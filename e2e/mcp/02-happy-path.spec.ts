import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../lib/worker-logs';
import { creditsOf } from '../lib/user';
import { McpSession, jwtClaims, newAgent, uuid } from '../lib/mcp-client';
import { applicationRows, documentRows, ledger, netCharged, readQuota } from '../lib/mcp-db';
import { KEEP_WORDING_REWRITE_INSTRUCTION, PRIMARY_CV_DE, REFUSED_REWRITE_INSTRUCTION, REGENERATE_LETTER_INSTRUCTION, SENIOR_JOB_DESCRIPTION } from '../lib/model-script';

/**
 * PLAN section 7, "Happy path", steps 1 to 8, through a real MCP client over OAuth, on the local D1 with the
 * model scripted (e2e/fake-anthropic.ts). One user, one application, in order:
 *
 *   1 OAuth with consent (read write spend)
 *   2 save_cv a German CV
 *   3 analyze_job_fit on a senior job ad (0.5)
 *   4 generate_application_kit, polled with get_operation (1.5; the ledger shows exactly 2.0 for fit + kit)
 *   5 update_cv_content, delete_cv_item, rewrite_cv_section (applied keeping section-only wording, applied, then refused)
 *   6 regenerate_document for the cover letter, then undo_last_edit restores it
 *   7 export_documents: the renderer behind PDF is Browser Run, which does not run locally, so the PDF case
 *     must fail with the clean message and give its quota back (the seven formats in two templates run in
 *     e2e/mcp-exports with E2E_MCP_EXPORTS=1); the Word and text formats that need no browser do export
 *   8 update_application_status to interview with a date, then /dashboard as the same user shows the same state
 */

interface Balance { total: number; monthly: number; rollover: number; addon: number }

test.describe.serial('MCP happy path: a German CV to a tracked application', () => {
  let agent: McpSession;
  let userId: string;
  let web: BrowserContext;
  let applicationId: string;
  let revision: number;
  let startBalance: number;
  let originalLetterBody: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'happy');
    agent = created.session;
    userId = created.user.id;
    web = created.context;
  });

  test.afterAll(async () => {
    await agent?.close();
    await web?.close();
  });

  test('1. OAuth with consent grants read, write and spend, and a token that expires in 10 minutes', async () => {
    const claims = jwtClaims(agent.accessToken);
    expect(String(claims.scope).split(' ').sort()).toEqual(expect.arrayContaining(['read', 'spend', 'write']));
    expect((claims.exp as number) - (claims.iat as number)).toBe(600);
    expect(agent.tokens.refreshToken, 'offline_access gave a refresh token').toBeTruthy();

    const account = await agent.ok<{ plan: string; credits: Balance; cvOnFile: { primary: boolean; master: boolean } }>('get_account');
    expect(account.plan).toBe('free');
    expect(account.cvOnFile).toEqual({ primary: false, master: false });
    startBalance = account.credits.total;
    expect(startBalance).toBeGreaterThanOrEqual(2.5);
  });

  test('2. save_cv stores a German CV, parsed into the same structure the web upload makes', async () => {
    const saved = await agent.ok<{ target: string; replacedExisting: boolean; name: string; counts: Record<string, number> }>('save_cv', {
      target: 'primary',
      text: PRIMARY_CV_DE,
    });
    expect(saved).toMatchObject({ target: 'primary', replacedExisting: false, name: 'Tomas Brandt' });
    expect(saved.counts).toMatchObject({ experience: 1, education: 1, skillCategories: 1, languages: 2 });

    const cv = await agent.ok<{ cv: { personal: { currentTitle: string }; summary: string; languages: Array<{ language: string }> } }>('get_cv', { which: 'primary' });
    expect(cv.cv.personal.currentTitle).toBe('Finanzanalyst');
    expect(cv.cv.summary).toContain('Prognose');
    expect(cv.cv.languages.map((language) => language.language)).toEqual(['Deutsch', 'Englisch']);
    // The stored document is the German text, byte for byte, which is what every later model call reads.
    const stored = documentRows(userId).find((row) => row.type === 'primary_cv');
    expect(stored?.raw_text).toBe(PRIMARY_CV_DE);
    expect((await agent.ok<{ cvOnFile: { primary: boolean } }>('get_account')).cvOnFile.primary).toBe(true);
  });

  test('3. analyze_job_fit on a senior job ad costs 0.5 and creates the draft application', async () => {
    const fit = await agent.ok<{
      applicationId: string; createdApplication: boolean; replayed: boolean; creditsUsed: number; balance: Balance;
      fit: { level: string; score: number; assessment: string; matchingSkills: string[]; missingSkills: string[] };
      job: { title: string; company: string } | null; revision: number | null;
    }>('analyze_job_fit', {
      idempotencyKey: uuid(),
      jobDescription: SENIOR_JOB_DESCRIPTION,
      jobTitle: 'Senior FP&A Analyst',
      company: 'Northwind Foods',
    });
    applicationId = fit.applicationId;
    expect(fit).toMatchObject({ createdApplication: true, replayed: false, creditsUsed: 0.5 });
    expect(['strong', 'good', 'fair', 'weak']).toContain(fit.fit.level);
    expect(fit.fit.score).toBeGreaterThan(0);
    expect(fit.fit.score).toBeLessThanOrEqual(100);
    // What came from the job ad or the model about the ad is handed back wrapped as data.
    expect(fit.fit.assessment).toMatch(/^<<[\s\S]*>>$/);
    expect(fit.job?.company).toMatch(/Northwind Foods/);
    expect(fit.balance.total).toBe(startBalance - 0.5);
    expect(creditsOf(userId).total).toBe(startBalance - 0.5);
  });

  test('4. generate_application_kit queues the kit; polling get_operation ends in success and the ledger shows exactly 2.0', async () => {
    const queued = await agent.ok<{ operationId: string; status: string; creditsReserved: number; pollAfterSeconds: number; deduped: boolean; joinedRunningOperation: boolean }>(
      'generate_application_kit',
      { idempotencyKey: uuid(), applicationId },
    );
    // The after-fit price: the fit above was paid for, so the kit is 1.5.
    expect(queued.creditsReserved).toBe(1.5);
    expect(['pending', 'running']).toContain(queued.status);
    expect(queued.pollAfterSeconds).toBe(10);
    expect(queued).toMatchObject({ deduped: false, joinedRunningOperation: false });

    let operation: { status: string; errorCode: string | null; kind: string; documents: Record<string, boolean> | null } | undefined;
    await expect
      .poll(
        async () => {
          operation = await agent.ok('get_operation', { operationId: queued.operationId });
          return operation?.status;
        },
        { timeout: 120_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe('succeeded');
    expect(operation).toMatchObject({ kind: 'generate_kit', errorCode: null });
    expect(operation?.documents).toEqual({ cv: true, coverLetter: true, email: true, followUpEmail: true });

    // Fit 0.5 plus kit 1.5: the ledger's net charge is exactly 2.0 and so is the balance.
    expect(netCharged(userId)).toBe(2);
    expect(creditsOf(userId).total).toBe(startBalance - 2);
    const account = await agent.ok<{ credits: Balance }>('get_account');
    expect(account.credits.total).toBe(startBalance - 2);

    const application = await agent.ok<{ revision: number; generation: { status: string }; kit: { hasKit: boolean; coverLetter: { body: string | null } } }>(
      'get_application',
      { applicationId, detail: 'full' },
    );
    expect(application.generation.status).toBe('succeeded');
    expect(application.kit.hasKit).toBe(true);
    originalLetterBody = application.kit.coverLetter.body ?? '';
    expect(originalLetterBody).toContain('Calder Industrial Components');
    revision = application.revision;
  });

  test('5a. update_cv_content changes the summary with the user\'s own words and returns before and after', async () => {
    const edit = await agent.ok<{ revision: number; changes: Array<{ path: string; before: string | null; after: string }> }>('update_cv_content', {
      applicationId,
      revision,
      fields: [{ path: 'summary', value: 'Finanzanalyst mit Schwerpunkt auf Prognose und Monatsabschluss.' }],
    });
    expect(edit.revision).toBeGreaterThan(revision);
    expect(edit.changes).toHaveLength(1);
    expect(edit.changes[0]).toMatchObject({
      path: 'summary',
      // The old text is the tailored CV a model wrote from the ad, so it comes back wrapped like get_cv shows it.
      before: '<<Finanzanalyst mit Erfahrung in Budgetierung, Prognose und Monatsabschluss.>>',
      after: 'Finanzanalyst mit Schwerpunkt auf Prognose und Monatsabschluss.',
    });
    revision = edit.revision;
  });

  test('5b. delete_cv_item removes one bullet by its handle, and a stale revision is refused', async () => {
    const outline = await agent.ok<{ revision: number; lists: Array<{ list: string; items: Array<{ handle: string; label: string }> }> }>('get_cv_outline', { applicationId });
    expect(outline.revision).toBe(revision);
    const bullets = outline.lists.find((list) => list.list.startsWith('bullets:'));
    expect(bullets?.items).toHaveLength(2);
    const target = bullets!.items[1];

    const stale = await agent.fails('delete_cv_item', { applicationId, revision: revision - 1, handle: target.handle });
    expect(stale).toMatch(/revision/i);

    const removed = await agent.ok<{ revision: number; removed: string; list: string }>('delete_cv_item', { applicationId, revision, handle: target.handle });
    expect(removed.revision).toBeGreaterThan(revision);
    expect(removed.removed).toContain('Prognosegenauigkeit');
    revision = removed.revision;

    const after = await agent.ok<{ lists: Array<{ list: string; items: unknown[] }> }>('get_cv_outline', { applicationId });
    expect(after.lists.find((list) => list.list.startsWith('bullets:'))?.items).toHaveLength(1);
  });

  test('5c. rewrite_cv_section: an applied rewrite costs 0.5; a refused one costs nothing and changes nothing', async () => {
    const before = creditsOf(userId).total;
    // The production bug of 2026-10-21: the section holds a word no CV has ("Schwerpunkt", from the edit in
    // 5a, as a kit writer's paraphrase would), and a rewrite that keeps it was refused as unsupported_claim.
    const kept = await agent.ok<{ outcome: string; reason: string | null; terms: string[]; creditsUsed: number; after: string[] }>('rewrite_cv_section', {
      idempotencyKey: uuid(),
      applicationId,
      section: { kind: 'summary' },
      instruction: `Please ${KEEP_WORDING_REWRITE_INSTRUCTION}.`,
    });
    expect(kept, `refused with ${JSON.stringify(kept.terms)}`).toMatchObject({ outcome: 'applied', creditsUsed: 0.5 });
    expect(kept.after).toEqual(['Finanzanalyst mit Schwerpunkt auf Monatsabschluss und Prognose.']);
    expect(creditsOf(userId).total).toBe(before - 0.5);

    const applied = await agent.ok<{ outcome: string; creditsUsed: number; after: string[]; before: string[]; revision: number | null; replayed: boolean }>('rewrite_cv_section', {
      idempotencyKey: uuid(),
      applicationId,
      section: { kind: 'summary' },
      instruction: 'Put forecasting first.',
    });
    expect(applied).toMatchObject({ outcome: 'applied', creditsUsed: 0.5, replayed: false });
    expect(applied.before).toEqual(['Finanzanalyst mit Schwerpunkt auf Monatsabschluss und Prognose.']);
    expect(applied.after).toEqual(['Finanzanalyst mit Erfahrung in Prognose, Budgetierung und Monatsabschluss.']);
    expect(creditsOf(userId).total).toBe(before - 1);
    revision = applied.revision as number;

    // The same rewrite again with a new instruction that makes the writer invent a number: refused, free, unchanged.
    const rows = applicationRows(userId);
    const refused = await agent.ok<{ outcome: string; reason: string | null; terms: string[]; creditsUsed: number }>('rewrite_cv_section', {
      idempotencyKey: uuid(),
      applicationId,
      section: { kind: 'summary' },
      instruction: `Please ${REFUSED_REWRITE_INSTRUCTION}.`,
    });
    expect(refused).toMatchObject({ outcome: 'refused', reason: 'unsupported_number', creditsUsed: 0 });
    expect(refused.terms.join(' ')).toMatch(/40|99/);
    expect(creditsOf(userId).total).toBe(before - 1);
    expect(applicationRows(userId)).toEqual(rows);
    expect(
      (await agent.ok<{ revision: number }>('get_application', { applicationId })).revision,
      'a refused rewrite does not bump the revision',
    ).toBe(revision);
  });

  test('6. regenerate_document rewrites the cover letter (0.5) and undo_last_edit restores the letter that was there', async () => {
    const before = creditsOf(userId).total;
    const regenerated = await agent.ok<{ document: string; body: string; creditsUsed: number; revision: number; replayed: boolean }>('regenerate_document', {
      idempotencyKey: uuid(),
      applicationId,
      document: 'cover_letter',
      instruction: REGENERATE_LETTER_INSTRUCTION,
    });
    expect(regenerated).toMatchObject({ document: 'cover_letter', creditsUsed: 0.5, replayed: false });
    expect(regenerated.body).not.toBe(originalLetterBody);
    // The instruction was followed: the accuracy result now comes before the monthly forecast sentence, and it was the other way round.
    const accuracy = 'I rebuilt the forecast model around order backlog';
    const forecast = 'I own the monthly forecast and variance reporting';
    expect(regenerated.body.indexOf(accuracy)).toBeGreaterThanOrEqual(0);
    expect(regenerated.body.indexOf(accuracy)).toBeLessThan(regenerated.body.indexOf(forecast));
    expect(originalLetterBody.indexOf(forecast)).toBeLessThan(originalLetterBody.indexOf(accuracy));
    expect(creditsOf(userId).total).toBe(before - 0.5);

    const undone = await agent.ok<{ group: string; revision: number; remainingVersions: number }>('undo_last_edit', { applicationId, group: 'cover_letter' });
    expect(undone.group).toBe('cover_letter');
    expect(undone.revision).toBeGreaterThan(regenerated.revision);
    const application = await agent.ok<{ revision: number; kit: { coverLetter: { body: string | null } } }>('get_application', { applicationId, detail: 'full' });
    expect(application.kit.coverLetter.body).toBe(originalLetterBody);
    revision = application.revision;
  });

  test('7. export_documents: the PDF renderer is Browser Run, so locally it fails cleanly and gives its quota back; text and Word export', async () => {
    const quotaBefore = readQuota('export_documents', userId);

    // Three PDFs: the first fails (no Browser Run in a local preview), the two never reached are refunded.
    const failure = await agent.fails('export_documents', { applicationId, formats: ['cv_pdf', 'cover_letter_pdf', 'answers_pdf'] });
    expect(failure).toMatch(/renderer is unavailable/i);
    expect(failure).not.toMatch(/Error|stack|at \w+\.|undefined/);
    expect(readQuota('export_documents', userId) - quotaBefore, 'only the render that ran counts, the files never reached are given back').toBe(1);

    // Formats that need no browser work in the same lane.
    const files = await agent.ok<{ files: Array<{ format: string; fileName: string; contentType: string; url: string; bytes: number; templateId: string }> }>('export_documents', {
      applicationId,
      formats: ['emails_txt', 'cv_docx'],
      templateId: 'german-ats',
    });
    expect(files.files.map((file) => file.format)).toEqual(['emails_txt', 'cv_docx']);
    for (const file of files.files) {
      expect(file.bytes).toBeGreaterThan(200);
      expect(file.url).toMatch(/\/api\/exports\//);
    }
    // The signed link serves the file, with no session.
    const download = await agent.request.get(files.files[0].url);
    expect(download.status()).toBe(200);
    expect(download.headers()['cache-control']).toMatch(/no-store/);
    expect(await download.text()).toContain('Calder Industrial Components');
  });

  test('8. update_application_status sets interview with a date, and /dashboard shows the same kit and tracker state', async ({}, testInfo) => {
    const status = await agent.ok<{ status: string; interviewAt: string | null; revision: number }>('update_application_status', {
      applicationId,
      status: 'interview',
      interviewAt: '2026-11-10T14:00:00Z',
    });
    expect(status).toMatchObject({ status: 'interview', interviewAt: '2026-11-10T14:00:00.000Z' });
    const stored = applicationRows(userId)[0] as { status: string; interview_at: string };
    expect(stored.status).toBe('interview');

    // The same user in the browser. The agent's final state is what the web app shows.
    const page = await web.newPage();
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Application Tracker' }).click();
    await expect(page.locator('button', { hasText: /^Interview$/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/10 Nov/).first(), 'the interview date the agent set').toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('tracker-after-agent.png'), fullPage: true });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
    await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('tab', { name: 'Cover letter' }).click();
    // The letter the agent regenerated and then undid: the original text is what the page shows.
    await expect(page.getByText(/I own the monthly forecast and variance reporting for two business units/).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: 'CV' }).click();
    await expect(page.getByText('Finanzanalyst mit Erfahrung in Prognose, Budgetierung und Monatsabschluss.').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('dashboard-after-agent.png'), fullPage: true });
    await page.close();

    // The ledger tells the same story as the calls: fit 0.5, kit 1.5, two applied rewrites 0.5 each, one letter 0.5.
    expect(netCharged(userId)).toBe(3.5);
    // The one refused rewrite reserved 0.5 and gave it straight back: the only refund row there is.
    const refunds = ledger(userId).filter((row) => row.transaction_kind === 'refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amount: 0.5 });
    expect(refunds[0].description).toContain('cv_section_refused');
  });
});
