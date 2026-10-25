import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { generateKitThroughUi, signedInPage, waitForStored } from '../lib/app';

/**
 * (o) The composer and the sidebar, on a signed-in account with a kit made through the product on the
 * scripted model, at 1440x900.
 *
 * Composer: a pill one line high that grows into a box when the text wraps, Send a circle that is quiet until
 * there is text, Shift+Enter a new line, Enter sends. Sidebar: one navigation group, applications grouped by
 * day with no status pill, the open page a raised row, the account row at the bottom.
 *
 * Every state is saved as a screenshot, and the composer growing is recorded and cut to frames at 30 fps
 * (ffmpeg) so each frame can be reviewed. Artifacts go to the test's output under verify/<branch>/.
 */

const LONG_MESSAGE = 'Rewrite my summary so it leads with the forecast accuracy work. Keep it under three lines, and mention Power BI only if it fits naturally.';

async function borderRadius(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
}

test('(o) the composer grows from a pill to a box and sends on Enter; the sidebar is one calm group with day labels', async ({ browser, request }, testInfo) => {
  test.setTimeout(300_000);
  const videoDir = testInfo.outputPath('video');
  const signedIn = await signedInPage(browser, request, 'composer-sidebar', { videoDir });
  const { page, user } = signedIn;
  try {
    await generateKitThroughUi(page);
    await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside').first();
    const composer = page.locator('#tour-mode-selector');
    const field = page.getByRole('textbox', { name: 'Message', exact: true });
    const send = composer.getByRole('button', { name: 'Send message' });
    await expect(field).toBeVisible({ timeout: 30_000 });

    // Sidebar at rest: the application under its day, no status pill, the open one raised.
    await expect(sidebar.getByText('Today', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Kit ready')).toHaveCount(0);
    const row = sidebar.getByRole('button', { name: /Northwind Foods/ });
    await expect(row).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.getByRole('button', { name: 'New application' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('1-dashboard-at-rest.png') });
    await sidebar.screenshot({ path: testInfo.outputPath('2-sidebar-at-rest.png') });

    // Composer at rest: a pill, Send quiet and disabled.
    await expect(send).toBeDisabled();
    const pillRadius = await borderRadius(composer);
    expect(Number.parseFloat(pillRadius), `pill radius ${pillRadius}`).toBeGreaterThan(100);
    const restHeight = (await composer.boundingBox())?.height ?? 0;
    expect(restHeight).toBeGreaterThanOrEqual(52);
    expect(restHeight).toBeLessThan(60);
    await composer.screenshot({ path: testInfo.outputPath('3-composer-at-rest.png') });

    // One line: still a pill, Send live.
    await field.click();
    await field.pressSequentially('Make the summary shorter', { delay: 20 });
    await expect(send).toBeEnabled();
    expect(Number.parseFloat(await borderRadius(composer))).toBeGreaterThan(100);
    await composer.screenshot({ path: testInfo.outputPath('4-composer-one-line-focused.png') });

    // Wrapped text: the box, taller, with the card radius; Shift+Enter adds a line and never sends.
    await field.fill(LONG_MESSAGE);
    await field.press('Shift+Enter');
    await field.pressSequentially('Thanks.', { delay: 20 });
    await expect(field).toHaveValue(`${LONG_MESSAGE}\nThanks.`);
    await expect.poll(async () => Number.parseFloat(await borderRadius(composer))).toBe(16);
    // Every line shows: the field is as tall as its text, nothing scrolled out of view.
    await expect.poll(() => field.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    const grownHeight = (await composer.boundingBox())?.height ?? 0;
    expect(grownHeight).toBeGreaterThan(restHeight + 20);
    await composer.screenshot({ path: testInfo.outputPath('5-composer-expanded.png') });

    // Enter sends: the field empties and shrinks back to the pill.
    await field.press('Enter');
    await expect(field).toHaveValue('');
    await expect.poll(async () => Number.parseFloat(await borderRadius(composer))).toBeGreaterThan(100);
    await page.screenshot({ path: testInfo.outputPath('6-after-send.png') });

    // Keyboard: focus shows on a navigation row.
    await sidebar.getByRole('button', { name: 'Search' }).focus();
    await page.keyboard.press('Tab');
    await sidebar.screenshot({ path: testInfo.outputPath('7-sidebar-focus-visible.png') });

    // The Job Board open: its row is the raised one, the application's is not.
    await sidebar.getByRole('button', { name: /^Job Board/ }).click();
    await expect(sidebar.getByRole('button', { name: /^Job Board/ })).toHaveAttribute('aria-current', 'page');
    await expect(row).not.toHaveAttribute('aria-current', 'page');
    await row.hover();
    await sidebar.screenshot({ path: testInfo.outputPath('8-sidebar-job-board-open-row-hover.png') });
  } finally {
    await signedIn.context.close();
  }

  // The recording, cut to frames at 30 fps for a frame-by-frame review of the composer growing and shrinking.
  const videos = readdirSync(videoDir).filter((file) => file.endsWith('.webm'));
  expect(videos.length).toBeGreaterThan(0);
  const framesDir = testInfo.outputPath('frames');
  mkdirSync(framesDir, { recursive: true });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-i', join(videoDir, videos[0]), '-vf', 'fps=30', join(framesDir, 'f-%04d.png')]);
  expect(readdirSync(framesDir).length).toBeGreaterThan(30);
});
