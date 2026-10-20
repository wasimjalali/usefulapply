import { expect, test } from '@playwright/test';
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
