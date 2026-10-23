import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage } from '../lib/app';
import { REPO_ROOT } from '../lib/env';
import { fakeControl } from '../lib/fake-control';
import { JOB_DESCRIPTION } from '../lib/model-script';

/**
 * (l) The kit progress card in the chat carries one Useful Apply icon, the chat row's, not a second one in its header.
 *
 * A user who already has a kit starts a second one from the chat, so the progress renders in ChatPanel (a first kit
 * runs on the guided line instead). Every model answer is slowed so the card stays up long enough to look at. While
 * it runs: exactly one brand icon in the assistant row that holds the card, and the header shows the bar and the
 * percent. Screenshots at 1280 and 768, per-paint CDP frames and a Playwright video of the card appearing go to
 * `<main checkout>/verify/<branch>/kit-progress/`.
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
const SHOTS = process.env.E2E_SHOTS ?? join(mainCheckout(), 'verify', branchSlug(), 'kit-progress');
const SKIP_CHECK = 'Skip the check, generate the full kit now';

/** The progress card's step labels (AgentProgressV2's STEP_CONFIG): no other chat message carries them. */
const STEP_LABEL = /^(Parsing CV & Requirements|Skill Matching|Optimizing CV|Composing Cover Letter|Assessing Job Fit|Writing Application Email|Writing Follow-Up Email|Analyzing Documents|Generating Documents)$/;

/** The assistant row holding the progress card: a chat row with the icon column, that shows a step of the run. */
const progressRow = (page: Page) =>
  page.locator('div.flex.gap-3:has(> div.flex-shrink-0 > svg[role="img"])').filter({ has: page.getByText(STEP_LABEL) });

async function expectOneIcon(page: Page) {
  const row = progressRow(page);
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  // Counted in the DOM: Playwright's selector engine missed these SVGs under the row's :has() locator.
  await expect
    .poll(() => row.evaluate((el) => el.querySelectorAll('svg[role="img"][aria-label="Useful Apply"]').length), { message: 'brand icons in the progress row' })
    .toBe(1);
  // The one that stays is the row's own, in its icon column: the card beside it carries none.
  expect(await row.evaluate((el) => el.querySelector(':scope > div.flex-1')?.querySelectorAll('svg[role="img"][aria-label="Useful Apply"]').length ?? -1)).toBe(0);
  await expect(row.getByText(/^\d+%$/)).toBeVisible();
}

/** Every frame Chrome paints from now until `stop` is called, as `f<n>_<ms>.jpg`, the naming framesheet reads. */
async function startPaints(page: Page, name: string) {
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
  return async () => {
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    expect(count, `${name} recorded no frames`).toBeGreaterThan(1);
  };
}

test('(l) the kit progress card in the chat carries one Useful Apply icon', async ({ browser, request }) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  const { context, page } = await signedInPage(browser, request, 'progressicon', { videoDir: join(SHOTS, 'video') });
  await generateKitThroughUi(page);

  // The chat proposes the application, so its buttons offer to skip the fit check and build the kit.
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'Pick a button below to continue.', actions: [], executed: [{ type: 'propose_application' }] }),
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard');
  const input = page.getByPlaceholder(/Ask for a change|Paste a job ad or ask anything/);
  await input.fill(JOB_DESCRIPTION);
  await input.press('Enter');
  const skip = page.getByRole('button', { name: SKIP_CHECK });
  await expect(skip).toBeVisible();

  // Slow every model answer so the run stays on screen, then record the card coming in from the click.
  await fakeControl({ delayMs: 4_000 });
  try {
    const stop = await startPaints(page, '1280-progress-appears');
    try {
      await skip.click();
      await expectOneIcon(page);
      await page.waitForTimeout(800);
    } finally {
      await stop();
    }
    // Real progress reaches the bar: the percent moves past the 0% it starts at.
    await expect
      .poll(async () => Number((await progressRow(page).getByText(/^\d+%$/).textContent())?.replace('%', '') ?? 0))
      .toBeGreaterThan(0);
    await page.screenshot({ path: join(SHOTS, '1280-progress.png') });

    // Compact, the canvas takes the row; the chat, with the run in it, is one click away.
    await page.setViewportSize({ width: 768, height: 900 });
    await page.getByRole('button', { name: 'Show the conversation' }).click();
    await expectOneIcon(page);
    await page.screenshot({ path: join(SHOTS, '768-progress.png') });
  } finally {
    await fakeControl({});
  }
  await expect(page.getByText(/Your kit for .* is ready/).last()).toBeVisible({ timeout: 180_000 });
  await context.close();
});
