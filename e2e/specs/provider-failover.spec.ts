import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { storedApplication } from '../lib/app';
import { BASE_URL } from '../lib/env';
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
 *  - a 529 on the FIRST round of a chat turn that ends in a write: Bedrock answers that round, the tool loop
 *    continues, the write runs exactly once (the same D1 effect as a turn with no failure), the next rounds
 *    go back to the Anthropic API (failover is per call), and the ledger holds one failed 'anthropic' row and
 *    one 'bedrock' row for that round;
 *  - a 529 on the round whose answer IS the write call: Bedrock's tool_use and thinking block are accepted
 *    when the next round is sent back to the Anthropic API, and the write still runs once;
 *  - a 400 from the Anthropic API never reaches Bedrock: the turn fails like it does today, one failed row;
 *  - a kit generation whose CV writer gets a 529 (the writers run in parallel): that writer is answered by
 *    Bedrock (Sonnet 5.5, `anthropic.claude-sonnet-5-5`), the others never leave the Anthropic API, and the
 *    user is charged once, with no refund.
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

interface LedgerRow { provider: string; model: string; status: string; http_status: number | null; operation: string; error_kind: string | null }
/** The user's ledger rows since `since`, in the order the calls started. */
function ledger(userId: string, since: string): LedgerRow[] {
  const db = openLocalD1();
  try {
    return db.prepare(`
      SELECT provider, model, status, http_status, operation, error_kind
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

  test('(f1) a 529 on the first chat round: Bedrock answers it, the write runs once, the next rounds return to the Anthropic API', async () => {
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

    // Round 1: two 529s from the Anthropic API (the SDK retried once), then Bedrock. Rounds 2 and 3: back on the Anthropic API.
    const calls = await chatRequests(message);
    expect(trail(calls)).toEqual(['anthropic:529', 'anthropic:529', 'bedrock:200', 'anthropic:200', 'anthropic:200']);
    expect(calls.map((call) => call.model)).toEqual([HAIKU, HAIKU, HAIKU_BEDROCK, HAIKU, HAIKU]);
    expect(calls.every((call) => call.auth === 'bearer'), 'SDK 1.x sends Authorization: Bearer').toBe(true);
    // Bedrock got the same request: same tools, same markers, same static prefix.
    const [primaryTry, , bedrockCall] = calls;
    expect(bedrockCall.tools).toEqual(primaryTry.tools);
    expect(bedrockCall.markers.map((m) => [m.where, m.ttl])).toEqual(primaryTry.markers.map((m) => [m.where, m.ttl]));
    expect(bedrockCall.staticPrefixHash).toBe(primaryTry.staticPrefixHash);
    // Bedrock has its own cache: round 1 there writes, it does not read what the Anthropic API cached earlier.
    expect(bedrockCall.usage?.cacheRead).toBe(0);
    expect(bedrockCall.usage?.cacheCreation).toBeGreaterThan(0);

    // The ledger: one failed anthropic row and one bedrock row for round 1, then the primary rounds.
    expect(ledger(a.user.id, since).map((r) => [r.provider, r.model, r.status, r.http_status, r.operation])).toEqual([
      ['anthropic', HAIKU, 'failed', 529, 'general_chat'],
      ['bedrock', HAIKU_BEDROCK, 'response_received', null, 'general_chat'],
      ['anthropic', HAIKU, 'response_received', null, 'tool_call:get_applications'],
      ['anthropic', HAIKU, 'response_received', null, 'tool_call:set_application_status'],
    ]);
  });

  test('(f2) a 529 on the round whose answer is the write: Bedrock\'s tool_use and thinking block go back to the Anthropic API, the write runs once', async () => {
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
    expect(trail(calls)).toEqual(['anthropic:200', 'anthropic:529', 'anthropic:529', 'bedrock:200', 'anthropic:200']);
    // Round 3 carries the tool_result of the write that Bedrock's round asked for, exactly once.
    const results = calls[4].toolResults.filter((text) => text.includes('"status":"interview"'));
    expect(results).toHaveLength(1);
    // And it was sent after Bedrock's answer, so Bedrock's thinking block went back unaltered (the fake rejects it otherwise).
    expect(calls[4].status).toBe(200);

    expect(ledger(a.user.id, since).map((r) => [r.provider, r.status, r.operation])).toEqual([
      ['anthropic', 'response_received', 'general_chat'],
      ['anthropic', 'failed', 'tool_call:get_applications'],
      ['bedrock', 'response_received', 'tool_call:get_applications'],
      ['anthropic', 'response_received', 'tool_call:set_application_status'],
    ]);
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
});
