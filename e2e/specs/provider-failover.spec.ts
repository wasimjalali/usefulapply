import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { storedApplication } from '../lib/app';
import { BASE_URL, FAKE_ANTHROPIC_URL } from '../lib/env';
import { fakeCalls, fakeControl, fakeReset, type FakeCall } from '../lib/fake-control';
import { JOB_DESCRIPTION } from '../lib/model-script';
import { runTool } from '../lib/run-tool';
import { openLocalD1 } from '../lib/sqlite';
import { callAgent, createSignedInApiUser, creditsOf, nextTestIp, type AgentEvent, type TestUser } from '../lib/user';

/**
 * The Amazon Bedrock failover, end to end through the real routes, the real SDKs (the Anthropic client and the
 * Bedrock mantle client), the real tools and the real local D1. Only the two model endpoints are scripted: one
 * fake process serves the Anthropic API at `/` and Bedrock at `/bedrock` (see e2e/fake-anthropic.ts), and the
 * test makes the Anthropic side answer 529 for chosen requests. The SDK retries a 529 once, so one failed
 * model call is two failed requests.
 *
 * What is pinned:
 *  - a 529 on the FIRST round of a chat turn that ends in a write: Bedrock answers that round, the rest of
 *    that request's tool loop stays on Bedrock (its thinking blocks are signed by Bedrock and the Anthropic API
 *    rejects them), the write runs exactly once (the same D1 effect as a turn with no failure), the ledger holds
 *    one failed 'anthropic' row and the 'bedrock' rows, and the NEXT user turn starts on the Anthropic API again;
 *  - a 529 on the round whose answer IS the write call: Bedrock answers it and the following round stays on
 *    Bedrock; the write still runs once and the next turn goes back to the Anthropic API;
 *  - the fake itself refuses a Bedrock-signed thinking block on the Anthropic endpoint, so a regression that
 *    moves a request back to the primary mid-loop fails here;
 *  - a 400 from the Anthropic API never reaches Bedrock: the turn fails like it does today, one failed row;
 *  - a kit generation whose CV writer gets a 529 (the writers run in parallel): that writer is answered by
 *    Bedrock (Sonnet 5.5, `anthropic.claude-sonnet-5-5`), the others never leave the Anthropic API, and the
 *    user is charged once, with no refund;
 *  - a kit generation whose CV writer STREAMS (max_tokens over 16k) and has its connection reset after the
 *    headers and half the text: the SDK sees a plain error with no status, our stream guard turns it into a
 *    failover error, Bedrock writes the CV, the failed row keeps the usage the stream reported, and the user is
 *    charged once.
 * "A 529 with no Bedrock credentials keeps today's failure path" needs a second preview without the
 * credentials; it is covered by the unit tests (providers.test.ts, haiku.test.ts) instead.
 */

const BERLIN_MESSAGE = 'ist jetzt im Interview, Dienstag 10 Uhr';
const HAIKU = 'claude-haiku-5-5';
const HAIKU_BEDROCK = 'anthropic.claude-haiku-5-5';

interface ApiUser { user: TestUser; api: APIRequestContext }

async function apiUser(label: string): Promise<ApiUser> {
  const api = await playwrightRequest.newContext();
  return { user: await createSignedInApiUser(api, label), api };
}

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

interface ChatResponse { reply: string; executed: Array<{ type: string; sessionId?: string; status?: string }> }
async function chat(who: ApiUser, message: string): Promise<ChatResponse> {
  const response = await postChat(who, message);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as ChatResponse;
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

interface RowState { status: string; interview_at: string | null; revision: number }
function rowState(id: string): RowState {
  const db = openLocalD1();
  try {
    return db.prepare('SELECT status, interview_at, revision FROM application_sessions WHERE id = ?').get(id) as RowState;
  } finally {
    db.close();
  }
}

interface LedgerRow { provider: string; model: string; status: string; http_status: number | null; operation: string; error_kind: string | null; input_tokens: number | null }
/** The user's ledger rows since `since`, in the order the calls started. */
function ledger(userId: string, since: string): LedgerRow[] {
  const db = openLocalD1();
  try {
    return db.prepare(`
      SELECT provider, model, status, http_status, operation, error_kind, input_tokens
      FROM llm_generations WHERE user_id = ? AND started_at >= ? ORDER BY started_at, rowid
    `).all(userId, since) as LedgerRow[];
  } finally {
    db.close();
  }
}

/** The chat model requests (not count_tokens) whose conversation carries `tag`, oldest first. */
async function chatRequests(tag: string): Promise<FakeCall[]> {
  return (await fakeCalls()).filter((call) => call.kind === 'messages' && call.writer === 'chat' && call.allUserText.includes(tag));
}

/** provider/status of each request, e.g. "anthropic:529". */
const trail = (calls: FakeCall[]) => calls.map((call) => `${call.provider}:${call.status}`);

test.describe.serial('provider failover to Amazon Bedrock', () => {
  let a: ApiUser;

  test.beforeAll(async () => {
    await fakeReset();
    a = await apiUser('failover-a');
  });

  test.afterEach(async () => {
    await fakeControl({ primaryFail: null });
  });

  test.afterAll(async () => {
    await fakeControl({ primaryFail: null });
    await a?.api.dispose();
  });

  test('(f1) a 529 on the first chat round: Bedrock answers it and the rest of that request, the write runs once, the next turn returns to the Anthropic API', async () => {
    // Baseline: the same turn with no failure, to know what one write does to the row.
    const baselineRow = seedRow(a.user.id, 'Acme Baseline');
    const baselineBefore = rowState(baselineRow);
    const baselineMessage = `Acme Baseline ${BERLIN_MESSAGE} (baseline)`;
    await chat(a, baselineMessage);
    const baselineAfter = rowState(baselineRow);
    expect(baselineAfter.status).toBe('interview');
    const writeRevisionDelta = baselineAfter.revision - baselineBefore.revision;
    expect(writeRevisionDelta).toBeGreaterThan(0);
    expect(trail(await chatRequests(baselineMessage))).toEqual(['anthropic:200', 'anthropic:200', 'anthropic:200']);

    const zapier = seedRow(a.user.id, 'Zapier');
    const before = rowState(zapier);
    const message = `Zapier ${BERLIN_MESSAGE} (first round fails)`;
    const since = new Date().toISOString();
    await fakeControl({ primaryFail: { status: 529, count: 2 } });
    const result = await chat(a, message);

    // The turn finished as if nothing happened.
    expect(result.executed).toEqual([{ type: 'tracker_updated', sessionId: zapier, status: 'interview' }]);
    expect(result.reply).toBe('Moved Zapier to interview.');

    // The write ran once: the row moved by exactly what one write does.
    const after = rowState(zapier);
    expect(after.status).toBe('interview');
    expect(after.interview_at).not.toBeNull();
    expect(after.revision - before.revision).toBe(writeRevisionDelta);

    // Round 1: two 529s from the Anthropic API (the SDK retried once), then Bedrock. Rounds 2 and 3 of the same
    // request stay on Bedrock, with no attempt on the Anthropic API.
    const calls = await chatRequests(message);
    expect(trail(calls)).toEqual(['anthropic:529', 'anthropic:529', 'bedrock:200', 'bedrock:200', 'bedrock:200']);
    expect(calls.map((call) => call.model)).toEqual([HAIKU, HAIKU, HAIKU_BEDROCK, HAIKU_BEDROCK, HAIKU_BEDROCK]);
    expect(calls.every((call) => call.auth === 'bearer'), 'SDK 1.x sends Authorization: Bearer').toBe(true);
    // Bedrock got the same request: same tools, same markers, same static prefix.
    const [primaryTry, , bedrockCall] = calls;
    expect(bedrockCall.tools).toEqual(primaryTry.tools);
    expect(bedrockCall.markers.map((m) => [m.where, m.ttl])).toEqual(primaryTry.markers.map((m) => [m.where, m.ttl]));
    expect(bedrockCall.staticPrefixHash).toBe(primaryTry.staticPrefixHash);
    // Bedrock has its own cache: round 1 there writes, it does not read what the Anthropic API cached earlier.
    expect(bedrockCall.usage?.cacheRead).toBe(0);
    expect(bedrockCall.usage?.cacheCreation).toBeGreaterThan(0);
    // Round 2 on Bedrock reads what round 1 wrote there.
    expect(calls[3].usage?.cacheRead).toBeGreaterThan(0);

    // The ledger: one failed anthropic row for round 1, then Bedrock rows for all three rounds.
    expect(ledger(a.user.id, since).map((r) => [r.provider, r.model, r.status, r.http_status, r.operation])).toEqual([
      ['anthropic', HAIKU, 'failed', 529, 'general_chat'],
      ['bedrock', HAIKU_BEDROCK, 'response_received', null, 'general_chat'],
      ['bedrock', HAIKU_BEDROCK, 'response_received', null, 'tool_call:get_applications'],
      ['bedrock', HAIKU_BEDROCK, 'response_received', null, 'tool_call:set_application_status'],
    ]);

    // The next user turn is a new request: it starts on the Anthropic API again (the client history is plain text).
    const next = `Danke (next turn after the failover)`;
    await chat(a, next);
    expect(trail(await chatRequests(next))).toEqual(['anthropic:200']);
  });

  test('(f2) a 529 on the round whose answer is the write: that round and the rest of the request run on Bedrock, the write runs once, the next turn returns to the Anthropic API', async () => {
    const row = seedRow(a.user.id, 'Globex');
    const before = rowState(row);
    const message = `Globex ${BERLIN_MESSAGE} (write round fails)`;
    const since = new Date().toISOString();
    // Let round 1 (the look-up) through, then fail one whole call.
    await fakeControl({ primaryFail: { status: 529, count: 2, skip: 1 } });
    const result = await chat(a, message);

    expect(result.executed).toEqual([{ type: 'tracker_updated', sessionId: row, status: 'interview' }]);
    expect(rowState(row).status).toBe('interview');
    expect(rowState(row).revision - before.revision, 'one write, not two').toBeGreaterThan(0);

    const calls = await chatRequests(message);
    expect(trail(calls)).toEqual(['anthropic:200', 'anthropic:529', 'anthropic:529', 'bedrock:200', 'bedrock:200']);
    // Round 3 carries the tool_result of the write that Bedrock's round asked for, exactly once.
    const results = calls[4].toolResults.filter((text) => text.includes('"ok":true') && text.includes('<<Globex>>') && text.includes('"status":"interview"'));
    expect(results).toHaveLength(1);
    // It went to Bedrock, with Bedrock's own thinking block in the history; the Anthropic API never saw it.
    expect(calls[4].provider).toBe('bedrock');

    expect(ledger(a.user.id, since).map((r) => [r.provider, r.status, r.operation])).toEqual([
      ['anthropic', 'response_received', 'general_chat'],
      ['anthropic', 'failed', 'tool_call:get_applications'],
      ['bedrock', 'response_received', 'tool_call:get_applications'],
      ['bedrock', 'response_received', 'tool_call:set_application_status'],
    ]);

    const next = `Thanks (next turn after the write-round failover)`;
    await chat(a, next);
    expect(trail(await chatRequests(next))).toEqual(['anthropic:200']);
  });

  test('(f2b) the fake refuses a Bedrock-signed thinking block on the Anthropic endpoint, so a request that hops back mid-loop fails in CI', async () => {
    // A thinking block Bedrock signed, replayed against the Anthropic endpoint, must be a 400.
    const replay = await fetch(`${FAKE_ANTHROPIC_URL}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer e2e-stub-key' },
      body: JSON.stringify({
        model: HAIKU,
        max_tokens: 100,
        system: 'You are the Useful Apply assistant. Useful Apply is a job application dashboard',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: [{ type: 'thinking', thinking: 'x', signature: 'bedrock-sig:sig_fake_1' }, { type: 'tool_use', id: 'toolu_1', name: 'get_applications', input: {} }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{}' }] },
        ],
      }),
    });
    expect(replay.status).toBe(400);
    expect(await replay.text()).toContain('signature');
  });

  test('(f3) a 400 from the Anthropic API never reaches Bedrock: the turn fails as it does today', async () => {
    const row = seedRow(a.user.id, 'Initech');
    const message = `Initech ${BERLIN_MESSAGE} (bad request)`;
    const since = new Date().toISOString();
    await fakeControl({ primaryFail: { status: 400, count: 1 } });
    const response = await postChat(a, message);

    expect(response.status()).toBe(500);
    expect(rowState(row)).toMatchObject({ status: 'applied', interview_at: null });
    const calls = await chatRequests(message);
    expect(trail(calls)).toEqual(['anthropic:400']);
    expect((await fakeCalls()).filter((call) => call.provider === 'bedrock' && call.allUserText.includes(message))).toEqual([]);
    expect(ledger(a.user.id, since).map((r) => [r.provider, r.status, r.http_status])).toEqual([['anthropic', 'failed', 400]]);
  });

  test('(f4) a kit whose CV writer gets a 529: Bedrock writes the CV, the other writers stay on the Anthropic API, one charge and no refund', async () => {
    const kitUser = await apiUser('failover-kit');
    const user = kitUser.user;
    const start = creditsOf(user.id).total;
    const created = await runTool<{ id: string }>('e2e/tools/ops.ts', ['create-application', JSON.stringify({ userId: user.id, jobDescription: JOB_DESCRIPTION })]);
    const since = new Date().toISOString();
    await fakeReset();
    await fakeControl({ primaryFail: { status: 529, count: 2, writer: 'cv' } });

    const events: AgentEvent[] = await callAgent(kitUser.api, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId: created.id }, `req-failover-${Date.now()}`);
    const done = events.find((event) => event.type === 'workflow_complete');
    expect(done, JSON.stringify(events.slice(-3))).toBeTruthy();
    expect(done?.creditsRefunded ?? 0).toBe(0);
    expect(creditsOf(user.id).total).toBe(start - 2.0);

    const stored = storedApplication(user.id, created.id);
    expect(stored?.generation_status).toBe('succeeded');
    expect(stored?.generated_cv?._optimizedCVData, 'the CV Bedrock wrote was stored').toBeTruthy();
    expect(stored?.cover_letter?.body).toContain('Calder Industrial Components');

    const requests = (await fakeCalls()).filter((call) => call.kind === 'messages');
    const cv = requests.filter((call) => call.writer === 'cv');
    expect(trail(cv)).toEqual(['anthropic:529', 'anthropic:529', 'bedrock:200']);
    expect(cv[2].model).toBe('anthropic.claude-sonnet-5-5');
    expect(requests.filter((call) => call.writer !== 'cv' && call.provider === 'bedrock')).toEqual([]);

    const rows = ledger(user.id, since);
    const cvRows = rows.filter((r) => r.operation === 'optimize_cv').map((r) => [r.provider, r.model, r.status, r.http_status]);
    expect(cvRows).toEqual([
      ['anthropic', 'claude-sonnet-5-5', 'failed', 529],
      ['bedrock', 'anthropic.claude-sonnet-5-5', 'response_received', null],
    ]);
    expect(rows.filter((r) => r.operation !== 'optimize_cv' && r.provider === 'bedrock')).toEqual([]);
    await kitUser.api.dispose();
  });

  test('(f5) a streamed CV writer whose connection is reset after the headers: Bedrock writes the CV, the failed row keeps its usage, one charge', async () => {
    const kitUser = await apiUser('failover-stream');
    const user = kitUser.user;
    const start = creditsOf(user.id).total;
    const created = await runTool<{ id: string }>('e2e/tools/ops.ts', ['create-application', JSON.stringify({ userId: user.id, jobDescription: JOB_DESCRIPTION })]);
    const since = new Date().toISOString();
    await fakeReset();
    await fakeControl({ primaryStreamCut: { count: 1, writer: 'cv' } });

    const events: AgentEvent[] = await callAgent(kitUser.api, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId: created.id }, `req-failover-stream-${Date.now()}`);
    const done = events.find((event) => event.type === 'workflow_complete');
    expect(done, JSON.stringify(events.slice(-3))).toBeTruthy();
    expect(done?.creditsRefunded ?? 0).toBe(0);
    expect(creditsOf(user.id).total).toBe(start - 2.0);

    const stored = storedApplication(user.id, created.id);
    expect(stored?.generation_status).toBe('succeeded');
    expect(stored?.generated_cv?._optimizedCVData, 'the CV Bedrock wrote was stored').toBeTruthy();

    const cv = (await fakeCalls()).filter((call) => call.kind === 'messages' && call.writer === 'cv');
    // The first request streamed and was cut after its headers (it never got a 5xx); Bedrock answered the second.
    expect(cv.map((call) => [call.provider, call.stream, call.streamCut])).toEqual([['anthropic', true, true], ['bedrock', true, false]]);
    expect(cv[1].model).toBe('anthropic.claude-sonnet-5-5');

    const cvRows = ledger(user.id, since).filter((r) => r.operation === 'optimize_cv');
    expect(cvRows.map((r) => [r.provider, r.model, r.status, r.error_kind])).toEqual([
      ['anthropic', 'claude-sonnet-5-5', 'failed', 'connection_error'],
      ['bedrock', 'anthropic.claude-sonnet-5-5', 'response_received', null],
    ]);
    expect(cvRows[0].input_tokens, 'the cut stream reported its input usage in message_start').toBeGreaterThan(0);
    await kitUser.api.dispose();
  });
});
