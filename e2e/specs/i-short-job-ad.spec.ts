import { expect, test, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage } from '../lib/app';
import { setBalance } from '../lib/user';
import {
  isShortJobAd,
  MIN_JOB_AD_CHARS,
  SHORT_JOB_AD_CHARS,
  SHORT_JOB_AD_HINT,
  TOO_SHORT_JOB_AD_NOTE,
} from '../../src/lib/job-ad-length';

const SHORT_AD = 'Product Engineer (m/w/d), Lumen Logistics GmbH, Berlin. Build internal tools with TypeScript, React and Node.js. 3+ years experience, English required, German a plus.';
const TOO_SHORT = 'Product Engineer (m/w/d), Lumen Logistics GmbH, Berlin. Build tools.';
const MODEL_REPLY = 'Pick a button below to continue.';

/** A message of exactly `length` characters that ends in a letter, so trimming never changes its length. */
const adOfLength = (length: number): string => `${'Product Engineer, Lumen Logistics GmbH, Berlin. Build internal tools. '.repeat(5).slice(0, length - 1)}x`;

/**
 * (i) A short pasted job ad. The chat model (Haiku 5.5) is not in play here: the
 * /api/chat response is scripted in the browser, so the proposal is fixed: the model calls propose_application and says to
 * pick a button. What is under test is what the client does with that proposal.
 *
 * 166 characters (the ad the brief called 176): the buttons show, with a hint that the posting looks short.
 * 68 characters: below the floor, the model's reply stays, one line is added and no buttons show.
 * The thresholds are pinned at 79 / 80 and 199 / 200 characters.
 */
async function scriptChat(page: Page) {
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: MODEL_REPLY, actions: [], executed: [{ type: 'propose_application' }] }),
    });
  });
}

async function openChatOnKit(page: Page) {
  await scriptChat(page);
  // The chat sits next to a finished kit: a new ad there only starts an application when a button is picked.
  await generateKitThroughUi(page);
  return page.getByPlaceholder(/Ask for a change/);
}

async function send(page: Page, text: string) {
  const input = page.getByPlaceholder(/Ask for a change|Paste a job ad or ask anything/);
  await input.fill(text);
  await input.press('Enter');
}

const SKIP_BUTTON = 'Skip the check, generate the full kit now';

test('the thresholds in the spec are the ones the app uses', () => {
  expect(MIN_JOB_AD_CHARS).toBe(80);
  expect(SHORT_JOB_AD_CHARS).toBe(200);
  expect([79, 80, 199, 200].map((length) => adOfLength(length).length)).toEqual([79, 80, 199, 200]);
  expect([79, 80, 199, 200].map((length) => isShortJobAd(adOfLength(length)))).toEqual([false, true, true, false]);
});

test('(i) a 166 character job ad (80 to 199) shows the buttons with a short hint', async ({ browser, request }) => {
  expect(SHORT_AD).toHaveLength(166);
  const { context, page } = await signedInPage(browser, request, 'shortad');
  const input = await openChatOnKit(page);
  await input.fill(SHORT_AD);
  await input.press('Enter');

  await expect(page.getByText(MODEL_REPLY)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Check my fit/ })).toBeVisible();
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toBeVisible();
  await expect(page.getByText(SHORT_JOB_AD_HINT)).toBeVisible();

  // Not a job ad: the kit is untouched.
  await page.getByRole('button', { name: /Not a job ad, just a question/ }).click();
  await expect(page.getByText(SHORT_JOB_AD_HINT)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Cover letter' })).toBeVisible();
  await context.close();
});

test('(i2) a message under 80 characters keeps the model reply, adds one line and shows no buttons', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'tooshort');
  const input = await openChatOnKit(page);
  await input.fill(TOO_SHORT);
  await input.press('Enter');

  await expect(page.getByText(MODEL_REPLY)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(TOO_SHORT_JOB_AD_NOTE)).toBeVisible();
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Cover letter' })).toBeVisible();
  await context.close();
});

test('(i3) the thresholds: 79 is a question, 80 to 199 shows the hint, 200 does not', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'thresholds');
  await openChatOnKit(page);
  const notAnAd = () => page.getByRole('button', { name: /Not a job ad, just a question/ });

  // 79 characters: no card, the added line.
  await send(page, adOfLength(79));
  await expect(page.getByText(TOO_SHORT_JOB_AD_NOTE)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toHaveCount(0);

  // 80 characters: the card with the hint.
  await send(page, adOfLength(80));
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(SHORT_JOB_AD_HINT)).toBeVisible();
  await notAnAd().click();
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toHaveCount(0);

  // 199 characters: still the hint.
  await send(page, adOfLength(199));
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(SHORT_JOB_AD_HINT)).toBeVisible();
  await notAnAd().click();
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toHaveCount(0);

  // 200 characters: the card without it.
  await send(page, adOfLength(200));
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(SHORT_JOB_AD_HINT)).toHaveCount(0);
  await context.close();
});

test('(i4) a short ad on an application without a kit leaves it alone until a button is picked', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'nokit');
  await scriptChat(page);

  // A finished application first, so the shell shows the sidebar. Then a second application: a full-length ad
  // pasted in the chat and checked for fit. It has its job description and its fit result and no kit.
  await generateKitThroughUi(page);
  setBalance(user.id, { monthly: 20 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'New Application' }).click();
  await send(page, adOfLength(260));
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(SHORT_JOB_AD_HINT)).toHaveCount(0);
  await page.getByRole('button', { name: /Check my fit/ }).last().click();
  // Its fit result is on screen, with the chip that spends 1.5 credits on the kit for this job.
  const kitChip = page.getByRole('button', { name: /^Generate the full kit/ });
  await expect(kitChip).toBeVisible({ timeout: 60_000 });

  // A run for another job would carry the short ad as its job description.
  const ad = adOfLength(150);
  const runsWithAd: string[] = [];
  page.on('request', (call) => {
    if (call.method() === 'POST' && (call.postData() ?? '').includes(ad) && !call.url().includes('/api/chat')) runsWithAd.push(call.url());
  });

  // The ad is short: the card shows the buttons and the short hint.
  await send(page, ad);
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(SHORT_JOB_AD_HINT)).toBeVisible();

  // "Not a job ad" closes the card. The application still holds the first job and its fit result: replacing
  // the job description would have cleared the fit result, and with it the chip. Nothing started: a run would
  // have been requested when the card opened, before this click, so its request is recorded by the time the card is gone.
  await page.getByRole('button', { name: /Not a job ad, just a question/ }).click();
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toHaveCount(0);
  await expect(kitChip).toBeVisible();
  expect(runsWithAd).toEqual([]);

  // Picking a button is what replaces it: the fit check runs on the short ad.
  await send(page, ad);
  await expect(page.getByRole('button', { name: SKIP_BUTTON })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Check my fit/ }).last().click();
  await expect.poll(() => runsWithAd.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await context.close();
});

test('(i5) with few credits left the card carries the short hint with the credits line', async ({ browser, request }) => {
  const { user, context, page } = await signedInPage(browser, request, 'lowcredit');
  await openChatOnKit(page);
  setBalance(user.id, { monthly: 1 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
  await send(page, SHORT_AD);
  await expect(page.getByText(SHORT_JOB_AD_HINT)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/The full kit needs 1\.5/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Check fit first/ })).toBeVisible();
  await context.close();
});
