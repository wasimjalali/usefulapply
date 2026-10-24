import { expect, test } from '@playwright/test';
import { signedInPage } from '../lib/app';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { createTestUser, nextTestIp, signInContext } from '../lib/user';
import type { TestUser } from '../lib/user';

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
 *   r7  Readiness latches: a tab that settled anonymous on the link, then signs in without a reload, is "ready"
 *       before the new user's reset runs, the link is already marked handled, and the reset sends it to the CV.
 *   r9  The users from signedInPage already hold a primary CV (the guided line starts at the job step), so r3 builds a
 *       user with `primaryCv: false`. r1, r2 and r4 don't depend on the guided line's step.
 *   r8  r3 passes on a blank page or a stuck spinner because it only asserts absence, so it also asserts the
 *       guided line's own heading and, after the CV is in, the job step where the account line used to sit.
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
  // signedInPage's user has a stored primary CV, so its guided line opens at the job step. This one has none.
  const user: TestUser = await createTestUser(request, 'deeplinkplain', { primaryCv: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
  });
  await signInContext(context, request, user);
  const page = await context.newPage();
  try {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Start with your CV' })).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 2, name: 'Application Tracker' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Today' })).toHaveCount(0);
    await expect(page.getByText('needs a free account')).toHaveCount(0);
    await expect(page.getByText('no account needed')).toHaveCount(0);

    // The job step, where "The full kit needs a free account" used to show.
    await page.getByRole('button', { name: 'No file handy? Paste the text instead' }).click();
    await page.getByPlaceholder(/Paste your full CV/).fill(PRIMARY_CV);
    await page.getByRole('button', { name: 'Use this text' }).click();
    const adBox = page.getByPlaceholder(/Paste the whole ad/).first();
    await expect(adBox).toBeVisible({ timeout: 60_000 });
    await adBox.fill(JOB_DESCRIPTION);
    await expect(page.getByRole('button', { name: /Check my fit/ })).toBeVisible();
    await expect(page.getByText('needs a free account')).toHaveCount(0);
    await expect(page.getByText('Your first fit check is free')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('(r4) a tab that loaded the link anonymously and then signs in lands on the tracker', async ({ browser, request }) => {
  const user = await createTestUser(request, 'deeplinkswitch');
  const ip = nextTestIp();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-connecting-ip': ip, 'x-forwarded-for': ip },
  });
  try {
    const page = await context.newPage();
    await page.goto('/dashboard?workspace=tracker');
    await page.waitForLoadState('networkidle');
    // Sign in without a reload: the cookie lands, then the app's session refetch (a window refocus) picks it up.
    await signInContext(context, request, user);
    await expect(async () => {
      await page.evaluate(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
      await expect(page.getByRole('heading', { level: 2, name: 'Application Tracker' })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 2, name: 'Application Tracker' })).toBeVisible();
  } finally {
    await context.close();
  }
});
