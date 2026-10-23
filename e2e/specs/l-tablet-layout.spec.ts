import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage } from '../lib/app';
import { REPO_ROOT } from '../lib/env';

/**
 * (l) The shell at tablet and laptop widths, with a kit on the canvas and a conversation that has messages.
 *
 * Below 1100px the 224px sidebar, a 400px conversation and a usable canvas don't fit side by side, so the
 * conversation and the canvas take turns: one gets the room beside the sidebar, the other is a rail with the
 * toggle back. Above it both columns show.
 *
 *   l1  768 and 1024: the canvas opens on its own, Show the conversation switches to the chat (the canvas folds
 *       to its rail in the same step), Show the canvas switches back. Whichever column shows gets at least 480px.
 *       An unsaved CV edit survives the same trip, and the job feed and the tracker take turns too.
 *       By keyboard, focus moves to the toggle that switches back. A remount of the shell at tablet width (a trip
 *       through the phone layout and back) keeps the chat view the user chose.
 *   l2  Back up to 1280 from either view both columns show again, the canvas keeps at least 480px and its header
 *       on one line, and Collapse/Expand canvas still work as before.
 *       The chat stays mounted behind its rail, so a draft and the scroll offset survive the trip, and the canvas
 *       header never wraps.
 *   l3  A cold load at 768 opens straight on the canvas: sampled on every animation frame from the first, the canvas
 *       never drops under 480px and the CV page never spills past it (no squeezed row, no unscaled page). New
 *       application from there brings the chat forward, where its job ad field is. On a fresh device (nothing in
 *       local storage) the CV arrives after the first render, and at 1280 it is still scaled on every frame.
 *
 * Screenshots of both states at each width, per-paint CDP screencast frames of the toggles and the cold load, and
 * a Playwright video of the whole run (both pages) go to `<main checkout>/verify/<branch>/layout/`.
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

const RAIL = 48;
const USABLE = 480;

// Compact, the folded canvas stays mounted, inert, behind its rail: only the one on screen counts.
const canvas = (page: Page) => page.locator('section:not([inert]):has([role="tablist"])');
// The canvas column whatever it holds: the kit, the job feed or the tracker.
const canvasColumn = (page: Page) => page.locator('[data-shell-column="canvas"]:not([inert])');
// The feed's conversation stays mounted, hidden, beside the application's, and the application's own stays
// mounted, inert and transparent, behind its rail: only the one on screen counts.
const chat = (page: Page) => page.locator('section:has(> header h2):visible:not([inert] *)');
const showChat = (page: Page) => page.getByRole('button', { name: 'Show the conversation' });
const showCanvas = (page: Page) => page.getByRole('button', { name: 'Show the canvas' });
const expandCanvas = (page: Page) => page.getByRole('button', { name: 'Expand canvas' });
const collapseCanvas = (page: Page) => page.getByRole('button', { name: 'Collapse canvas' });

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error(`${locator} is not on screen`);
  return found;
}
const width = async (locator: Locator) => (await box(locator)).width;

/** The sidebar's real width, so the expected column widths follow it. */
const sidebar = async (page: Page) => width(page.locator('aside').first());

/**
 * Read the scroll offset of the chat's message list (the scrolling ancestor of the kit message), or first move it to
 * the middle of its range.
 */
async function chatScroll(page: Page, toMiddle = false): Promise<number> {
  return chat(page).getByText(/Your kit for Northwind Foods is ready/).evaluate((message, value) => {
    let list: HTMLElement | null = message.parentElement;
    while (list && !/(auto|scroll)/.test(getComputedStyle(list).overflowY)) list = list.parentElement;
    if (!list) throw new Error('the kit message has no scrolling ancestor');
    const range = list.scrollHeight - list.clientHeight;
    if (range < 200) throw new Error('the conversation is too short to prove a scroll offset');
    if (value) list.scrollTop = Math.round(range / 2);
    return list.scrollTop;
  }, toMiddle);
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
  const cvTab = await box(page.getByRole('tab', { name: 'CV', exact: true }));
  const letterTab = await box(page.getByRole('tab', { name: 'Cover letter' }));
  expect(letterTab.height).toBe(cvTab.height);
  expect((await box(page.getByRole('button', { name: 'Download all' }))).height).toBeLessThanOrEqual(40);
  expect(Math.abs(canvasWidth - (viewport - (await sidebar(page)) - RAIL))).toBeLessThanOrEqual(1);
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
  expect(Math.abs(chatWidth - (viewport - (await sidebar(page)) - RAIL))).toBeLessThanOrEqual(1);
  // The conversation is the real one, messages and all.
  await expect(chat(page).getByText(/Your kit for Northwind Foods is ready/)).toBeVisible();
  await expectNoSideScroll(page);
}

/**
 * Sample the canvas on every animation frame from the first: its width, and how far the CV page spills past it
 * (null on frames without the page). Read back with expectSampledFrames.
 */
async function sampleFrames(page: Page) {
  await page.addInitScript(() => {
    const frames: { canvas: number; spill: number | null }[] = [];
    (window as unknown as { layoutFrames: typeof frames }).layoutFrames = frames;
    const sample = () => {
      const column = document.querySelector('section:not([inert]):has([role="tablist"])');
      if (column) {
        const bounds = column.getBoundingClientRect();
        // The CV's size wrapper holds the Full Preview button; unscaled, it is the page's full 816px.
        const page = Array.from(column.querySelectorAll('button'))
          .find((button) => button.textContent?.includes('Full Preview'))
          ?.parentElement?.getBoundingClientRect();
        frames.push({
          canvas: bounds.width,
          spill: page ? Math.max(page.right - bounds.right, bounds.left - page.left) : null,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

/** No sampled frame had a canvas under `minCanvas` or a CV page spilling past it, and some frames did show the page. */
async function expectSampledFrames(page: Page, minCanvas: number) {
  await expect(page.getByRole('button', { name: 'Full Preview' })).toBeVisible({ timeout: 30_000 });
  const frames = await page.evaluate(() => (window as unknown as { layoutFrames: { canvas: number; spill: number | null }[] }).layoutFrames);
  expect(frames.length).toBeGreaterThan(5);
  expect(Math.min(...frames.map((frame) => frame.canvas))).toBeGreaterThanOrEqual(minCanvas);
  // Only frames that had the CV page on them say anything about its scale, so there must be some.
  const spills = frames.map((frame) => frame.spill).filter((spill): spill is number => spill !== null);
  expect(spills.length).toBeGreaterThan(5);
  expect(Math.max(...spills)).toBeLessThanOrEqual(1);
}

test('(l1-l3) chat and canvas take turns below 1100px and sit side by side above it', async ({ browser, request }) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  const { context, page } = await signedInPage(browser, request, 'tabletlayout', { videoDir: join(SHOTS, 'video') });
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

    // The chat stays mounted behind its rail: a draft typed before the switch is still there after it, and the
    // message list is where the user left it, not back at the top.
    const draft = `Draft kept across the switch at ${viewport}`;
    await chat(page).getByPlaceholder('Ask for a change or a screening answer').fill(draft);
    const offset = await chatScroll(page, true);
    expect(offset).toBeGreaterThan(0);

    await recordPaints(page, `${viewport}-to-canvas`, () => showCanvas(page).click());
    await expectCanvasView(page, viewport);

    await showChat(page).click();
    await expectChatView(page, viewport);
    await expect(chat(page).getByPlaceholder('Ask for a change or a screening answer')).toHaveValue(draft);
    expect(await chatScroll(page)).toBe(offset);
    await chat(page).getByPlaceholder('Ask for a change or a screening answer').fill('');
    await showCanvas(page).click();
    await expectCanvasView(page, viewport);
  }

  // An unsaved CV edit survives a trip to the chat: compact, the folded canvas stays mounted behind its rail.
  const draftTitle = 'Draft title kept across the switch';
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByText('Professional Title', { exact: true }).locator('xpath=..').click();
  await page.locator('input[type="text"]').first().fill(draftTitle);
  await page.locator('button[title="Save"]').first().click();
  await expect(canvas(page).getByText(draftTitle)).toBeVisible();
  await showChat(page).click();
  await expectChatView(page, 768);
  await showCanvas(page).click();
  await expect(canvas(page).getByText(draftTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: /Save changes/ })).toBeVisible();
  await shot(page, '768-cv-edit-kept');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expectCanvasView(page, 768);

  // The job feed and the tracker share the two columns, so they take turns the same way.
  for (const [workspace, slug] of [[/^Job Board/, 'job-board'], [/^Application Tracker/, 'tracker']] as const) {
    await page.getByRole('button', { name: workspace }).click();
    await expect(showChat(page)).toBeVisible();
    expect(Math.abs((await width(canvasColumn(page))) - (768 - (await sidebar(page)) - RAIL))).toBeLessThanOrEqual(1);
    await expectNoSideScroll(page);
    await shot(page, `768-${slug}-canvas`);
    await showChat(page).click();
    await expect(showCanvas(page)).toBeVisible();
    await expect(canvasColumn(page)).toHaveCount(0);
    await expectNoSideScroll(page);
    await shot(page, `768-${slug}-chat`);
    await showCanvas(page).click();
    await expect(canvasColumn(page)).toBeVisible();
  }
  await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
  await expectCanvasView(page, 768);

  // Keyboard: the toggle that was pressed leaves with the switch, and focus lands on the one that switches back.
  await showChat(page).focus();
  await page.keyboard.press('Enter');
  await expectChatView(page, 768);
  await expect(showCanvas(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expectCanvasView(page, 768);
  await expect(showChat(page)).toBeFocused();

  // l2 from the canvas view: up past the breakpoint both columns return, and back down the canvas takes the row.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(canvas(page)).toBeVisible();
  await expect(chat(page)).toBeVisible();
  await page.setViewportSize({ width: 768, height: 900 });
  await expectCanvasView(page, 768);

  // Below 768 the shell unmounts for the phone layout. Coming back mounts it again, in the chat view the user chose.
  await showChat(page).click();
  await expectChatView(page, 768);
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.getByRole('heading', { name: 'Best on desktop' })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 900 });
  await expectChatView(page, 768);

  // l2 from the chat view: both columns return.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(canvas(page)).toBeVisible();
  await expect(chat(page)).toBeVisible();
  expect(await width(canvas(page))).toBeGreaterThanOrEqual(USABLE);
  expect(await width(chat(page))).toBeGreaterThanOrEqual(360);
  const cvTab = await box(page.getByRole('tab', { name: 'CV', exact: true }));
  expect((await box(page.getByRole('tab', { name: 'Cover letter' }))).height).toBe(cvTab.height);
  await expectNoSideScroll(page);
  await shot(page, '1280-both');

  await recordPaints(page, '1280-collapse-canvas', () => collapseCanvas(page).click());
  await expect(canvas(page)).toHaveCount(0);
  await expect(chat(page)).toBeVisible();
  expect(await width(chat(page))).toBeGreaterThanOrEqual(1280 - (await sidebar(page)) - RAIL - 1);
  await shot(page, '1280-chat');
  await expandCanvas(page).click();
  await expect(canvas(page)).toBeVisible();
  await expect(chat(page)).toBeVisible();

  // l3: a cold load at tablet width, recorded from the first paint and sampled on every animation frame.
  const cold = await context.newPage();
  await cold.setViewportSize({ width: 768, height: 900 });
  await sampleFrames(cold);
  await recordPaints(cold, '768-cold-start', async () => {
    await cold.goto('/dashboard');
    await expect(canvas(cold)).toBeVisible({ timeout: 30_000 });
  });
  await expectCanvasView(cold, 768);
  await expectSampledFrames(cold, USABLE);
  await shot(cold, '768-cold-start');

  // New application from the canvas view: the reset lands in the chat, so the chat comes forward with its job ad field.
  await cold.getByRole('button', { name: 'New Application' }).click();
  await expect(chat(cold).getByPlaceholder('Paste a job ad or ask anything')).toBeVisible();
  await expect(showCanvas(cold)).toBeVisible();
  expect(await width(chat(cold))).toBeGreaterThanOrEqual(USABLE);
  await shot(cold, '768-new-application');

  // l3 on a fresh device: the same account with nothing in local storage, so the CV only arrives once the session
  // loads from the server, after the first render. The page must still be scaled on every frame it shows.
  const fresh = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies: await context.cookies(), origins: [] } });
  const device = await fresh.newPage();
  await sampleFrames(device);
  await recordPaints(device, '1280-fresh-device', async () => {
    await device.goto('/dashboard');
    await expect(device.getByRole('button', { name: 'Full Preview' })).toBeVisible({ timeout: 30_000 });
  });
  await expectSampledFrames(device, USABLE);
  await shot(device, '1280-fresh-device');
  await fresh.close();
  await context.close();
});
