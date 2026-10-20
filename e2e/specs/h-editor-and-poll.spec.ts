import { expect, test, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage, storedApplication, waitForStored } from '../lib/app';
import { fakeControl } from '../lib/fake-control';
import { runTool } from '../lib/run-tool';

const CONFLICT = 'This application was updated elsewhere. We loaded the latest version.';

/** Stop the 15 second revision poll; the spec drives polls itself with a focus event. */
async function manualPolling(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      ms === 15_000 ? 0 : original(handler, ms, ...args)) as typeof window.setInterval;
  });
}

const poll = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

/**
 * Editor drafts live outside the store. Each editor remembers the revision it
 * opened on, and a save made after the browser moved to a newer revision (a
 * poll reload, say) must not land on top of what the newer revision holds.
 */
test('(h1) an editor draft opened on an older revision cannot overwrite a newer one', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'draft');
  await manualPolling(page);
  await generateKitThroughUi(page);
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');

  await page.getByRole('tab', { name: 'Cover letter' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const box = page.getByPlaceholder('Cover letter content...');
  await expect(box).toBeVisible();

  // Another writer changes the letter while the editor is open, and this tab's poll picks it up.
  const serverText = 'Dear Northwind team,\n\nThis letter was written by another writer while the editor was open.\n\nKind regards,\nTomas Brandt';
  const server = await runTool<{ revision: number }>('e2e/tools/ops.ts', [
    'persist-letter',
    JSON.stringify({ userId: user.id, sessionId: generated.id, body: serverText }),
  ]);
  await poll(page);
  await expect.poll(async () => (await page.evaluate(() => localStorage.getItem('session-store')))?.includes('"revision":' + server.revision), { timeout: 20_000 }).toBeTruthy();

  // The user finishes typing against what they opened and saves.
  const draft = 'My draft of the letter, typed before the other writer saved.';
  await box.fill(draft);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText(/Your text is still in the editor/)).toBeVisible({ timeout: 20_000 });
  expect(storedApplication(user.id)?.cover_letter?.body, 'the other writer\'s letter stays').toContain('written by another writer');
  expect(storedApplication(user.id)?.cover_letter?.body).not.toContain('My draft');
  expect(storedApplication(user.id)?.revision).toBe(server.revision);
  await expect(box).toHaveValue(draft);
  await context.close();
});

/**
 * A poll that decides the store is clean must not apply the server's copy over
 * something the user changed while that copy was on its way. The change is
 * settled as a conflict, with a notice, instead of vanishing.
 */
test('(h2) a change made while a poll reload is in flight is not silently replaced', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'race');
  await manualPolling(page);
  await generateKitThroughUi(page);
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');

  const seen: string[] = [];
  let holdId: string | null = null;
  let release: () => void = () => undefined;
  let held: () => void = () => undefined;
  const heldRequest = new Promise<void>((resolve) => { held = resolve; });
  await page.route('**/dashboard**', async (route) => {
    const id = route.request().method() === 'POST' ? route.request().headers()['next-action'] : undefined;
    if (id) {
      seen.push(id);
      if (holdId && id === holdId) {
        holdId = null;
        held();
        await new Promise<void>((resolve) => { release = resolve; });
      }
    }
    await route.continue();
  });

  // Learn which server action is the reload: a poll that finds a newer revision asks for the revision, then the row.
  const mark = seen.length;
  await runTool('e2e/tools/ops.ts', ['edit-email', JSON.stringify({ userId: user.id, sessionId: generated.id, body: 'First change by another writer.' })]);
  await poll(page);
  await expect.poll(() => new Set(seen.slice(mark)).size, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  const reloadAction = [...new Set(seen.slice(mark))][1];

  // A clean poll reloads quietly: no conflict notice yet, so the one asserted below can only come from the race.
  await expect(page.getByText(CONFLICT)).toHaveCount(0);

  // Second change by another writer; hold the reload request when it is made.
  holdId = reloadAction;
  await runTool('e2e/tools/ops.ts', ['edit-email', JSON.stringify({ userId: user.id, sessionId: generated.id, body: 'Second change by another writer.' })]);
  await poll(page);
  await heldRequest;

  // While it is held the user picks another template: a store change the poll has not seen.
  await page.getByRole('tab', { name: 'CV' }).click();
  await page.getByRole('button', { name: /Templates/ }).click();
  await page.getByRole('option', { name: /Executive/ }).click();
  release();

  await expect(page.getByText(CONFLICT).first()).toBeVisible({ timeout: 20_000 });
  expect(storedApplication(user.id)?.selected_template, 'the template choice was based on an old revision and did not overwrite').toBe(generated.selected_template);
  await page.getByRole('tab', { name: 'Emails' }).click();
  await expect(page.getByText('Second change by another writer.').first()).toBeVisible();
  await context.close();
});

/**
 * A server write this tab made (a retry of a failed document) comes back with a
 * revision that includes another writer's change to a different document. The
 * tab must load that change, not adopt the revision and then overwrite it.
 */
test('(h3) adopting a regenerate\'s revision loads changes made elsewhere in between', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'adopt');
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 700)); });
  await manualPolling(page);
  await fakeControl({ failWriter: 'coverLetter' });
  await generateKitThroughUi(page);
  await fakeControl({ failWriter: null });
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
  expect(generated.cover_letter).toBeNull();

  // Another tab edits the email. This tab has not polled.
  await runTool('e2e/tools/ops.ts', ['edit-email', JSON.stringify({ userId: user.id, sessionId: generated.id, body: 'The email as edited in another tab.' })]);

  // This tab retries the failed cover letter: the server writes it and answers with a newer revision.
  await page.getByRole('tab', { name: 'Cover letter' }).click();
  await page.getByRole('button', { name: /Try again/ }).click();
  await waitForStored(user.id, (row) => row.cover_letter != null, 'letter regenerated');

  await page.getByRole('tab', { name: 'Emails' }).click();
  await expect(page.getByText('The email as edited in another tab.').first()).toBeVisible({ timeout: 20_000 });
  await context.close();
});
