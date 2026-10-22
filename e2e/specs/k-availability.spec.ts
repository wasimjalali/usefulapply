import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Page, type Request, type Response, type Route } from '@playwright/test';
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
 *   k5  Chat after a fit check: Generate parks before the fit is cleared, a reload with the card open keeps the
 *       fit and the Generate button, and Save runs the kit at the after-fit price (1.5).
 *   k6  A double click on Save runs one kit and charges once.
 *   k7  A failed save keeps the card and its error, and Skip still runs the kit (the stamp is simply not written).
 *
 *   k8   The profile was answered elsewhere after this tab loaded it: the card opens on stale data, re-reads the
 *        profile, resolves as answered with no write, and the kit runs.
 *   k9   A salary with > is refused before any request, with the agreed message, on the card and in Settings (the
 *        edit stays open). The fixed text then saves.
 *   k10  The profile hasn't loaded when Generate is clicked after a fit check: the click waits for it, the card
 *        parks before the fit is cleared, a reload keeps the Generate button, and the kit costs 1.5.
 *   k11  Guided line: a reload with the card open keeps the fit result, and Generate then Save runs the kit at 1.5.
 *   (A parked kit that can't run, so the guided line goes back to the fit result, is covered by
 *   src/lib/profile/logistics-resume.test.ts: no browser path switches the application while the card is open.)
 *
 *   k1b, k3b, k4b  The captured cover letter prompt: the saved note and salary, the never-mention rule once the
 *       salary is cleared, and the exact fallback wording after a skip.
 */

const GERMAN_AD = `${JOB_DESCRIPTION} Bitte nennen Sie Ihre Gehaltsvorstellung und den frühestmöglichen Eintrittstermin.`;
const NOTE = '3 Monate zum Quartalsende';
const SALARY = '65.000 EUR brutto/Jahr';
const CARD = 'Two quick questions before I write';
const SKIP_CHECK = 'Skip the check, generate the full kit now';
const BLOCKED = "Use letters, numbers and normal punctuation. < > [ and ] aren't allowed.";

/** The server action that reads the profile: a POST with a next-action header whose answer holds the profile row. */
async function isProfileRead(response: Response): Promise<boolean> {
  const request = response.request();
  if (request.method() !== 'POST' || !request.headers()['next-action']) return false;
  return (await response.text().catch(() => '')).includes('"availability_asked_at"');
}

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

/**
 * The chat path for a job: the model proposes the application, then the user skips the fit check (or asks for it).
 * `beforeClick` runs right before that last click, after the page has settled.
 */
async function startKitThroughChat(
  page: Page,
  jobAd: string,
  how: 'skip-check' | 'check-fit' = 'skip-check',
  beforeClick?: () => void | Promise<void>,
) {
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
  const button = page.getByRole('button', { name: how === 'skip-check' ? SKIP_CHECK : /Check my fit/ });
  await expect(button).toBeVisible();
  if (beforeClick) {
    // Let the page's own reads of the profile finish first.
    await page.waitForTimeout(2000);
    await beforeClick();
  }
  await button.click();
}

/** Starts watching for the profile read, so the action's id is known to route on. Call before the page loads. */
function learnProfileAction(page: Page): { id: () => string; stop: () => void } {
  let id = '';
  const listener = async (response: Response) => {
    if (!id && (await isProfileRead(response))) id = response.request().headers()['next-action'] ?? '';
  };
  page.on('response', listener);
  return { id: () => id, stop: () => page.off('response', listener) };
}

const kitReady = (page: Page) => page.getByText(/Your kit for .* is ready/).last();

test.describe.serial('(k) start date and salary', () => {
  let a: Signedin;
  let afterFit = 0;
  let letterPrompt = '';
  let skipLetterPrompt = '';

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
    await page.getByRole('button', { name: 'Other', exact: true }).click();
    await expect(save).toBeDisabled();
    await shoot(page, '2-guided-line-other-needs-details');
    await page.getByPlaceholder('3 months to the end of the quarter').fill(NOTE);
    await page.getByPlaceholder('65,000 EUR gross a year').fill(SALARY);
    await expect(save).toBeEnabled();
    await shoot(page, '3-guided-line-filled');
    await save.click();

    // 3. The kit runs at the after-fit price: 0.5 + 1.5 = 2.0 in total.
    await expect(page.getByText(/Your kit for Northwind Foods is ready/)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Got it. Writing your kit now.').first()).toBeVisible();
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

  test('(k1b) the cover letter prompt carries the note and the salary', async () => {
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
    // A new choice drops the old details ("3 Monate zum Quartalsende" next to "In 1 month" would disagree).
    expect(profileRow(user.id).availability_note).toBeNull();
    await expect(page.getByRole('button', { name: NOTE })).toHaveCount(0);

    // Other with no details isn't used by the writers, so the row says so instead of "Saved".
    await page.getByRole('combobox', { name: 'When you can start' }).selectOption('other');
    // Scoped to the row: the app behind the modal has its own "Saved" label.
    const startRow = page.getByText('When you can start', { exact: true }).locator('xpath=ancestor::div[contains(@class,"min-h-[52px]")]');
    await expect(startRow.getByText('Add details to use Other.')).toBeVisible();
    await expect(startRow.getByText('Saved')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'When you can start' }).selectOption('1_month');
    await expect(startRow.getByText('Saved')).toBeVisible();
    await expect(startRow.getByText('Add details to use Other.')).toHaveCount(0);

    // Details with no start choice aren't used either, and the notice says what to do (not "Add details to use Other").
    await page.getByRole('combobox', { name: 'When you can start' }).selectOption('');
    await expect.poll(() => profileRow(user.id).availability).toBeNull();
    const detailsRow = page.getByText('Details', { exact: true }).locator('xpath=ancestor::div[contains(@class,"min-h-[52px]")]');
    await detailsRow.getByRole('button').click();
    await page.getByPlaceholder('3 months to the end of the quarter').fill('after the move');
    await page.getByPlaceholder('3 months to the end of the quarter').press('Enter');
    await expect(detailsRow.getByText('Pick when you can start to use these details.')).toBeVisible();
    await expect(detailsRow.getByText('Add details to use Other.')).toHaveCount(0);
    await expect(detailsRow.getByText('Saved')).toHaveCount(0);
    await shoot(page, '5b-settings-details-need-start', { scrollTo: 'Salary expectation' });
    // Picking a start date (which also drops the old details) is the way out.
    await page.getByRole('combobox', { name: 'When you can start' }).selectOption('1_month');
    await expect(startRow.getByText('Saved')).toBeVisible();

    // Clearing the salary leaves the start date alone, and the asked-at stamp stays set.
    await page.getByRole('button', { name: SALARY }).click();
    await page.getByPlaceholder('65,000 EUR gross a year').fill('');
    await page.getByPlaceholder('65,000 EUR gross a year').press('Enter');
    await expect(page.getByRole('button', { name: 'Not set' })).toHaveCount(2);
    await expect.poll(() => profileRow(user.id).salary_expectation).toBeNull();
    const cleared = profileRow(user.id);
    expect(cleared.availability).toBe('1_month');
    expect(cleared.availability_note).toBeNull();
    expect(cleared.availability_asked_at).toBeTruthy();
    await shoot(page, '6-settings-salary-cleared', { scrollTo: 'Salary expectation' });
  });

  test('(k3b) with the salary cleared, the regenerated letter prompt never mentions salary', async () => {
    const { page } = a;
    await fakeReset();
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
    await page.getByRole('tab', { name: 'Cover letter' }).click();
    // A rewrite is asked for in the composer and confirmed on the cost chip (0.5 credits).
    const input = page.getByPlaceholder(/Ask for a change/);
    await input.fill('Rewrite the cover letter');
    await input.press('Enter');
    await page.getByRole('button', { name: 'Rewrite it' }).click();
    await expect.poll(async () => (await fakeCalls()).some((call) => call.writer === 'coverLetter')).toBe(true);
    const prompt = (await fakeCalls()).find((call) => call.writer === 'coverLetter')?.user ?? '';
    expect(prompt).not.toContain(SALARY);
    expect(prompt).toMatch(/never mention salary/i);
    // The regenerate read the profile fresh: the new start date is there and the old details are gone.
    expect(prompt).toContain('one month after accepting an offer');
    expect(prompt).not.toContain(NOTE);
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
    await expect(b.page.getByText("No problem. I'll keep the timing general and leave salary out.").first()).toBeVisible({ timeout: 20_000 });
    await expect(kitReady(b.page)).toBeVisible({ timeout: 120_000 });
    const skipped = profileRow(b.user.id);
    expect(skipped.availability).toBeNull();
    expect(skipped.salary_expectation).toBeNull();
    expect(skipped.availability_asked_at).toBeTruthy();
    await expect.poll(() => creditsOf(b.user.id).total, { timeout: 120_000 }).toBe(4);
    // The skip kit's own letter prompt, taken before another kit adds a second call to the shared fake.
    skipLetterPrompt = (await fakeCalls()).find((call) => call.writer === 'coverLetter')?.user ?? '';
    await shoot(b.page, '8-chat-after-skip', { chat: true });

    // The skip was remembered: a third kit goes straight through.
    await fakeReset();
    await startKitThroughChat(b.page, SENIOR_JOB_DESCRIPTION);
    await expect(b.page.getByRole('heading', { name: CARD })).toHaveCount(0);
    await expect.poll(() => creditsOf(b.user.id).total, { timeout: 120_000 }).toBe(2);
    await b.context.close();
    await a.context.close();
  });

  test('(k4b) after a skip the letter prompt carries the exact neutral notice-period wording and no salary', async () => {
    expect(skipLetterPrompt).not.toBe('');
    // The fixed English wording for an applicant who gave no start date, and no saved-availability block.
    expect(skipLetterPrompt).toContain('"after my notice period" (for a US job: "after giving notice to my current employer")');
    expect(skipLetterPrompt).not.toContain('Saved availability:');
    expect(skipLetterPrompt).not.toContain(SALARY);
    expect(skipLetterPrompt).toContain('Never mention salary in any other way, not even to say it is open or negotiable.');
  });

  test.describe.serial('chat flows on one user', () => {
    let c: Signedin;
    const generateChip = () => c.page.getByRole('button', { name: /Generate the full kit/ });
    const card = () => c.page.getByRole('heading', { name: CARD });

    /** A user with a kit already, nothing asked yet, and six credits. */
    const unasked = async () => {
      resetProfileLogistics(c.user.id);
      setBalance(c.user.id, { monthly: 6 });
      await fakeReset();
    };

    test('(k5) after a fit check in chat, the card parks before the fit is cleared and the after-fit price is kept', async ({ browser, request }) => {
      test.setTimeout(420_000);
      c = await signedInPage(browser, request, 'avail-c');
      await generateKitThroughUi(c.page);
      await unasked();

      await startKitThroughChat(c.page, SENIOR_JOB_DESCRIPTION, 'check-fit');
      await expect(generateChip()).toBeVisible({ timeout: 60_000 });
      expect(creditsOf(c.user.id).total).toBe(5.5);
      await fakeReset();

      // Generate parks: nothing moves, and the fit is still there.
      await generateChip().click();
      await expect(card()).toBeVisible({ timeout: 20_000 });
      await c.page.waitForTimeout(1500);
      expect(creditsOf(c.user.id).total).toBe(5.5);
      expect(await fakeCalls()).toEqual([]);
      expect(profileRow(c.user.id).availability_asked_at).toBeNull();

      // A reload with the card open: the card is transient, the fit and its button are not.
      await c.page.reload();
      await expect(card()).toHaveCount(0);
      await expect(generateChip()).toBeVisible({ timeout: 30_000 });
      await generateChip().click();
      await expect(card()).toBeVisible({ timeout: 20_000 });

      await c.page.getByRole('button', { name: 'In 1 month' }).click();
      await c.page.getByRole('button', { name: 'Save and write' }).click();
      await expect(c.page.getByText('Got it. Writing your kit now.').last()).toBeVisible({ timeout: 20_000 });
      // 0.5 for the fit, 1.5 for the kit after it: 6 - 2.0.
      await expect.poll(() => creditsOf(c.user.id).total, { timeout: 120_000 }).toBe(4);
      expect(profileRow(c.user.id)).toMatchObject({ availability: '1_month', availability_note: null });
    });

    test('(k6) a double click on Save runs one kit and charges once', async () => {
      test.setTimeout(240_000);
      await unasked();
      await startKitThroughChat(c.page, SENIOR_JOB_DESCRIPTION);
      await expect(card()).toBeVisible({ timeout: 20_000 });
      await c.page.getByRole('button', { name: 'In 2 weeks' }).click();
      await c.page.getByRole('button', { name: 'Save and write' }).dblclick();
      // A direct kit is 2.0.
      await expect.poll(() => creditsOf(c.user.id).total, { timeout: 120_000 }).toBe(4);
      await c.page.waitForTimeout(3000);
      expect(creditsOf(c.user.id).total).toBe(4);
      expect((await fakeCalls()).filter((call) => call.writer === 'coverLetter')).toHaveLength(1);
    });

    test('(k7) a failed save keeps the error, and Skip still runs the kit', async ({ browser, request }) => {
      test.setTimeout(420_000);
      // A fresh user: the kits above already used this one's per-minute allowance.
      await c.context.close();
      c = await signedInPage(browser, request, 'avail-d');
      await generateKitThroughUi(c.page);
      await unasked();
      await startKitThroughChat(c.page, SENIOR_JOB_DESCRIPTION);
      await expect(card()).toBeVisible({ timeout: 20_000 });
      await expect(c.page.getByRole('button', { name: 'Skip for now' })).toBeEnabled();

      // Every profile write fails from here, which is what a dropped session or a D1 hiccup looks like.
      // Other server actions (the kit's own) still work: only the update carrying the start date is cut.
      const failActions = async (route: Route) => {
        const request = route.request();
        if (request.method() === 'POST' && request.headers()['next-action'] && (request.postData() ?? '').includes('"availability"')) return route.abort();
        return route.fallback();
      };
      await c.page.route('**/*', failActions);
      await c.page.getByRole('button', { name: 'In 1 month' }).click();
      await c.page.getByRole('button', { name: 'Save and write' }).click();
      await expect(c.page.getByText("We couldn't save that. Try again.")).toBeVisible({ timeout: 20_000 });
      await expect(card()).toBeVisible();
      expect(creditsOf(c.user.id).total).toBe(6);
      expect(await fakeCalls()).toEqual([]);

      // Skip never blocks the kit, even though its own write fails too.
      await c.page.getByRole('button', { name: 'Skip for now' }).click();
      await expect(c.page.getByText("No problem. I'll keep the timing general and leave salary out.").last()).toBeVisible({ timeout: 20_000 });
      await c.page.unroute('**/*', failActions);
      await expect.poll(() => creditsOf(c.user.id).total, { timeout: 120_000 }).toBe(4);
      // The stamp didn't land, so the question comes back next time.
      expect(profileRow(c.user.id).availability_asked_at).toBeNull();
      await c.context.close();
    });
  });

  test.describe.serial('more chat and guided line flows', () => {
    const cardHeading = (page: Page) => page.getByRole('heading', { name: CARD });
    const generateButton = (page: Page) => page.getByRole('button', { name: /Generate the full kit/ });

    test('(k8) a profile answered elsewhere resolves the card with no write, and the kit runs', async ({ browser, request }) => {
      test.setTimeout(420_000);
      const e = await signedInPage(browser, request, 'avail-e');
      try {
        const profileAction = learnProfileAction(e.page);
        await generateKitThroughUi(e.page);
        profileAction.stop();
        expect(profileAction.id(), 'the profile read was seen on a normal load').not.toBe('');
        resetProfileLogistics(e.user.id);
        setBalance(e.user.id, { monthly: 6 });
        await fakeReset();

        // The tab's profile says unasked. Another tab (or an agent) answers just before the card re-reads the profile:
        // the first profile read after this point is the card's, and the row is written right as it goes out.
        const answeredAt = '2026-10-01T09:00:00.000Z';
        let answeredElsewhere = false;
        const answerBeforeCardRead = async (route: Route) => {
          const sent = route.request();
          if (!answeredElsewhere && sent.method() === 'POST' && sent.headers()['next-action'] === profileAction.id()) {
            answeredElsewhere = true;
            const db = openLocalD1();
            try {
              db.prepare("UPDATE profiles SET availability = '3_months', availability_note = NULL, salary_expectation = '70.000 EUR', availability_asked_at = ? WHERE id = ?").run(answeredAt, e.user.id);
            } finally {
              db.close();
            }
          }
          return route.fallback();
        };
        await startKitThroughChat(e.page, SENIOR_JOB_DESCRIPTION, 'skip-check', async () => { await e.page.route('**/*', answerBeforeCardRead); });

        // The stale tab parked the kit, the card re-read the profile and let it through without writing anything.
        await expect(e.page.getByText('Got it. Writing your kit now.').last()).toBeVisible({ timeout: 30_000 });
        expect(answeredElsewhere, "the card's profile read was the one that saw the answer").toBe(true);
        await expect(cardHeading(e.page)).toHaveCount(0);
        await expect.poll(() => creditsOf(e.user.id).total, { timeout: 120_000 }).toBe(4);
        await expect(kitReady(e.page)).toBeVisible({ timeout: 120_000 });
        expect(profileRow(e.user.id), 'no write: the answer from the other tab is exactly as it was').toEqual({
          availability: '3_months',
          availability_note: null,
          salary_expectation: '70.000 EUR',
          availability_asked_at: answeredAt,
        });
      } finally {
        await e.context.close();
      }
    });

    test('(k9) a salary with > is refused with the agreed message, on the card and in Settings', async ({ browser, request }) => {
      test.setTimeout(420_000);
      const f = await signedInPage(browser, request, 'avail-f');
      try {
        await generateKitThroughUi(f.page);
        resetProfileLogistics(f.user.id);
        setBalance(f.user.id, { monthly: 6 });
        await fakeReset();
        const salaryInput = f.page.getByPlaceholder('65,000 EUR gross a year');

        // The card: refused before any request, so nothing is written, charged or sent to the model.
        await startKitThroughChat(f.page, SENIOR_JOB_DESCRIPTION);
        await expect(cardHeading(f.page)).toBeVisible({ timeout: 20_000 });
        await f.page.getByRole('button', { name: 'In 1 month' }).click();
        await salaryInput.fill('>60k EUR');
        await f.page.getByRole('button', { name: 'Save and write' }).click();
        await expect(f.page.getByText(BLOCKED)).toBeVisible();
        await expect(f.page.getByText("We couldn't save that. Try again.")).toHaveCount(0);
        await f.page.waitForTimeout(1000);
        expect(profileRow(f.user.id)).toEqual({ availability: null, availability_note: null, salary_expectation: null, availability_asked_at: null });
        expect(creditsOf(f.user.id).total).toBe(6);
        expect(await fakeCalls()).toEqual([]);
        await shoot(f.page, '9-chat-card-blocked-sign', { chat: true });

        // Fixed text saves, and the kit runs. (The screenshot resizes the window, which rebuilds the card, so the choice is made again.)
        await f.page.getByRole('button', { name: 'In 1 month' }).click();
        await salaryInput.fill('over 60k EUR');
        await expect(f.page.getByText(BLOCKED)).toHaveCount(0);
        await f.page.getByRole('button', { name: 'Save and write' }).click();
        await expect.poll(() => creditsOf(f.user.id).total, { timeout: 120_000 }).toBe(4);
        expect(profileRow(f.user.id)).toMatchObject({ availability: '1_month', salary_expectation: 'over 60k EUR' });

        // Settings: the edit stays open with the message, nothing is saved, and the fixed text saves.
        await f.page.goto('/dashboard');
        await f.page.getByRole('button', { name: 'Open settings' }).click();
        await f.page.getByRole('button', { name: 'over 60k EUR' }).click();
        await salaryInput.fill('<70k');
        await salaryInput.press('Enter');
        await expect(f.page.getByText(BLOCKED)).toBeVisible();
        await expect(salaryInput).toBeVisible();
        expect(profileRow(f.user.id).salary_expectation).toBe('over 60k EUR');
        await shoot(f.page, '10-settings-blocked-sign');
        await salaryInput.fill('over 70k EUR');
        await salaryInput.press('Enter');
        await expect(f.page.getByText(BLOCKED)).toHaveCount(0);
        await expect.poll(() => profileRow(f.user.id).salary_expectation).toBe('over 70k EUR');
      } finally {
        await f.context.close();
      }
    });

    test('(k10) after a fit check with the profile not loaded, Generate waits for it and the after-fit price is kept', async ({ browser, request }) => {
      test.setTimeout(420_000);
      const g = await signedInPage(browser, request, 'avail-g');
      try {
        // Learn which server action reads the profile, from a normal load.
        const profileAction = learnProfileAction(g.page);
        await generateKitThroughUi(g.page);
        profileAction.stop();
        const profileActionId = profileAction.id();
        expect(profileActionId, 'the profile read was seen on a normal load').not.toBe('');
        resetProfileLogistics(g.user.id);
        setBalance(g.user.id, { monthly: 6 });
        await fakeReset();

        await startKitThroughChat(g.page, SENIOR_JOB_DESCRIPTION, 'check-fit');
        await expect(generateButton(g.page)).toBeVisible({ timeout: 60_000 });
        expect(creditsOf(g.user.id).total).toBe(5.5);
        await fakeReset();

        // The first profile read after a reload fails (a dropped connection), so the page has no profile.
        let cut = 0;
        const failFirstRead = async (route: Route) => {
          const request: Request = route.request();
          if (cut === 0 && request.method() === 'POST' && request.headers()['next-action'] === profileActionId) {
            cut += 1;
            return route.abort();
          }
          return route.fallback();
        };
        await g.page.route('**/*', failFirstRead);
        await g.page.reload();
        await expect(generateButton(g.page)).toBeVisible({ timeout: 30_000 });
        expect(cut, 'the first profile read was cut').toBe(1);

        // Generate waits for the profile (a second read, which works) and then parks. The fit stays.
        await generateButton(g.page).click();
        await expect(cardHeading(g.page)).toBeVisible({ timeout: 20_000 });
        await g.page.waitForTimeout(1500);
        expect(creditsOf(g.user.id).total).toBe(5.5);
        expect(await fakeCalls()).toEqual([]);
        await g.page.unroute('**/*', failFirstRead);

        // A reload with the card open still has the fit and its button.
        await g.page.reload();
        await expect(cardHeading(g.page)).toHaveCount(0);
        await expect(generateButton(g.page)).toBeVisible({ timeout: 30_000 });
        await generateButton(g.page).click();
        await expect(cardHeading(g.page)).toBeVisible({ timeout: 20_000 });
        await g.page.getByRole('button', { name: 'In 1 month' }).click();
        await g.page.getByRole('button', { name: 'Save and write' }).click();
        // 0.5 for the fit, 1.5 for the kit after it: 6 - 2.0.
        await expect.poll(() => creditsOf(g.user.id).total, { timeout: 120_000 }).toBe(4);
      } finally {
        await g.context.close();
      }
    });

    test('(k11) guided line: a reload with the card open keeps the fit result, and Save runs the kit at the after-fit price', async ({ browser, request }) => {
      test.setTimeout(420_000);
      const h = await signedInPage(browser, request, 'avail-h', { askedAvailability: false });
      try {
        await h.page.goto('/dashboard');
        await h.page.getByPlaceholder(/Paste the whole ad/).fill(GERMAN_AD);
        await h.page.getByRole('button', { name: /Check my fit/ }).click();
        await expect(generateButton(h.page)).toBeVisible({ timeout: 60_000 });
        const afterFitCheck = creditsOf(h.user.id).total;
        await fakeReset();

        await generateButton(h.page).click();
        await expect(cardHeading(h.page)).toBeVisible({ timeout: 20_000 });
        await h.page.waitForTimeout(1500);
        expect(creditsOf(h.user.id).total).toBe(afterFitCheck);

        // The card is transient, the fit is not.
        await h.page.reload();
        await expect(cardHeading(h.page)).toHaveCount(0);
        await expect(generateButton(h.page)).toBeVisible({ timeout: 30_000 });
        expect(creditsOf(h.user.id).total).toBe(afterFitCheck);
        expect(await fakeCalls()).toEqual([]);

        await generateButton(h.page).click();
        await expect(cardHeading(h.page)).toBeVisible({ timeout: 20_000 });
        await h.page.getByRole('button', { name: 'In 2 weeks' }).click();
        await h.page.getByRole('button', { name: 'Save and create my kit' }).click();
        await expect(h.page.getByText(/Your kit for Northwind Foods is ready/)).toBeVisible({ timeout: 120_000 });
        expect(afterFitCheck - creditsOf(h.user.id).total).toBe(1.5);
        expect(profileRow(h.user.id)).toMatchObject({ availability: '2_weeks' });
      } finally {
        await h.context.close();
      }
    });
  });
});
