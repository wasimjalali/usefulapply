import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, request as playwrightRequest, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { generateKitThroughUi, signedInPage, storedApplication, waitForStored } from '../lib/app';
import { BASE_URL } from '../lib/env';
import { fakeReset } from '../lib/fake-control';
import { pinUser, rewriteTimes, seedFeedInbox, signIn, visualUser, waitForSavedChat, type SessionCookies, type TimeRewrite } from '../lib/visual';

/**
 * (visual, on demand) Motion of the design system's pop and lift moments, captured frame by frame: the delete dialog
 * opening, a job card's hover lift and a toast arriving. Chromium's screencast hands over every frame the compositor
 * paints (up to 60 a second), so a state that lasts a few milliseconds is in the frames. Frames land in each test's
 * output folder as frames/frame-NNNN.png with their times in frames/frames.json; tile them into a sheet to review.
 *
 * Unlike the screenshots, motion is on (no reduced motion) and the clock is real. Run it with E2E_MOTION=1.
 */

test.skip(process.platform !== 'linux' || !process.env.E2E_MOTION, 'Records motion frames on demand: E2E_MOTION=1 on Linux.');

type SignedIn = { cookies: SessionCookies; sessionId: string };
let tracker: SignedIn;
let toasts: SignedIn;
let feed: SignedIn;
let feedRewrites: TimeRewrite[];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  await fakeReset();
  const kitApi = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const generationDay = new Date().toISOString().slice(0, 10);
  let kitUserId: string;
  try {
    const signedIn = await signedInPage(browser, kitApi, 'motion-kit');
    try {
      await generateKitThroughUi(signedIn.page);
      await waitForStored(signedIn.user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
      await waitForSavedChat(signedIn.user.id, 'Your kit for Northwind Foods is ready');
      kitUserId = pinUser(signedIn.user, 'motion-kit', [generationDay]).id;
    } finally {
      await signedIn.context.close();
    }
  } finally {
    await kitApi.dispose();
  }
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const withKit = async (handle: string, seed?: (userId: string) => void): Promise<SignedIn> => {
      const user = await visualUser(api, handle, { applicationsFrom: kitUserId });
      seed?.(user.id);
      const stored = storedApplication(user.id);
      if (!stored) throw new Error(`${user.email} has no application`);
      return { cookies: await signIn(user), sessionId: stored.id };
    };
    tracker = await withKit('motion-tracker');
    toasts = await withKit('motion-toasts');
    feed = await withKit('motion-feed', (userId) => {
      feedRewrites = seedFeedInbox(userId, [
        { title: 'Senior FP&A Analyst', company: 'Northwind Foods', fitLabel: 'strong', salary: 'USD 95k to 115k', location: 'Remote' },
        { title: 'Financial Planning Analyst', company: 'Harbor Freight Lines', fitLabel: 'good', salary: 'USD 85k to 100k', location: 'Chicago, IL' },
      ]);
    });
  } finally {
    await api.dispose();
  }
});

async function motionPage(browser: Browser, user: SignedIn, rewrites: TimeRewrite[] = []): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    timezoneId: 'UTC',
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const origin = new URL(BASE_URL).origin;
  await context.route((url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'), (route) => route.abort());
  await rewriteTimes(context, rewrites);
  await context.addCookies(user.cookies);
  const page = await context.newPage();
  return {
    page,
    close: async () => {
      await context.unrouteAll({ behavior: 'ignoreErrors' });
      await context.close();
    },
  };
}

/** Capture every painted frame from just before `action` until `settleMs` after it. Returns the frame count. */
async function recordFrames(page: Page, testInfo: TestInfo, action: () => Promise<void>, settleMs = 900): Promise<number> {
  const dir = testInfo.outputPath('frames');
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: { data: string; timestamp: number }[] = [];
  cdp.on('Page.screencastFrame', (frame) => {
    frames.push({ data: frame.data, timestamp: frame.metadata.timestamp ?? 0 });
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(200);
  await action();
  await page.waitForTimeout(settleMs);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  frames.forEach((frame, i) => writeFileSync(join(dir, `frame-${String(i).padStart(4, '0')}.png`), Buffer.from(frame.data, 'base64')));
  const start = frames[0]?.timestamp ?? 0;
  writeFileSync(join(dir, 'frames.json'), JSON.stringify(frames.map((frame, i) => ({ frame: i, ms: Math.round((frame.timestamp - start) * 1000) })), null, 2));
  return frames.length;
}

async function openWorkspace(page: Page, button: 'Application Tracker' | RegExp): Promise<void> {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  const nav = page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: button });
  await nav.click();
  await expect(nav).toHaveAttribute('aria-current', 'page');
  await page.waitForLoadState('networkidle');
}

test('dialog opens', async ({ browser }, testInfo) => {
  const { page, close } = await motionPage(browser, tracker);
  try {
    await openWorkspace(page, 'Application Tracker');
    const button = page.getByRole('button', { name: 'Delete this application', exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const count = await recordFrames(page, testInfo, () => button.click());
    await expect(page.getByRole('dialog', { name: 'Delete Northwind Foods?' })).toBeVisible();
    expect(count, 'frames captured').toBeGreaterThan(3);
  } finally {
    await close();
  }
});

test('job card hover lift', async ({ browser }, testInfo) => {
  const { page, close } = await motionPage(browser, feed, feedRewrites);
  try {
    await openWorkspace(page, /^Job Board/);
    const card = page.getByText('Harbor Freight Lines').first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.mouse.move(5, 5);
    const count = await recordFrames(page, testInfo, () => card.hover());
    expect(count, 'frames captured').toBeGreaterThan(3);
  } finally {
    await close();
  }
});

test('toast arrives', async ({ browser }, testInfo) => {
  const { page, close } = await motionPage(browser, toasts);
  try {
    await page.goto(`/dashboard?session=${toasts.sessionId}&workspace=application-kit&tab=cover-letter`);
    await expect(page.getByText(/Your kit for Northwind Foods is ready/).first()).toBeAttached({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const count = await recordFrames(page, testInfo, () => page.getByRole('menuitem', { name: 'DOCX' }).click(), 1_500);
    await expect(page.getByRole('alert').filter({ hasText: 'DOCX downloaded.' })).toBeVisible();
    expect(count, 'frames captured').toBeGreaterThan(3);
  } finally {
    await close();
  }
});
