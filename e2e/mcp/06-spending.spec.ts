import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, setDailyLimitInUi, uuid } from '../lib/mcp-client';
import { accountSnapshot, applicationCount, ledger, netCharged, operations, reservations, setBalance } from '../lib/mcp-db';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { creditsOf, type TestUser } from '../lib/user';
import type { BrowserContext } from '@playwright/test';

/**
 * PLAN section 7 negatives about money: one idempotencyKey twice is one charge, the same key with other input is
 * refused, a fresh key with identical input is one charge, the account out of credits, and the daily agent cap.
 * Every case ends with the ledger, because "nothing was charged" is a statement about the ledger.
 */

interface FitResult {
  applicationId: string;
  operationId: string;
  replayed: boolean;
  creditsUsed: number;
  balance: { total: number };
  fit: { score: number };
}

const fitCharges = (userId: string) => ledger(userId).filter((row) => row.transaction_type === 'fit_analysis');

async function newUserWithCv(browser: import('@playwright/test').Browser, request: import('@playwright/test').APIRequestContext, label: string) {
  const created = await newAgent(browser, request, label);
  await created.session.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
  return created;
}

async function draft(session: McpSession, title: string): Promise<string> {
  return (await session.ok<{ applicationId: string }>('create_application', { jobDescription: JOB_DESCRIPTION, title, company: 'Northwind Foods' })).applicationId;
}

test.describe.serial('idempotency: a retry is never a second charge', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;
  let otherApplicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newUserWithCv(browser, request, 'idem');
    agent = created.session;
    user = created.user;
    context = created.context;
    applicationId = await draft(agent, 'Senior FP&A Analyst');
    otherApplicationId = await draft(agent, 'Controller');
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('the same key and input twice: one charge, one reservation, the second returns the first result with creditsUsed 0', async () => {
    const start = creditsOf(user.id).total;
    const key = uuid();
    const first = await agent.ok<FitResult>('analyze_job_fit', { idempotencyKey: key, applicationId });
    const second = await agent.ok<FitResult>('analyze_job_fit', { idempotencyKey: key, applicationId });
    expect(first).toMatchObject({ replayed: false, creditsUsed: 0.5 });
    expect(second).toMatchObject({ replayed: true, creditsUsed: 0, operationId: first.operationId, applicationId });
    expect(second.fit).toEqual(first.fit);
    expect(creditsOf(user.id).total).toBe(start - 0.5);
    expect(fitCharges(user.id)).toHaveLength(1);
    expect(reservations(user.id).filter((row) => row.action === 'fit_analysis')).toHaveLength(1);
    expect(operations(user.id).filter((row) => row.kind === 'analyze_fit')).toHaveLength(1);
  });

  test('the same key with different input is refused, and charges nothing', async () => {
    const before = accountSnapshot(user.id);
    const key = uuid();
    await agent.ok('analyze_job_fit', { idempotencyKey: key, applicationId: otherApplicationId });
    const afterFirst = accountSnapshot(user.id);
    // Same key, other application.
    const mismatch = await agent.fails('analyze_job_fit', { idempotencyKey: key, applicationId });
    expect(mismatch).toMatch(/already used with different input/i);
    expect(accountSnapshot(user.id), 'the refused call changed nothing').toEqual(afterFirst);
    expect(netCharged(user.id)).toBe(1);
    expect(afterFirst).not.toEqual(before);
  });

  test('a fresh key with identical input within 10 minutes returns the first request and charges once', async () => {
    const charged = netCharged(user.id);
    const again = await agent.ok<FitResult>('analyze_job_fit', { idempotencyKey: uuid(), applicationId });
    expect(again).toMatchObject({ replayed: true, creditsUsed: 0, applicationId });
    expect(netCharged(user.id)).toBe(charged);
    expect(fitCharges(user.id)).toHaveLength(2);
  });

  test('the kit: the same key twice and then a fresh key are one reservation of 1.5 (the fit is paid), one operation, one kit', async () => {
    const charged = netCharged(user.id);
    const key = uuid();
    const first = await agent.ok<{ operationId: string; creditsReserved: number; deduped: boolean }>('generate_application_kit', { idempotencyKey: key, applicationId });
    const second = await agent.ok<{ operationId: string; creditsReserved: number; deduped: boolean }>('generate_application_kit', { idempotencyKey: key, applicationId });
    const fresh = await agent.ok<{ operationId: string; deduped: boolean }>('generate_application_kit', { idempotencyKey: uuid(), applicationId });
    expect(first).toMatchObject({ creditsReserved: 1.5, deduped: false });
    expect(second).toMatchObject({ operationId: first.operationId, deduped: true });
    expect(fresh).toMatchObject({ operationId: first.operationId, deduped: true });
    expect(operations(user.id).filter((row) => row.kind === 'generate_kit')).toHaveLength(1);
    expect(reservations(user.id).filter((row) => row.action === 'generation_after_fit')).toHaveLength(1);

    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: first.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
    expect(netCharged(user.id)).toBe(charged + 1.5);

    // After it succeeded the same request is still the same operation, still one charge.
    const late = await agent.ok<{ operationId: string; status: string; deduped: boolean }>('generate_application_kit', { idempotencyKey: key, applicationId });
    expect(late).toMatchObject({ operationId: first.operationId, deduped: true });
    expect(netCharged(user.id)).toBe(charged + 1.5);
  });

  test('regenerate_document: same key twice, a changed instruction under the same key, and a fresh key are one 0.5 charge', async () => {
    const charged = netCharged(user.id);
    const key = uuid();
    const input = { applicationId, document: 'cover_letter', instruction: 'Keep it short.' };
    const first = await agent.ok<{ replayed: boolean; creditsUsed: number; revision: number; body: string }>('regenerate_document', { idempotencyKey: key, ...input });
    const second = await agent.ok<{ replayed: boolean; creditsUsed: number; revision: number; body: string }>('regenerate_document', { idempotencyKey: key, ...input });
    expect(first).toMatchObject({ replayed: false, creditsUsed: 0.5 });
    expect(second).toMatchObject({ replayed: true, creditsUsed: 0, revision: first.revision, body: first.body });
    expect(netCharged(user.id)).toBe(charged + 0.5);

    const changed = await agent.fails('regenerate_document', { idempotencyKey: key, ...input, instruction: 'Make it longer.' });
    expect(changed).toMatch(/already used with different input/i);
    const fresh = await agent.ok<{ replayed: boolean; creditsUsed: number }>('regenerate_document', { idempotencyKey: uuid(), ...input });
    expect(fresh).toMatchObject({ replayed: true, creditsUsed: 0 });
    expect(netCharged(user.id)).toBe(charged + 0.5);
  });

  test('rewrite_cv_section: the same key twice is one charge', async () => {
    const charged = netCharged(user.id);
    const key = uuid();
    const input = { applicationId, section: { kind: 'summary' }, instruction: 'Put forecasting first.' };
    const first = await agent.ok<{ outcome: string; replayed: boolean; creditsUsed: number }>('rewrite_cv_section', { idempotencyKey: key, ...input });
    const second = await agent.ok<{ outcome: string; replayed: boolean; creditsUsed: number }>('rewrite_cv_section', { idempotencyKey: key, ...input });
    // The English CV answer the fake gives a summary rewrite is in German words the English CV does not have, so the writer
    // may refuse it: what matters here is that the second call reads back the first, and that the charge matches the outcome.
    expect(second).toMatchObject({ replayed: true, creditsUsed: 0, outcome: first.outcome });
    expect(netCharged(user.id)).toBe(charged + first.creditsUsed);
  });
});

test.describe.serial('out of credits and the daily agent cap', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newUserWithCv(browser, request, 'money');
    agent = created.session;
    user = created.user;
    context = created.context;
    applicationId = await draft(agent, 'Senior FP&A Analyst');
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('out of credits: a neutral message with the facts, nothing reserved, no application or operation created', async () => {
    setBalance(user.id, { monthly: 0.4 });
    const before = accountSnapshot(user.id);
    const applications = applicationCount(user.id);

    const fit = await agent.fails('analyze_job_fit', { idempotencyKey: uuid(), applicationId });
    expect(fit).toMatch(/Not enough credits: 0\.5 needed, 0\.4 available/);
    // The plans page is mentioned as information. Nothing sells, nothing links to a checkout.
    expect(fit).toMatch(/usefulapply\.com\/pricing/);
    expect(fit).not.toMatch(/buy|purchase|checkout|upgrade now|subscribe|click/i);

    const kit = await agent.fails('generate_application_kit', { idempotencyKey: uuid(), applicationId });
    expect(kit).toMatch(/Not enough credits: 2 needed, 0\.4 available/);
    const pasted = await agent.fails('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION });
    expect(pasted).toMatch(/Not enough credits/);

    expect(accountSnapshot(user.id), 'nothing reserved, nothing written').toEqual(before);
    expect(applicationCount(user.id), 'a pasted job ad that could not be paid for leaves no draft behind').toBe(applications);
    expect(operations(user.id)).toEqual([]);
    expect(reservations(user.id)).toEqual([]);

    const account = await agent.ok<{ credits: { total: number } }>('get_account');
    expect(account.credits.total).toBe(0.4);
    setBalance(user.id, { monthly: 4 });
  });

  test('the daily agent cap, set in Connected apps: spending stops at the limit with the cap\'s own message and reserves nothing', async () => {
    const page = await context.newPage();
    await setDailyLimitInUi(page, '0.5');
    const account = await agent.ok<{ dailyAgentCredits: { limit: number; used: number; remaining: number; resetsAt: string } }>('get_account');
    expect(account.dailyAgentCredits).toMatchObject({ limit: 0.5, used: 0, remaining: 0.5 });
    expect(account.dailyAgentCredits.resetsAt).toMatch(/T00:00:00\.000Z$/);

    // 0.5 fits exactly.
    const first = await agent.ok<{ creditsUsed: number }>('analyze_job_fit', { idempotencyKey: uuid(), applicationId });
    expect(first.creditsUsed).toBe(0.5);
    expect((await agent.ok<{ dailyAgentCredits: { used: number; remaining: number } }>('get_account')).dailyAgentCredits).toMatchObject({ used: 0.5, remaining: 0 });

    // The next one does not.
    const other = await draft(agent, 'Controller');
    const before = accountSnapshot(user.id);
    const refused = await agent.fails('analyze_job_fit', { idempotencyKey: uuid(), applicationId: other });
    expect(refused).toMatch(/daily agent credit limit is reached: 0\.5 of 0\.5 credits used today/);
    expect(refused).toMatch(/Settings, Connected apps/);
    const kit = await agent.fails('generate_application_kit', { idempotencyKey: uuid(), applicationId: other });
    expect(kit).toMatch(/daily agent credit limit/);
    const letter = await agent.fails('regenerate_document', { idempotencyKey: uuid(), applicationId, document: 'cover_letter' });
    expect(letter).toBeTruthy();
    expect(accountSnapshot(user.id), 'the refusals reserved nothing and wrote nothing').toEqual(before);

    // The cap is the owner's to move: raising it in the same screen lets the same call through.
    await setDailyLimitInUi(page, '10');
    const allowed = await agent.ok<{ creditsUsed: number }>('analyze_job_fit', { idempotencyKey: uuid(), applicationId: other });
    expect(allowed.creditsUsed).toBe(0.5);
    // And 0 turns agent spending off, while reading and free edits still work.
    await setDailyLimitInUi(page, '0');
    const off = await agent.fails('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION });
    expect(off).toMatch(/daily agent credit limit/);
    await agent.ok('update_notification_settings', { marketing: false });
    await agent.ok('get_account');
    await page.close();
  });
});
