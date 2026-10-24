import { expect, test, type Locator, type Page } from '@playwright/test';
import { signedInPage } from '../lib/app';
import { setPlan } from '../lib/mcp-db';
import { feedFeedbackRows, seedFeedInbox, seedFeedSettings } from '../lib/mcp-feed-seed';

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
 */

const JOBS = [
  { title: 'Senior FP&A Analyst', company: 'Northwind Foods', fitLabel: 'strong' as const },
  { title: 'Financial Controller', company: 'Fabrikam', fitLabel: 'good' as const },
  { title: 'Head of Planning', company: 'Contoso', fitLabel: 'good' as const },
];

const canvas = (page: Page) => page.locator('[data-shell-column="canvas"]:not([inert])');
const cardOf = (page: Page, title: string): Locator =>
  canvas(page).getByRole('heading', { name: title }).locator('xpath=ancestor::div[@role="button"][1]');

async function openJobBoard(page: Page) {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^Job Board/ }).click();
  await expect(canvas(page).getByRole('tab', { name: 'Today' })).toBeVisible();
}

test('(r1) a Plus user dismisses a saved job: asked first, gone from Today and Saved, still gone after a reload, row stamped', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const { user, context, page } = await signedInPage(browser, request, 'feeddismiss');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    const [keep, target, other] = seedFeedInbox(user.id, JOBS);

    await openJobBoard(page);
    for (const job of JOBS) await expect(cardOf(page, job.title)).toBeVisible();

    // Save the target, so it lives on both tabs.
    await cardOf(page, target.title).getByRole('button', { name: 'Save this role' }).click();
    await expect(cardOf(page, target.title).getByRole('button', { name: 'Remove from saved' })).toBeVisible();
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await expect(cardOf(page, target.title)).toBeVisible();
    await canvas(page).getByRole('tab', { name: 'Today' }).click();

    // Asked in place. Keep sends nothing and closes the question.
    const card = cardOf(page, target.title);
    await card.getByRole('button', { name: 'Dismiss this role' }).click();
    await expect(card.getByText('Dismiss this job?')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Save this role' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Keep' }).click();
    await expect(card.getByText('Dismiss this job?')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Dismiss this role' })).toBeVisible();
    expect(feedFeedbackRows(user.id).filter((row) => row.dismissed_at)).toHaveLength(0);

    // Escape closes it too, and Enter on Keep doesn't open the detail behind it.
    await card.getByRole('button', { name: 'Dismiss this role' }).click();
    await expect(card.getByRole('button', { name: 'Keep' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(card.getByText('Dismiss this job?')).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: 'Back to feed' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Dismiss this role' }).click();
    await page.keyboard.press('Escape');
    await expect(card.getByText('Dismiss this job?')).toHaveCount(0);

    // Confirm, with a double click: one request.
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/job-feed/feedback') && req.method() === 'POST') requests.push(req.postData() ?? '');
    });
    await card.getByRole('button', { name: 'Dismiss this role' }).click();
    await card.getByRole('button', { name: 'Dismiss', exact: true }).dblclick();
    await expect(page.getByText("Job dismissed. It won't come back.")).toBeVisible();
    await expect(cardOf(page, target.title)).toHaveCount(0);
    expect(requests.filter((body) => body.includes('"dismissed"'))).toHaveLength(1);

    // Neighbours stay, and the job is gone from Saved too.
    await expect(cardOf(page, keep.title)).toBeVisible();
    await expect(cardOf(page, other.title)).toBeVisible();
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await expect(canvas(page).getByText('Nothing saved yet', { exact: false })).toBeVisible();
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
    await canvas(page).getByRole('tab', { name: 'Saved' }).click();
    await expect(canvas(page).getByText('Nothing saved yet', { exact: false })).toBeVisible();

    // From the detail view: the same question, and the user lands back on the list.
    await canvas(page).getByRole('tab', { name: 'Today' }).click();
    await cardOf(page, other.title).click();
    await canvas(page).getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(canvas(page).getByText('Dismiss this job?')).toBeVisible();
    await canvas(page).getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(canvas(page).getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(cardOf(page, other.title)).toHaveCount(0);
    await expect(cardOf(page, keep.title)).toBeVisible();
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
