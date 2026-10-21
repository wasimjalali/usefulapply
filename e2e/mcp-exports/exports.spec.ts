import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { openLocalD1 } from '../lib/sqlite';
import { PRIMARY_CV, SENIOR_JOB_DESCRIPTION } from '../lib/model-script';
import type { BrowserContext } from '@playwright/test';
import type { TestUser } from '../lib/user';

const run = promisify(execFile);

/**
 * PLAN section 7, happy path step 6: "Export all seven formats in two templates", through export_documents.
 *
 * Only with E2E_MCP_EXPORTS=1, because the PDFs are rendered by Browser Run, which does not run in a local preview:
 * the preview for this project runs with the `browser` binding remote in its generated wrangler config (see
 * playwright.config.ts; nothing is committed), so it needs a wrangler login on the machine and costs a few cents of
 * rendering. Nothing here touches a remote database. The rest of the MCP lane asserts the local behaviour of
 * export_documents (the clean "renderer is unavailable" failure and its quota refund) in 02-happy-path.spec.ts.
 *
 * Run: E2E_MCP_EXPORTS=1 npx playwright test --project=mcp-exports
 */

const FORMATS = ['cv_pdf', 'cv_docx', 'cover_letter_pdf', 'cover_letter_docx', 'emails_txt', 'answers_pdf', 'answers_txt'] as const;
const TEMPLATES = [
  { templateId: 'premium-ats', paper: 'letter', letterLocale: undefined },
  { templateId: 'german-ats', paper: 'a4', letterLocale: 'de' },
] as const;

let pdftotext: string | null = null;
async function hasPdftotext(): Promise<boolean> {
  if (pdftotext !== null) return pdftotext !== '';
  try {
    await run('pdftotext', ['-v']).catch((error: { stderr?: string }) => {
      if (!/pdftotext/i.test(error.stderr ?? '')) throw error;
    });
    pdftotext = 'pdftotext';
  } catch {
    pdftotext = '';
  }
  return pdftotext !== '';
}

test.describe.serial('export_documents: seven formats, two templates', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'exports');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    applicationId = (await agent.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: SENIOR_JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' })).applicationId;
    const kit = await agent.ok<{ operationId: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');

    // Screening answers are written by Workers AI, which a local preview does not have: put two where the product keeps them.
    const db = openLocalD1();
    try {
      const row = db.prepare('SELECT generated_cv, revision FROM application_sessions WHERE id = ? AND user_id = ?').get(applicationId, user.id) as { generated_cv: string; revision: number };
      const generated = JSON.parse(row.generated_cv) as Record<string, unknown>;
      const now = new Date().toISOString();
      generated._screeningAnswers = [
        { id: 'ans-1', question: 'Why do you want to work at Northwind Foods?', answer: 'I own the monthly forecast and variance reporting for two business units.', createdAt: now },
        { id: 'ans-2', question: 'What is your notice period?', answer: 'Four weeks.', createdAt: now },
      ];
      db.prepare('UPDATE application_sessions SET generated_cv = ?, revision = revision + 1 WHERE id = ?').run(JSON.stringify(generated), applicationId);
    } finally {
      db.close();
    }
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  for (const template of TEMPLATES) {
    test(`all seven formats in ${template.templateId}: signed links that serve real files, text that matches the application`, async ({}, testInfo) => {
      const result = await agent.ok<{ files: Array<{ format: string; fileName: string; contentType: string; bytes: number; url: string; templateId: string; paper: string }> }>('export_documents', {
        applicationId,
        formats: [...FORMATS],
        templateId: template.templateId,
        paper: template.paper,
        ...(template.letterLocale ? { letterLocale: template.letterLocale } : {}),
      });
      expect(result.files.map((file) => file.format)).toEqual([...FORMATS]);
      const dir = mkdtempSync(join(tmpdir(), `ua-mcp-exports-${template.templateId}-`));
      for (const file of result.files) {
        expect(file.bytes, file.format).toBeGreaterThan(500);
        // The link is the only credential: no session, no token.
        const download = await agent.request.get(file.url);
        expect(download.status(), file.format).toBe(200);
        expect(download.headers()['cache-control'], file.format).toMatch(/no-store/);
        expect(download.headers()['referrer-policy'] ?? '', file.format).toMatch(/no-referrer/);
        const bytes = Buffer.from(await download.body());
        expect(bytes.length).toBe(file.bytes);
        const path = join(dir, file.fileName);
        writeFileSync(path, bytes);
        await testInfo.attach(`${template.templateId}-${file.fileName}`, { path, contentType: file.contentType });

        if (file.format.endsWith('_pdf')) {
          expect(bytes.subarray(0, 5).toString(), `${file.format} is a PDF`).toBe('%PDF-');
          if (await hasPdftotext()) {
            const { stdout } = await run('pdftotext', ['-layout', path, '-']);
            if (file.format === 'cv_pdf') {
              expect(stdout).toContain('Tomas Brandt');
              expect(stdout).toContain('Calder Industrial Components');
              expect(stdout).toContain('96%');
            }
            if (file.format === 'cover_letter_pdf') expect(stdout).toMatch(/forecast/i);
            if (file.format === 'answers_pdf') expect(stdout).toContain('Four weeks.');
          }
        } else if (file.format.endsWith('_docx')) {
          expect(bytes.subarray(0, 2).toString(), `${file.format} is a zip`).toBe('PK');
        } else {
          const text = bytes.toString('utf8');
          if (file.format === 'emails_txt') expect(text).toContain('Calder Industrial Components');
          if (file.format === 'answers_txt') expect(text).toContain('Four weeks.');
        }
      }
      // The CV and letter follow the template and paper that were asked for.
      expect(result.files.find((file) => file.format === 'cv_pdf')).toMatchObject({ templateId: template.templateId, paper: template.paper });
    });
  }

  test('a repeat of the same export is served from the store, and another user\'s link is not yours', async ({ browser, request }) => {
    const again = await agent.ok<{ files: Array<{ cached: boolean; format: string; url: string }> }>('export_documents', { applicationId, formats: ['cv_pdf'], templateId: 'premium-ats', paper: 'letter' });
    expect(again.files[0].cached).toBe(true);

    // A link altered by one character is refused, whoever asks.
    const tampered = again.files[0].url.replace(/.$/, (character) => (character === 'a' ? 'b' : 'a'));
    expect((await agent.request.get(tampered)).status()).toBeGreaterThanOrEqual(400);

    // Another user cannot export this application at all.
    const other = await newAgent(browser, request, 'exports-other', { primaryCv: true });
    try {
      const refused = await other.session.fails('export_documents', { applicationId, formats: ['cv_pdf'] });
      expect(refused).toMatch(/not found/i);
    } finally {
      await other.session.close();
      await other.context.close();
    }
  });
});
