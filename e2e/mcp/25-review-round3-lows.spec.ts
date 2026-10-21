import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { applicationRows, profileRow, setPlan } from '../lib/mcp-db';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { ageR2Object } from '../lib/r2-state';
import { openLocalD1 } from '../lib/sqlite';
import { tinyPng } from '../lib/tiny-png';
import type { BrowserContext, Page } from '@playwright/test';
import type { TestUser } from '../lib/user';

/**
 * Review round 3 on PR 5, the lows that change behaviour.
 *
 * - get_cv wraps only free text: ids and plain dates come back as stored, so a path built from get_cv works,
 *   and the write tools hand a field's old text back wrapped the way get_cv shows it.
 * - update_application and create_application refuse values still wrapped in << >>.
 * - The screening prompt carries the CV's additional information and driver's licence lines.
 * - The profile photo: a leftover Supabase URL is resolved to its object when a new photo replaces it, removing
 *   deletes only what it unlinked, and old orphans are swept after a change while a young upload survives.
 */

const WRAPPED = /^<<[\s\S]*>>$/;

/** The parts of the tailored CV these tests read and edit. */
interface StoredCv {
  summary?: string;
  personal: { driverLicense?: string };
  additionalInfo?: string[];
  experience: Array<{ id: string; startDate: string; position: string; bullets: string[] }>;
  education: Array<{ id: string }>;
  languages: Array<{ language: string }>;
}

test.describe.serial('round 3 lows', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  async function tailored(): Promise<{ revision: number; cv: StoredCv }> {
    return agent.ok('get_cv', { which: 'tailored', applicationId });
  }

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'round3-lows');
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

  test('get_cv leaves ids and plain dates as stored, so a path built from it works, and the write result wraps the old text', async () => {
    const read = await tailored();
    const job = read.cv.experience[0];
    expect(job.id, 'an item id is not wrapped').toBe('exp-1');
    expect(job.startDate, 'a plain date is not wrapped').toBe('Mar 2022');
    expect(job.position).toMatch(WRAPPED);
    expect(job.bullets.every((bullet: string) => WRAPPED.test(bullet))).toBe(true);
    expect(read.cv.summary).toMatch(WRAPPED);
    expect(read.cv.education[0].id).toBe('edu-1');
    expect(read.cv.languages[0].language).toMatch(WRAPPED);

    // The path is built from the id exactly as get_cv shows it.
    const edit = await agent.ok<{ revision: number; changes: Array<{ path: string; before: string | null; after: string }> }>('update_cv_content', {
      applicationId,
      revision: read.revision,
      fields: [
        { path: `experience.${job.id}.position`, value: 'Senior Financial Analyst' },
        { path: `experience.${job.id}.startDate`, value: 'Apr 2022' },
        { path: 'summary', value: 'Financial analyst focused on forecasting.' },
      ],
    });
    const byPath = Object.fromEntries(edit.changes.map((change) => [change.path, change]));
    expect(byPath['experience.exp-1.position']).toMatchObject({ before: '<<Financial Analyst>>', after: 'Senior Financial Analyst' });
    expect(byPath['experience.exp-1.startDate'].before, 'a plain date comes back as get_cv shows it').toBe('Mar 2022');
    expect(byPath.summary.before).toMatch(WRAPPED);
    expect(byPath.summary.after).toBe('Financial analyst focused on forecasting.');
  });

  test('edit_document_text hands the replaced text back wrapped, for a letter and an email', async () => {
    const wrappedOrNull = (value: unknown) => (Array.isArray(value) ? value.every((entry) => WRAPPED.test(entry)) : value === null || WRAPPED.test(String(value)));
    let revision = (await tailored()).revision;
    const letter = await agent.ok<{ revision: number; changes: Array<{ field: string; before: string | string[] | null }> }>('edit_document_text', {
      applicationId,
      revision,
      document: 'cover_letter',
      subject: 'Application for the Senior FP&A Analyst role',
      paragraphs: ['I own forecasting and reporting for two units.', 'I would bring that work to Northwind Foods.'],
      closing: 'Kind regards',
    });
    expect(letter.changes.length).toBeGreaterThan(0);
    expect(letter.changes.some((change) => change.before !== null), 'something was replaced').toBe(true);
    for (const change of letter.changes) expect(wrappedOrNull(change.before), `${change.field} before is wrapped`).toBe(true);
    revision = letter.revision;

    const email = await agent.ok<{ changes: Array<{ field: string; before: string | string[] | null }> }>('edit_document_text', {
      applicationId,
      revision,
      document: 'email',
      subject: 'Application: Senior FP&A Analyst',
      body: 'Hello, my CV and letter are attached.',
    });
    expect(email.changes.some((change) => change.before !== null), 'something was replaced').toBe(true);
    for (const change of email.changes) expect(wrappedOrNull(change.before), `${change.field} before is wrapped`).toBe(true);
  });

  test('update_application and create_application refuse values still wrapped in << >>, and nothing changes', async () => {
    const application = await agent.ok<{ revision: number; job: { company: string } }>('get_application', { applicationId });
    const wrapped = application.job.company;
    expect(wrapped, 'get_application wraps the company').toMatch(WRAPPED);
    const rows = applicationRows(user.id);

    for (const field of ['title', 'company', 'companyAddress', 'contactPerson']) {
      const refused = await agent.fails('update_application', { applicationId, revision: application.revision, [field]: field === 'company' ? wrapped : `<<Value for ${field}>>` });
      expect(refused, field).toMatch(/starts with << and ends with >>.*without them/);
    }
    expect(await agent.fails('create_application', { jobDescription: JOB_DESCRIPTION, company: wrapped })).toMatch(/without them/);
    expect(applicationRows(user.id)).toEqual(rows);

    // The words without the marks are stored as given.
    const updated = await agent.ok<{ revision: number }>('update_application', { applicationId, revision: application.revision, company: 'Northwind Foods GmbH' });
    expect(updated.revision).toBeGreaterThan(application.revision);
    expect(applicationRows(user.id).find((row) => row.id === applicationId)?.company).toBe('Northwind Foods GmbH');
  });

  /** Edit the stored tailored CV the way the kit stores it, in whichever column holds it. */
  function editStoredCv(mutate: (cv: StoredCv) => void): void {
    const db = openLocalD1();
    try {
      const row = db.prepare('SELECT generated_cv, generated_artifacts FROM application_sessions WHERE id = ?').get(applicationId) as { generated_cv: string | null; generated_artifacts: string | null };
      const generated = row.generated_cv ? JSON.parse(row.generated_cv) : null;
      if (generated?._optimizedCVData) {
        mutate(generated._optimizedCVData);
        db.prepare('UPDATE application_sessions SET generated_cv = ? WHERE id = ?').run(JSON.stringify(generated), applicationId);
        return;
      }
      const artifacts = row.generated_artifacts ? JSON.parse(row.generated_artifacts) : null;
      if (!artifacts?.optimizedCVData) throw new Error('No stored tailored CV to edit');
      mutate(artifacts.optimizedCVData);
      db.prepare('UPDATE application_sessions SET generated_artifacts = ? WHERE id = ?').run(JSON.stringify(artifacts), applicationId);
    } finally {
      db.close();
    }
  }

  test('the screening prompt carries the CV\'s additional information and its driver\'s licence', async () => {
    const shown = async () => {
      const drafted = await agent.ok<{ answers: Array<{ answer: string }> }>('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions: [`FAKE-AI-ECHO-PROMPT ${uuid()}`] });
      return drafted.answers.map((answer) => answer.answer).join('\n');
    };

    editStoredCv((cv) => {
      cv.additionalInfo = ['Valid work permit for Germany (FAKE-ADDITIONAL-INFO-7)'];
      delete cv.personal.driverLicense;
    });
    const withInfo = await shown();
    expect(withInfo).toContain('Optimized CV content');
    expect(withInfo, 'the additional information is in the prompt').toContain('FAKE-ADDITIONAL-INFO-7');

    // A CV with no additional information of its own prints the licence there, and so does the prompt.
    editStoredCv((cv) => {
      delete cv.additionalInfo;
      cv.personal.driverLicense = 'Class B FAKE-LICENCE-B';
    });
    const withLicence = await shown();
    expect(withLicence).toContain("Driver's License: Class B FAKE-LICENCE-B");
    expect(withLicence).not.toContain('FAKE-ADDITIONAL-INFO-7');
  });

  test.describe('the profile photo', () => {
    let page: Page;
    const png = () => Buffer.from(tinyPng(), 'base64');

    test.beforeAll(async () => {
      page = await context.newPage();
    });
    test.afterAll(async () => {
      await page?.close();
    });

    const upload = async () => {
      const response = await page.request.post('/api/files/upload', { multipart: { bucket: 'avatars', file: { name: 'photo.png', mimeType: 'image/png', buffer: png() } } });
      expect(response.status()).toBe(200);
      return ((await response.json()) as { key: string }).key;
    };
    const exists = async (key: string) => (await page.request.get(`/api/files/${key}`)).status() === 200;
    const avatar = () => profileRow(user.id).avatar_url as string | null;
    const setByAgent = async () => {
      await agent.ok('set_profile_photo', { file: { base64: tinyPng(), mimeType: 'image/png' } });
      return String(avatar());
    };

    test('a replaced photo that a leftover Supabase URL points at is deleted', async () => {
      const old = await upload();
      const db = openLocalD1();
      try {
        db.prepare('UPDATE profiles SET avatar_url = ? WHERE id = ?').run(`https://legacy.supabase.co/storage/v1/object/public/${old}`, user.id);
      } finally {
        db.close();
      }
      expect(await exists(old)).toBe(true);

      const current = await setByAgent();
      expect(current).not.toBe(old);
      expect(await exists(current)).toBe(true);
      await expect.poll(() => exists(old), { timeout: 15_000 }).toBe(false);
    });

    test('removing the photo deletes what it unlinked and keeps an upload another surface has stored but not linked', async () => {
      const current = await setByAgent();
      const inFlight = await upload();
      const oldOrphan = await upload();
      ageR2Object(oldOrphan, 20 * 60 * 1000);

      const removed = await agent.ok<{ removed: boolean; hadPhoto: boolean }>('remove_profile_photo');
      expect(removed).toMatchObject({ removed: true, hadPhoto: true });
      expect(avatar()).toBeNull();
      expect(await exists(current), 'the unlinked photo is deleted').toBe(false);
      expect(await exists(oldOrphan), 'an orphan older than ten minutes goes with it').toBe(false);
      expect(await exists(inFlight), 'a photo stored a moment ago may be about to be linked, so it stays').toBe(true);
    });

    test('Remove in Settings does the same', async () => {
      const current = await setByAgent();
      const inFlight = await upload();

      await page.goto('/dashboard?settings=general');
      await page.getByRole('button', { name: 'Remove' }).click();
      await expect.poll(() => avatar(), { timeout: 30_000 }).toBeNull();
      await expect.poll(() => exists(current), { timeout: 15_000 }).toBe(false);
      expect(await exists(inFlight), 'the photo another surface stored is not deleted').toBe(true);
    });

    test('a photo change sweeps orphans older than ten minutes and leaves a young upload alone', async () => {
      const oldOrphan = await upload();
      const youngUpload = await upload();
      ageR2Object(oldOrphan, 20 * 60 * 1000);

      const current = await setByAgent();
      expect(await exists(current)).toBe(true);
      await expect.poll(() => exists(oldOrphan), { timeout: 15_000 }).toBe(false);
      expect(await exists(youngUpload), 'an upload in flight survives the sweep').toBe(true);
    });
  });
});
