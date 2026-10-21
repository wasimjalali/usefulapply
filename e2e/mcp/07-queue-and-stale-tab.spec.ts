import { expect, test } from '../lib/worker-logs';
import { MCP_BASE_URL, MCP_FAKE_URL } from '../lib/env';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { applicationRows, ledger, netCharged, operations, reservations, setOperationStatus } from '../lib/mcp-db';
import { editCoverLetter, openApplication, storedApplication, waitForStored } from '../lib/app';
import { fakeCalls, fakeControl, fakeReset } from '../lib/fake-control';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { creditsOf, type TestUser } from '../lib/user';
import type { BrowserContext } from '@playwright/test';

/**
 * PLAN section 7: "a Queue crash mid-run (no double charge, credits released)" and "a stale open tab writing
 * after an agent edit (conflict, no overwrite)".
 *
 * The crash is the data lane's d8 scenario driven through the real thing: the preview Worker's own queue
 * consumer is mid-run (the scripted model is made slow), the worker "dies" (its lease is expired and its
 * attempts used up, in D1), the cron sweeper ends the operation and returns the credits, and then the original
 * run finishes anyway and must change nothing. The stale tab is spec (b) with an agent as the other writer.
 */

const SWEEP = `${MCP_BASE_URL}/__scheduled?cron=*%2F10+*+*+*+*`;

async function userWithDraft(browser: import('@playwright/test').Browser, request: import('@playwright/test').APIRequestContext, label: string) {
  const created = await newAgent(browser, request, label);
  await created.session.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
  const draft = await created.session.ok<{ applicationId: string }>('create_application', { jobDescription: JOB_DESCRIPTION, title: 'Senior FP&A Analyst', company: 'Northwind Foods' });
  return { ...created, applicationId: draft.applicationId };
}

test.describe.serial('queue: a worker that dies mid-run', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await userWithDraft(browser, request, 'crash');
    agent = created.session;
    user = created.user;
    context = created.context;
    applicationId = created.applicationId;
    await fakeControl({ failWriter: null, delayMs: 0 }, MCP_FAKE_URL);
    await fakeReset(MCP_FAKE_URL);
  });

  test.afterAll(async () => {
    await fakeControl({ failWriter: null, delayMs: 0 }, MCP_FAKE_URL);
    await agent?.close();
    await context?.close();
  });

  test('the sweeper ends the operation and releases the credits once; the run that finishes late charges nothing and writes nothing', async ({ request }) => {
    test.setTimeout(200_000);
    const start = creditsOf(user.id).total;
    await fakeControl({ delayMs: 8_000 }, MCP_FAKE_URL);

    const queued = await agent.ok<{ operationId: string; creditsReserved: number; status: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId });
    expect(queued.creditsReserved).toBe(2);
    expect(creditsOf(user.id).total, 'the credits are reserved at once').toBe(start - 2);

    // The consumer picks it up and is now inside the (slow) model call.
    await expect.poll(() => operations(user.id)[0]?.status, { timeout: 30_000, intervals: [500] }).toBe('running');
    const [operation] = operations(user.id);
    expect(operation.attempt).toBe(1);

    // The worker dies: its lease ran out long ago and it has used every attempt. Nothing is told.
    const long = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    setOperationStatus(operation.id, { lease_expires_at: long, attempt: 4, updated_at: long });
    const sweep = await request.get(SWEEP);
    expect(sweep.ok(), await sweep.text()).toBeTruthy();

    await expect.poll(() => operations(user.id)[0]?.status, { timeout: 30_000, intervals: [500] }).toBe('failed');
    expect(operations(user.id)[0].error_code).toBe('stuck');
    expect(creditsOf(user.id).total, 'every credit is back').toBe(start);
    expect(reservations(user.id).map((row) => row.status)).toEqual(['released']);
    expect(netCharged(user.id)).toBe(0);
    const afterSweep = { ledger: ledger(user.id), reservations: reservations(user.id), rows: applicationRows(user.id) };
    expect(afterSweep.ledger.filter((row) => row.transaction_kind === 'refund')).toHaveLength(1);

    const failed = await agent.ok<{ status: string; errorCode: string | null }>('get_operation', { operationId: queued.operationId });
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'stuck' });
    const app = await agent.ok<{ generation: { status: string }; kit: { hasKit: boolean } }>('get_application', { applicationId });
    expect(app.generation.status).toBe('failed');
    expect(app.kit.hasKit).toBe(false);

    // The original run is still inside the model. Let it finish: it must find it no longer owns the operation.
    // The last writer of the pipeline has been called; after its own delay the run has everything it needs to settle.
    await expect
      .poll(async () => (await fakeCalls(MCP_FAKE_URL)).filter((call) => call.writer === 'followUpEmail').length, { timeout: 90_000, intervals: [1_000] })
      .toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    expect(operations(user.id)[0].status, 'the late finisher did not revive the operation').toBe('failed');
    expect(creditsOf(user.id).total, 'and charged nothing').toBe(start);
    expect(ledger(user.id)).toEqual(afterSweep.ledger);
    expect(reservations(user.id)).toEqual(afterSweep.reservations);
    expect(applicationRows(user.id), 'and wrote no kit').toEqual(afterSweep.rows);
    expect((await agent.ok<{ kit: { hasKit: boolean } }>('get_application', { applicationId })).kit.hasKit).toBe(false);
  });

  test('after the crash the same request works again, with a new key, and is charged once', async () => {
    await fakeControl({ delayMs: 0 }, MCP_FAKE_URL);
    const start = creditsOf(user.id).total;
    const retried = await agent.ok<{ operationId: string; creditsReserved: number; deduped: boolean }>('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    expect(retried.deduped).toBe(false);
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: retried.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
    expect(creditsOf(user.id).total).toBe(start - 2);
    expect(netCharged(user.id)).toBe(2);
    expect(operations(user.id).map((row) => row.status)).toEqual(['failed', 'succeeded']);
  });
});

test.describe.serial('queue: one document of the kit fails', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await userWithDraft(browser, request, 'partial');
    agent = created.session;
    user = created.user;
    context = created.context;
    applicationId = created.applicationId;
  });

  test.afterAll(async () => {
    await fakeControl({ failWriter: null, delayMs: 0 }, MCP_FAKE_URL);
    await agent?.close();
    await context?.close();
  });

  test('a kit whose CV writer fails is refunded for that document only, exactly once, and says which document failed', async () => {
    await fakeControl({ failWriter: 'cv', delayMs: 0 }, MCP_FAKE_URL);
    const start = creditsOf(user.id).total;
    const queued = await agent.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId });
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: queued.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toMatch(/succeeded|failed/);
    const operation = await agent.ok<{ status: string; documents: Record<string, boolean> | null }>('get_operation', { operationId: queued.operationId });
    expect(operation.status).toBe('succeeded');
    expect(operation.documents).toMatchObject({ cv: false, coverLetter: true, email: true, followUpEmail: true });

    // The CV is 0.5 of the 2.0: charged 1.5, refunded 0.5, never refunded twice.
    expect(creditsOf(user.id).total).toBe(start - 1.5);
    expect(netCharged(user.id)).toBe(1.5);
    const refunds = ledger(user.id).filter((row) => row.transaction_kind === 'refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(0.5);
    const app = await agent.ok<{ kit: { documentErrors: Record<string, string> | null; coverLetter: { exists: boolean }; cv: { exists: boolean } } }>('get_application', { applicationId });
    expect(app.kit.coverLetter.exists).toBe(true);
    expect(Object.keys(app.kit.documentErrors ?? {})).toEqual(expect.arrayContaining(['cv']));
  });
});

test.describe.serial('a stale web tab after an agent edit', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await userWithDraft(browser, request, 'stale');
    agent = created.session;
    user = created.user;
    context = created.context;
    applicationId = created.applicationId;
    await agent.ok('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('the tab that loaded the application before the agent edited it gets the conflict notice and overwrites nothing', async () => {
    const CONFLICT = 'This application was updated elsewhere. We loaded the latest version.';
    // The stale tab: opened now, with its own 15 s revision poll switched off so the write itself is what is tested (spec c covers the poll).
    const tab = await context.newPage();
    await tab.addInitScript(() => {
      const original = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => (ms === 15_000 ? 0 : original(handler, ms, ...args))) as typeof window.setInterval;
    });
    await openApplication(tab);
    const loaded = storedApplication(user.id);

    // The agent edits the letter after the tab loaded it.
    const current = await agent.ok<{ revision: number }>('get_application', { applicationId });
    const edit = await agent.ok<{ revision: number }>('edit_document_text', {
      applicationId,
      revision: current.revision,
      document: 'cover_letter',
      salutation: 'Dear Ms Keller,',
      paragraphs: ['This is the letter the agent saved first.', 'Nothing a second tab saves later may replace it.'],
      closing: 'Best regards,',
    });
    const afterAgent = await waitForStored(user.id, (row) => row.cover_letter?.body?.includes('the agent saved first') === true, "the agent's letter");
    expect(afterAgent.revision).toBeGreaterThan(loaded?.revision ?? 0);
    expect(afterAgent.revision).toBe(edit.revision);

    // The stale tab edits the same letter and saves.
    const staleLetter = 'Dear Northwind team,\n\nThis letter was written in a stale tab and must not land.\n\nKind regards,\nTomas Brandt';
    await editCoverLetter(tab, staleLetter);
    await expect(tab.getByText(CONFLICT)).toBeVisible({ timeout: 20_000 });

    // Nothing was overwritten: the agent's letter and revision are what is stored, and what the tab shows after it reloads.
    const final = storedApplication(user.id);
    expect(final?.cover_letter?.body).toContain('the agent saved first');
    expect(final?.cover_letter?.body).not.toContain('stale tab');
    expect(final?.revision).toBe(afterAgent.revision);
    await tab.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(tab.getByText(/the agent saved first/).first()).toBeVisible();
    await expect(tab.getByText(/stale tab and must not land/)).toHaveCount(0);
    await tab.close();

    // And the other way round: the agent holding an old revision after a web edit is refused, and the web edit survives.
    const page = await context.newPage();
    await openApplication(page);
    await editCoverLetter(page, 'Dear Northwind team,\n\nThis letter was written in the web app.\n\nKind regards,\nTomas Brandt');
    await waitForStored(user.id, (row) => row.cover_letter?.body?.includes('written in the web app') === true, 'the web edit');
    const refused = await agent.fails('edit_document_text', {
      applicationId,
      revision: edit.revision,
      document: 'cover_letter',
      paragraphs: ['The agent writes again from an old revision.'],
    });
    expect(refused).toMatch(/revision/i);
    expect(storedApplication(user.id)?.cover_letter?.body).toContain('written in the web app');
    await page.close();
  });
});
