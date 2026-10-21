import { expect, test } from '@playwright/test';
import {
  editCvTitle,
  generateKitThroughUi,
  signedInPage,
  storedApplication,
  waitForStored,
} from '../lib/app';
import { openLocalD1 } from '../lib/sqlite';

const CONFLICT = 'This application was updated elsewhere. We loaded the latest version.';

/**
 * (f) Tracker status goes through the revisioned service. A status change
 * after the user's own edits in the same browser must not conflict with them;
 * one made from a stale tracker view, after another writer moved the
 * application, must not overwrite that writer's status.
 */
test('(f) tracker status is revision-conditional and never conflicts with the user\'s own edits', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'tracker');
  await generateKitThroughUi(page);
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');

  // The user's own edit moves the revision. The tracker row has not seen it.
  await editCvTitle(page, 'Senior Forecasting Analyst');
  const edited = await waitForStored(user.id, (row) => JSON.stringify(row.generated_cv).includes('Senior Forecasting Analyst'), 'edit saved');
  expect(edited.revision).toBeGreaterThan(generated.revision);

  await page.getByRole('button', { name: 'Application Tracker' }).click();
  await page.locator('button', { hasText: /^Drafted$/ }).first().click();
  await page.getByText('Applied', { exact: true }).last().click();
  const applied = await waitForStored(user.id, (row) => row.status === 'applied', 'status saved');
  expect(applied.revision).toBeGreaterThan(edited.revision);
  await expect(page.getByText(CONFLICT)).toHaveCount(0);

  // Another writer (an agent) moves the application. This tracker view is now stale.
  const db = openLocalD1();
  try {
    db.prepare("UPDATE application_sessions SET status = 'interview', revision = revision + 1 WHERE id = ?").run(applied.id);
  } finally {
    db.close();
  }
  await page.locator('button', { hasText: /^Applied$/ }).first().click();
  await page.getByText('Rejected', { exact: true }).last().click();
  await expect(page.getByText(CONFLICT)).toBeVisible({ timeout: 20_000 });
  const final = storedApplication(user.id);
  expect(final?.status, 'the agent\'s status was not overwritten').toBe('interview');
  await context.close();
});
