import { expect, test } from '@playwright/test';
import { BASE_URL } from '../lib/env';

/**
 * (visual) A cold load in dark never paints a light frame. An init script samples the body background on every
 * animation frame from the first one with a body (the real clock: a fake one would fake requestAnimationFrame too),
 * and every sample must be the dark canvas. The browser is set to light, so only the setting can make it dark.
 * The run is recorded on video; cut it to 30 fps frames to look at it.
 */

test.skip(process.platform !== 'linux', 'Runs with the visual project.');

const DARK_CANVAS = 'rgb(11, 22, 34)';

test('a cold dark load paints dark from the first frame', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    recordVideo: { dir: testInfo.outputPath('video'), size: { width: 1280, height: 900 } },
  });
  try {
    await context.addCookies([{ name: 'ua-theme', value: 'dark', url: BASE_URL }]);
    await context.addInitScript(() => {
      const samples: string[] = [];
      (window as unknown as { __bgSamples: string[] }).__bgSamples = samples;
      const sample = () => {
        if (document.body) samples.push(getComputedStyle(document.body).backgroundColor);
        if (samples.length < 240) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForLoadState('networkidle');
    const samples = await page.evaluate(() => (window as unknown as { __bgSamples: string[] }).__bgSamples);
    testInfo.attach('background-samples.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
    expect(samples.length).toBeGreaterThan(10);
    expect(samples.filter((value) => value !== DARK_CANVAS), 'frames painted with another background').toEqual([]);
  } finally {
    await context.close();
  }
});
