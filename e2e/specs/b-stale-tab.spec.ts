import { expect, test } from '@playwright/test';
import {
  editCoverLetter,
  editCvTitle,
  generateKitThroughUi,
  openApplication,
  signedInPage,
  storedApplication,
  waitForStored,
} from '../lib/app';

const CONFLICT_TOAST = 'This application was updated elsewhere. We loaded the latest version.';

/**
 * (b) Stale tab. The same application is open in two tabs. Tab A edits and
 * saves. Tab B, still holding the revision it loaded, then edits. B must not
 * overwrite A: it gets the conflict toast, reloads A's version, and D1 keeps A's
 * edit with none of B's.
 *
 * Tab B's 15 second revision poll is switched off here so the test exercises
 * the write conflict itself. Spec (c) covers the poll.
 */
test('(b) a stale tab gets the conflict toast and overwrites nothing', async ({ browser, request }) => {
  const { user, context, page: pageA } = await signedInPage(browser, request, 'stale');
  await generateKitThroughUi(pageA);
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');

  const pageB = await context.newPage();
  await pageB.addInitScript(() => {
    const original = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      ms === 15_000 ? 0 : original(handler, ms, ...args)) as typeof window.setInterval;
  });
  await openApplication(pageB);

  // A edits first.
  await editCvTitle(pageA, 'Senior Forecasting Analyst');
  const afterA = await waitForStored(
    user.id,
    (row) => JSON.stringify(row.generated_cv).includes('Senior Forecasting Analyst'),
    "A's CV edit saved",
  );
  expect(afterA.revision).toBeGreaterThan(generated.revision);

  // B, stale, edits the letter and saves.
  const staleLetter = 'Dear Northwind team,\n\nThis letter was written in a stale tab and must not land.\n\nKind regards,\nTomas Brandt';
  await editCoverLetter(pageB, staleLetter);

  await expect(pageB.getByText(CONFLICT_TOAST)).toBeVisible({ timeout: 20_000 });

  // B's draft is still in the editor so it can be copied; leaving the editor shows what is stored.
  await expect(pageB.getByPlaceholder('Cover letter content...')).toHaveValue(staleLetter);
  await pageB.getByRole('button', { name: 'Cancel', exact: true }).click();

  // B now shows A's version, and B's letter did not survive.
  await pageB.getByRole('tab', { name: 'CV' }).click();
  await expect(pageB.getByText('Senior Forecasting Analyst', { exact: true }).first()).toBeVisible();
  await pageB.getByRole('tab', { name: 'Cover letter' }).click();
  await expect(pageB.getByText(/stale tab and must not land/)).toHaveCount(0);
  await expect(pageB.getByText(/rebuilt the forecast model around order backlog/).first()).toBeVisible();

  // D1 holds A's edit and the original letter. Nothing was silently overwritten.
  const final = storedApplication(user.id);
  expect(JSON.stringify(final?.generated_cv)).toContain('Senior Forecasting Analyst');
  expect(final?.cover_letter?.body).not.toContain('stale tab');
  expect(final?.cover_letter?.body).toContain('rebuilt the forecast model around order backlog');
  expect(final?.revision).toBe(afterA.revision);

  await context.close();
});
