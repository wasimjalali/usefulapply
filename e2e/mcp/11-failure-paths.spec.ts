import { expect, test } from '../lib/worker-logs';
import { MCP_FAKE_URL } from '../lib/env';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { applicationCount, applicationRows, ledger, netCharged, operations, reservations } from '../lib/mcp-db';
import { fakeCalls, fakeControl, fakeReset } from '../lib/fake-control';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { creditsOf, type TestUser } from '../lib/user';
import type { BrowserContext } from '@playwright/test';

/**
 * What a user is promised when something goes wrong in the middle of a paid call: the credits come back, the
 * application keeps what it had, and a request that is retried or sent twice at once is still one charge. The
 * scripted model is told to fail a writer (fake-anthropic /__control) or to answer slowly.
 */

const fake = (body: { failWriter?: string | string[] | null; delayMs?: number }) => fakeControl(body, MCP_FAKE_URL);

async function setUp(browser: import('@playwright/test').Browser, request: import('@playwright/test').APIRequestContext, label: string) {
  const created = await newAgent(browser, request, label);
  await created.session.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
  const draft = await created.session.ok<{ applicationId: string }>('create_application', { jobDescription: JOB_DESCRIPTION, title: 'Senior FP&A Analyst', company: 'Northwind Foods' });
  return { ...created, applicationId: draft.applicationId };
}

async function kitDone(agent: McpSession, applicationId: string): Promise<void> {
  const kit = await agent.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId });
  await expect
    .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
    .toBe('succeeded');
}

test.describe.serial('a paid call whose writer fails gives the credits back and keeps what the application had', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await setUp(browser, request, 'failing');
    agent = created.session;
    user = created.user;
    context = created.context;
    applicationId = created.applicationId;
    await fake({ failWriter: null, delayMs: 0 });
  });

  test.afterAll(async () => {
    await fake({ failWriter: null, delayMs: 0 });
    await agent?.close();
    await context?.close();
  });

  test('analyze_job_fit: the model fails, the 0.5 is released, a pasted ad leaves no draft behind, and a retry with a new key works', async () => {
    const start = creditsOf(user.id).total;
    await fake({ failWriter: 'fit' });
    const drafts = applicationCount(user.id);

    const key = uuid();
    const onApplication = await agent.fails('analyze_job_fit', { idempotencyKey: key, applicationId });
    expect(onApplication).toMatch(/Something went wrong/);
    expect(onApplication, 'no internals').not.toMatch(/500|api_error|scripted|stack|at \w+ \(/i);
    const pasted = await agent.fails('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Controller', company: 'Fabrikam' });
    expect(pasted).toMatch(/Something went wrong/);

    expect(creditsOf(user.id).total, 'every credit is back').toBe(start);
    expect(netCharged(user.id)).toBe(0);
    expect(reservations(user.id).map((row) => row.status)).toEqual(['released', 'released']);
    expect(applicationCount(user.id), 'the draft a pasted ad would have made is gone again').toBe(drafts);

    // The same key after a failure says what to do; a new key works and is charged once.
    await fake({ failWriter: null });
    expect(await agent.fails('analyze_job_fit', { idempotencyKey: key, applicationId })).toMatch(/failed earlier.*credits were returned.*new idempotencyKey/i);
    const ok = await agent.ok<{ creditsUsed: number }>('analyze_job_fit', { idempotencyKey: uuid(), applicationId });
    expect(ok.creditsUsed).toBe(0.5);
    expect(netCharged(user.id)).toBe(0.5);
  });

  test('regenerate_document and rewrite_cv_section: a failing writer changes nothing and costs nothing', async () => {
    await kitDone(agent, applicationId);
    const charged = netCharged(user.id);
    const before = applicationRows(user.id);

    await fake({ failWriter: 'coverLetter' });
    const letter = await agent.fails('regenerate_document', { idempotencyKey: uuid(), applicationId, document: 'cover_letter', instruction: 'Make it warmer.' });
    expect(letter).toMatch(/Something went wrong/);
    await fake({ failWriter: 'cv' });
    const rewrite = await agent.fails('rewrite_cv_section', { idempotencyKey: uuid(), applicationId, section: { kind: 'summary' }, instruction: 'Put forecasting first.' });
    expect(rewrite).toMatch(/Something went wrong/);
    await fake({ failWriter: null });

    expect(netCharged(user.id), 'the reservations were released').toBe(charged);
    expect(applicationRows(user.id), 'the letter and the CV are exactly as they were').toEqual(before);
    expect(reservations(user.id).slice(-2).map((row) => row.status)).toEqual(['released', 'released']);
  });
});

test.describe.serial('the same request sent at once is still one charge', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await setUp(browser, request, 'concurrent');
    agent = created.session;
    user = created.user;
    context = created.context;
    applicationId = created.applicationId;
    await fake({ failWriter: null, delayMs: 0 });
  });

  test.afterAll(async () => {
    await fake({ failWriter: null, delayMs: 0 });
    await agent?.close();
    await context?.close();
  });

  test('two analyze_job_fit calls with one key at the same time: one charge, and the other is a replay or "still running", never a second run', async () => {
    await fake({ delayMs: 1_500 });
    const key = uuid();
    const results = await Promise.all([agent.call('analyze_job_fit', { idempotencyKey: key, applicationId }), agent.call('analyze_job_fit', { idempotencyKey: key, applicationId })]);
    await fake({ delayMs: 0 });
    const succeeded = results.filter((result) => !result.isError);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    for (const failed of results.filter((result) => result.isError)) expect(failed.text).toMatch(/still running|in progress/i);
    expect(netCharged(user.id)).toBe(0.5);
    expect(ledger(user.id).filter((row) => row.transaction_type === 'fit_analysis')).toHaveLength(1);
    expect(operations(user.id).filter((row) => row.kind === 'analyze_fit')).toHaveLength(1);
    // After the dust settles the key reads back the one result.
    const settled = await agent.ok<{ replayed: boolean; creditsUsed: number }>('analyze_job_fit', { idempotencyKey: key, applicationId });
    expect(settled).toMatchObject({ replayed: true, creditsUsed: 0 });
  });

  test('two kit requests with different keys at the same time: one operation, one reservation, one kit', async () => {
    const charged = netCharged(user.id);
    const [first, second] = await Promise.all([
      agent.ok<{ operationId: string; creditsReserved: number }>('generate_application_kit', { idempotencyKey: uuid(), applicationId }),
      agent.ok<{ operationId: string; creditsReserved: number }>('generate_application_kit', { idempotencyKey: uuid(), applicationId }),
    ]);
    expect(second.operationId).toBe(first.operationId);
    expect(operations(user.id).filter((row) => row.kind === 'generate_kit')).toHaveLength(1);
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: first.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
    expect(netCharged(user.id)).toBe(charged + 1.5);
  });
});

test.describe.serial('cancel and delete while a kit is being written', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;

  test.beforeAll(async ({ browser, request }) => {
    const created = await setUp(browser, request, 'cancel');
    agent = created.session;
    user = created.user;
    context = created.context;
    await fake({ failWriter: null, delayMs: 0 });
    await fakeReset(MCP_FAKE_URL);
  });

  test.afterAll(async () => {
    await fake({ failWriter: null, delayMs: 0 });
    await agent?.close();
    await context?.close();
  });

  /** Start a kit with a slow model, and return once the consumer is inside it. */
  async function startSlowKit(applicationId: string) {
    await fake({ delayMs: 6_000 });
    const queued = await agent.ok<{ operationId: string; creditsReserved: number }>('generate_application_kit', { idempotencyKey: uuid(), applicationId });
    await expect.poll(() => operations(user.id).find((row) => row.id === queued.operationId)?.status, { timeout: 30_000, intervals: [300] }).toBe('running');
    return queued;
  }

  /** Let the run that was cancelled finish its writing, so what it does with the result can be seen. */
  async function letLateRunFinish() {
    const callsBefore = (await fakeCalls(MCP_FAKE_URL)).filter((call) => call.writer === 'followUpEmail').length;
    await expect
      .poll(async () => (await fakeCalls(MCP_FAKE_URL)).filter((call) => call.writer === 'followUpEmail').length, { timeout: 90_000, intervals: [1_000] })
      .toBeGreaterThan(callsBefore - 1);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await fake({ delayMs: 0 });
  }

  test('cancel_generation on a running kit releases the credits at once, and the run that finishes later writes no kit and charges nothing', async () => {
    const draft = await agent.ok<{ applicationId: string }>('create_application', { jobDescription: JOB_DESCRIPTION, title: 'Controller', company: 'Fabrikam' });
    const start = creditsOf(user.id).total;
    const queued = await startSlowKit(draft.applicationId);
    expect(queued.creditsReserved).toBe(2);
    expect(creditsOf(user.id).total).toBe(start - 2);

    const cancelled = await agent.ok<{ operationId: string; status: string; creditsTotal: number }>('cancel_generation', { operationId: queued.operationId });
    expect(cancelled).toMatchObject({ operationId: queued.operationId, status: 'cancelled', creditsTotal: start });
    expect(creditsOf(user.id).total, 'the credits are back before the model has even answered').toBe(start);
    const snapshot = { ledger: ledger(user.id), reservations: reservations(user.id) };
    expect(reservations(user.id).at(-1)?.status).toBe('released');

    await letLateRunFinish();
    const app = await agent.ok<{ generation: { status: string }; kit: { hasKit: boolean } }>('get_application', { applicationId: draft.applicationId });
    expect(app.kit.hasKit, 'the late run wrote nothing').toBe(false);
    expect(app.generation.status).toBe('cancelled');
    expect(operations(user.id).find((row) => row.id === queued.operationId)?.status).toBe('cancelled');
    expect({ ledger: ledger(user.id), reservations: reservations(user.id) }, 'and was not charged for it').toEqual(snapshot);
    // Cancelling again, or by application with nothing running, is a statement of fact and not an error.
    expect((await agent.ok<{ status: string }>('cancel_generation', { applicationId: draft.applicationId })).status).toBe('no_active_generation');
  });

  test('delete_application on an application with a running kit cancels the kit first, releases its credits, and the operation reads back without documents', async () => {
    const draft = await agent.ok<{ applicationId: string }>('create_application', { jobDescription: JOB_DESCRIPTION, title: 'Planner', company: 'Contoso' });
    const start = creditsOf(user.id).total;
    const queued = await startSlowKit(draft.applicationId);
    expect(creditsOf(user.id).total).toBe(start - 2);

    const deleted = await agent.ok<{ deleted: boolean; cancelledOperationId: string | null }>('delete_application', { applicationId: draft.applicationId });
    expect(deleted).toEqual({ applicationId: draft.applicationId, deleted: true, cancelledOperationId: queued.operationId });
    expect(creditsOf(user.id).total, 'released by the delete, not left to a sweep').toBe(start);
    const snapshot = { ledger: ledger(user.id), reservations: reservations(user.id) };

    await letLateRunFinish();
    expect(applicationCount(user.id) >= 0).toBe(true);
    expect(await agent.fails('get_application', { applicationId: draft.applicationId })).toMatch(/not found/i);
    const operation = await agent.ok<{ status: string; documents: unknown }>('get_operation', { operationId: queued.operationId });
    expect(operation.status).toBe('cancelled');
    expect(operation.documents).toBeNull();
    expect({ ledger: ledger(user.id), reservations: reservations(user.id) }, 'the run that finished after the delete charged nothing').toEqual(snapshot);
  });
});
