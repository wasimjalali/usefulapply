import { expect, test } from '@playwright/test';
import { generateKitThroughUi, signedInPage, storedApplication, waitForStored } from '../lib/app';
import { runTool } from '../lib/run-tool';

/**
 * (c) A server write while the application is open. An agent edits the CV
 * through the service layer, then a generation run lands a new cover letter
 * through persistKit, while the page sits untouched. The page must pick both
 * up on its own (revision poll: window focus and every 15 seconds) and must
 * not write anything back.
 */
test('(c) a server-side write shows up in the open page within 15 seconds', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'poll');
  await generateKitThroughUi(page);
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
  await page.getByRole('tab', { name: 'CV' }).click();
  await expect(page.getByText('Financial Analyst').first()).toBeVisible();

  // 1. A service edit of a CV field.
  const edit = await runTool<{ revision: number }>('e2e/tools/ops.ts', [
    'edit-cv-title',
    JSON.stringify({ userId: user.id, sessionId: generated.id, title: 'Head of Forecasting' }),
  ]);
  expect(edit.revision).toBeGreaterThan(generated.revision);
  const editedAt = Date.now();
  await expect(page.getByText('Head of Forecasting').first()).toBeVisible({ timeout: 20_000 });
  const refreshMs = Date.now() - editedAt;
  expect(refreshMs).toBeLessThan(18_000);

  // 2. persistKit lands a new cover letter.
  const kit = await runTool<{ revision: number }>('e2e/tools/ops.ts', [
    'persist-letter',
    JSON.stringify({ userId: user.id, sessionId: generated.id, body: 'Dear Northwind team,\n\nA letter written by a background generation run.\n\nKind regards,\nTomas Brandt' }),
  ]);
  expect(kit.revision).toBeGreaterThan(edit.revision);
  await page.getByRole('tab', { name: 'Cover letter' }).click();
  await expect(page.getByText(/written by a background generation run/).first()).toBeVisible({ timeout: 20_000 });

  // The page only read: the stored revision is exactly what the server writes left it at.
  await page.waitForTimeout(3_000);
  expect(storedApplication(user.id)?.revision).toBe(kit.revision);
  await context.close();
});
