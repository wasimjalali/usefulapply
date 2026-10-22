import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { netCharged, readQuota, setPlan } from '../lib/mcp-db';
import { MCP_FAKE_URL } from '../lib/env';
import { fakeCalls } from '../lib/fake-control';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import type { BrowserContext } from '@playwright/test';
import type { TestUser } from '../lib/user';

/**
 * draft_screening_answers end to end. The model behind it is Claude Haiku 5.5, answered by the lane's scripted
 * Anthropic fake (e2e/fake-anthropic.ts): one scripted answer per question in the format the product parses,
 * a failure on request, and a check of what the real call looked like (model, cached prefix).
 *
 * Rules under test: paid plans only, costs no credits, at most 5 turns per application (the cap is spent by an
 * atomic claim and handed back when the model fails), the same key is one turn, the daily quota counts a call
 * that reached the model, and the saved answers are what the export reads.
 */

interface Drafted {
  applicationId: string;
  replayed: boolean;
  answers: Array<{ id: string; question: string; answer: string }>;
  screeningTurnsUsed: number;
  screeningTurnCap: number;
  revision: number;
  creditsUsed: number;
}

test.describe.serial('draft_screening_answers', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'screening');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    applicationId = (await agent.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' })).applicationId;
    const kit = await agent.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
    setPlan(user.id, 'plus');
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('two questions come back as two answers, free, saved on the application, with the employer\'s wording wrapped as data', async () => {
    const charged = netCharged(user.id);
    const key = uuid();
    const questions = ['Why do you want to work at Northwind Foods?', 'Do you need a work permit to work in Germany?'];
    const first = await agent.ok<Drafted>('draft_screening_answers', { idempotencyKey: key, applicationId, questions });
    expect(first).toMatchObject({ replayed: false, creditsUsed: 0, screeningTurnsUsed: 1, screeningTurnCap: 5 });
    expect(first.answers).toHaveLength(2);
    for (const [index, answer] of first.answers.entries()) {
      expect(answer.question).toMatch(/^<<[\s\S]*>>$/);
      expect(answer.question).toContain(questions[index]);
      expect(answer.answer).toContain('monthly forecast');
    }
    expect(netCharged(user.id)).toBe(charged);
    expect(readQuota('draft_screening_answers', user.id)).toBe(1);

    // The same request again is the same turn: same answers, no new turn, no new quota unit.
    const replay = await agent.ok<Drafted>('draft_screening_answers', { idempotencyKey: key, applicationId, questions });
    expect(replay).toMatchObject({ replayed: true, screeningTurnsUsed: 1, revision: first.revision });
    expect(replay.answers.map((answer) => answer.answer)).toEqual(first.answers.map((answer) => answer.answer));
    expect(readQuota('draft_screening_answers', user.id)).toBe(1);

    const application = await agent.ok<{ kit: { screeningAnswerCount: number } }>('get_application', { applicationId });
    expect(application.kit.screeningAnswerCount).toBe(2);
    // What was saved is what the export reads.
    const exported = await agent.ok<{ files: Array<{ url: string }> }>('export_documents', { applicationId, formats: ['answers_txt'] });
    const file = await agent.request.get(exported.files[0].url);
    expect(file.status()).toBe(200);
    expect(await file.text()).toContain('monthly forecast');
  });

  test('a model that fails hands the turn back, and says so without internals', async () => {
    const failed = await agent.fails('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: ['FAKE-AI-FAIL Why this company?'] });
    expect(failed).toMatch(/Something went wrong/);
    expect(failed).not.toMatch(/scripted|Workers AI|stack/i);
    // The turn was released: the next real request is turn 2, not turn 3.
    const next = await agent.ok<Drafted>('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: ['What is your notice period?'] });
    expect(next.screeningTurnsUsed).toBe(2);
  });

  test('five turns an application: the sixth is refused with the cap, and the saved answers are untouched', async () => {
    // The per-minute limit is 5 calls: let the first minute pass so only the cap is in the way.
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    for (const [index, turn] of [3, 4, 5].entries()) {
      const drafted = await agent.ok<Drafted>('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: [`Question number ${index + 3}: what is your salary expectation?`] });
      expect(drafted.screeningTurnsUsed).toBe(turn);
    }
    const before = (await agent.ok<{ kit: { screeningAnswerCount: number } }>('get_application', { applicationId })).kit.screeningAnswerCount;
    const refused = await agent.fails('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: ['One question too many?'] });
    expect(refused).toMatch(/used all 5 screening answer turns/);
    expect((await agent.ok<{ kit: { screeningAnswerCount: number } }>('get_application', { applicationId })).kit.screeningAnswerCount).toBe(before);
  });

  test('a long list is refused before anything is claimed: more than 7 questions, a question over 1500 characters, a blank one', async () => {
    const quota = readQuota('draft_screening_answers', user.id);
    expect((await agent.call('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: Array.from({ length: 8 }, (_, i) => `Question ${i + 1} here?`) })).isError).toBe(true);
    expect((await agent.call('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: ['x'.repeat(1_501)] })).isError).toBe(true);
    expect((await agent.call('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: ['  '] })).isError).toBe(true);
    expect(readQuota('draft_screening_answers', user.id)).toBe(quota);
  });

  test('the calls are Haiku 5.5 calls with a cached prefix: a second turn reads the CV block, a second user shares the static rules', async ({ browser, request }) => {
    const screening = async () => (await fakeCalls(MCP_FAKE_URL)).filter((call) => call.kind === 'messages' && call.writer === 'screening' && call.status === 200);

    // The first user's turns: every call is Haiku with an effort, static rules and CVs both marked for an hour.
    const mine = await screening();
    expect(mine.length, 'the turns of the tests above').toBeGreaterThanOrEqual(5);
    for (const call of mine) {
      expect(call.model).toBe('claude-haiku-5-5');
      expect(['low', 'medium', 'high']).toContain(call.effort);
      expect(call.markers.map((marker) => [marker.where, marker.ttl])).toEqual([['system', '1h'], ['system', '1h']]);
    }
    // The second turn reads everything the first one had in its prefix and writes nothing new (the application
    // block and the questions come after the last marker).
    const [first, second] = mine;
    expect(first.usage?.cacheCreation).toBeGreaterThan(0);
    expect(second.usage?.cacheRead).toBe((first.usage?.cacheRead ?? 0) + (first.usage?.cacheCreation ?? 0));
    expect(second.usage?.cacheCreation).toBe(0);
    expect(second.staticPrefixHash).toBe(first.staticPrefixHash);

    // A second user with a CV of their own (the same person's facts, one more line): the same static prefix byte for byte, their own CV block.
    const other = await newAgent(browser, request, 'screening-b');
    try {
      await other.session.ok('save_cv', { target: 'primary', text: `${PRIMARY_CV}\n- Prepared the annual budget for the regional team` });
      const otherApplication = (await other.session.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' })).applicationId;
      const kit = await other.session.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId: otherApplication, waitSeconds: 20 });
      await expect
        .poll(async () => (await other.session.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
        .toBe('succeeded');
      setPlan(other.user.id, 'plus');
      const before = (await screening()).length;
      await other.session.ok<Drafted>('draft_screening_answers', { idempotencyKey: uuid(), applicationId: otherApplication, questions: ['What is your notice period?'] });
      const all = await screening();
      expect(all.length).toBe(before + 1);
      const theirs = all[all.length - 1];
      expect(theirs.model).toBe('claude-haiku-5-5');
      expect(theirs.staticPrefixHash, 'the static rules are byte-identical across users').toBe(first.staticPrefixHash);
      expect(theirs.markers[1].prefixHash, 'the CV block is their own').not.toBe(first.markers[1].prefixHash);
      // They read the rules the first user wrote and write only their own CV block.
      expect(theirs.usage?.cacheRead).toBeGreaterThan(0);
      expect(theirs.usage?.cacheRead).toBeLessThan((first.usage?.cacheRead ?? 0) + (first.usage?.cacheCreation ?? 0));
      expect(theirs.usage?.cacheCreation).toBeGreaterThan(0);
    } finally {
      await other.session.close();
      await other.context.close();
    }
  });
});
