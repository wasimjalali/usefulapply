import { deflateSync } from 'node:zlib';
import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { documentRows, profileRow } from '../lib/mcp-db';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';

/**
 * Every read tool and every free write tool (the feed tools have their own spec), called once with valid input
 * through the MCP client. The SDK client validates each structuredContent against the tool's published
 * outputSchema, so a result that does not match its schema fails here instead of reaching a user as a generic
 * error. The spending tools are exercised in 02-happy-path and 05-spending.
 *
 * One account, in an order that never uses a thing after it was deleted: build the data first (CVs, a fit, a
 * kit), then read it, then edit it, then delete it.
 */

/** A real 8x8 PNG, built here so the spec carries no binary fixture. */
function tinyPng(): string {
  const width = 8;
  const height = 8;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width * 3; x++) raw[y * (width * 3 + 1) + 1 + x] = (x * 7 + y * 13) & 0xff;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

interface Outline {
  revision: number;
  lists: Array<{ list: string; items: Array<{ handle: string; label: string; hidden?: boolean }> }>;
  headings: Record<string, string>;
  renameableAs: Record<string, string[]>;
}

test.describe.serial('tool tour: every read and free write tool once', () => {
  let agent: McpSession;
  let userId: string;
  let applicationId: string;
  let revision: number;
  let operationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'tour');
    agent = created.session;
    userId = created.user.id;
    await created.context.close();
  });

  test.afterAll(async () => {
    await agent?.close();
  });

  test('build the account: CVs, a fit check and a kit', async () => {
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    const master = await agent.ok<{ target: string; replacedExisting: boolean; fileName: string }>('save_cv', {
      target: 'master',
      file: { base64: Buffer.from(`${PRIMARY_CV}\nMaster extras\nPrepared the annual budget for the regional team`).toString('base64'), filename: 'master.txt', mimeType: 'text/plain' },
    });
    expect(master).toMatchObject({ target: 'master', replacedExisting: false, fileName: 'master.txt' });

    const fit = await agent.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' });
    applicationId = fit.applicationId;
    const kit = await agent.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    operationId = kit.operationId;
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
  });

  test('read tools: account, credit history, applications, one application, one operation', async () => {
    const account = await agent.ok<{ credits: { total: number }; dailyAgentCredits: { limit: number; used: number; remaining: number }; cvOnFile: { primary: boolean; master: boolean } }>('get_account');
    expect(account.cvOnFile).toEqual({ primary: true, master: true });
    expect(account.dailyAgentCredits).toMatchObject({ limit: 10, used: 2 });
    expect(account.dailyAgentCredits.remaining).toBe(8);

    const history = await agent.ok<{ transactions: Array<{ amount: number; type: string }> }>('get_credit_history', { limit: 5 });
    expect(history.transactions.length).toBeGreaterThanOrEqual(3);
    expect(history.transactions.some((row) => row.amount === -1.5)).toBe(true);
    await agent.ok('get_credit_history');

    const list = await agent.ok<{ applications: Array<{ applicationId: string; hasKit: boolean; title: string }>; total: number; nextCursor: string | null }>('list_applications', {});
    expect(list.total).toBe(1);
    expect(list.applications[0]).toMatchObject({ applicationId, hasKit: true });
    expect(list.applications[0].title).toMatch(/^<<.*>>$/);
    await agent.ok('list_applications', { status: 'drafted', limit: 1 });
    await agent.ok('list_applications', { status: 'interview' });

    const concise = await agent.ok<{ revision: number; job: { description: string | null }; kit: { hasKit: boolean; coverLetter: { body: string | null; preview: string | null } } }>('get_application', { applicationId });
    revision = concise.revision;
    expect(concise.job.description, 'concise never returns the job ad').toBeNull();
    expect(concise.kit.coverLetter.body).toBeNull();
    expect(concise.kit.coverLetter.preview).toBeTruthy();
    const full = await agent.ok<{ job: { description: string | null }; kit: { coverLetter: { body: string | null } } }>('get_application', { applicationId, detail: 'full' });
    expect(full.job.description).toMatch(/^<<[\s\S]*Northwind Foods[\s\S]*>>$/);
    expect(full.kit.coverLetter.body).toContain('Calder Industrial Components');

    const operation = await agent.ok<{ operationId: string; kind: string; status: string; documents: Record<string, boolean> | null }>('get_operation', { operationId });
    expect(operation).toMatchObject({ operationId, kind: 'generate_kit', status: 'succeeded' });
    expect(operation.documents).toEqual({ cv: true, coverLetter: true, email: true, followUpEmail: true });
  });

  test('read tools: CVs, outline, templates, fit explanation, briefing', async () => {
    const primary = await agent.ok<{ which: string; cv: { personal: { fullName: string } } }>('get_cv', { which: 'primary' });
    expect(primary.cv.personal.fullName).toBe('Tomas Brandt');
    await agent.ok('get_cv', { which: 'master' });
    const tailored = await agent.ok<{ revision: number; templateId: string | null }>('get_cv', { which: 'tailored', applicationId });
    expect(tailored.revision).toBe(revision);

    const outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
    expect(outline.revision).toBe(revision);
    expect(outline.lists.map((list) => list.list)).toEqual(expect.arrayContaining(['experience', 'education', 'skills']));

    const templates = await agent.ok<{ templates: Array<{ id: string; name: string; market: string; paper: string; ats: { readingOrder: string } }>; evalDate: string }>('list_cv_templates');
    expect(templates.templates).toHaveLength(6);
    expect(templates.templates.map((template) => template.id)).toEqual(expect.arrayContaining(['premium-ats', 'german-ats']));

    const fit = await agent.ok<{ matchScore: number | null; summary: string; matchingSkills: string[] }>('explain_fit', { applicationId });
    expect(fit.matchScore).toBeGreaterThan(0);
    expect(fit.summary).toMatch(/match score/i);

    const briefing = await agent.ok<{ followUpsDue: { count: number }; generationsInProgress: { count: number }; newStrongMatches: { count: number } }>('morning_briefing');
    expect(briefing.followUpsDue.count).toBe(0);
    expect(briefing.generationsInProgress.count).toBe(0);
  });

  test('write tools on applications: create, update, status, cancel', async () => {
    const created = await agent.ok<{ applicationId: string; revision: number }>('create_application', {
      jobDescription: 'Financial Controller at Fabrikam. You close the books each month and own the audit relationship.',
      title: 'Financial Controller',
      company: 'Fabrikam',
      url: 'https://careers.fabrikam.example/jobs/42',
    });
    expect(created.revision).toBe(0);

    const updated = await agent.ok<{ revision: number }>('update_application', {
      applicationId: created.applicationId,
      revision: created.revision,
      title: 'Group Financial Controller',
      companyAddress: 'Fabrikam GmbH\nMusterstrasse 1\n10115 Berlin',
      contactPerson: 'Ms Keller',
      letterLanguage: 'de',
    });
    expect(updated.revision).toBeGreaterThan(created.revision);

    const status = await agent.ok<{ status: string; interviewAt: string | null; followUpDueAt: string | null; revision: number }>('update_application_status', {
      applicationId: created.applicationId,
      status: 'applied',
      followUpDueAt: '2026-11-20',
    });
    expect(status).toMatchObject({ status: 'applied', followUpDueAt: '2026-11-20T00:00:00.000Z', interviewAt: null });
    const cleared = await agent.ok<{ followUpDueAt: string | null }>('update_application_status', { applicationId: created.applicationId, status: 'applied', followUpDueAt: null });
    expect(cleared.followUpDueAt).toBeNull();

    const nothing = await agent.ok<{ operationId: string | null; status: string }>('cancel_generation', { applicationId: created.applicationId });
    expect(nothing).toMatchObject({ operationId: null, status: 'no_active_generation' });

    const stored = await agent.ok<{ job: { title: string; companyAddress: string | null; letterLanguage: string } }>('get_application', { applicationId: created.applicationId });
    expect(stored.job.letterLanguage).toBe('de');
    expect(stored.job.title).toContain('Group Financial Controller');
    expect(stored.job.companyAddress).toContain('Musterstrasse 1');

    // This application goes away at the end of the tour; park its id.
    await agent.ok('delete_application', { applicationId: created.applicationId });
  });

  test('CV edit tools: update content, add, hide and show, reorder, rename a heading, delete, set template, undo', async () => {
    let outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
    revision = outline.revision;

    const content = await agent.ok<{ revision: number; changes: Array<{ path: string; after: string }> }>('update_cv_content', {
      applicationId,
      revision,
      fields: [{ path: 'personal.currentTitle', value: 'Senior Financial Analyst' }],
    });
    expect(content.changes[0]).toMatchObject({ path: 'personal.currentTitle', after: 'Senior Financial Analyst' });
    revision = content.revision;

    const added = await agent.ok<{ revision: number; list: string; handle: string | null }>('add_cv_item', {
      applicationId,
      revision,
      item: { kind: 'certification', name: 'CFA Level I', issuer: 'CFA Institute', date: '2024' },
    });
    expect(added.list).toBe('certifications');
    expect(added.handle).toBeTruthy();
    // A second one, so deleting the first later leaves a section behind (the last entry of a section is refused).
    const second = await agent.ok<{ revision: number }>('add_cv_item', {
      applicationId,
      revision: added.revision,
      item: { kind: 'certification', name: 'CMA', issuer: 'IMA', date: '2025' },
    });
    revision = second.revision;

    outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
    const skillGroup = outline.lists.find((list) => list.list === 'skills')?.items[0];
    expect(skillGroup, 'a skill group to add a skill to').toBeTruthy();
    const skill = await agent.ok<{ revision: number }>('add_cv_item', {
      applicationId,
      revision,
      item: { kind: 'skill_item', groupHandle: skillGroup!.handle, skill: 'Anaplan' },
    });
    revision = skill.revision;

    const hidden = await agent.ok<{ revision: number; hidden: boolean }>('set_cv_item_visibility', { applicationId, revision, handle: added.handle, hidden: true });
    expect(hidden.hidden).toBe(true);
    const shown = await agent.ok<{ revision: number; hidden: boolean }>('set_cv_item_visibility', { applicationId, revision: hidden.revision, handle: added.handle, hidden: false });
    expect(shown.hidden).toBe(false);
    revision = shown.revision;
    const sectionHidden = await agent.ok<{ revision: number }>('set_cv_item_visibility', { applicationId, revision, section: 'summary', hidden: true });
    const sectionShown = await agent.ok<{ revision: number }>('set_cv_item_visibility', { applicationId, revision: sectionHidden.revision, section: 'summary', hidden: false });
    revision = sectionShown.revision;

    outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
    const bullets = outline.lists.find((list) => list.list.startsWith('bullets:'));
    expect(bullets?.items).toHaveLength(2);
    const reordered = await agent.ok<{ revision: number; listNow: Array<{ handle: string }> | null }>('edit_cv_structure', {
      applicationId,
      revision,
      operation: 'reorder',
      list: bullets!.list,
      order: bullets!.items.map((item) => item.handle).reverse(),
    });
    expect(reordered.listNow?.map((item) => item.handle)).toEqual(bullets!.items.map((item) => item.handle).reverse());
    revision = reordered.revision;

    outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
    const renameable = Object.entries(outline.renameableAs).find(([section, options]) => options.some((option) => option !== outline.headings[section]));
    expect(renameable, 'a heading with an alternative').toBeTruthy();
    const [section, options] = renameable!;
    const heading = options.find((option) => option !== outline.headings[section]) as string;
    const renamed = await agent.ok<{ revision: number; heading: { section: string; to: string } | null }>('edit_cv_structure', {
      applicationId,
      revision,
      operation: 'rename_heading',
      section,
      heading,
    });
    expect(renamed.heading).toMatchObject({ section, to: heading });
    revision = renamed.revision;

    // delete_cv_item: the certification added above.
    outline = await agent.ok<Outline>('get_cv_outline', { applicationId });
    const certification = outline.lists.find((list) => list.list === 'certifications')?.items[0];
    const removed = await agent.ok<{ revision: number; removed: string }>('delete_cv_item', { applicationId, revision, handle: certification!.handle });
    expect(removed.removed).toContain('CFA Level I');
    revision = removed.revision;

    const templates = await agent.ok<{ templates: Array<{ id: string }> }>('list_cv_templates');
    const current = (await agent.ok<{ templateId: string | null }>('get_cv', { which: 'tailored', applicationId })).templateId;
    const templateId = templates.templates.map((template) => template.id).find((id) => id !== current) as string;
    const template = await agent.ok<{ revision: number; templateId: string; templateName: string }>('set_cv_template', { applicationId, templateId });
    expect(template.templateId).toBe(templateId);
    revision = template.revision;

    // undo_last_edit: the template choice is not in the history, so this restores the CV as it was before the delete.
    const undone = await agent.ok<{ group: string; revision: number; remainingVersions: number }>('undo_last_edit', { applicationId, group: 'cv' });
    expect(undone.group).toBe('cv');
    revision = undone.revision;
    const afterUndo = await agent.ok<Outline>('get_cv_outline', { applicationId });
    expect(afterUndo.lists.find((list) => list.list === 'certifications')?.items.some((item) => item.label.includes('CFA Level I'))).toBe(true);
  });

  test('document tools: edit the cover letter and the emails, export text', async () => {
    const before = await agent.ok<{ revision: number }>('get_application', { applicationId });
    const letter = await agent.ok<{ revision: number; changes: Array<{ field: string }> }>('edit_document_text', {
      applicationId,
      revision: before.revision,
      document: 'cover_letter',
      salutation: 'Dear Ms Keller,',
      paragraphs: ['I write about the Senior FP&A Analyst role.', 'I would like to talk about the rolling forecast.'],
      closing: 'Best regards,',
    });
    expect(letter.changes.map((change) => change.field)).toEqual(expect.arrayContaining(['salutation', 'paragraphs', 'closing']));

    const email = await agent.ok<{ revision: number; changes: Array<{ field: string; after: string | string[] }> }>('edit_document_text', {
      applicationId,
      revision: letter.revision,
      document: 'email',
      subject: 'Application: Senior FP&A Analyst',
      body: 'Dear Hiring Team,\n\nPlease find my CV and cover letter attached.\n\nKind regards,\nTomas Brandt',
    });
    expect(email.changes.map((change) => change.field)).toEqual(expect.arrayContaining(['subject', 'body']));
    const followUp = await agent.ok<{ revision: number }>('edit_document_text', {
      applicationId,
      revision: email.revision,
      document: 'follow_up_email',
      body: 'Dear Hiring Team,\n\nI am following up on my application.\n\nKind regards,\nTomas Brandt',
    });
    revision = followUp.revision;

    const exported = await agent.ok<{ files: Array<{ format: string; url: string; bytes: number }> }>('export_documents', { applicationId, formats: ['emails_txt'] });
    expect(exported.files).toHaveLength(1);
    const file = await agent.request.get(exported.files[0].url);
    expect(file.status()).toBe(200);
    expect(await file.text()).toContain('I am following up on my application.');
  });

  test('profile tools: contact details, notifications, photo', async () => {
    const profile = await agent.ok<{ fullName: string | null; phone: string | null; location: string | null; linkedinUrl: string | null }>('update_profile', {
      fullName: 'Tomas Brandt',
      phone: '+49 30 1234567',
      location: 'Berlin, Germany',
      linkedinUrl: 'linkedin.com/in/tomas-brandt',
    });
    expect(profile).toMatchObject({ fullName: 'Tomas Brandt', phone: '+49 30 1234567', location: 'Berlin, Germany' });
    const kept = await agent.ok<{ phone: string | null; location: string | null }>('update_profile', { location: null });
    expect(kept.location, 'null clears').toBeNull();
    expect(kept.phone, 'a field left out keeps its value').toBe('+49 30 1234567');
    expect(await agent.fails('update_profile', { githubUrl: 'javascript:alert(1)' })).toMatch(/Not a web address/);
    expect(profileRow(userId).github_url, 'the refused link was not saved').toBeNull();

    const notifications = await agent.ok<{ marketing: boolean; creditsLow: boolean }>('update_notification_settings', { marketing: false, creditsLow: true });
    expect(notifications).toMatchObject({ marketing: false, creditsLow: true });
    expect(profileRow(userId)).toMatchObject({ notify_marketing: 0 });

    const none = await agent.ok<{ removed: boolean; hadPhoto: boolean }>('remove_profile_photo');
    expect(none).toMatchObject({ removed: true, hadPhoto: false });
    const set = await agent.ok<{ set: boolean; replacedExisting: boolean }>('set_profile_photo', { file: { base64: tinyPng(), mimeType: 'image/png' } });
    expect(set).toMatchObject({ set: true, replacedExisting: false });
    const replaced = await agent.ok<{ replacedExisting: boolean }>('set_profile_photo', { file: { base64: tinyPng(), mimeType: 'image/png' } });
    expect(replaced.replacedExisting).toBe(true);
    const removed = await agent.ok<{ hadPhoto: boolean }>('remove_profile_photo');
    expect(removed.hadPhoto).toBe(true);
  });

  test('delete tools: master CV, then the application', async () => {
    const cv = await agent.ok<{ target: string; deleted: boolean }>('delete_cv', { target: 'master' });
    expect(cv).toMatchObject({ target: 'master', deleted: true });
    expect(documentRows(userId).map((row) => row.type)).toEqual(['primary_cv']);
    expect(await agent.fails('delete_cv', { target: 'master' })).toMatch(/no|not/i);

    const deleted = await agent.ok<{ applicationId: string; deleted: boolean; cancelledOperationId: string | null }>('delete_application', { applicationId });
    expect(deleted).toMatchObject({ applicationId, deleted: true, cancelledOperationId: null });
    const list = await agent.ok<{ total: number }>('list_applications');
    expect(list.total).toBe(0);
  });
});
