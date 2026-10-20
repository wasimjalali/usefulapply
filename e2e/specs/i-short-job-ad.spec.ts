import { expect, test, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage } from '../lib/app';

const SHORT_AD = 'Product Engineer (m/w/d), Lumen Logistics GmbH, Berlin. Build internal tools with TypeScript, React and Node.js. 3+ years experience, English required, German a plus.';
const TOO_SHORT = 'Product Engineer (m/w/d), Lumen Logistics GmbH, Berlin. Build tools.';
const TOO_SHORT_REPLY = "That's too short for me to work from. Paste the whole posting: the role, requirements and responsibilities.";
const SHORT_HINT = 'This looks short. Add more of the posting for a better match.';

/**
 * (i) A short pasted job ad. Chat runs on Workers AI, which the data preview does not have, so the
 * /api/chat response is scripted in the browser: the model calls propose_application and says to
 * pick a button. What is under test is what the client does with that proposal.
 *
 * 166 characters (the ad the brief called 176): the buttons show, with a hint that the posting looks short.
 * 68 characters: below the floor, the reply is replaced and no buttons show.
 */
async function openChatOnKit(page: Page) {
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'Pick a button below to continue.', actions: [], executed: [{ type: 'propose_application' }] }),
    });
  });
  // The chat sits next to a finished kit: a new ad there only starts an application when a button is picked.
  await generateKitThroughUi(page);
  return page.getByPlaceholder(/Ask for a change/);
}

test('(i) a 166 character job ad (80 to 199) shows the buttons with a short hint', async ({ browser, request }) => {
  expect(SHORT_AD).toHaveLength(166);
  const { context, page } = await signedInPage(browser, request, 'shortad');
  const input = await openChatOnKit(page);
  await input.fill(SHORT_AD);
  await input.press('Enter');

  await expect(page.getByText('Pick a button below to continue.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Check my fit/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip the check, generate the full kit now' })).toBeVisible();
  await expect(page.getByText(SHORT_HINT)).toBeVisible();

  // Not a job ad: the kit is untouched.
  await page.getByRole('button', { name: /Not a job ad, just a question/ }).click();
  await expect(page.getByText(SHORT_HINT)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Cover letter' })).toBeVisible();
  await context.close();
});

test('(i2) a message under 80 characters gets the too-short reply and no buttons', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'tooshort');
  const input = await openChatOnKit(page);
  await input.fill(TOO_SHORT);
  await input.press('Enter');

  await expect(page.getByText(TOO_SHORT_REPLY)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Pick a button/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Skip the check, generate the full kit now' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Cover letter' })).toBeVisible();
  await context.close();
});
