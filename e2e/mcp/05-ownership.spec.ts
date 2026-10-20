import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { accountSnapshot, setPlan } from '../lib/mcp-db';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import type { TestUser } from '../lib/user';

/**
 * PLAN section 7: another user's ids on every id-taking tool. User B holds a valid token and tries user A's
 * application and operation ids on every tool that takes one. Each must read as "not found", in exactly the
 * words an id that never existed gets (no way to tell the two apart), change nothing for A, and cost B nothing.
 * The feed tools take a job id, which is not owned by anyone: they are in 08-feed.spec.ts.
 */

const NOT_FOUND = /not found|may have been deleted|belongs to another account/i;

test.describe.serial('ownership: user B cannot see or change what belongs to user A', () => {
  let a: McpSession;
  let b: McpSession;
  let userA: TestUser;
  let userB: TestUser;
  let applicationId: string;
  let operationId: string;
  let revision: number;
  let sharedKey: string;

  test.beforeAll(async ({ browser, request }) => {
    const createdA = await newAgent(browser, request, 'owner-a');
    a = createdA.session;
    userA = createdA.user;
    await createdA.context.close();
    const createdB = await newAgent(browser, request, 'owner-b');
    b = createdB.session;
    userB = createdB.user;
    await createdB.context.close();

    // A has a CV, a fit check, a finished kit and a pending-free account.
    await a.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    sharedKey = uuid();
    const fit = await a.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: sharedKey, jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' });
    applicationId = fit.applicationId;
    const kit = await a.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId });
    operationId = kit.operationId;
    await expect
      .poll(async () => (await a.ok<{ status: string }>('get_operation', { operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
    revision = (await a.ok<{ revision: number }>('get_application', { applicationId })).revision;

    // B has what a real user has: a CV (so a spend tool gets as far as the ownership check) and a plan that includes screening.
    await b.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    setPlan(userB.id, 'plus');
  });

  test.afterAll(async () => {
    await Promise.all([a?.close(), b?.close()]);
  });

  test('every tool that takes A\'s application or operation id says not found to B, and changes nothing', async () => {
    const key = () => uuid();
    const calls: Array<[string, (id: string) => Record<string, unknown>]> = [
      ['get_application', (id) => ({ applicationId: id })],
      ['get_application', (id) => ({ applicationId: id, detail: 'full' })],
      ['get_cv', (id) => ({ which: 'tailored', applicationId: id })],
      ['get_cv_outline', (id) => ({ applicationId: id })],
      ['explain_fit', (id) => ({ applicationId: id })],
      ['get_operation', (id) => ({ operationId: id })],
      ['update_application', (id) => ({ applicationId: id, revision, title: 'Hijacked' })],
      ['update_application_status', (id) => ({ applicationId: id, status: 'rejected' })],
      ['delete_application', (id) => ({ applicationId: id })],
      ['cancel_generation', (id) => ({ applicationId: id })],
      ['cancel_generation', (id) => ({ operationId: id })],
      ['update_cv_content', (id) => ({ applicationId: id, revision, fields: [{ path: 'summary', value: 'Hijacked' }] })],
      ['add_cv_item', (id) => ({ applicationId: id, revision, item: { kind: 'certification', name: 'Hijacked', issuer: 'Nobody' } })],
      ['set_cv_item_visibility', (id) => ({ applicationId: id, revision, section: 'summary', hidden: true })],
      ['edit_cv_structure', (id) => ({ applicationId: id, revision, operation: 'rename_heading', section: 'summary', heading: 'Profile' })],
      ['delete_cv_item', (id) => ({ applicationId: id, revision, handle: 'experience:x' })],
      ['undo_last_edit', (id) => ({ applicationId: id, group: 'cv' })],
      ['edit_document_text', (id) => ({ applicationId: id, revision, document: 'cover_letter', subject: 'Hijacked' })],
      ['set_cv_template', (id) => ({ applicationId: id, templateId: 'german-ats' })],
      ['export_documents', (id) => ({ applicationId: id, formats: ['emails_txt'] })],
      ['analyze_job_fit', (id) => ({ idempotencyKey: key(), applicationId: id })],
      ['generate_application_kit', (id) => ({ idempotencyKey: key(), applicationId: id, regenerate: true })],
      ['regenerate_document', (id) => ({ idempotencyKey: key(), applicationId: id, document: 'cover_letter' })],
      ['rewrite_cv_section', (id) => ({ idempotencyKey: key(), applicationId: id, section: { kind: 'summary' } })],
      ['draft_screening_answers', (id) => ({ idempotencyKey: key(), applicationId: id, questions: ['Why do you want this job?'] })],
    ];
    const operationCalls = new Set(['get_operation']);

    const beforeA = accountSnapshot(userA.id);
    const beforeB = accountSnapshot(userB.id);
    const problems: string[] = [];
    for (const [name, build] of calls) {
      const isOperation = operationCalls.has(name) || (name === 'cancel_generation' && 'operationId' in build('x'));
      const theirs = await b.call(name, build(isOperation ? operationId : applicationId));
      const nothing = await b.call(name, build(uuid()));
      if (!theirs.isError) problems.push(`${name}: succeeded on another user's id`);
      else if (!NOT_FOUND.test(theirs.text)) problems.push(`${name}: said "${theirs.text}"`);
      // No existence oracle: the words for A's id and for an id that never existed are the same.
      if (theirs.text !== nothing.text) problems.push(`${name}: "${theirs.text}" for A's id but "${nothing.text}" for an unknown id`);
    }
    expect(problems).toEqual([]);
    expect(accountSnapshot(userA.id), 'A is untouched').toEqual(beforeA);
    expect(accountSnapshot(userB.id), 'B was charged nothing and holds nothing new').toEqual(beforeB);

    // A still sees all of it.
    const app = await a.ok<{ applicationId: string; job: { title: string } }>('get_application', { applicationId });
    expect(app.job.title).toContain('Senior FP&A Analyst');
  });

  test('the same idempotencyKey in two accounts is two separate requests, and neither sees the other', async () => {
    // B's own application, B's own fit check, A's key.
    const own = await b.ok<{ applicationId: string }>('create_application', { jobDescription: JOB_DESCRIPTION, title: 'Controller', company: 'Fabrikam' });
    const fit = await b.ok<{ applicationId: string; replayed: boolean; creditsUsed: number }>('analyze_job_fit', { idempotencyKey: sharedKey, applicationId: own.applicationId });
    expect(fit).toMatchObject({ applicationId: own.applicationId, replayed: false, creditsUsed: 0.5 });
    // A's replay of the same key still returns A's own result.
    const replay = await a.ok<{ applicationId: string; replayed: boolean; creditsUsed: number }>('analyze_job_fit', { idempotencyKey: sharedKey, jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' });
    expect(replay).toMatchObject({ applicationId, replayed: true, creditsUsed: 0 });
  });
});
