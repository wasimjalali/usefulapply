import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { accountSnapshot, netCharged, operations, setPlan } from '../lib/mcp-db';
import { feedFeedbackRows, feedRuns, seedCareerProfile, seedFeedInbox, seedFeedRun, seedFeedSettings, type SeededFeedJob } from '../lib/mcp-feed-seed';
import { HOSTILE_JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { creditsOf, type TestUser } from '../lib/user';
import type { BrowserContext } from '@playwright/test';

/**
 * The eight feed tools over the wire: get_job_feed, get_feed_settings, get_career_profile, run_job_feed,
 * update_feed_settings, give_job_feedback, withdraw_feed_consent and apply_to_feed_job.
 *
 * The feed rows are seeded into the local D1 the way the pipeline leaves them (mcp-feed-seed.ts). No search
 * provider is ever called. That also decides what run_job_feed can show here: a call that would start a fresh
 * run puts a message on the preview's queue, whose consumer would claim the run and search, so this spec only
 * uses states no message can claim (refusals, a run already completed today, a run already running today). The
 * start path, a queued run claimed once by the consumer, is the data lane's (j) scenarios, which run the same tool
 * against a stubbed search.
 */

interface FeedItem {
  jobId: string;
  title: string;
  company: string;
  fitLabel: string | null;
  matchReason: string | null;
  saved: boolean;
  savedAt: string | null;
  matchRating: string | null;
  applicationId: string | null;
  generationStatus: string;
  description?: string | null;
  applyUrl: string | null;
}
interface FeedPage { view: string; items: FeedItem[]; totalCount: number; hasMore: boolean; offset: number; limit: number }

const JOBS = [
  { title: 'Senior FP&A Analyst', company: 'Northwind Foods', fitLabel: 'strong' as const },
  { title: 'Financial Controller', company: 'Fabrikam', fitLabel: 'good' as const },
  { title: 'Head of Planning', company: 'Contoso', fitLabel: 'good' as const, description: HOSTILE_JOB_DESCRIPTION },
];

test.describe.serial('feed: reading, rating, settings, applying', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let jobs: SeededFeedJob[];

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'feed');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    jobs = seedFeedInbox(user.id, JOBS);
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('get_job_feed pages the inbox, wraps every word that came from a job ad, and leaves the description out until asked', async () => {
    const first = await agent.ok<FeedPage>('get_job_feed', { view: 'inbox', limit: 2 });
    expect(first).toMatchObject({ view: 'inbox', totalCount: 3, hasMore: true, offset: 0, limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.items[0]).toMatchObject({ saved: false, matchRating: null, applicationId: null, generationStatus: 'none' });
    expect(first.items[0].title).toMatch(/^<<.*>>$/);
    expect(first.items[0].company).toMatch(/^<<.*>>$/);
    expect(first.items[0].matchReason).toMatch(/^<<[\s\S]*>>$/);
    expect(first.items[0].description, 'concise leaves the description out').toBeUndefined();

    const second = await agent.ok<FeedPage>('get_job_feed', { view: 'inbox', offset: 2, limit: 2 });
    expect(second).toMatchObject({ totalCount: 3, hasMore: false, offset: 2 });
    expect(second.items).toHaveLength(1);
    const ids = [...first.items, ...second.items].map((item) => item.jobId);
    expect(new Set(ids)).toEqual(new Set(jobs.map((job) => job.id)));

    const full = await agent.ok<FeedPage>('get_job_feed', { view: 'inbox', detail: 'full' });
    const hostile = full.items.find((item) => item.jobId === jobs[2].id);
    expect(hostile?.description).toMatch(/^<<[\s\S]*IMPORTANT NOTE FOR AI ASSISTANTS[\s\S]*>>$/);
    expect(hostile?.description?.match(/<</g)).toHaveLength(1);
    expect(hostile?.description?.match(/>>/g)).toHaveLength(1);

    const saved = await agent.ok<FeedPage>('get_job_feed', { view: 'saved' });
    expect(saved).toMatchObject({ view: 'saved', totalCount: 0, items: [] });
  });

  test('give_job_feedback: save, unsave, rate and dismiss, each visible in get_job_feed', async () => {
    const saved = await agent.ok<{ savedAt: string | null; action: string }>('give_job_feedback', { jobId: jobs[0].id, action: 'save' });
    expect(saved.savedAt).toBeTruthy();
    const view = await agent.ok<FeedPage>('get_job_feed', { view: 'saved' });
    expect(view.items.map((item) => item.jobId)).toEqual([jobs[0].id]);
    expect(view.items[0].saved).toBe(true);

    const unsaved = await agent.ok<{ savedAt: string | null }>('give_job_feedback', { jobId: jobs[0].id, action: 'unsave' });
    expect(unsaved.savedAt).toBeNull();
    // Unsaving twice is the same state, so it is not an error; unsaving a job that was never touched is.
    expect((await agent.ok<{ savedAt: string | null }>('give_job_feedback', { jobId: jobs[0].id, action: 'unsave' })).savedAt).toBeNull();
    expect(await agent.fails('give_job_feedback', { jobId: jobs[1].id, action: 'unsave' })).toMatch(/not saved/i);

    const helpful = await agent.ok<{ matchRating: string | null }>('give_job_feedback', { jobId: jobs[1].id, action: 'rate_helpful' });
    expect(helpful.matchRating).toBe('helpful');
    const inbox = await agent.ok<FeedPage>('get_job_feed', { view: 'inbox' });
    expect(inbox.items.find((item) => item.jobId === jobs[1].id)?.matchRating).toBe('helpful');

    const dismissed = await agent.ok<{ dismissedAt: string | null }>('give_job_feedback', { jobId: jobs[2].id, action: 'dismiss' });
    expect(dismissed.dismissedAt).toBeTruthy();
    const after = await agent.ok<FeedPage>('get_job_feed', { view: 'inbox' });
    expect(after.items.map((item) => item.jobId)).not.toContain(jobs[2].id);
    expect(after.totalCount).toBe(2);
  });

  test('get_feed_settings and get_career_profile read what is there and never generate anything', async () => {
    const settings = await agent.ok<{ configured: boolean; canEdit: boolean; consent: { given: boolean }; settings: { roles: string[]; countries: string[]; timezone: string; automationEnabled: boolean } | null }>('get_feed_settings');
    expect(settings).toMatchObject({ configured: true, canEdit: true, consent: { given: true } });
    expect(settings.settings).toMatchObject({ roles: ['Financial Analyst'], countries: ['us'], timezone: 'UTC', automationEnabled: true });

    const career = await agent.ok<{ status: string; profile: unknown; searchStrategy: { status: string; queries: unknown[] } }>('get_career_profile');
    // Nothing has synthesized a profile for this account, and a read never does.
    expect(career.status).toBe('no_profile');
    expect(career.profile).toBeNull();
    expect(career.searchStrategy.queries).toEqual([]);
  });

  test('update_feed_settings changes only what is sent, says what changed, and a declined form changes nothing', async () => {
    const { tools } = await (await agent.connect()).listTools();
    const properties = (tools.find((tool) => tool.name === 'update_feed_settings')?.inputSchema as { properties: Record<string, { items?: { enum?: string[] } }> }).properties;
    const country = properties.countries.items?.enum?.find((code) => code !== 'us') as string;
    const workMode = properties.workModes.items?.enum?.[0] as string;

    const changed = await agent.ok<{ changed: string[]; settings: { roles: string[]; countries: string[]; workModes: string[]; salaryFloor: number | null; timezone: string }; searches: Array<{ role: string; country: string }> | null }>('update_feed_settings', {
      roles: ['Financial Controller', 'FP&A Manager'],
      countries: ['us', country],
      workModes: [workMode],
      salaryFloor: 90000,
      timezone: 'Europe/Berlin',
    });
    expect(changed.changed).toEqual(expect.arrayContaining(['roles', 'countries', 'work modes', 'salary floor', 'timezone']));
    // The daily feed runs a limited number of role and country searches, so fewer roles can be kept than were sent; the result says which.
    expect(changed.settings).toMatchObject({ countries: ['us', country], salaryFloor: 90000, timezone: 'Europe/Berlin' });
    expect(changed.settings.roles.length).toBeGreaterThan(0);
    expect(['Financial Controller', 'FP&A Manager']).toEqual(expect.arrayContaining(changed.settings.roles));
    expect(changed.searches?.length).toBeGreaterThan(0);
    const keptRoles = changed.settings.roles;

    const same = await agent.ok<{ changed: string[]; searches: unknown }>('update_feed_settings', { salaryFloor: 90000 });
    expect(same.changed).toEqual([]);
    expect(same.searches).toBeNull();
    // The same roles again also change nothing, although the plan's search cap kept fewer of them than were sent.
    const sameRoles = await agent.ok<{ changed: string[]; searches: unknown }>('update_feed_settings', { roles: ['Financial Controller', 'FP&A Manager'] });
    expect(sameRoles.changed).toEqual([]);
    expect(sameRoles.searches).toBeNull();
    expect(await agent.fails('update_feed_settings', {})).toMatch(/at least one setting/i);

    const declining = await agent.elicitingClient('decline');
    try {
      const result = await declining.client.callTool({ name: 'update_feed_settings', arguments: { roles: ['Chief Executive'], salaryFloor: null } });
      expect(result.isError).toBe(true);
      expect(declining.asked[0]).toMatch(/Change the job feed settings \(roles, salary floor\)/);
    } finally {
      await declining.client.close();
    }
    const kept = await agent.ok<{ settings: { roles: string[]; salaryFloor: number | null } }>('get_feed_settings');
    expect(kept.settings).toMatchObject({ roles: keptRoles, salaryFloor: 90000 });
  });

  test('get_career_profile maps a stored career profile and the confirmed searches, field by field', async () => {
    seedCareerProfile(user.id);
    const career = await agent.ok<{
      status: string;
      cvNewerThanProfile: boolean;
      profile: { function: string; seniority: { level: string; confidence: string }; yearsTotal: number; inferredTitles: Array<{ title: string; confidence: string }>; aspirationalTitles: string[]; pivot: { from: string; to: string } | null; primarySkills: Array<{ name: string; skills: string[] }>; secondarySkills: Array<{ name: string; skills: string[] }>; industries: string[]; tools: string[]; workingLanguages: string[]; narrative: string } | null;
      searchStrategy: { status: string; userConfirmed: boolean; queries: Array<{ query: string; targetCountry: string; type: string; expectedRecall: string }>; negativeTerms: string[] };
    }>('get_career_profile');
    expect(career).toMatchObject({ status: 'ok', cvNewerThanProfile: false });
    expect(career.profile).toMatchObject({
      function: 'finance',
      seniority: { level: 'senior', confidence: 'high' },
      yearsTotal: 5,
      inferredTitles: [{ title: 'Senior FP&A Analyst', confidence: 'high' }, { title: 'Financial Controller', confidence: 'medium' }],
      aspirationalTitles: ['Head of Planning'],
      pivot: { from: 'analyst', to: 'finance manager' },
      primarySkills: [{ name: 'planning and forecasting', skills: ['Forecasting', 'Budgeting'] }],
      secondarySkills: [{ name: 'reporting tools', skills: ['Excel', 'Anaplan'] }],
      industries: ['consumer goods'],
      tools: ['Excel', 'Anaplan'],
      workingLanguages: ['English'],
    });
    // The searches are the ones update_feed_settings confirmed in the test before this one.
    expect(career.searchStrategy).toMatchObject({ status: 'ok', userConfirmed: true });
    expect(career.searchStrategy.queries.length).toBeGreaterThan(0);
    for (const query of career.searchStrategy.queries) {
      expect(query.query).toBeTruthy();
      expect(query.targetCountry).toBeTruthy();
      expect(query.expectedRecall).toBeTruthy();
    }
    expect(Array.isArray(career.searchStrategy.negativeTerms)).toBe(true);
  });

  test('apply_to_feed_job: a fit check costs 0.5, a repeat costs nothing, a kit is queued and finishes the feed row', async () => {
    const start = creditsOf(user.id).total;
    const fitKey = uuid();
    const fit = await agent.ok<{ applicationId: string; status: string; creditsUsed: number; replayed: boolean; fit: { score: number; assessment: string } | null; job: { title: string } }>('apply_to_feed_job', { jobId: jobs[0].id, mode: 'fit', idempotencyKey: fitKey });
    expect(fit).toMatchObject({ status: 'succeeded', creditsUsed: 0.5, replayed: false });
    expect(fit.fit?.assessment).toMatch(/^<<[\s\S]*>>$/);
    expect(fit.job.title).toMatch(/Senior FP&A Analyst/);
    const replay = await agent.ok<{ applicationId: string; creditsUsed: number; replayed: boolean }>('apply_to_feed_job', { jobId: jobs[0].id, mode: 'fit', idempotencyKey: fitKey });
    expect(replay).toMatchObject({ applicationId: fit.applicationId, creditsUsed: 0, replayed: true });
    expect(creditsOf(user.id).total).toBe(start - 0.5);

    // The application is the user's own, with the job's ad as its description.
    const app = await agent.ok<{ job: { description: string | null; title: string } }>('get_application', { applicationId: fit.applicationId, detail: 'full' });
    expect(app.job.description).toMatch(/rolling forecast/);

    // The kit for the same job reuses that application and queues the generation.
    const kit = await agent.ok<{ applicationId: string; status: string; operationId: string | null; pollAfterSeconds: number | null; creditsUsed: number }>('apply_to_feed_job', { jobId: jobs[0].id, mode: 'kit', idempotencyKey: uuid() });
    expect(kit.applicationId).toBe(fit.applicationId);
    expect(['pending', 'running']).toContain(kit.status);
    expect(kit.pollAfterSeconds).toBe(10);
    // The fit above was paid on this application, so the kit takes the after-fit price.
    expect(kit.creditsUsed).toBe(1.5);
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId as string })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
    expect(operations(user.id).filter((row) => row.kind === 'generate_kit')).toHaveLength(1);
    // Fit 0.5 plus kit 1.5.
    expect(netCharged(user.id)).toBe(2);

    // The feed row follows the kit: the job points at its application and says the kit is done. An applied job
    // leaves the inbox (that is what applying means), so the row is read where it lives.
    const feedRow = () => feedFeedbackRows(user.id).find((row) => row.canonical_job_id === jobs[0].id);
    await expect.poll(() => feedRow()?.generation_status, { timeout: 30_000, intervals: [500] }).toBe('succeeded');
    expect(feedRow()).toMatchObject({ application_session_id: fit.applicationId, generation_error: null });
    expect((await agent.ok<FeedPage>('get_job_feed', { view: 'inbox' })).items.map((item) => item.jobId)).not.toContain(jobs[0].id);

    // A job that already has a kit is not paid for twice.
    const charged = netCharged(user.id);
    const again = await agent.ok<{ status: string; creditsUsed: number }>('apply_to_feed_job', { jobId: jobs[0].id, mode: 'kit', idempotencyKey: uuid() });
    expect(again).toMatchObject({ status: 'kit_exists', creditsUsed: 0 });
    expect(netCharged(user.id)).toBe(charged);

    // A dismissed job cannot be applied to.
    const beforeDismissed = netCharged(user.id);
    const dismissed = await agent.fails('apply_to_feed_job', { jobId: jobs[2].id, mode: 'fit', idempotencyKey: uuid() });
    expect(dismissed).toMatch(/already dismissed, rated not relevant or applied to/);
    expect(netCharged(user.id), 'a refused apply costs nothing').toBe(beforeDismissed);
  });

  test('withdraw_feed_consent: a declined form changes nothing; accepted, it turns the feed off and run_job_feed says why', async () => {
    const declining = await agent.elicitingClient('decline');
    try {
      const before = await agent.ok<{ consent: { given: boolean } }>('get_feed_settings');
      const result = await declining.client.callTool({ name: 'withdraw_feed_consent', arguments: {} });
      expect(result.isError).toBe(true);
      expect(declining.asked[0]).toMatch(/Stop job feed processing/);
      expect((await agent.ok<{ consent: { given: boolean } }>('get_feed_settings')).consent.given).toBe(before.consent.given);
    } finally {
      await declining.client.close();
    }

    const accepting = await agent.elicitingClient('accept');
    try {
      const result = await accepting.client.callTool({ name: 'withdraw_feed_consent', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ withdrawn: true });
    } finally {
      await accepting.client.close();
    }
    const settings = await agent.ok<{ consent: { given: boolean }; settings: { automationEnabled: boolean } | null }>('get_feed_settings');
    expect(settings.consent.given).toBe(false);
    expect(settings.settings?.automationEnabled).toBe(false);

    // No consent, no run: the refusal says who can fix it, and nothing is queued.
    const runs = feedRuns(user.id).length;
    expect(await agent.fails('run_job_feed')).toMatch(/no consent on file/i);
    expect(feedRuns(user.id)).toHaveLength(runs);
    // The saved jobs and settings stay readable.
    expect((await agent.ok<FeedPage>('get_job_feed', { view: 'inbox' })).totalCount).toBeGreaterThan(0);
  });
});

test.describe.serial('run_job_feed: the states no queue message can claim', () => {
  test('a run already completed today: nothing is queued, alreadyRanToday, with the finished run\'s numbers', async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'feed-done');
    try {
      setPlan(created.user.id, 'plus');
      seedFeedSettings(created.user.id);
      const runId = seedFeedRun(created.user.id, { status: 'completed', triggerSource: 'manual_user', ranked: 7 });
      const before = feedRuns(created.user.id);
      const result = await created.session.ok<{ runId: string; status: string; started: boolean; alreadyRanToday: boolean; rankedJobsCount: number; nextRunAt: string | null; failed: boolean }>('run_job_feed');
      expect(result).toMatchObject({ runId, status: 'completed', started: false, alreadyRanToday: true, rankedJobsCount: 7, failed: false });
      expect(new Date(result.nextRunAt as string).getTime()).toBeGreaterThan(Date.now());
      // A second call the same day says the same, and starts nothing.
      const again = await created.session.ok<{ runId: string; alreadyRanToday: boolean }>('run_job_feed');
      expect(again).toMatchObject({ runId, alreadyRanToday: true });
      expect(feedRuns(created.user.id)).toEqual(before);
      // The feed's own limit is 2 a minute, shared with the web app, and it counts every call.
      expect(await created.session.fails('run_job_feed')).toMatch(/Too many requests\. Try again in a minute\./);
    } finally {
      await created.session.close();
      await created.context.close();
    }
  });

  test('a run already in flight today: the call returns at once with that run and does not start another', async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'feed-running');
    try {
      setPlan(created.user.id, 'plus');
      seedFeedSettings(created.user.id);
      const runId = seedFeedRun(created.user.id, { status: 'running' });
      const before = feedRuns(created.user.id);
      const started = Date.now();
      const result = await created.session.ok<{ runId: string; status: string; started: boolean; alreadyRanToday: boolean; rankedJobsCount: number | null; failed: boolean }>('run_job_feed');
      expect(Date.now() - started, 'returns at once, it does not wait for the run').toBeLessThan(5_000);
      expect(result).toMatchObject({ runId, status: 'running', started: false, alreadyRanToday: false, rankedJobsCount: null, failed: false });
      expect(feedRuns(created.user.id)).toEqual(before);
    } finally {
      await created.session.close();
      await created.context.close();
    }
  });

  test('refusals say what is missing and who can fix it: a free plan without consent, no setup, feed off, no consent', async ({ browser, request }) => {
    // The run limit is 2 a minute per user, so each pair of refusals has its own account.
    const first = await newAgent(browser, request, 'feed-refused-1');
    const second = await newAgent(browser, request, 'feed-refused-2');
    try {
      // A free account that never started the feed: consent is the account owner's to give.
      expect(await first.session.fails('run_job_feed')).toMatch(/no consent on file/i);
      setPlan(first.user.id, 'plus');
      expect(await first.session.fails('run_job_feed')).toMatch(/not set up yet/i);

      setPlan(second.user.id, 'plus');
      seedFeedSettings(second.user.id, { enabled: false });
      expect(await second.session.fails('run_job_feed')).toMatch(/turned off/i);
      seedFeedSettings(second.user.id, { consent: false });
      expect(await second.session.fails('run_job_feed')).toMatch(/no consent on file/i);
      expect(feedRuns(first.user.id)).toEqual([]);
      expect(feedRuns(second.user.id)).toEqual([]);
    } finally {
      for (const created of [first, second]) {
        await created.session.close();
        await created.context.close();
      }
    }
  });
});

test.describe.serial('feed: user B cannot use user A\'s feed', () => {
  let a: McpSession;
  let b: McpSession;
  let userA: TestUser;
  let userB: TestUser;
  let jobs: SeededFeedJob[];

  test.beforeAll(async ({ browser, request }) => {
    const createdA = await newAgent(browser, request, 'feed-a');
    a = createdA.session;
    userA = createdA.user;
    await createdA.context.close();
    const createdB = await newAgent(browser, request, 'feed-b');
    b = createdB.session;
    userB = createdB.user;
    await createdB.context.close();
    for (const user of [userA, userB]) {
      setPlan(user.id, 'plus');
      seedFeedSettings(user.id);
    }
    await b.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    jobs = seedFeedInbox(userA.id, JOBS);
  });

  test.afterAll(async () => {
    await Promise.all([a?.close(), b?.close()]);
  });

  test('B sees none of A\'s jobs, and every feed tool that takes a jobId says not found for it', async () => {
    const beforeA = accountSnapshot(userA.id);
    const beforeB = accountSnapshot(userB.id);
    expect(await b.ok<FeedPage>('get_job_feed', { view: 'inbox' })).toMatchObject({ totalCount: 0, items: [] });

    for (const action of ['save', 'dismiss', 'rate_helpful', 'rate_not_relevant'] as const) {
      const real = await b.call('give_job_feedback', { jobId: jobs[0].id, action });
      const missing = await b.call('give_job_feedback', { jobId: uuid(), action });
      expect(real.isError, `give_job_feedback ${action} on A's job`).toBe(true);
      expect(real.text, `${action}: no way to tell A's job from one that never existed`).toBe(missing.text);
    }
    for (const mode of ['fit', 'kit'] as const) {
      const real = await b.call('apply_to_feed_job', { jobId: jobs[0].id, mode, idempotencyKey: uuid() });
      const missing = await b.call('apply_to_feed_job', { jobId: uuid(), mode, idempotencyKey: uuid() });
      expect(real.isError, `apply_to_feed_job ${mode} on A's job`).toBe(true);
      expect(real.text).toBe(missing.text);
    }
    expect(accountSnapshot(userA.id)).toEqual(beforeA);
    // Refused applies leave a failed, content-free 'feed_apply_session' operation row each (no application, no charge): all that changed.
    const afterB = accountSnapshot(userB.id);
    const leftovers = (afterB.operations as Array<{ kind: string; status: string; error_code: string | null }>);
    expect(leftovers.every((row) => row.kind === 'feed_apply_session' && row.status === 'failed' && row.error_code === 'not_found')).toBe(true);
    expect({ ...afterB, operations: [] }, 'B was charged nothing and holds nothing new').toEqual({ ...beforeB, operations: [] });
    expect(await a.ok<FeedPage>('get_job_feed', { view: 'inbox' })).toMatchObject({ totalCount: 3 });
  });
});
