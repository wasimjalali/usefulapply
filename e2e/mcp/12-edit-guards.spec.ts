import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { applicationRows } from '../lib/mcp-db';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import type { BrowserContext } from '@playwright/test';
import type { TestUser } from '../lib/user';

/**
 * The refusals of the edit and tracker tools, one by one. Every refusal names what was wrong in words an agent
 * can act on, and every one leaves the application exactly as it was (same revision, same stored columns).
 */

interface Outline {
  revision: number;
  lists: Array<{ list: string; items: Array<{ handle: string; label: string }> }>;
  headings: Record<string, string>;
  renameableAs: Record<string, string[]>;
}

test.describe.serial('edit tools refuse what they cannot do safely, and change nothing when they do', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;
  let outline: Outline;

  /** Run a refused call and prove the stored application did not move. */
  async function refused(name: string, args: Record<string, unknown>, expected: RegExp): Promise<string> {
    const before = applicationRows(user.id);
    const text = await agent.fails(name, args);
    expect(text, `${name}: ${text}`).toMatch(expected);
    expect(text, 'no internals in a refusal').not.toMatch(/ZodError|at \w+ \(|SQLITE|undefined|\[object/);
    expect(applicationRows(user.id), `${name} changed something`).toEqual(before);
    return text;
  }

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'guards');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    applicationId = (await agent.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' })).applicationId;
    const kit = await agent.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
    outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('update_cv_content: only text fields, all or nothing, nothing that could reach the structure', async () => {
    const revision = outline.revision;
    const role = outline.lists.find((list) => list.list === 'experience')?.items[0];
    expect(role).toBeTruthy();
    // Includes names every JavaScript object has: they must read as "not a field", never as an internal error.
    for (const path of ['__proto__.polluted', 'constructor.prototype.polluted', 'constructor.name.first', 'toString.a.b.0', 'hasOwnProperty.a.b', 'experience.0.id', 'experience.0.hidden', 'sectionHeaders.summary', 'analysis.summary', 'personal.nonexistent', 'personal.constructor', 'nothing.here']) {
      await refused('update_cv_content', { applicationId, revision, fields: [{ path, value: 'x' }] }, /is not a text field that can be edited/);
    }
    // All or nothing: the first field is valid, the second is not, and the first must not land.
    await refused(
      'update_cv_content',
      { applicationId, revision, fields: [{ path: 'summary', value: 'A summary that must not land.' }, { path: '__proto__.x', value: 'x' }] },
      /is not a text field that can be edited/,
    );
    // Too long, empty list, stale revision.
    const longValue = await agent.call('update_cv_content', { applicationId, revision, fields: [{ path: 'summary', value: 'x'.repeat(5_001) }] });
    expect(longValue.isError).toBe(true);
    expect((await agent.call('update_cv_content', { applicationId, revision, fields: [] })).isError).toBe(true);
    await refused('update_cv_content', { applicationId, revision: revision + 5, fields: [{ path: 'summary', value: 'x' }] }, /revision/i);
    await refused('update_cv_content', { applicationId, revision: revision - 1, fields: [{ path: 'summary', value: 'x' }] }, /revision/i);
  });

  test('update_cv_content: values equal to the current ones are refused and leave no version behind', async () => {
    const before = await agent.ok<{ revision: number; cv: { summary: string } }>('get_cv', { which: 'tailored', applicationId });
    const original = before.cv.summary;
    const edited = await agent.ok<{ revision: number }>('update_cv_content', { applicationId, revision: before.revision, fields: [{ path: 'summary', value: 'Financial analyst focused on forecasting accuracy.' }] });
    // A retry loop sending the same value again must not save, bump the revision or write history.
    for (let attempt = 0; attempt < 3; attempt++) {
      await refused('update_cv_content', { applicationId, revision: edited.revision, fields: [{ path: 'summary', value: 'Financial analyst focused on forecasting accuracy.' }] }, /already the current values, so nothing changed/);
    }
    const current = await agent.ok<{ revision: number }>('get_cv', { which: 'tailored', applicationId });
    expect(current.revision).toBe(edited.revision);
    // One undo goes back to the text before the edit; with copies of the edit in the history it would stay on the edit.
    await agent.ok('undo_last_edit', { applicationId, group: 'cv' });
    const restored = await agent.ok<{ cv: { summary: string } }>('get_cv', { which: 'tailored', applicationId });
    expect(restored.cv.summary).toBe(original);
    outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
  });

  test('add_cv_item: an entry twice, a skill that is already there, and a skill added to something that is not a group are refused', async () => {
    const revision = outline.revision;
    const item = { kind: 'certification', name: 'CFA Level I', issuer: 'CFA Institute', date: '2024' };
    const first = await agent.ok<{ revision: number }>('add_cv_item', { applicationId, revision, item });
    await refused('add_cv_item', { applicationId, revision: first.revision, item }, /already|twin|same|duplicate/i);
    const group = outline.lists.find((list) => list.list === 'skills')?.items[0];
    await refused('add_cv_item', { applicationId, revision: first.revision, item: { kind: 'skill_item', groupHandle: group?.handle, skill: 'Excel' } }, /already|duplicate/i);
    await refused('add_cv_item', { applicationId, revision: first.revision, item: { kind: 'skill_item', groupHandle: 'experience:nope', skill: 'Anaplan' } }, /not a skill group handle/);
    outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
  });

  test('set_cv_item_visibility and edit_cv_structure: exactly one target, a whole list in a new order, only the headings offered', async () => {
    const revision = outline.revision;
    const bullets = outline.lists.find((list) => list.list.startsWith('bullets:'));
    const handles = bullets?.items.map((item) => item.handle) ?? [];
    expect(handles.length).toBeGreaterThanOrEqual(2);

    await refused('set_cv_item_visibility', { applicationId, revision, handle: handles[0], section: 'summary', hidden: true }, /either handle or section|handle or section/i);
    await refused('set_cv_item_visibility', { applicationId, revision, hidden: true }, /either handle or section|handle or section/i);
    await refused('set_cv_item_visibility', { applicationId, revision, handle: handles[0], hidden: true }, /Only entries, skill groups, single skills and whole sections can be hidden/);

    await refused('edit_cv_structure', { applicationId, revision, operation: 'reorder', list: bullets!.list, order: [handles[0]] }, /has to list all \d+ entries exactly once/);
    await refused('edit_cv_structure', { applicationId, revision, operation: 'reorder', list: bullets!.list, order: [handles[0], handles[0]] }, /same entry twice/);
    await refused('edit_cv_structure', { applicationId, revision, operation: 'reorder', list: bullets!.list }, /list and order/i);
    await refused('edit_cv_structure', { applicationId, revision, operation: 'rename_heading', section: 'experience', heading: 'Chief Executive Duties' }, /not one this CV can use/);
    const [section, current] = Object.entries(outline.headings).find(([key]) => outline.renameableAs[key]) ?? [];
    await refused('edit_cv_structure', { applicationId, revision, operation: 'rename_heading', section, heading: current }, /not one this CV can use/);
    await refused('edit_cv_structure', { applicationId, revision, operation: 'rename_heading', section: 'experience' }, /section and heading|heading/i);
  });

  test('delete_cv_item: the last entry of a section, an unknown handle and a stale revision are refused', async () => {
    const revision = outline.revision;
    const education = outline.lists.find((list) => list.list === 'education')?.items[0];
    expect(education).toBeTruthy();
    await refused('delete_cv_item', { applicationId, revision, handle: education!.handle }, /would leave no|whole section/i);
    await refused('delete_cv_item', { applicationId, revision, handle: 'education:does-not-exist' }, /cannot find that entry/);
    await refused('delete_cv_item', { applicationId, revision: revision + 3, handle: education!.handle }, /revision/i);
    // Down to one bullet is fine; the last bullet of a role is not.
    const bullets = outline.lists.find((list) => list.list.startsWith('bullets:'))!;
    const one = await agent.ok<{ revision: number }>('delete_cv_item', { applicationId, revision, handle: bullets.items[0].handle });
    const remaining = (await agent.ok<Outline>('get_cv_outline', { applicationId })).lists.find((list) => list.list.startsWith('bullets:'))!;
    expect(remaining.items).toHaveLength(bullets.items.length - 1);
    if (remaining.items.length === 1) await refused('delete_cv_item', { applicationId, revision: one.revision, handle: remaining.items[0].handle }, /last bullet on that role/);
    outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
  });

  test('names every JavaScript object has are ordinary unknown handles and lists, never an internal error', async () => {
    const revision = outline.revision;
    for (const handle of ['__proto__', 'constructor', 'toString', 'hasOwnProperty:1', 'experience:__proto__', 'skills:constructor']) {
      const text = await refused('delete_cv_item', { applicationId, revision, handle }, /cannot find that entry/);
      expect(text, handle).not.toMatch(/Something went wrong/);
      const hide = await refused('set_cv_item_visibility', { applicationId, revision, handle, hidden: true }, /cannot find that entry/);
      expect(hide, handle).not.toMatch(/Something went wrong/);
    }
    for (const list of ['__proto__', 'constructor', 'toString', 'bullets:__proto__']) {
      const text = await refused('edit_cv_structure', { applicationId, revision, operation: 'reorder', list, order: ['a', 'b'] }, /not a list I can reorder/);
      expect(text, list).not.toMatch(/Something went wrong/);
    }
    const title = await refused('set_cv_template', { applicationId, templateId: 'constructor' }, /Unknown template/);
    expect(title).not.toMatch(/Something went wrong/);
    const heading = await refused('edit_cv_structure', { applicationId, revision, operation: 'rename_heading', section: 'experience', heading: 'constructor' }, /not one this CV can use/);
    expect(heading).not.toMatch(/Something went wrong/);
  });

  test('set_cv_template: an unknown id lists the valid ones; edit_document_text refuses what would change nothing or leave nothing', async () => {
    const unknown = await refused('set_cv_template', { applicationId, templateId: 'comic-sans-deluxe' }, /Unknown template/);
    expect(unknown).toMatch(/premium-ats/);
    expect(unknown).toMatch(/german-ats/);

    const application = await agent.ok<{ revision: number; kit: { email: { subject: string | null; body: string | null } } }>('get_application', { applicationId, detail: 'full' });
    const email = application.kit.email;
    // The same text again changes nothing: refused, not a silent revision bump.
    await refused('edit_document_text', { applicationId, revision: application.revision, document: 'email', subject: email.subject, body: email.body }, /already the current text, so nothing changed/);
    // Fields the document does not have.
    await refused('edit_document_text', { applicationId, revision: application.revision, document: 'email', paragraphs: ['A paragraph in an email.'] }, /takes subject, body/);
    await refused('edit_document_text', { applicationId, revision: application.revision, document: 'cover_letter' }, /No changes given/);
    expect((await agent.call('edit_document_text', { applicationId, revision: application.revision, document: 'email', subject: '' })).isError).toBe(true);
    await refused('undo_last_edit', { applicationId, group: 'follow_up_email' }, /no earlier version|nothing|no saved/i);
  });

  test('application tools: a call with nothing to change, both ids, no fit yet, and the tracker\'s dates', async () => {
    const draft = await agent.ok<{ applicationId: string; revision: number }>('create_application', { jobDescription: JOB_DESCRIPTION, title: 'Controller', company: 'Fabrikam' });
    await refused('update_application', { applicationId: draft.applicationId, revision: draft.revision }, /at least one field/i);
    await refused('cancel_generation', { applicationId: draft.applicationId, operationId: uuid() }, /exactly one of/i);
    await refused('cancel_generation', {}, /exactly one of/i);
    await refused('explain_fit', { applicationId: draft.applicationId }, /No fit analysis/i);
    await refused('get_cv', { which: 'tailored' }, /applicationId is required/i);
    await refused('get_cv', { which: 'tailored', applicationId: draft.applicationId }, /no tailored CV/i);
    await refused('get_cv_outline', { applicationId: draft.applicationId }, /no tailored CV/i);
    await refused('update_cv_content', { applicationId: draft.applicationId, revision: draft.revision, fields: [{ path: 'summary', value: 'x' }] }, /no tailored CV/i);
    await refused('update_application_status', { applicationId: draft.applicationId, status: 'archived' }, /Invalid option/);
    await refused('update_application_status', { applicationId: draft.applicationId, status: 'applied', interviewAt: 'next tuesday' }, /ISO 8601/i);
    await refused('update_application', { applicationId: draft.applicationId, revision: draft.revision + 4, title: 'Stale' }, /revision/i);

    // Dates: left out keeps the old value while the status stays, clears it when the status changes, null clears it.
    const interview = await agent.ok<{ interviewAt: string | null; followUpDueAt: string | null; revision: number }>('update_application_status', {
      applicationId: draft.applicationId, status: 'interview', interviewAt: '2026-11-10T14:00:00Z', followUpDueAt: '2026-11-17',
    });
    expect(interview).toMatchObject({ interviewAt: '2026-11-10T14:00:00.000Z', followUpDueAt: '2026-11-17T00:00:00.000Z' });
    const same = await agent.ok<{ interviewAt: string | null; followUpDueAt: string | null }>('update_application_status', { applicationId: draft.applicationId, status: 'interview' });
    expect(same).toMatchObject({ interviewAt: '2026-11-10T14:00:00.000Z', followUpDueAt: '2026-11-17T00:00:00.000Z' });
    const cleared = await agent.ok<{ interviewAt: string | null; followUpDueAt: string | null }>('update_application_status', { applicationId: draft.applicationId, status: 'interview', followUpDueAt: null });
    expect(cleared).toMatchObject({ interviewAt: '2026-11-10T14:00:00.000Z', followUpDueAt: null });
    const moved = await agent.ok<{ interviewAt: string | null; followUpDueAt: string | null }>('update_application_status', { applicationId: draft.applicationId, status: 'accepted' });
    expect(moved, 'a new status starts with no dates').toMatchObject({ interviewAt: null, followUpDueAt: null });

    // Paging: a cursor walks the whole list once.
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await agent.ok<{ applications: Array<{ applicationId: string }>; nextCursor: string | null; total: number }>('list_applications', { limit: 1, ...(cursor ? { cursor } : {}) });
      seen.push(...result.applications.map((row) => row.applicationId));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(2);
    expect(seen).toContain(draft.applicationId);
    await refused('get_application', { applicationId: 'not-a-uuid' }, /Invalid UUID/);
  });

  test('the job link takes web addresses only: other schemes and protocol-relative links are refused, an upper-case https link is stored', async () => {
    const draft = await agent.ok<{ applicationId: string; revision: number }>('create_application', { jobDescription: JOB_DESCRIPTION, title: 'Planner', company: 'Contoso' });
    const storedUrl = () => applicationRows(user.id).find((row) => row.id === draft.applicationId)?.job_url;
    // The link is rendered as an href in the web app, so an address that runs script or leaves the site's scheme never reaches the row.
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.com']) {
      await refused('update_application', { applicationId: draft.applicationId, revision: draft.revision, url }, /web link|url/i);
      expect(storedUrl(), url).toBeNull();
      await refused('create_application', { jobDescription: JOB_DESCRIPTION, title: 'Planner', company: 'Contoso', url }, /web link|url/i);
    }
    const accepted = await agent.ok<{ revision: number }>('update_application', { applicationId: draft.applicationId, revision: draft.revision, url: 'HTTPS://example.com/job' });
    expect(accepted.revision).toBeGreaterThan(draft.revision);
    expect(storedUrl()).toBe('HTTPS://example.com/job');
  });
});
