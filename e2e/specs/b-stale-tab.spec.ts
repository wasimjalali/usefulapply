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
import { runTool } from '../lib/run-tool';

const CONFLICT_TOAST = 'This application was updated elsewhere. We loaded the latest version.';

/**
 * (b) Stale tab. The same application is open in two tabs, and tab B's 15 second
 * revision poll is switched off so the tests exercise the write itself. Spec (c)
 * covers the poll.
 *
 * Two cases. Both tabs change the SAME field: B must not overwrite A, it gets the
 * conflict toast, loads A's version, and keeps its own text in the editor to copy.
 * The tabs change DIFFERENT fields: nothing conflicts, B's change lands on top of
 * A's and both survive.
 */
async function twoTabs(browser: import('@playwright/test').Browser, request: import('@playwright/test').APIRequestContext, label: string) {
  const { user, context, page: pageA } = await signedInPage(browser, request, label);
  await generateKitThroughUi(pageA);
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
  const pageB = await context.newPage();
  await pageB.addInitScript(() => {
    const original = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      ms === 15_000 ? 0 : original(handler, ms, ...args)) as typeof window.setInterval;
  });
  await openApplication(pageB);
  return { user, context, pageA, pageB, generated };
}

test('(b) a stale tab that changes the same field gets the conflict toast and overwrites nothing', async ({ browser, request }) => {
  const { user, context, pageA, pageB, generated } = await twoTabs(browser, request, 'stale');

  // A edits the letter first.
  const letterA = 'Dear Northwind team,\n\nThis is the letter tab A saved first.\n\nKind regards,\nTomas Brandt';
  await editCoverLetter(pageA, letterA);
  const afterA = await waitForStored(user.id, (row) => row.cover_letter?.body?.includes('tab A saved first') === true, "A's letter saved");
  expect(afterA.revision).toBeGreaterThan(generated.revision);

  // B, stale, edits the same letter and saves.
  const staleLetter = 'Dear Northwind team,\n\nThis letter was written in a stale tab and must not land.\n\nKind regards,\nTomas Brandt';
  await editCoverLetter(pageB, staleLetter);
  await expect(pageB.getByText(CONFLICT_TOAST)).toBeVisible({ timeout: 20_000 });

  // B's draft is still in the editor so it can be copied; leaving the editor shows what is stored.
  await expect(pageB.getByPlaceholder('Cover letter content...')).toHaveValue(staleLetter);
  await pageB.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(pageB.getByText(/tab A saved first/).first()).toBeVisible();
  await expect(pageB.getByText(/stale tab and must not land/)).toHaveCount(0);

  // D1 holds A's letter. Nothing was silently overwritten.
  const final = storedApplication(user.id);
  expect(final?.cover_letter?.body).toContain('tab A saved first');
  expect(final?.cover_letter?.body).not.toContain('stale tab');
  expect(final?.revision).toBe(afterA.revision);

  // The notice about B's text does not close by itself: it is still there after the old 20 second lifetime,
  // offers the text back, and asks before it throws the text away.
  const notice = pageB.getByRole('alert').filter({ hasText: CONFLICT_TOAST });
  await pageB.waitForTimeout(21_000);
  await expect(notice.getByRole('button', { name: 'Copy my text' })).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Restore my text' })).toBeVisible();
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice.getByText('Discard your text?')).toBeVisible();
  await notice.getByRole('button', { name: 'Keep' }).click();
  await expect(notice.getByRole('button', { name: 'Copy my text' })).toBeVisible();
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await notice.getByRole('button', { name: 'Discard' }).click();
  await expect(notice).toHaveCount(0);
  await context.close();
});

test('(b3) a stale Save is refused again, and after Discard the editor no longer holds the discarded text', async ({ browser, request }) => {
  const { user, context, pageA, pageB } = await twoTabs(browser, request, 'discard');

  const letterA = 'Dear Northwind team,\n\nThis is the letter tab A saved first.\n\nKind regards,\nTomas Brandt';
  await editCoverLetter(pageA, letterA);
  const afterA = await waitForStored(user.id, (row) => row.cover_letter?.body?.includes('tab A saved first') === true, "A's letter saved");

  // B conflicts and keeps its draft in the open editor.
  const discardedText = 'Dear Northwind team,\n\nThis draft is discarded on purpose and must never be saved.\n\nKind regards,\nTomas Brandt';
  await editCoverLetter(pageB, discardedText);
  const notice = pageB.getByRole('alert').filter({ hasText: CONFLICT_TOAST });
  await expect(notice).toBeVisible({ timeout: 20_000 });
  const editor = pageB.getByPlaceholder('Cover letter content...');
  await expect(editor).toHaveValue(discardedText);

  // The stale draft is saved again, as a user who did not read the notice would: it is refused, the editor
  // keeps the draft (a save that landed would have closed it) and D1 still holds A's letter at A's revision.
  await pageB.getByRole('button', { name: 'Save', exact: true }).click();
  await pageB.waitForTimeout(3_000);
  await expect(editor).toHaveValue(discardedText);
  expect(storedApplication(user.id)?.cover_letter?.body).not.toContain('discarded on purpose');
  expect(storedApplication(user.id)?.revision).toBe(afterA.revision);

  // Dismiss, then Discard, with the editor still open.
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await notice.getByRole('button', { name: 'Discard' }).click();
  await expect(notice).toHaveCount(0);

  // The editor is closed and B shows A's version.
  await expect(editor).toHaveCount(0);
  await expect(pageB.getByText(/tab A saved first/).first()).toBeVisible();
  await expect(pageB.getByText(/discarded on purpose/)).toHaveCount(0);

  // Discarding wrote nothing. Opening the editor again starts from A's letter, not from the discarded text.
  await pageB.waitForTimeout(3_000);
  expect(storedApplication(user.id)?.revision).toBe(afterA.revision);
  await pageB.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveValue(letterA);
  await pageB.getByRole('button', { name: 'Cancel', exact: true }).click();

  const final = storedApplication(user.id);
  expect(final?.cover_letter?.body).toContain('tab A saved first');
  expect(final?.cover_letter?.body).not.toContain('discarded on purpose');
  expect(final?.revision).toBe(afterA.revision);
  await context.close();
});

/**
 * Discard only reaches the editor whose text it throws away. An email conflict notice is open, the user
 * goes to the CV and starts a legitimate edit, then discards the email text: the CV edit is still open
 * and its Save writes it.
 */
test('(b4) discarding an email conflict leaves an open CV edit alone', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'bystander');
  await page.addInitScript(() => {
    const original = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      ms === 15_000 ? 0 : original(handler, ms, ...args)) as typeof window.setInterval;
  });
  await generateKitThroughUi(page);
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');

  // The email editor opens, another writer changes the email, and the Save conflicts: the notice is about the email.
  await page.getByRole('tab', { name: 'Emails' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('textarea[rows="11"]').first().fill('This email draft was written on an older revision.');
  await runTool('e2e/tools/ops.ts', [
    'edit-email',
    JSON.stringify({ userId: user.id, sessionId: generated.id, body: 'The email as edited by another writer.' }),
  ]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const notice = page.getByRole('alert').filter({ hasText: CONFLICT_TOAST });
  await expect(notice).toBeVisible({ timeout: 20_000 });

  // A legitimate CV edit is open, its field confirmed and the editor not yet saved.
  await page.getByRole('tab', { name: 'CV' }).click();
  // The notice sits over the toolbar, so the click goes to the button directly.
  await page.getByRole('button', { name: 'Edit', exact: true }).dispatchEvent('click');
  await page.getByText('Professional Title', { exact: true }).locator('xpath=..').click();
  await page.locator('input[type="text"]').first().fill('Principal Forecasting Analyst');
  await page.locator('button[title="Save"]').first().click();

  // Discard the email text.
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await notice.getByRole('button', { name: 'Discard' }).click();
  await expect(notice).toHaveCount(0);

  // The CV edit is still there, and it saves.
  const saveChanges = page.getByRole('button', { name: /Save changes/ });
  await expect(saveChanges).toBeVisible();
  await saveChanges.click();
  const stored = await waitForStored(
    user.id,
    (row) => JSON.stringify(row.generated_cv).includes('Principal Forecasting Analyst'),
    'the CV edit saved after the email conflict was discarded',
  );
  expect(stored.email?.body).toContain('edited by another writer');
  expect(stored.email?.body).not.toContain('older revision');
  await context.close();
});

test('(b2) a stale tab that changes a different field is merged: both changes survive', async ({ browser, request }) => {
  const { user, context, pageA, pageB, generated } = await twoTabs(browser, request, 'merge');

  // A edits the CV title first.
  await editCvTitle(pageA, 'Senior Forecasting Analyst');
  const afterA = await waitForStored(
    user.id,
    (row) => JSON.stringify(row.generated_cv).includes('Senior Forecasting Analyst'),
    "A's CV edit saved",
  );
  expect(afterA.revision).toBeGreaterThan(generated.revision);

  // B, stale, edits the letter. It is a different field, so it lands on top of A's change.
  const letterB = 'Dear Northwind team,\n\nThis letter was saved from the second tab.\n\nKind regards,\nTomas Brandt';
  await editCoverLetter(pageB, letterB);
  const merged = await waitForStored(user.id, (row) => row.cover_letter?.body?.includes('second tab') === true, "B's letter saved");
  expect(JSON.stringify(merged.generated_cv)).toContain('Senior Forecasting Analyst');
  expect(merged.revision).toBeGreaterThan(afterA.revision);
  await expect(pageB.getByText(CONFLICT_TOAST)).toHaveCount(0);

  // B loaded A's CV edit on the way.
  await pageB.getByRole('tab', { name: 'CV' }).click();
  await expect(pageB.getByText('Senior Forecasting Analyst', { exact: true }).first()).toBeVisible();
  await context.close();
});
