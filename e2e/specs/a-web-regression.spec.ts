import { expect, test } from '@playwright/test';
import { callAgent, createSignedInApiUser, creditsOf } from '../lib/user';
import { JOB_DESCRIPTION } from '../lib/model-script';
import { runTool } from '../lib/run-tool';
import {
  editCoverLetter,
  editCvTitle,
  generateKitThroughUi,
  signedInPage,
  storedApplication,
  waitForStored,
} from '../lib/app';

/**
 * (a) Web regression. The core flow must survive the move of kit persistence
 * to the server and of editor saves to revisioned writes: fit check, generate
 * the kit, the canvas shows CV, letter and email, edit a CV field and the
 * letter, reload, and the edits are still there and sit in D1's canonical columns.
 *
 * The model is the scripted fake (e2e/fake-anthropic.ts). Everything else is real:
 * the Worker, the agents and their validators, auth, D1, the browser store.
 */
test('(a) fit, kit, edits and reload keep working, and the canonical columns are filled', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'web');

  await generateKitThroughUi(page);

  // The server wrote the kit: nothing in the browser had to.
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
  expect(generated.generated_cv, 'generated_cv').toBeTruthy();
  expect(generated.generated_cv?._optimizedCVData, 'structured CV embedded in generated_cv').toBeTruthy();
  expect(generated.cover_letter?.body, 'cover_letter').toContain('Calder Industrial Components');
  expect(generated.email?.subject, 'email').toContain('Application');
  expect(generated.follow_up_email?.subject, 'follow_up_email').toContain('Following Up');
  expect(generated.job_title).toBe('Senior FP&A Analyst');
  expect(generated.company).toBe('Northwind Foods');
  expect(generated.revision).toBeGreaterThanOrEqual(1);

  // The server wrote it: after the browser has had time to load and show it, nothing of the
  // browser's has been written on top (the revision is the server's, unchanged).
  await page.waitForTimeout(4_000);
  expect(storedApplication(user.id)?.revision, 'the browser wrote nothing after the server persisted the kit').toBe(generated.revision);

  // The canvas shows all three documents.
  await page.getByRole('tab', { name: 'CV' }).click();
  await expect(page.getByText('Tomas Brandt').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Cover letter' }).click();
  await expect(page.getByText(/rebuilt the forecast model around order backlog/).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Emails' }).click();
  await expect(page.getByText(/Application: Senior FP&A Analyst/).first()).toBeVisible();

  // Edit a CV field and the letter.
  const newTitle = "Senior Forecasting Analyst";
  await editCvTitle(page, newTitle);
  const afterCv = await waitForStored(
    user.id,
    (row) => JSON.stringify(row.generated_cv).includes('Senior Forecasting Analyst'),
    'CV edit saved',
  );
  expect(afterCv.revision).toBeGreaterThan(generated.revision);

  const newLetter = 'Dear Northwind team,\n\nMy edited letter for the Northwind team.\n\nKind regards,\nTomas Brandt';
  await editCoverLetter(page, newLetter);
  const afterLetter = await waitForStored(
    user.id,
    (row) => (row.cover_letter?.body ?? '').includes('edited letter for the Northwind team'),
    'letter edit saved',
  );
  expect(afterLetter.revision).toBeGreaterThan(afterCv.revision);

  // Reload: what the user sees comes back from D1.
  await page.reload();
  await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
  await page.getByRole('tab', { name: 'CV' }).click();
  await expect(page.getByText("Senior Forecasting Analyst", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Cover letter' }).click();
  await expect(page.getByText(/edited letter for the Northwind team/).first()).toBeVisible();

  // The reload and the open did not write anything: the revision is where the last edit left it.
  expect(storedApplication(user.id)?.revision).toBe(afterLetter.revision);
  await context.close();
});

/**
 * The kit lands through the SERVER alone: no browser exists while it is
 * generated, yet the canonical columns and the revision are filled. Opening
 * the application afterwards shows it and writes nothing.
 */
test('(a2) a kit generated with no browser lands in the canonical columns, and opening it writes nothing', async ({ browser, request }) => {
  const user = await createSignedInApiUser(request, 'server');
  const created = await runTool<{ id: string }>('e2e/tools/ops.ts', [
    'create-application',
    JSON.stringify({ userId: user.id, jobDescription: JOB_DESCRIPTION }),
  ]);
  const start = creditsOf(user.id).total;
  const events = await callAgent(request, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId: created.id }, `req-a2-${Date.now()}`);
  expect(events.find((event) => event.type === 'workflow_complete')).toBeTruthy();
  expect(creditsOf(user.id).total).toBe(start - 2);

  const server = storedApplication(user.id, created.id);
  expect(server?.generated_cv?._optimizedCVData).toBeTruthy();
  expect(server?.cover_letter?.body).toBeTruthy();
  expect(server?.email?.subject).toBeTruthy();
  expect(server?.follow_up_email?.subject).toBeTruthy();
  expect(server?.generation_status).toBe('succeeded');
  const revision = server?.revision ?? -1;
  expect(revision).toBeGreaterThanOrEqual(1);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip } });
  // The API client is already signed in: hand its session cookie to the browser.
  await context.addCookies((await request.storageState()).cookies);
  const page = await context.newPage();
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
  await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Tomas Brandt').first()).toBeVisible();
  await page.waitForTimeout(4_000);
  expect(storedApplication(user.id, created.id)?.revision, 'loading the kit from the server wrote nothing').toBe(revision);
  await context.close();
});
