import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { applicationRows } from '../lib/mcp-db';
import { openLocalD1 } from '../lib/sqlite';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import type { BrowserContext } from '@playwright/test';
import type { TestUser } from '../lib/user';

/**
 * undo_last_edit must never replace a version it did not record. Only the agent's own edits are in the history:
 * a whole-kit regenerate and a save from the web canvas or editor write the same columns and record nothing.
 * So after one of those, "undo your change" must refuse and leave the newer work exactly as it is (before the
 * fix it put the old version back on top and the newer work was gone for good).
 *
 * Also checks that undo still works when nothing else wrote, and that remainingVersions counts every earlier version.
 */

interface Outline {
  revision: number;
}

test.describe.serial('undo_last_edit refuses to overwrite work it did not record', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  const revisionOf = async () => (await agent.ok<Outline>('get_cv_outline', { applicationId })).revision;
  const editTitle = async (title: string) =>
    agent.ok<{ revision: number }>('update_cv_content', {
      applicationId,
      revision: await revisionOf(),
      fields: [{ path: 'personal.currentTitle', value: title }],
    });

  /** What the web canvas or editor does: write the column straight and bump the revision, recording nothing. */
  function webSave(column: 'generated_cv' | 'email', change: (value: Record<string, unknown>) => void): void {
    const db = openLocalD1();
    try {
      const row = db.prepare(`SELECT ${column} AS value FROM application_sessions WHERE id = ?`).get(applicationId) as { value: string };
      const value = JSON.parse(row.value) as Record<string, unknown>;
      change(value);
      db.prepare(`UPDATE application_sessions SET ${column} = ?, revision = revision + 1 WHERE id = ?`).run(JSON.stringify(value), applicationId);
    } finally {
      db.close();
    }
  }

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'undo-guard');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    applicationId = (await agent.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' })).applicationId;
    const kit = await agent.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('a kit regenerated after the agent\'s edit is not replaced by an undo', async () => {
    await editTitle('Edited Before The Regenerate');
    const regenerated = await agent.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId, regenerate: true, waitSeconds: 20 });
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: regenerated.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');

    const before = applicationRows(user.id);
    const text = await agent.fails('undo_last_edit', { applicationId, group: 'cv' });
    expect(text).toMatch(/changed since the last recorded edit, so nothing was undone/);
    expect(text, 'no internals in a refusal').not.toMatch(/ZodError|at \w+ \(|SQLITE|undefined|\[object/);
    expect(applicationRows(user.id), 'the refused undo changed something').toEqual(before);
  });

  test('a save from the web canvas after the agent\'s edit is not replaced by an undo, in the CV and in a document', async () => {
    await editTitle('Edited Before The Canvas Save');
    webSave('generated_cv', (cv) => {
      cv.content = 'Rewritten by the user in the canvas.';
    });
    let before = applicationRows(user.id);
    const cv = await agent.fails('undo_last_edit', { applicationId, group: 'cv' });
    expect(cv).toMatch(/changed since the last recorded edit/);
    expect(applicationRows(user.id)).toEqual(before);

    const application = await agent.ok<{ revision: number; kit: { email: { subject: string | null } } }>('get_application', { applicationId, detail: 'full' });
    await agent.ok('edit_document_text', { applicationId, revision: application.revision, document: 'email', subject: 'Subject the agent wrote' });
    webSave('email', (email) => {
      email.subject = 'Subject the user typed';
    });
    before = applicationRows(user.id);
    const email = await agent.fails('undo_last_edit', { applicationId, group: 'email' });
    expect(email).toMatch(/changed since the last recorded edit/);
    expect(applicationRows(user.id)).toEqual(before);
  });

  test('with nothing else written in between, undo restores the previous version and counts every earlier one left', async () => {
    // The CV was last written by the canvas above, so the agent starts a fresh run of recorded edits.
    await editTitle('First');
    await editTitle('Second');
    await editTitle('Third');
    const undone = await agent.ok<{ group: string; remainingVersions: number }>('undo_last_edit', { applicationId, group: 'cv' });
    expect(undone.group).toBe('cv');
    // Two rows from the refused cases above (the edits before the regenerate and before the canvas save) plus First and Second.
    expect(undone.remainingVersions).toBe(4);
    expect(JSON.stringify(await agent.ok('get_cv', { which: 'tailored', applicationId }))).toContain('Second');
    // And a second undo walks one further back.
    await agent.ok('undo_last_edit', { applicationId, group: 'cv' });
    expect(JSON.stringify(await agent.ok('get_cv', { which: 'tailored', applicationId }))).toContain('First');
  });
});
