import { expect, test } from '@playwright/test';
import { signedInPage } from '../lib/app';

/**
 * (r) Dashboard deep links for a signed-in user on a fresh browser (no localStorage) with no kit.
 *
 * Ways this could fail, written before the spec:
 *   r1  The link is applied while the spinner is up, then AuthContext resets the UI store (a signed-in user on a
 *       browser with no stored user id) and the workspace goes back to the CV. With no kit the user lands on the
 *       guided line instead of the tracker.
 *   r2  The fix over-holds: the link is never applied because the "stores ready" signal never turns true, so the
 *       user stays on the default pane.
 *   r3  Only tracker is fixed; job-feed still loses its link (it goes through the same effect, so check both).
 *   r4  A plain /dashboard load changes: it must still show the guided line, not a tracker or feed pane.
 *   r5  The guided line shows anonymous-only copy ("needs a free account", "no account needed") to a signed-in user.
 *   r6  The spec passes because the page shows the text elsewhere (the sidebar also says "Application Tracker"),
 *       so assert on the pane's own level 2 heading and the job board's Today/Saved tabs, not loose text, and
 *       check again after the page has settled so a late reset can't hide behind a first-paint pass.
 */
test('(r1) ?workspace=tracker opens the tracker for a signed-in user with no kit', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'deeplinktracker');
  try {
    await page.goto('/dashboard?workspace=tracker');
    await expect(page.getByRole('heading', { level: 2, name: 'Application Tracker' })).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 2, name: 'Application Tracker' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('(r2) ?workspace=job-feed opens the Job Board for a signed-in user with no kit', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'deeplinkfeed');
  try {
    await page.goto('/dashboard?workspace=job-feed');
    await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Saved' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('(r3) a plain /dashboard load shows the guided line without anonymous-only copy', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'deeplinkplain');
  try {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 2, name: 'Application Tracker' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Today' })).toHaveCount(0);
    await expect(page.getByText('needs a free account')).toHaveCount(0);
    await expect(page.getByText('no account needed')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
