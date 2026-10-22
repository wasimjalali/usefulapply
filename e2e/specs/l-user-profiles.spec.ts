import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { storedApplication } from '../lib/app';
import { BASE_URL } from '../lib/env';
import { fakeAddProfile, fakeBanProfile, fakeCalls, fakeControl, fakeProfiles, fakeReset, type FakeCall } from '../lib/fake-control';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { runTool } from '../lib/run-tool';
import { openLocalD1 } from '../lib/sqlite';
import { callAgent, createSignedInApiUser, nextTestIp, type AgentEvent, type TestUser } from '../lib/user';

/**
 * Anthropic user profiles, end to end through the real routes, the real SDKs (the Anthropic client and the Bedrock
 * mantle client), the real local D1 and Better Auth's real account deletion. Only Anthropic is scripted
 * (e2e/fake-anthropic.ts): it creates and deletes profiles, rejects an unknown id in the header with a 400 like the
 * API, takes the id as a body field on Bedrock, and records the id every request carried.
 *
 * What is pinned:
 *  - (u1) a new user's chat (a tool loop) and kit generation (parallel Sonnet writers) start at the same moment while
 *    the profile create is held open, and the CV writer fails over to Bedrock: exactly one profile is created
 *    (application, reference_id = the user id), it is stored in D1, every request of that user (Haiku and Sonnet,
 *    count_tokens included, Bedrock included) names it, and a second user gets a different one;
 *  - (u2) a race lost to another isolate: while this isolate's create is in flight, the spec stores another profile
 *    for the user in D1 (as a second isolate would). The app keeps the stored one, deletes its own at Anthropic and
 *    sends the stored id;
 *  - (u3) a profile create that fails (500) does not cost the user the kit: it completes, charged once, and no
 *    request carries a profile; nothing is stored;
 *  - (u4) account deletion whose profile delete fails at Anthropic stops (the account, the row and the profile stay)
 *    and a second confirmation finishes it: the profile is deleted at Anthropic, then the D1 row, other users untouched;
 *  - (u5) a stored id the API no longer accepts (deleted elsewhere, or an API key from another organization): that
 *    call fails with the API's 400, the app confirms with a retrieve (404) that the profile is gone, drops the mapping,
 *    and the next call creates a new profile and works;
 *  - (u6) a banned profile whose refusal is a 400 naming the id: the retrieve shows the profile still exists, so the app
 *    keeps the mapping and never swaps the user onto a fresh, unrestricted profile;
 *  - (u7) an anonymous CV upload sends no profile and creates none.
 */

interface ApiUser { user: TestUser; api: APIRequestContext }

async function apiUser(label: string): Promise<ApiUser> {
  const api = await playwrightRequest.newContext();
  return { user: await createSignedInApiUser(api, label), api };
}

const INTERVIEW_MESSAGE = 'Zapier ist jetzt im Interview, Dienstag 10 Uhr';

async function postChat({ api }: ApiUser, message: string) {
  const ip = nextTestIp();
  return api.post(`${BASE_URL}/api/chat`, {
    data: {
      message,
      context: {
        hasCV: true,
        cvSummary: 'Tomas Brandt, Financial Analyst, forecasting and variance reporting.',
        hasAnalysis: false,
        timeZone: 'Europe/Berlin',
        chatHistory: [],
      },
    },
    headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': ip },
    timeout: 120_000,
  });
}

function seedRow(userId: string, company: string): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = openLocalD1();
  try {
    db.prepare(`
      INSERT INTO application_sessions
        (id, user_id, job_title, company, job_description, matching_skills, missing_skills, suggestions, cv_edits,
         generated_cv, status, generation_status, created_at, updated_at)
      VALUES (?, ?, 'Data Engineer', ?, 'Seeded posting', '[]', '[]', '[]', '[]', '{"content":"cv"}', 'applied', 'succeeded', ?, ?)
    `).run(id, userId, company, now, now);
  } finally {
    db.close();
  }
  return id;
}

function storedProfile(userId: string): string | null {
  const db = openLocalD1();
  try {
    const row = db.prepare('SELECT profile_id FROM anthropic_user_profiles WHERE user_id = ?').get(userId) as { profile_id: string } | undefined;
    return row?.profile_id ?? null;
  } finally {
    db.close();
  }
}

function userRowExists(userId: string): boolean {
  const db = openLocalD1();
  try {
    return db.prepare('SELECT 1 FROM user WHERE id = ?').get(userId) !== undefined;
  } finally {
    db.close();
  }
}

async function createsFor(userId: string) {
  return (await fakeProfiles()).events.filter((event) => event.kind === 'create' && event.referenceId === userId);
}

async function waitFor<T>(what: string, read: () => Promise<T | null | undefined>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function generateKit(who: ApiUser): Promise<{ sessionId: string; events: AgentEvent[] }> {
  const created = await runTool<{ id: string }>('e2e/tools/ops.ts', ['create-application', JSON.stringify({ userId: who.user.id, jobDescription: JOB_DESCRIPTION })]);
  const events = await callAgent(who.api, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId: created.id }, `req-profiles-${Date.now()}`);
  return { sessionId: created.id, events };
}

const profileTrail = (calls: FakeCall[]) => calls.map((call) => `${call.kind}:${call.provider}:${call.writer}:${call.status}:${call.userProfileId ?? 'none'}`);

test.describe.serial('Anthropic user profiles', () => {
  test.afterEach(async () => {
    await fakeControl({});
  });

  test('(u1) chat and a kit racing the first profile create: one profile, every request names it, Bedrock too, a second user gets another', async () => {
    const a = await apiUser('profiles-a');
    seedRow(a.user.id, 'Zapier');
    const created = await runTool<{ id: string }>('e2e/tools/ops.ts', ['create-application', JSON.stringify({ userId: a.user.id, jobDescription: JOB_DESCRIPTION })]);
    await fakeReset();
    // Hold the create so every first call of the chat and the kit is waiting on it; the CV writer fails over to Bedrock.
    await fakeControl({ profileCreateHoldMs: 1_500, primaryFail: { status: 529, count: 2, writer: 'cv' } });

    const [chatResponse, events] = await Promise.all([
      postChat(a, INTERVIEW_MESSAGE),
      callAgent(a.api, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId: created.id }, `req-profiles-a-${Date.now()}`),
    ]);
    expect(chatResponse.status(), await chatResponse.text()).toBe(200);
    const chat = (await chatResponse.json()) as { reply: string; executed: Array<{ type: string }> };
    expect(chat.executed.map((item) => item.type)).toEqual(['tracker_updated']);
    const done = events.find((event) => event.type === 'workflow_complete');
    expect(done, JSON.stringify(events.slice(-3))).toBeTruthy();
    expect(storedApplication(a.user.id, created.id)?.generation_status).toBe('succeeded');

    const creates = await createsFor(a.user.id);
    expect(creates.map((event) => event.status), 'exactly one profile create for the user').toEqual([200]);
    const profileId = creates[0].id as string;
    expect(profileId).toMatch(/^uprof_/);
    expect(storedProfile(a.user.id)).toBe(profileId);
    const profile = (await fakeProfiles()).profiles.find((p) => p.id === profileId);
    expect(profile).toMatchObject({ accessType: 'application', referenceId: a.user.id, deletedAt: null });

    const calls = await fakeCalls();
    const chatCalls = calls.filter((call) => call.writer === 'chat');
    const kitWriters = new Set(calls.filter((call) => ['cv', 'coverLetter', 'applicationEmail', 'followUpEmail'].includes(call.writer)).map((call) => call.writer));
    expect(chatCalls.length, 'the chat ran its tool loop').toBeGreaterThanOrEqual(3);
    expect(kitWriters.size, 'the parallel kit writers ran').toBeGreaterThanOrEqual(3);
    // Every request of this window is this user's (the lane runs one test at a time), so every one must name the profile.
    expect(profileTrail(calls).filter((line) => !line.endsWith(`:${profileId}`)), 'requests without the profile').toEqual([]);
    // The first model request went out only once the held create answered.
    const firstCall = calls.map((call) => call.at).sort()[0];
    expect(new Date(firstCall).getTime()).toBeGreaterThanOrEqual(new Date(creates[0].at).getTime() + 1_400);
    // Bedrock got the profile in the body (the fake rejects the header there) and answered the CV.
    const cv = calls.filter((call) => call.writer === 'cv' && call.kind === 'messages');
    expect(cv.map((call) => `${call.provider}:${call.status}`)).toEqual(['anthropic:529', 'anthropic:529', 'bedrock:200']);
    expect(cv[2].userProfileId).toBe(profileId);

    // A second user gets their own profile.
    const b = await apiUser('profiles-b');
    await fakeReset();
    const thanks = await postChat(b, 'Thanks for the help');
    expect(thanks.status(), await thanks.text()).toBe(200);
    const bCreates = await createsFor(b.user.id);
    expect(bCreates.map((event) => event.status)).toEqual([200]);
    const bProfile = bCreates[0].id as string;
    expect(bProfile).not.toBe(profileId);
    expect(storedProfile(b.user.id)).toBe(bProfile);
    const bCalls = await fakeCalls();
    expect(bCalls.length).toBeGreaterThan(0);
    expect(bCalls.every((call) => call.userProfileId === bProfile), JSON.stringify(profileTrail(bCalls))).toBe(true);
  });

  test('(u2) a race lost to another isolate: the stored profile wins, the app deletes its own and sends the stored id', async () => {
    const c = await apiUser('profiles-race');
    await fakeReset();
    await fakeControl({ profileCreateHoldMs: 3_000 });
    const chat = postChat(c, 'Thanks for the help');

    // This isolate's create has reached Anthropic; another isolate stores its profile first.
    await waitFor('the app to start creating a profile', async () => (await createsFor(c.user.id))[0]);
    const winner = `uprof_otherisolate${Date.now().toString(36)}`;
    await fakeAddProfile(winner, c.user.id);
    const db = openLocalD1();
    try {
      db.prepare('INSERT INTO anthropic_user_profiles (user_id, profile_id, created_at) VALUES (?, ?, ?)').run(c.user.id, winner, new Date().toISOString());
    } finally {
      db.close();
    }

    const response = await chat;
    expect(response.status(), await response.text()).toBe(200);
    const creates = await createsFor(c.user.id);
    expect(creates.map((event) => event.status)).toEqual([200]);
    const lost = creates[0].id as string;
    expect(lost).not.toBe(winner);
    expect(storedProfile(c.user.id)).toBe(winner);
    const deletes = (await fakeProfiles()).events.filter((event) => event.kind === 'delete' && event.id === lost);
    expect(deletes.map((event) => event.status), 'the losing profile was deleted at Anthropic').toEqual([200]);
    const calls = await fakeCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.userProfileId === winner), JSON.stringify(profileTrail(calls))).toBe(true);
  });

  test('(u3) a failed profile create: the kit completes without the header, one charge, nothing stored', async () => {
    const d = await apiUser('profiles-fail');
    const creditsBefore = (() => {
      const db = openLocalD1();
      try {
        const row = db.prepare('SELECT monthly_credits + rollover_credits + addon_credits AS total FROM user_credits WHERE user_id = ?').get(d.user.id) as { total: number };
        return row.total;
      } finally {
        db.close();
      }
    })();
    await fakeReset();
    await fakeControl({ profileCreateFail: { status: 500, count: 1 } });

    const { sessionId, events } = await generateKit(d);
    const done = events.find((event) => event.type === 'workflow_complete');
    expect(done, JSON.stringify(events.slice(-3))).toBeTruthy();
    expect(done?.creditsRefunded ?? 0).toBe(0);
    expect(storedApplication(d.user.id, sessionId)?.generation_status).toBe('succeeded');
    const db = openLocalD1();
    try {
      const row = db.prepare('SELECT monthly_credits + rollover_credits + addon_credits AS total FROM user_credits WHERE user_id = ?').get(d.user.id) as { total: number };
      expect(row.total).toBe(creditsBefore - 2.0);
    } finally {
      db.close();
    }

    // One attempt for the whole kit: the parallel calls shared it, and later ones skipped creation after the failure.
    expect((await createsFor(d.user.id)).map((event) => event.status)).toEqual([500]);
    expect(storedProfile(d.user.id)).toBeNull();
    const calls = await fakeCalls();
    expect(calls.filter((call) => call.kind === 'messages').length).toBeGreaterThanOrEqual(4);
    expect(calls.every((call) => call.userProfileId === null), JSON.stringify(profileTrail(calls))).toBe(true);
  });

  test('(u4) account deletion: a failed profile delete stops it, a second confirmation deletes the profile, then the row', async () => {
    const e = await apiUser('profiles-delete');
    const other = await apiUser('profiles-keep');
    await fakeReset();
    for (const who of [e, other]) {
      const response = await postChat(who, 'Thanks for the help');
      expect(response.status(), await response.text()).toBe(200);
    }
    const profileId = storedProfile(e.user.id);
    const otherProfile = storedProfile(other.user.id);
    expect(profileId).toMatch(/^uprof_/);
    expect(otherProfile).toMatch(/^uprof_/);

    const confirmDeletion = async () => {
      const ip = nextTestIp();
      const ask = await e.api.delete(`${BASE_URL}/api/auth/delete-account`, { headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': ip } });
      expect(ask.status(), await ask.text()).toBe(200);
      // The confirmation link goes to a mailbox nobody reads: take its token from Better Auth's verification row.
      const db = openLocalD1();
      let token: string;
      try {
        const row = db.prepare("SELECT identifier FROM verification WHERE value = ? AND identifier LIKE 'delete-account-%' ORDER BY created_at DESC LIMIT 1")
          .get(e.user.id) as { identifier: string } | undefined;
        expect(row, 'a delete-account verification row').toBeTruthy();
        token = (row as { identifier: string }).identifier.slice('delete-account-'.length);
      } finally {
        db.close();
      }
      return e.api.get(`${BASE_URL}/api/auth/delete-user/callback?token=${token}`, { maxRedirects: 0 });
    };

    // Anthropic fails every delete attempt (the SDK tries three times): the deletion stops before the user row goes.
    await fakeControl({ profileDeleteFail: { status: 500, count: 3 } });
    const failed = await confirmDeletion();
    expect(failed.status(), 'the deletion stops when the profile cannot be deleted').toBeGreaterThanOrEqual(400);
    expect(userRowExists(e.user.id)).toBe(true);
    expect(storedProfile(e.user.id)).toBe(profileId);
    expect((await fakeProfiles()).profiles.find((p) => p.id === profileId)?.deletedAt).toBeNull();
    expect((await fakeProfiles()).events.filter((event) => event.kind === 'delete' && event.id === profileId).map((event) => event.status)).toEqual([500, 500, 500]);

    await fakeControl({});
    const confirm = await confirmDeletion();
    expect(confirm.status(), await confirm.text()).toBe(200);

    expect(userRowExists(e.user.id)).toBe(false);
    expect(storedProfile(e.user.id)).toBeNull();
    const { profiles, events } = await fakeProfiles();
    expect(events.filter((event) => event.kind === 'delete' && event.id === profileId).map((event) => event.status)).toEqual([500, 500, 500, 200]);
    expect(profiles.find((p) => p.id === profileId)?.deletedAt).toBeTruthy();
    expect(profiles.find((p) => p.id === otherProfile)?.deletedAt).toBeNull();
    expect(storedProfile(other.user.id)).toBe(otherProfile);
  });

  test('(u5) a stored id the API rejects: that call fails, the mapping is dropped, the next call gets a new profile', async () => {
    const f = await apiUser('profiles-stale');
    const stale = `uprof_deletedelsewhere${Date.now().toString(36)}`;
    const db = openLocalD1();
    try {
      db.prepare('INSERT INTO anthropic_user_profiles (user_id, profile_id, created_at) VALUES (?, ?, ?)').run(f.user.id, stale, new Date().toISOString());
    } finally {
      db.close();
    }
    await fakeReset();

    const first = await postChat(f, 'Thanks for the help');
    expect(first.status(), 'the call with the rejected id fails loud').toBe(500);
    const rejected = await fakeCalls();
    expect(rejected.map((call) => `${call.provider}:${call.status}:${call.userProfileId}`)).toEqual([`anthropic:400:${stale}`]);
    expect(storedProfile(f.user.id), 'the stale mapping was dropped').toBeNull();
    expect(await createsFor(f.user.id)).toEqual([]);
    const checks = (await fakeProfiles()).events.filter((event) => event.kind === 'retrieve' && event.id === stale);
    expect(checks.map((event) => event.status), 'the app confirmed the profile is gone before dropping it').toEqual([404]);

    await fakeReset();
    const second = await postChat(f, 'Thanks for the help');
    expect(second.status(), await second.text()).toBe(200);
    const creates = await createsFor(f.user.id);
    expect(creates.map((event) => event.status)).toEqual([200]);
    const fresh = creates[0].id as string;
    expect(storedProfile(f.user.id)).toBe(fresh);
    const calls = await fakeCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.userProfileId === fresh && call.status === 200), JSON.stringify(profileTrail(calls))).toBe(true);
  });

  test('(u6) a banned profile refused with a 400 naming its id: the mapping stays, no fresh profile replaces it', async () => {
    const g = await apiUser('profiles-banned');
    await fakeReset();
    const first = await postChat(g, 'Thanks for the help');
    expect(first.status(), await first.text()).toBe(200);
    const profileId = storedProfile(g.user.id) as string;
    expect(profileId).toMatch(/^uprof_/);

    await fakeBanProfile(profileId);
    await fakeReset();
    for (let i = 0; i < 2; i++) {
      const refused = await postChat(g, 'Thanks for the help');
      expect(refused.status(), 'a banned user is refused').toBe(500);
    }
    const calls = await fakeCalls();
    expect(calls.map((call) => `${call.status}:${call.userProfileId}`)).toEqual([`400:${profileId}`, `400:${profileId}`]);
    expect(storedProfile(g.user.id), 'the mapping is kept').toBe(profileId);
    expect((await createsFor(g.user.id)).map((event) => event.status), 'no second profile').toEqual([200]);
    const checks = (await fakeProfiles()).events.filter((event) => event.kind === 'retrieve' && event.id === profileId);
    expect(checks.length, 'the app looked the profile up before deciding').toBeGreaterThanOrEqual(1);
    expect(checks.every((event) => event.status === 200)).toBe(true);
  });

  test('(u7) an anonymous CV upload sends no profile and creates none', async () => {
    const api = await playwrightRequest.newContext();
    await fakeReset();
    const before = (await fakeProfiles()).events.filter((event) => event.kind === 'create').length;
    const ip = nextTestIp();
    const response = await api.post(`${BASE_URL}/api/parse-cv`, {
      multipart: { file: { name: 'tomas-brandt.txt', mimeType: 'text/plain', buffer: Buffer.from(PRIMARY_CV) } },
      headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': ip },
      timeout: 120_000,
    });
    expect(response.status(), await response.text()).toBe(200);
    const calls = await fakeCalls();
    expect(calls.filter((call) => call.kind === 'messages').length, 'the parse called the model').toBeGreaterThanOrEqual(1);
    expect(calls.every((call) => call.userProfileId === null), JSON.stringify(profileTrail(calls))).toBe(true);
    expect((await fakeProfiles()).events.filter((event) => event.kind === 'create').length).toBe(before);
  });
});
