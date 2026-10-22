import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage } from '../lib/app';
import { REPO_ROOT } from '../lib/env';

/**
 * (l) The shell at tablet and laptop widths, with a kit on the canvas and a conversation that has messages.
 *
 * Below 1100px the 225px sidebar, a 400px conversation and a usable canvas don't fit side by side, so the
 * conversation and the canvas take turns: one gets the room beside the sidebar, the other is a rail with the
 * toggle back. Above it both columns show.
 *
 *   l1  768 and 1024: the canvas opens on its own, Show the conversation switches to the chat (the canvas folds
 *       to its rail in the same step), Show the canvas switches back. Whichever column shows gets at least 480px.
 *   l2  Back up to 1280 both columns show again, the canvas keeps at least 480px, and Collapse/Expand canvas
 *       still work as before.
 *       The chat stays mounted behind its rail, so a draft survives the trip, and the canvas header never wraps.
 *   l3  A cold load at 768 opens straight on the canvas, never on the squeezed three-column layout.
 *
 * Screenshots of both states at each width, and per-paint CDP screencast frames of the toggles and the cold
 * load, go to `<main checkout>/verify/<branch>/layout/`.
 */

function mainCheckout(): string {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  return dirname(resolve(REPO_ROOT, common));
}
function branchSlug(): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-');
}
const SHOTS = process.env.E2E_SHOTS ?? join(mainCheckout(), 'verify', branchSlug(), 'layout');

const SIDEBAR = 225;
const RAIL = 48;
const USABLE = 480;

const canvas = (page: Page) => page.locator('section:has([role="tablist"])');
// The feed's conversation stays mounted, hidden, beside the application's: only the visible one counts.
const chat = (page: Page) => page.locator('section:has(> header h2):visible');
const showChat = (page: Page) => page.getByRole('button', { name: 'Show the conversation' });
const showCanvas = (page: Page) => page.getByRole('button', { name: 'Show the canvas' });
const expandCanvas = (page: Page) => page.getByRole('button', { name: 'Expand canvas' });
const collapseCanvas = (page: Page) => page.getByRole('button', { name: 'Collapse canvas' });

async function width(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('column is not on screen');
  return box.width;
}

/** The page never scrolls sideways: a squeezed column shows up as overflow before it shows up as a number. */
async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every frame Chrome paints while `action` runs, as `f_<ms>.jpg`, the naming framesheet reads. */
async function recordPaints(page: Page, name: string, action: () => Promise<void>) {
  const dir = join(SHOTS, 'frames', name);
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const started = Date.now();
  let count = 0;
  cdp.on('Page.screencastFrame', (frame) => {
    const ms = String(Date.now() - started).padStart(6, '0');
    writeFileSync(join(dir, `f${String(count++).padStart(4, '0')}_${ms}.jpg`), Buffer.from(frame.data, 'base64'));
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
  await action();
  // Let the last paints land before stopping.
  await page.waitForTimeout(600);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  expect(count, `${name} recorded no frames`).toBeGreaterThan(1);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

/** Compact: the canvas has the room, the chat is a rail. */
async function expectCanvasView(page: Page, viewport: number) {
  await expect(canvas(page)).toBeVisible();
  await expect(showChat(page)).toBeVisible();
  await expect(chat(page)).toHaveCount(0);
  // One control per move: the chat rail is the way across, so the canvas has no collapse button of its own.
  await expect(collapseCanvas(page)).toHaveCount(0);
  await expect(showCanvas(page)).toHaveCount(0);
  const canvasWidth = await width(canvas(page));
  expect(canvasWidth).toBeGreaterThanOrEqual(USABLE);
  // No label breaks onto a second line in the canvas header.
  const cvTab = await page.getByRole('tab', { name: 'CV', exact: true }).boundingBox();
  const letterTab = await page.getByRole('tab', { name: 'Cover letter' }).boundingBox();
  expect(letterTab?.height).toBe(cvTab?.height);
  expect((await page.getByRole('button', { name: 'Download all' }).boundingBox())?.height).toBeLessThanOrEqual(40);
  expect(Math.abs(canvasWidth - (viewport - SIDEBAR - RAIL))).toBeLessThanOrEqual(2);
  await expectNoSideScroll(page);
}

/** Compact: the chat has the room, the canvas is a rail. */
async function expectChatView(page: Page, viewport: number) {
  await expect(chat(page)).toBeVisible();
  await expect(showCanvas(page)).toBeVisible();
  await expect(canvas(page)).toHaveCount(0);
  await expect(showChat(page)).toHaveCount(0);
  const chatWidth = await width(chat(page));
  expect(chatWidth).toBeGreaterThanOrEqual(USABLE);
  expect(Math.abs(chatWidth - (viewport - SIDEBAR - RAIL))).toBeLessThanOrEqual(2);
  // The conversation is the real one, messages and all.
  await expect(chat(page).getByText(/Your kit for Northwind Foods is ready/)).toBeVisible();
  await expectNoSideScroll(page);
}

test('(l1-l3) chat and canvas take turns below 1100px and sit side by side above it', async ({ browser, request }) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  const { context, page } = await signedInPage(browser, request, 'tabletlayout');
  await generateKitThroughUi(page);
  await expect(canvas(page)).toBeVisible();

  // l1: shrink the window with the kit open and the conversation full of messages.
  for (const viewport of [1024, 768]) {
    await page.setViewportSize({ width: viewport, height: 900 });
    await expectCanvasView(page, viewport);
    await shot(page, `${viewport}-canvas`);

    await recordPaints(page, `${viewport}-to-chat`, () => showChat(page).click());
    await expectChatView(page, viewport);
    await shot(page, `${viewport}-chat`);

    // The chat stays mounted behind its rail: a draft typed before the switch is still there after it.
    const draft = `Draft kept across the switch at ${viewport}`;
    await chat(page).getByPlaceholder('Ask for a change or a screening answer').fill(draft);

    await recordPaints(page, `${viewport}-to-canvas`, () => showCanvas(page).click());
    await expectCanvasView(page, viewport);

    await showChat(page).click();
    await expectChatView(page, viewport);
    await expect(chat(page).getByPlaceholder('Ask for a change or a screening answer')).toHaveValue(draft);
    await chat(page).getByPlaceholder('Ask for a change or a screening answer').fill('');
    await showCanvas(page).click();
    await expectCanvasView(page, viewport);
  }

  // l2: back above the breakpoint from the chat view, both columns return.
  await showChat(page).click();
  await expectChatView(page, 768);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(canvas(page)).toBeVisible();
  await expect(chat(page)).toBeVisible();
  expect(await width(canvas(page))).toBeGreaterThanOrEqual(USABLE);
  expect(await width(chat(page))).toBeGreaterThanOrEqual(360);
  await expectNoSideScroll(page);
  await shot(page, '1280-both');

  await recordPaints(page, '1280-collapse-canvas', () => collapseCanvas(page).click());
  await expect(canvas(page)).toHaveCount(0);
  await expect(chat(page)).toBeVisible();
  expect(await width(chat(page))).toBeGreaterThanOrEqual(1280 - SIDEBAR - RAIL - 2);
  await shot(page, '1280-chat');
  await expandCanvas(page).click();
  await expect(canvas(page)).toBeVisible();
  await expect(chat(page)).toBeVisible();

  // l3: a cold load at tablet width, recorded from the first paint.
  const cold = await context.newPage();
  await cold.setViewportSize({ width: 768, height: 900 });
  await recordPaints(cold, '768-cold-start', async () => {
    await cold.goto('/dashboard');
    await expect(canvas(cold)).toBeVisible({ timeout: 30_000 });
  });
  await expectCanvasView(cold, 768);
  await shot(cold, '768-cold-start');
  await context.close();
});
