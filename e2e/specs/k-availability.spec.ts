import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage, type Signedin } from '../lib/app';
import { REPO_ROOT } from '../lib/env';
import { fakeCalls, fakeReset } from '../lib/fake-control';
import { JOB_DESCRIPTION, SENIOR_JOB_DESCRIPTION } from '../lib/model-script';
import { openLocalD1 } from '../lib/sqlite';
import { creditsOf, setBalance } from '../lib/user';

/**
 * (k) The applicant's own start date and salary expectation, so the writers never invent them.
 *
 *   k1  New user, a German ad. Fit check (0.5), then Generate: the card parks the kit before any request, with the
 *       ledger and the model untouched. Other needs details. Save and create my kit runs the kit at the after-fit
 *       price (ledger total 2.0), the profile row holds the answer and the asked-at stamp.
 *   k2  A second job through chat shows no card.
 *   k3  Settings shows the saved values and edits them. Clearing the salary leaves the rest and the stamp set.
 *   k4  User B has a kit already and empty fields. The chat path shows the card, Skip stamps asked-at with no
 *       start date, the kit runs, and a third kit shows no card.
 *
 * The writer prompt block (what the letter and emails are told about the saved values) is a separate piece of work.
 * The prompt assertions below are test.fixme until it lands; they're written out so they only need unskipping.
 */

const GERMAN_AD = `${JOB_DESCRIPTION} Bitte nennen Sie Ihre Gehaltsvorstellung und den frühestmöglichen Eintrittstermin.`;
const NOTE = '3 Monate zum Quartalsende';
const SALARY = '65.000 EUR brutto/Jahr';
const CARD = 'Two quick questions before I write';
const SKIP_CHECK = 'Skip the check, generate the full kit now';

function mainCheckout(): string {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  return dirname(resolve(REPO_ROOT, common));
}
const SHOTS = process.env.E2E_SHOTS ?? join(mainCheckout(), 'verify', 'feature-profile-availability-salary');
mkdirSync(SHOTS, { recursive: true });

const SIZES = [
  { name: '1280', width: 1280, height: 800 },
  { name: '768', width: 768, height: 1024 },
];

interface ProfileRow {
  availability: string | null;
  availability_note: string | null;
  salary_expectation: string | null;
  availability_asked_at: string | null;
}

function profileRow(userId: string): ProfileRow {
  const db = openLocalD1();
  try {
    return db.prepare('SELECT availability, availability_note, salary_expectation, availability_asked_at FROM profiles WHERE id = ?').get(userId) as ProfileRow;
  } finally {
    db.close();
  }
}

function resetProfileLogistics(userId: string) {
  const db = openLocalD1();
  try {
    db.prepare('UPDATE profiles SET availability = NULL, availability_note = NULL, salary_expectation = NULL, availability_asked_at = NULL WHERE id = ?').run(userId);
  } finally {
    db.close();
  }
}

/** A screenshot at both desktop sizes. The conversation column collapses at 768, so chat shots open it first. */
async function shoot(page: Page, name: string, options: { chat?: boolean; scrollTo?: string } = {}) {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(400);
    const show = page.getByRole('button', { name: 'Show the conversation' });
    if (options.chat && (await show.isVisible())) {
      await show.click();
      await page.waitForTimeout(400);
    }
    if (options.scrollTo) await page.getByText(options.scrollTo, { exact: true }).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: join(SHOTS, `k-${name}-${size.name}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** The chat path for a job: the model proposes the application, the user skips the fit check. */
async function startKitThroughChat(page: Page, jobAd: string) {
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'Pick a button below to continue.', actions: [], executed: [{ type: 'propose_application' }] }),
    });
  });
  await page.goto('/dashboard');
  const input = page.getByPlaceholder(/Ask for a change|Paste a job ad or ask anything/);
  await input.fill(jobAd);
  await input.press('Enter');
  await page.getByRole('button', { name: SKIP_CHECK }).click();
}

const kitReady = (page: Page) => page.getByText(/Your kit for .* is ready/).last();

test.describe.serial('(k) start date and salary', () => {
  let a: Signedin;
  let afterFit = 0;
  let letterPrompt = '';

  test('(k1) the card parks the kit before any request, Save runs it at the after-fit price', async ({ browser, request }) => {
    test.setTimeout(300_000);
    a = await signedInPage(browser, request, 'avail-a', { askedAvailability: false });
    const { user, page } = a;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    expect(profileRow(user.id)).toEqual({ availability: null, availability_note: null, salary_expectation: null, availability_asked_at: null });

    await page.getByPlaceholder(/Paste the whole ad/).fill(GERMAN_AD);
    await page.getByRole('button', { name: /Check my fit/ }).click();
    await expect(page.getByRole('button', { name: /Generate the full kit/ })).toBeVisible({ timeout: 60_000 });
    afterFit = creditsOf(user.id).total;
    const before = creditsOf(user.id);
    await fakeReset();

    // 1. Generate: the card appears and nothing moves. No credits, no model call, no profile write.
    await page.getByRole('button', { name: /Generate the full kit/ }).click();
    await expect(page.getByRole('heading', { name: CARD })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(creditsOf(user.id)).toEqual(before);
    expect(await fakeCalls()).toEqual([]);
    expect(profileRow(user.id).availability_asked_at).toBeNull();
    await shoot(page, '1-guided-line-card');

    // 2. Other needs details before it can be saved.
    const save = page.getByRole('button', { name: 'Save and create my kit' });
    await expect(save).toBeDisabled();
    await page.getByRole('radio', { name: 'Other' }).click();
    await expect(save).toBeDisabled();
    await shoot(page, '2-guided-line-other-needs-details');
    await page.getByPlaceholder('3 months to the end of the quarter').fill(NOTE);
    await page.getByPlaceholder('65,000 EUR gross a year').fill(SALARY);
    await expect(save).toBeEnabled();
    await shoot(page, '3-guided-line-filled');
    await save.click();

    // 3. The kit runs at the after-fit price: 0.5 + 1.5 = 2.0 in total.
    await expect(page.getByText(/Your kit for Northwind Foods is ready/)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Got it. Writing your kit now.')).toBeVisible();
    expect(afterFit - creditsOf(user.id).total).toBe(1.5);
    const row = profileRow(user.id);
    expect(row.availability).toBe('other');
    expect(row.availability_note).toBe(NOTE);
    expect(row.salary_expectation).toBe(SALARY);
    expect(row.availability_asked_at).toBeTruthy();

    // The writers ran only after the answer was saved.
    const calls = await fakeCalls();
    const letter = calls.find((call) => call.writer === 'coverLetter');
    expect(letter).toBeTruthy();
    letterPrompt = letter?.user ?? '';
    await shoot(page, '4-kit-ready');
  });

  test.fixme('(k1b) the cover letter prompt carries the note and the salary (needs the writer prompt block)', async () => {
    expect(letterPrompt).toContain(NOTE);
    expect(letterPrompt).toContain(SALARY);
  });

  test('(k2) a second job through chat shows no card', async () => {
    test.setTimeout(240_000);
    const { user, page } = a;
    setBalance(user.id, { monthly: 4 });
    await startKitThroughChat(page, SENIOR_JOB_DESCRIPTION);
    await expect(kitReady(page)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('heading', { name: CARD })).toHaveCount(0);
    // A direct kit is 2.0. The earlier kit's message is still on screen, so the ledger is what proves this run.
    await expect.poll(() => creditsOf(user.id).total, { timeout: 120_000 }).toBe(2);
  });

  test('(k3) Settings shows and edits the saved values', async () => {
    test.setTimeout(120_000);
    const { user, page } = a;
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByText('APPLICATIONS', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'When you can start' })).toHaveValue('other');
    await expect(page.getByRole('button', { name: NOTE })).toBeVisible();
    await expect(page.getByRole('button', { name: SALARY })).toBeVisible();
    await shoot(page, '5-settings-saved', { scrollTo: 'Salary expectation' });

    // The select saves on change, like the timezone select.
    await page.getByRole('combobox', { name: 'When you can start' }).selectOption('1_month');
    await expect(page.getByText('Saved').first()).toBeVisible();
    await expect.poll(() => profileRow(user.id).availability).toBe('1_month');

    // Clearing the salary leaves the start date and the details alone, and the asked-at stamp stays set.
    await page.getByRole('button', { name: SALARY }).click();
    await page.getByPlaceholder('65,000 EUR gross a year').fill('');
    await page.getByPlaceholder('65,000 EUR gross a year').press('Enter');
    await expect(page.getByRole('button', { name: 'Not set' })).toHaveCount(1);
    await expect.poll(() => profileRow(user.id).salary_expectation).toBeNull();
    const cleared = profileRow(user.id);
    expect(cleared.availability).toBe('1_month');
    expect(cleared.availability_note).toBe(NOTE);
    expect(cleared.availability_asked_at).toBeTruthy();
    await shoot(page, '6-settings-salary-cleared', { scrollTo: 'Salary expectation' });
  });

  test.fixme('(k3b) with the salary cleared, the regenerated letter prompt never mentions salary (needs the writer prompt block)', async () => {
    const { page } = a;
    await fakeReset();
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
    await page.getByRole('tab', { name: 'Cover letter' }).click();
    await page.getByRole('button', { name: /Regenerate/ }).first().click();
    await expect.poll(async () => (await fakeCalls()).some((call) => call.writer === 'coverLetter')).toBe(true);
    const prompt = (await fakeCalls()).find((call) => call.writer === 'coverLetter')?.user ?? '';
    expect(prompt).not.toContain(SALARY);
    expect(prompt).toMatch(/never mention salary/i);
  });

  test('(k4) an existing user with empty fields: Skip is remembered and the next kit shows no card', async ({ browser, request }) => {
    test.setTimeout(420_000);
    // Seeded the way an existing account looks: a kit already written, nothing asked yet.
    const b = await signedInPage(browser, request, 'avail-b');
    await generateKitThroughUi(b.page);
    resetProfileLogistics(b.user.id);
    setBalance(b.user.id, { monthly: 6 });
    await fakeReset();

    await startKitThroughChat(b.page, SENIOR_JOB_DESCRIPTION);
    await expect(b.page.getByRole('heading', { name: CARD })).toBeVisible({ timeout: 20_000 });
    await b.page.waitForTimeout(1500);
    expect(creditsOf(b.user.id).total).toBe(6);
    expect(await fakeCalls()).toEqual([]);
    await shoot(b.page, '7-chat-card', { chat: true });
    await expect(b.page.getByRole('button', { name: 'Save and write' })).toBeDisabled();

    await b.page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(b.page.getByText("No problem. I'll keep the timing general and leave salary out.")).toBeVisible({ timeout: 20_000 });
    await expect(kitReady(b.page)).toBeVisible({ timeout: 120_000 });
    const skipped = profileRow(b.user.id);
    expect(skipped.availability).toBeNull();
    expect(skipped.salary_expectation).toBeNull();
    expect(skipped.availability_asked_at).toBeTruthy();
    await expect.poll(() => creditsOf(b.user.id).total, { timeout: 120_000 }).toBe(4);
    await shoot(b.page, '8-chat-after-skip', { chat: true });

    // The skip was remembered: a third kit goes straight through.
    await startKitThroughChat(b.page, SENIOR_JOB_DESCRIPTION);
    await expect(b.page.getByRole('heading', { name: CARD })).toHaveCount(0);
    await expect.poll(() => creditsOf(b.user.id).total, { timeout: 120_000 }).toBe(2);
    await b.context.close();
    await a.context.close();
  });

  test.fixme('(k4b) after a skip the letter prompt carries the neutral notice-period wording and no salary (needs the writer prompt block)', async () => {
    const prompt = (await fakeCalls()).find((call) => call.writer === 'coverLetter')?.user ?? '';
    expect(prompt).not.toContain('65');
    expect(prompt).toMatch(/not stated|never mention salary/i);
  });
});
