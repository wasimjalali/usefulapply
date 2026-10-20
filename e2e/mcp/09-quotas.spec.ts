import { expect, test } from '../lib/worker-logs';
import { MCP_FAKE_URL } from '../lib/env';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { accountSnapshot, documentRows, netCharged, readQuota, seedQuota, setPlan } from '../lib/mcp-db';
import { fakeCalls, fakeReset } from '../lib/fake-control';
import { JOB_DESCRIPTION, PRIMARY_CV, PRIMARY_CV_DE } from '../lib/model-script';
import type { BrowserContext } from '@playwright/test';
import type { TestUser } from '../lib/user';

/**
 * PLAN section 3.4: "Free but costly operations get quotas": save_cv (a model parse), draft_screening_answers
 * (a model call) and export_documents (Browser Run) each have a per-user rate limit per minute and a daily
 * quota. A quota can't be reached by calling the tool 20, 30 or 60 times in a test run without waiting out the
 * per-minute limit, so the daily counters are seeded the way the product keeps them: a KV key
 * `mcp-quota:<tool>:<user id>:<UTC date>` in the CONTEXT_CACHE namespace the preview shares (see
 * e2e/lib/mcp-db.ts seedQuota). The per-minute limits are reached for real.
 */

const parses = async () => (await fakeCalls(MCP_FAKE_URL)).filter((call) => call.writer === 'cvParse').length;

test.describe.serial('save_cv', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'quota-cv');
    agent = created.session;
    user = created.user;
    context = created.context;
    await fakeReset(MCP_FAKE_URL);
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('the daily quota: at 20 a day the next upload is refused before any model call, and nothing is stored', async () => {
    seedQuota('save_cv', user.id, 19);
    const parsesBefore = await parses();
    const last = await agent.ok<{ name: string }>('save_cv', { target: 'primary', text: PRIMARY_CV });
    expect(last.name).toBe('Tomas Brandt');
    expect(readQuota('save_cv', user.id)).toBe(20);
    expect(await parses()).toBe(parsesBefore + 1);

    const before = accountSnapshot(user.id);
    const refused = await agent.fails('save_cv', { target: 'master', text: PRIMARY_CV_DE });
    expect(refused).toMatch(/The daily limit of 20 CV uploads is reached for this account\. It resets at 00:00 UTC\./);
    expect(await parses(), 'the model was not called').toBe(parsesBefore + 1);
    expect(accountSnapshot(user.id)).toEqual(before);
    expect(documentRows(user.id).map((row) => row.type)).toEqual(['primary_cv']);
    expect(readQuota('save_cv', user.id), 'a refusal counts nothing').toBe(20);
  });

  test('the per-minute limit: the sixth upload inside a minute is refused', async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'quota-cv-rate');
    try {
      const outcomes: string[] = [];
      for (let i = 0; i < 6; i++) {
        const outcome = await created.session.call('save_cv', { target: 'primary', text: PRIMARY_CV });
        outcomes.push(outcome.isError ? outcome.text : 'ok');
      }
      expect(outcomes.slice(0, 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
      expect(outcomes[5]).toMatch(/Too many CV uploads in a short time\. Try again in a minute\./);
      // 5 parses ran and the refused one counted nothing toward the day.
      expect(readQuota('save_cv', created.user.id)).toBe(5);
    } finally {
      await created.session.close();
      await created.context.close();
    }
  });

  test('bad input is refused before the quota is touched: a file with a wrong type, empty text, text and file together', async () => {
    const before = readQuota('save_cv', user.id);
    expect(await agent.fails('save_cv', { target: 'primary', file: { base64: Buffer.from('x').toString('base64'), filename: 'cv.exe', mimeType: 'application/octet-stream' } })).toMatch(/Unsupported file type/);
    expect(await agent.fails('save_cv', { target: 'primary', file: { base64: '!!!not base64!!!', filename: 'cv.txt', mimeType: 'text/plain' } })).toMatch(/not valid base64/);
    expect(await agent.fails('save_cv', { target: 'primary', file: { base64: Buffer.from(PRIMARY_CV).toString('base64'), filename: 'cv.txt', mimeType: 'text/plain' }, text: PRIMARY_CV })).toMatch(/either text or file/);
    expect(await agent.fails('save_cv', { target: 'primary' })).toMatch(/either text or file/);
    expect(readQuota('save_cv', user.id)).toBe(before);
  });
});

test.describe.serial('draft_screening_answers', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'quota-screening');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    applicationId = (await agent.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' })).applicationId;
    await agent.ok('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    await expect
      .poll(async () => (await agent.ok<{ kit: { hasKit: boolean } }>('get_application', { applicationId })).kit.hasKit, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe(true);
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('a free plan is told so, costs nothing and counts nothing', async () => {
    const charged = netCharged(user.id);
    const refused = await agent.fails('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: ['Why do you want to work here?'] });
    expect(refused).toMatch(/not included in this account's plan/);
    expect(refused).toMatch(/usefulapply\.com\/pricing/);
    expect(refused).not.toMatch(/buy|purchase|checkout|upgrade now/i);
    expect(netCharged(user.id)).toBe(charged);
    expect(readQuota('draft_screening_answers', user.id)).toBe(0);
  });

  test('on a paid plan the daily quota of 30 stops the 31st request, and input limits are enforced first', async () => {
    setPlan(user.id, 'plus');
    // More questions than the tool takes, and one that is too long: refused by the schema, nothing counted.
    const tooMany = await agent.call('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: Array.from({ length: 8 }, (_, i) => `Question number ${i + 1}?`) });
    expect(tooMany.isError).toBe(true);
    expect(readQuota('draft_screening_answers', user.id)).toBe(0);

    seedQuota('draft_screening_answers', user.id, 30);
    const charged = netCharged(user.id);
    const refused = await agent.fails('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: ['Why do you want to work here?'] });
    expect(refused).toMatch(/The daily limit of 30 screening answer requests is reached for this account\. It resets at 00:00 UTC\./);
    expect(netCharged(user.id), 'screening costs no credits, refused or not').toBe(charged);
    expect(readQuota('draft_screening_answers', user.id)).toBe(30);
  });

  test('the per-minute limit: at most 5 requests a minute, then the limit message', async () => {
    setPlan(user.id, 'plus');
    seedQuota('draft_screening_answers', user.id, 0);
    const outcomes: string[] = [];
    for (let i = 0; i < 6; i++) {
      const outcome = await agent.call('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: [`Question number ${i + 1}, why this company?`] });
      outcomes.push(outcome.text);
    }
    // Earlier tests in this block already used part of the minute, so the limit may bite before the sixth call; it must bite by the sixth.
    const limited = outcomes.findIndex((text) => /Too many screening answer requests in a short time\. Try again in a minute\./.test(text));
    expect(limited, JSON.stringify(outcomes)).toBeGreaterThanOrEqual(0);
    expect(limited).toBeLessThanOrEqual(5);
    for (const text of outcomes.slice(0, limited)) expect(text).not.toMatch(/Too many/);
  });
});

test.describe.serial('export_documents', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'quota-export');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    applicationId = (await agent.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' })).applicationId;
    await agent.ok('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    await expect
      .poll(async () => (await agent.ok<{ kit: { hasKit: boolean } }>('get_application', { applicationId })).kit.hasKit, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe(true);
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('the daily quota counts one unit per file: at 59 of 60 one file is allowed and two are not', async () => {
    seedQuota('export_documents', user.id, 59);
    const two = await agent.fails('export_documents', { applicationId, formats: ['emails_txt', 'cv_docx'] });
    expect(two).toMatch(/The daily limit of 60 exported files is reached for this account\. It resets at 00:00 UTC\./);
    expect(readQuota('export_documents', user.id), 'a refusal counts nothing').toBe(59);

    const one = await agent.ok<{ files: unknown[] }>('export_documents', { applicationId, formats: ['emails_txt'] });
    expect(one.files).toHaveLength(1);
    expect(readQuota('export_documents', user.id)).toBe(60);
    const refused = await agent.fails('export_documents', { applicationId, formats: ['emails_txt'] });
    expect(refused).toMatch(/daily limit of 60 exported files/);
  });

  test('the per-minute limit: at most 12 export calls a minute, then the limit message', async () => {
    seedQuota('export_documents', user.id, 0);
    const outcomes: string[] = [];
    for (let i = 0; i < 13; i++) {
      const outcome = await agent.call('export_documents', { applicationId, formats: ['emails_txt'] });
      outcomes.push(outcome.isError ? outcome.text : 'ok');
    }
    // The previous test used part of the minute, so the limit may bite before the 13th call; it must bite by then.
    const limited = outcomes.findIndex((outcome) => /Too many exported files in a short time\. Try again in a minute\./.test(outcome));
    expect(limited, JSON.stringify(outcomes)).toBeGreaterThanOrEqual(0);
    expect(limited).toBeLessThanOrEqual(12);
    expect(outcomes.slice(0, limited).every((outcome) => outcome === 'ok')).toBe(true);
  });
});
