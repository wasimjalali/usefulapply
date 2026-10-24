import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage, storedApplication, waitForStored } from '../lib/app';
import { BASE_URL } from '../lib/env';
import { fakeReset } from '../lib/fake-control';
import type { TestUser } from '../lib/user';
import { pinUser, seedFeedInbox, settleLongPage, signIn, visualPage, visualUser, waitForSavedChat, VIEWPORTS, type SessionCookies, type TimeRewrite, type Viewport } from '../lib/visual';

/**
 * (visual) Every screen of the design-system plan (docs/plans/2026-10-24-design-system.md) at 1280x900 and
 * 768x1024, compared pixel for pixel (maxDiffPixels 0, threshold 0.005) against the committed Linux renders in
 * e2e/visual/__screenshots__/. The token PRs change no pixel, so any difference here is a regression.
 *
 * Users, kit and feed rows are seeded through the product (sign-up, the fit and kit flow on the scripted model)
 * or straight into the local D1, then pinned to a fixed name, email and timestamps (e2e/lib/visual.ts). The
 * browser runs on a frozen clock (2026-10-24T09:00:00Z), in UTC and en-US, with reduced motion and with every
 * request to another host aborted. Animations and the caret are off in the screenshots.
 *
 * The snapshots are Linux renders, so the project skips itself anywhere else. Rebaseline only with the plan's
 * four-step procedure, never to make a diff go away.
 */

test.skip(process.platform !== 'linux', 'The snapshots are Linux renders; other platforms render fonts differently.');
test.describe.configure({ mode: 'serial' });

const FEED_JOBS = [
  { title: 'Senior FP&A Analyst', company: 'Northwind Foods', fitLabel: 'strong' as const, salary: 'USD 95k to 115k', location: 'Remote' },
  { title: 'Financial Planning Analyst', company: 'Harbor Freight Lines', fitLabel: 'good' as const, salary: 'USD 85k to 100k', location: 'Chicago, IL' },
  { title: 'Forecasting Analyst', company: 'Lakeview Health', fitLabel: 'good' as const, salary: 'USD 80k to 95k', location: 'Remote' },
];

type SignedIn = { user: TestUser; cookies: SessionCookies };
// One user per screen group: the job feed API allows 15 loads a minute per user, and every dashboard load spends
// one. All but `empty` hold copies of the one kit generated in beforeAll.
let empty: SignedIn;
let kit: SignedIn;
let kitSessionId: string;
let tracker: SignedIn;
let feedSetup: SignedIn;
let toasts: SignedIn;
let toastsSessionId: string;
let feed: SignedIn;
let feedRewrites: TimeRewrite[];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  await fakeReset();
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const emptyUser = await visualUser(api, 'empty');
    empty = { user: emptyUser, cookies: await signIn(emptyUser) };

    // The kit comes from the real fit and kit flow on the scripted model, then gets pinned like the others.
    // Its own request context: signing in leaves a session cookie behind, and Better Auth refuses a sign-up that
    // carries cookies but no Origin.
    const kitApi = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const signedIn = await signedInPage(browser, kitApi, 'visual-kit');
    await generateKitThroughUi(signedIn.page);
    await waitForStored(signedIn.user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
    await waitForSavedChat(signedIn.user.id, 'Your kit for Northwind Foods is ready');
    await signedIn.context.close();
    await kitApi.dispose();
    const kitUser = pinUser(signedIn.user, 'kit');
    kit = { user: kitUser, cookies: await signIn(kitUser) };
    kitSessionId = sessionOf(kitUser);

    const withKit = async (handle: string): Promise<SignedIn> => {
      const user = await visualUser(api, handle, { applicationsFrom: kitUser.id });
      return { user, cookies: await signIn(user) };
    };
    tracker = await withKit('tracker');
    feedSetup = await withKit('feed-setup');
    toasts = await withKit('toasts');
    toastsSessionId = sessionOf(toasts.user);

    const feedUser = await visualUser(api, 'feed', { applicationsFrom: kitUser.id });
    feedRewrites = seedFeedInbox(feedUser.id, FEED_JOBS);
    feed = { user: feedUser, cookies: await signIn(feedUser) };
  } finally {
    await api.dispose();
  }
});

function sessionOf(user: TestUser): string {
  const stored = storedApplication(user.id);
  if (!stored) throw new Error(`${user.email} has no application`);
  return stored.id;
}

async function shoot(page: Page, name: string, viewport: Viewport, fullPage = false): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}-${viewport.name}.png`, {
    fullPage,
    mask: [page.locator('video, iframe')],
    timeout: 30_000,
  });
}

/**
 * The tracker or the job feed, opened from the sidebar the way a user gets there. The dashboard first restores the
 * user's last application, so the click waits for that to finish, or the restore can switch the workspace back.
 */
async function openWorkspace(page: Page, button: 'Application Tracker' | RegExp): Promise<void> {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  const nav = page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: button });
  await nav.click();
  await expect(nav).toHaveAttribute('aria-current', 'page');
  await page.waitForLoadState('networkidle');
}

/** The kit's saved conversation loads after the canvas; the screen isn't final until its last message is in. */
async function waitForKitChat(page: Page): Promise<void> {
  await expect(page.getByText(/Your kit for Northwind Foods is ready/).first()).toBeAttached({ timeout: 30_000 });
}

const kitTab = (tab: 'cv' | 'cover-letter' | 'email', sessionId = kitSessionId) =>
  `/dashboard?session=${sessionId}&workspace=application-kit&tab=${tab}`;

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    for (const [name, path] of [
      ['landing', '/'],
      ['pricing', '/pricing'],
      ['geo-cover-letter-generator', '/ai-job-application/cover-letter-generator'],
    ] as const) {
      test(`${name} @${viewport.name}`, async ({ browser }) => {
        const { context, page } = await visualPage(browser, viewport);
        await page.goto(path);
        await settleLongPage(page);
        await shoot(page, name, viewport, true);
        await context.close();
      });
    }

    test(`sign-in @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport);
      await page.goto('/auth/login');
      await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shoot(page, 'sign-in', viewport);
      await context.close();
    });

    test(`sign-up @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport);
      await page.goto('/auth/signup');
      await expect(page.getByRole('heading', { name: 'Create your free account' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shoot(page, 'sign-up', viewport);
      await context.close();
    });

    test(`dashboard empty @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport, { user: empty });
      await page.goto('/dashboard');
      await expect(page.getByPlaceholder(/Paste the whole ad/)).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      await shoot(page, 'dashboard-empty', viewport);
      await context.close();
    });

    for (const [name, tab, tabName] of [
      ['dashboard-kit-cv', 'cv', 'CV'],
      ['dashboard-kit-cover-letter', 'cover-letter', 'Cover letter'],
      ['dashboard-kit-emails', 'email', 'Emails'],
    ] as const) {
      test(`${name} @${viewport.name}`, async ({ browser }) => {
        const { context, page } = await visualPage(browser, viewport, { user: kit });
        await page.goto(kitTab(tab));
        await expect(page.getByRole('tab', { name: tabName, exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
        await waitForKitChat(page);
        await page.waitForLoadState('networkidle');
        await shoot(page, name, viewport);
        await context.close();
      });
    }

    if (viewport.name === 'tablet') {
      // At 768 the conversation and the canvas take turns; this is the conversation's turn.
      test(`dashboard-kit-chat @${viewport.name}`, async ({ browser }) => {
        const { context, page } = await visualPage(browser, viewport, { user: kit });
        await page.goto(kitTab('cv'));
        await page.getByRole('button', { name: 'Show the conversation' }).click();
        await expect(page.getByText(/Your kit for Northwind Foods is ready/).last()).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState('networkidle');
        await shoot(page, 'dashboard-kit-chat', viewport);
        await context.close();
      });
    }

    test(`tracker @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport, { user: tracker });
      await openWorkspace(page, 'Application Tracker');
      await expect(page.getByRole('button', { name: 'Delete this application', exact: true })).toBeAttached({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      await shoot(page, 'tracker', viewport);
      await context.close();
    });

    test(`dialog delete-application @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport, { user: tracker });
      await openWorkspace(page, 'Application Tracker');
      await page.getByRole('button', { name: 'Delete this application', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Delete Northwind Foods?' })).toBeVisible();
      await shoot(page, 'dialog-delete-application', viewport);
      await context.close();
    });

    test(`job-feed setup @${viewport.name}`, async ({ browser }) => {
      // A user with an application who never set the feed up. (With no application, the first-run view has no sidebar.)
      const { context, page } = await visualPage(browser, viewport, { user: feedSetup });
      await openWorkspace(page, /^Job Board/);
      await page.waitForLoadState('networkidle');
      await shoot(page, 'job-feed-setup', viewport);
      await context.close();
    });

    test(`job-feed results @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport, { user: feed, rewrites: feedRewrites });
      await openWorkspace(page, /^Job Board/);
      await expect(page.getByText('Harbor Freight Lines').first()).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      await shoot(page, 'job-feed-results', viewport);
      await context.close();
    });

    test(`settings @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport, { user: empty });
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('visual-empty@test.local').first()).toBeVisible({ timeout: 30_000 });
      await shoot(page, 'settings', viewport);
      await context.close();
    });

    test(`toast success @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport, { user: toasts });
      await page.goto(kitTab('cover-letter', toastsSessionId));
      await waitForKitChat(page);
      await page.getByRole('button', { name: 'Download', exact: true }).click();
      await page.getByRole('menuitem', { name: 'DOCX' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'DOCX downloaded.' })).toBeVisible({ timeout: 30_000 });
      await shoot(page, 'toast-success', viewport);
      await context.close();
    });

    test(`toast error @${viewport.name}`, async ({ browser }) => {
      const { context, page } = await visualPage(browser, viewport, { user: toasts });
      await page.goto(kitTab('cv', toastsSessionId));
      await waitForKitChat(page);
      // Browser Run does not run locally, so the PDF export fails the way a real outage does.
      await page.getByRole('button', { name: 'Download PDF' }).click();
      await expect(page.getByRole('alert').filter({ hasText: "The PDF didn't build. Try again in a moment." })).toBeVisible({ timeout: 30_000 });
      await shoot(page, 'toast-error', viewport);
      await context.close();
    });
  });
}
