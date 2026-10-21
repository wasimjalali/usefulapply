import { expect, test, type Browser, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { generateKitThroughUi, signedInPage, storedApplication, waitForStored } from '../lib/app';
import { runTool } from '../lib/run-tool';

const CONFLICT_TOAST = 'This application was updated elsewhere. We loaded the latest version.';

/**
 * (j) The real email panel: one editor over two documents, the application email and the follow-up. The sync
 * fuzz models what the panel does; these drive the panel itself and read what D1 holds.
 *
 *   j1  Copy of an email conflict moves only the email snapshot: a newer server follow-up still makes a Save of
 *       the panel's old follow-up copy a conflict.
 *   j2  Save writes only the document the user typed into: the panel's copy of the other one never goes back
 *       over a newer server version.
 *   j3  After a Discard of the email draft the panel stays open with the store's email. A follow-up save that
 *       lands while the user keeps typing must not move the email snapshot, so the stale email copy cannot be
 *       saved over a newer server email later (review round 3 high).
 *
 * The 15 second revision poll is switched off; a poll runs when the test fires the window's focus event, and
 * the test waits until the store holds the revision D1 is at. No fixed sleeps.
 */
async function emailPanel(browser: Browser, request: APIRequestContext, label: string) {
  const { user, context, page } = await signedInPage(browser, request, label);
  await page.addInitScript(() => {
    const original = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      ms === 15_000 ? 0 : original(handler, ms, ...args)) as typeof window.setInterval;
  });
  await generateKitThroughUi(page);
  const generated = await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
  await page.getByRole('tab', { name: 'Emails' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const bodies = page.locator('textarea[rows="11"]');
  await expect(bodies).toHaveCount(2);
  return { user, context, page, generated, emailBody: bodies.nth(0), followUpBody: bodies.nth(1) };
}

const storeRevision = (page: Page) => page.evaluate(() => {
  const persisted = JSON.parse(localStorage.getItem('session-store') ?? 'null') as { state?: { currentSession?: { revision?: number } } } | null;
  return persisted?.state?.currentSession?.revision ?? null;
});

/** Poll for changes (as a focus would) until the store holds this revision. */
async function pollUntil(page: Page, revision: number) {
  await expect.poll(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    return storeRevision(page);
  }, { timeout: 20_000 }).toBe(revision);
}

const editEmail = (userId: string, sessionId: string, body: string) =>
  runTool<{ revision: number }>('e2e/tools/ops.ts', ['edit-email', JSON.stringify({ userId, sessionId, body })]);
const editFollowUp = (userId: string, sessionId: string, body: string) =>
  runTool<{ revision: number }>('e2e/tools/ops.ts', ['edit-follow-up', JSON.stringify({ userId, sessionId, body })]);

test('(j1) Copy of an email conflict leaves the follow-up snapshot alone', async ({ browser, request }) => {
  const { user, context, page, generated, emailBody, followUpBody } = await emailPanel(browser, request, 'mailcopy');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const notice = page.getByRole('alert').filter({ hasText: CONFLICT_TOAST });

  // The email draft is written on the opening revision; another writer changes the email; Save conflicts.
  await emailBody.fill('Jcopy email draft written on the opening revision.');
  const g1 = await editEmail(user.id, generated.id, 'Jcopy email as edited by another writer.');
  await save.click();
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(emailBody).toHaveValue('Jcopy email draft written on the opening revision.');
  expect(storedApplication(user.id)?.revision).toBe(g1.revision);

  // A newer follow-up arrives and the tab loads it. The panel still shows the follow-up it opened with.
  const g2 = await editFollowUp(user.id, generated.id, 'Jcopy follow-up as edited by another writer.');
  await pollUntil(page, g2.revision);

  // Copy deals with the email notice: the email snapshot moves to the version the notice showed, nothing else.
  await notice.getByRole('button', { name: 'Copy my text' }).click();
  await expect(notice).toHaveCount(0);

  // The user now edits the follow-up copy the panel opened with and saves: that copy is older than the server's.
  await followUpBody.fill('Jcopy follow-up draft typed over the old copy.');
  await save.click();
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(save).toBeVisible();
  const stored = storedApplication(user.id);
  expect(stored?.follow_up_email?.body).toContain('Jcopy follow-up as edited by another writer.');
  expect(stored?.follow_up_email?.body).not.toContain('typed over the old copy');
  expect(stored?.email?.body).toContain('Jcopy email as edited by another writer.');
  expect(stored?.revision).toBe(g2.revision);
  await context.close();
});

test('(j2) Save writes only the document the user typed into', async ({ browser, request }) => {
  const { user, context, page, generated, emailBody } = await emailPanel(browser, request, 'mailtyped');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const notice = page.getByRole('alert').filter({ hasText: CONFLICT_TOAST });
  const openedFollowUp = generated.follow_up_email?.body;
  expect(openedFollowUp).toBeTruthy();

  // Only the email is typed into. Meanwhile the follow-up changes on the server and the tab loads it.
  await emailBody.fill('Jtyped email typed in the panel.');
  const g1 = await editFollowUp(user.id, generated.id, 'Jtyped follow-up as edited by another writer.');
  await pollUntil(page, g1.revision);

  // Save writes the email and leaves the newer follow-up alone: no conflict, the editor closes.
  await save.click();
  const stored = await waitForStored(user.id, (row) => row.email?.body?.includes('Jtyped email typed in the panel.') === true, 'the typed email saved');
  await expect(save).toHaveCount(0);
  await expect(notice).toHaveCount(0);
  expect(stored.follow_up_email?.body).toContain('Jtyped follow-up as edited by another writer.');
  expect(stored.follow_up_email?.body).not.toBe(openedFollowUp);
  expect(stored.revision).toBe(g1.revision + 1);
  await context.close();
});

test('(j3) after a Discard of the email, a stale email copy is never saved over a newer server email', async ({ browser, request }) => {
  const { user, context, page, generated, emailBody, followUpBody } = await emailPanel(browser, request, 'maildiscard');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const notice = page.getByRole('alert').filter({ hasText: CONFLICT_TOAST });

  // An email draft conflicts with another writer's email (G1).
  await emailBody.fill('Jdiscard email draft written on the opening revision.');
  await editEmail(user.id, generated.id, 'Jdiscard G1 email from another writer.');
  await save.click();
  await expect(notice).toBeVisible({ timeout: 20_000 });

  // Discard the email text. The panel stays open and shows the store's email, G1.
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await notice.getByRole('button', { name: 'Discard' }).click();
  await expect(notice).toHaveCount(0);
  await expect(save).toBeVisible();
  await expect(emailBody).toHaveValue(/Jdiscard G1 email from another writer\./);

  // A newer email (G2) arrives and the tab loads it; the panel keeps showing its G1 copy.
  const g2 = await editEmail(user.id, generated.id, 'Jdiscard G2 email from another writer.');
  await pollUntil(page, g2.revision);
  await expect(emailBody).toHaveValue(/Jdiscard G1 email/);

  // A follow-up-only save, held at the network while the user keeps typing in the follow-up.
  const followUpDraft = 'Jdiscard follow-up draft saved first.';
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    void page.route('**/*', async (route: Route) => {
      const call = route.request();
      if (call.method() !== 'POST' || !call.headers()['next-action'] || !(call.postData() ?? '').includes(followUpDraft)) {
        await route.fallback();
        return;
      }
      resolve();
      await new Promise<void>((done) => { release = done; });
      await route.continue();
    });
  });
  await followUpBody.fill(followUpDraft);
  await save.click();
  await held;
  await followUpBody.fill('Jdiscard follow-up typed while the save ran.');
  release();
  const afterFollowUp = await waitForStored(user.id, (row) => row.follow_up_email?.body?.includes(followUpDraft) === true, 'the follow-up save landed');
  expect(afterFollowUp.email?.body).toContain('Jdiscard G2 email from another writer.');
  // The save has come back to the panel: the store is at the revision it wrote.
  await expect.poll(() => storeRevision(page), { timeout: 20_000 }).toBe(afterFollowUp.revision);
  await expect(save).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });

  // The user edits the G1 copy still in the panel and saves. G2 is newer: a conflict, never a write over it.
  await emailBody.fill('Jdiscard E3 typed over the stale G1 copy.');
  await save.click();
  await expect(notice).toBeVisible({ timeout: 20_000 });
  const final = storedApplication(user.id);
  expect(final?.email?.body).toContain('Jdiscard G2 email from another writer.');
  expect(final?.email?.body).not.toContain('E3 typed over');
  expect(final?.revision).toBe(afterFollowUp.revision);
  await context.close();
});
