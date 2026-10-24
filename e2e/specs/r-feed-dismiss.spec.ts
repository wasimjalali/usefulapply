import { expect, test, type Locator, type Page } from '@playwright/test';
import { signedInPage } from '../lib/app';
import { setPlan } from '../lib/mcp-db';
import { feedFeedbackRows, seedFeedInbox, seedFeedSettings } from '../lib/mcp-feed-seed';
import { openLocalD1 } from '../lib/sqlite';

/**
 * (r) Dismissing a job from the Job Board.
 *
 * Ways it could fail, written before the spec:
 *  1. The icon is missing, or shows on the Free plan, where the server answers 403.
 *  2. A click dismisses at once with no question (a dismiss can't be undone: the server refuses every change to a
 *     dismissed row but "opened" and "unsaved"), or "Keep" still sends the request.
 *  3. The card stays on Today after the request succeeds, or stays on Saved (a saved job has two homes).
 *  4. The request works but the row is wrong: dismissed_at empty, or saved_at still set, so the job reappears.
 *  5. The card leaves only from the client's copy: after a reload the server serves it again.
 *  6. A double click on Dismiss sends two requests, or dismissing one card takes a neighbour with it.
 *  7. Keyboard: Enter on "Keep"/"Dismiss" bubbles to the card and opens the detail instead.
 *  8. The detail view's Dismiss leaves the user on a dead detail page.
 *  9. A Free user who posts the action by hand gets through.
 * 10. Enter on the X opens the detail instead of the question (the card's own key handler), or focus is lost after
 *     Keep/Escape.
 * 11. Dismissing one job while another job's save is in flight re-enables or double-submits either (one shared lock),
 *     or the same job's X stays live while its own save is pending.
 * 12. The list keeps a phantom "Show more roles" after the total drops.
 * 13. Two clicks in the same tick on Dismiss (before React disables it) send two requests.
 * 14. Enter on Check fit bubbles to the card and opens the detail as well as starting the fit.
 * 15. A list fetched before the dismiss lands after it and puts the job back (Saved tab here).
 * 16. A 404 (already gone) shows an error instead of just removing the card.
 * 17. A role that was applied to offers Dismiss, which the server refuses with a 409 that must not read as success.
 * 18. After a dismiss focus falls to the page instead of the next card (or the list heading).
 */

const JOBS = [
  { title: 'Senior FP&A Analyst', company: 'Northwind Foods', fitLabel: 'strong' as const },
  { title: 'Financial Controller', company: 'Fabrikam', fitLabel: 'good' as const },
  { title: 'Head of Planning', company: 'Contoso', fitLabel: 'good' as const },
  { title: 'Treasury Lead', company: 'Adventure Works', fitLabel: 'good' as const },
];

const canvas = (page: Page) => page.locator('[data-shell-column="canvas"]:not([inert])');
const cardOf = (page: Page, title: string): Locator =>
  canvas(page).getByRole('heading', { name: title }).locator('xpath=ancestor::div[@role="button"][1]');

async function openJobBoard(page: Page) {
  // A user with no kit yet is on the guided line, which has no sidebar. The dashboard's own deep link opens the
  // Job Board straight away.
  await page.goto('/dashboard?workspace=job-feed');
  await expect(canvas(page).getByRole('tab', { name: 'Today' })).toBeVisible();
}

test('(r1) a Plus user dismisses a saved job: asked first, gone from Today and Saved, still gone after a reload, row stamped', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const { user, context, page } = await signedInPage(browser, request, 'feeddismiss');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    const [keep, target, other, fourth] = seedFeedInbox(user.id, JOBS);

    await openJobBoard(page);
    for (const job of JOBS) await expect(cardOf(page, job.title)).toBeVisible();

    // Save the target, so it lives on both tabs.
    await cardOf(page, target.title).getByRole('button', { name: 'Save this role' }).click();
    await expect(cardOf(page, target.title).getByRole('button', { name: 'Remove from saved' })).toBeVisible();
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await expect(cardOf(page, target.title)).toBeVisible();
    await canvas(page).getByRole('tab', { name: 'Today' }).click();

    // Asked in place, by keyboard: Enter on the X opens the question, not the detail behind the card.
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/job-feed/feedback') && req.method() === 'POST') requests.push(req.postData() ?? '');
    });
    const dismissRequests = () => requests.filter((body) => body.includes('"dismissed"'));
    const card = cardOf(page, target.title);
    const trigger = card.getByRole('button', { name: 'Dismiss this role' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(card.getByText('Dismiss this job?')).toBeVisible();
    await expect(canvas(page).getByRole('button', { name: 'Back to feed' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Save this role' })).toHaveCount(0);

    // Keep sends nothing, closes the question and puts focus back on the X.
    await card.getByRole('button', { name: 'Keep' }).click();
    await expect(card.getByText('Dismiss this job?')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.waitForTimeout(500);
    expect(dismissRequests()).toHaveLength(0);
    expect(feedFeedbackRows(user.id).filter((row) => row.dismissed_at)).toHaveLength(0);

    // Escape closes it too, and Enter on Keep doesn't open the detail behind it.
    await trigger.click();
    await expect(card.getByRole('button', { name: 'Keep' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(card.getByText('Dismiss this job?')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(canvas(page).getByRole('button', { name: 'Back to feed' })).toHaveCount(0);
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(card.getByText('Dismiss this job?')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(dismissRequests()).toHaveLength(0);

    // A save in flight on one job doesn't block, or get cleared by, a dismiss on another. The same job's X waits.
    await page.route('**/api/job-feed/feedback', async (route) => {
      if (route.request().postData()?.includes('"saved"')) await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    const keepCard = cardOf(page, keep.title);
    await keepCard.getByRole('button', { name: 'Save this role' }).click();
    await expect(keepCard.getByRole('button', { name: 'Dismiss this role' })).toBeDisabled();
    const fourthCard = cardOf(page, fourth.title);
    await fourthCard.getByRole('button', { name: 'Dismiss this role' }).click();
    await fourthCard.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(cardOf(page, fourth.title)).toHaveCount(0);
    await expect(keepCard.getByRole('button', { name: 'Remove from saved' })).toBeVisible();
    await expect(keepCard.getByRole('button', { name: 'Dismiss this role' })).toBeEnabled();
    await page.unroute('**/api/job-feed/feedback');
    expect(dismissRequests()).toHaveLength(1);

    // Confirm: the button locks while the request runs (slowed so it can be seen) and one request goes out.
    await page.route('**/api/job-feed/feedback', async (route) => {
      if (route.request().postData()?.includes('"dismissed"')) await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await trigger.click();
    // Two clicks in the same tick, before React can disable the button: the lock, not the DOM, stops the second.
    await card.getByRole('button', { name: 'Dismiss', exact: true }).evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
    await expect(card.getByRole('button', { name: 'Dismissing' })).toBeDisabled();
    await expect(page.getByText("That role won't come back.").first()).toBeVisible();
    await expect(cardOf(page, target.title)).toHaveCount(0);
    // Focus moved on to the next card's X, not the page.
    await expect(cardOf(page, other.title).getByRole('button', { name: 'Dismiss this role' })).toBeFocused();
    await page.unroute('**/api/job-feed/feedback');
    // One for the fourth job above, one for the target.
    expect(dismissRequests()).toHaveLength(2);

    // Nothing left to page through: the list must not offer more.
    await expect(canvas(page).getByRole('button', { name: 'Show more roles' })).toHaveCount(0);

    // Neighbours stay, and the job is gone from Saved too.
    await expect(cardOf(page, keep.title)).toBeVisible();
    await expect(cardOf(page, other.title)).toBeVisible();
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await expect(cardOf(page, keep.title)).toBeVisible();
    await expect(cardOf(page, target.title)).toHaveCount(0);

    // The row: dismissed, and no longer saved.
    const row = feedFeedbackRows(user.id).find((r) => r.canonical_job_id === target.id);
    expect(row, 'a feedback row for the dismissed job').toBeTruthy();
    expect(row?.dismissed_at, 'dismissed_at is stamped').toBeTruthy();
    expect(row?.saved_at, 'saved_at is cleared').toBeNull();

    // Still gone after a reload: the server no longer serves it, on either tab.
    await page.reload();
    await openJobBoard(page);
    await expect(cardOf(page, keep.title)).toBeVisible();
    await expect(cardOf(page, other.title)).toBeVisible();
    await expect(cardOf(page, target.title)).toHaveCount(0);
    await expect(cardOf(page, fourth.title)).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: 'Show more roles' })).toHaveCount(0);
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await expect(cardOf(page, keep.title)).toBeVisible();
    await expect(cardOf(page, target.title)).toHaveCount(0);

    // From the detail view: the same question (Escape and Enter on Keep close it, focus returns), and the user
    // lands back on the list.
    await canvas(page).getByRole('tab', { name: 'Today' }).click();
    await cardOf(page, other.title).click();
    const detailTrigger = canvas(page).getByRole('button', { name: 'Dismiss', exact: true });
    await detailTrigger.click();
    await expect(canvas(page).getByText('Dismiss this job?')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(canvas(page).getByText('Dismiss this job?')).toHaveCount(0);
    await expect(detailTrigger).toBeFocused();
    await detailTrigger.click();
    await expect(canvas(page).getByRole('button', { name: 'Keep' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(canvas(page).getByText('Dismiss this job?')).toHaveCount(0);
    await expect(detailTrigger).toBeFocused();
    await expect(canvas(page).getByRole('heading', { name: other.title })).toBeVisible();
    await detailTrigger.click();
    await canvas(page).getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(canvas(page).getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(cardOf(page, other.title)).toHaveCount(0);
    await expect(cardOf(page, keep.title)).toBeVisible();
    await expect(canvas(page).getByRole('heading', { level: 2 })).toBeFocused();
    expect(feedFeedbackRows(user.id).find((r) => r.canonical_job_id === other.id)?.dismissed_at).toBeTruthy();
    expect(feedFeedbackRows(user.id).find((r) => r.canonical_job_id === keep.id)?.dismissed_at ?? null).toBeNull();
  } finally {
    await context.close();
  }
});

test('(r2) a Free user sees no dismiss icon, and the server refuses a hand-made dismiss', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const { user, context, page } = await signedInPage(browser, request, 'feeddismissfree');
  try {
    setPlan(user.id, 'free');
    seedFeedSettings(user.id);
    const [job] = seedFeedInbox(user.id, JOBS);

    await openJobBoard(page);
    await expect(cardOf(page, job.title)).toBeVisible();
    await expect(cardOf(page, job.title).getByRole('button', { name: 'Save this role' })).toBeVisible();
    await expect(canvas(page).getByRole('button', { name: 'Dismiss this role' })).toHaveCount(0);

    const response = await page.request.post('/api/job-feed/feedback', {
      data: { jobId: job.id, action: 'dismissed', runId: null },
    });
    expect(response.status()).toBe(403);
    expect(feedFeedbackRows(user.id).filter((row) => row.dismissed_at)).toHaveLength(0);
    await page.reload();
    await openJobBoard(page);
    await expect(cardOf(page, job.title)).toBeVisible();
  } finally {
    await context.close();
  }
});

test('(r3) Enter on Check fit starts the fit and does not also open the detail', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const { user, context, page } = await signedInPage(browser, request, 'feeddismisskey');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    const [job] = seedFeedInbox(user.id, JOBS.slice(0, 1));
    await openJobBoard(page);
    // Stop the handoff at the door: the request is enough to prove the click ran, and no kit gets built.
    await page.route('**/api/job-feed/apply', (route) => route.abort());
    const checkFit = cardOf(page, job.title).getByRole('button', { name: /Check fit/ });
    await checkFit.focus();
    // The click ran if either the handoff reached the server or, with no CV loaded in the page yet, the feed
    // answered that it needs one. Both come from the button's own click; neither opens the detail.
    const sent = page.waitForRequest((req) => req.url().endsWith('/api/job-feed/apply'), { timeout: 15_000 });
    const refused = page.getByText('I need your CV before I can check a fit').first().waitFor({ timeout: 15_000 });
    await page.keyboard.press('Enter');
    sent.catch(() => undefined);
    refused.catch(() => undefined);
    await Promise.race([sent, refused]);
    await expect(canvas(page).getByRole('button', { name: 'Back to feed' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('(r4) a list fetched before the dismiss cannot bring the job back, and a 404 just removes the card', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const { user, context, page } = await signedInPage(browser, request, 'feeddismissrace');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    const [first, second] = seedFeedInbox(user.id, JOBS.slice(0, 2));
    await openJobBoard(page);
    await cardOf(page, first.title).getByRole('button', { name: 'Save this role' }).click();
    await expect(cardOf(page, first.title).getByRole('button', { name: 'Remove from saved' })).toBeVisible();

    // The Saved list is asked for while the job is still saved, and answers only after the dismiss.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let captured!: () => void;
    const savedCaptured = new Promise<void>((resolve) => { captured = resolve; });
    await page.route('**/api/job-feed/saved', async (route) => {
      const response = await route.fetch();
      expect(await response.text(), 'the held response still holds the job').toContain(first.title);
      captured();
      await gate;
      await route.fulfill({ response });
    });
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await canvas(page).getByRole('tab', { name: 'Today' }).click();
    await savedCaptured;
    await cardOf(page, first.title).getByRole('button', { name: 'Dismiss this role' }).click();
    await cardOf(page, first.title).getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(cardOf(page, first.title)).toHaveCount(0);
    release();
    await page.waitForTimeout(500);
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await expect(canvas(page).getByText('Loading your saved roles.')).toHaveCount(0);
    await expect(cardOf(page, first.title)).toHaveCount(0);
    await canvas(page).getByRole('tab', { name: 'Today' }).click();
    await expect(cardOf(page, second.title)).toBeVisible();
    await expect(canvas(page).getByRole('button', { name: 'Show more roles' })).toHaveCount(0);

    // A 404 means the role is already gone: the card leaves and no error is shown.
    await page.route('**/api/job-feed/feedback', (route) => (
      route.request().postData()?.includes('"dismissed"')
        ? route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Job Feed item not found.' }) })
        : route.continue()
    ));
    await cardOf(page, second.title).getByRole('button', { name: 'Dismiss this role' }).click();
    await cardOf(page, second.title).getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(cardOf(page, second.title)).toHaveCount(0);
    await expect(page.getByText(/no longer in your feed/)).toHaveCount(0);
    await expect(page.getByText("That role won't come back.")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('(r5) a saved role that was already applied to offers no dismiss', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const { user, context, page } = await signedInPage(browser, request, 'feeddismissapplied');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    const [applied] = seedFeedInbox(user.id, JOBS.slice(0, 2));
    const db = openLocalD1();
    try {
      const run = db.prepare('SELECT run_id FROM job_feed_ranked_items WHERE canonical_job_id = ?').get(applied.id) as { run_id: string };
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO job_feed_feedback
          (id, user_id, canonical_job_id, latest_run_id, opened_at, saved_at, applied_at, generation_status, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'succeeded', '{}', ?, ?)
      `).run(crypto.randomUUID(), user.id, applied.id, run.run_id, now, now, now, now, now);
    } finally {
      db.close();
    }
    await openJobBoard(page);
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await expect(cardOf(page, applied.title)).toBeVisible();
    await expect(cardOf(page, applied.title).getByRole('button', { name: 'Save this role' })).toHaveCount(0);
    await expect(cardOf(page, applied.title).getByRole('button', { name: 'Remove from saved' })).toBeVisible();
    await expect(cardOf(page, applied.title).getByRole('button', { name: 'Dismiss this role' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('(r6) a 409 from the server keeps the card, says why and reloads the list', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const { user, context, page } = await signedInPage(browser, request, 'feeddismiss409');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    const [job] = seedFeedInbox(user.id, JOBS.slice(0, 1));
    await openJobBoard(page);
    await page.route('**/api/job-feed/feedback', (route) => (
      route.request().postData()?.includes('"dismissed"')
        ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'terminal' }) })
        : route.continue()
    ));
    const reloaded = page.waitForRequest((req) => req.url().includes('/api/job-feed/overview') && req.method() === 'GET');
    await cardOf(page, job.title).getByRole('button', { name: 'Dismiss this role' }).click();
    await cardOf(page, job.title).getByRole('button', { name: 'Dismiss', exact: true }).click();
    await reloaded;
    await expect(page.getByText("That role can't be dismissed now.")).toBeVisible();
    await expect(page.getByText("That role won't come back.")).toHaveCount(0);
    await expect(cardOf(page, job.title)).toBeVisible();
  } finally {
    await context.close();
  }
});
