import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { fakeCalls, fakeControl, fakeReset, type FakeCall } from '../lib/fake-control';
import { openLocalD1 } from '../lib/sqlite';
import { generateKitThroughUi, openApplication, signedInPage } from '../lib/app';
import { setBalance, type TestUser } from '../lib/user';
import { CHAT_LOCAL_REPLAY_TURNS } from '../../src/lib/chat-limits';

/**
 * The chat UX pass, end to end (branch feature/chat-ux-pass): the real ChatPanel, the real /api/chat route, the real local
 * D1. Only the model is scripted (e2e/fake-anthropic.ts, e2e/lib/model-script.ts).
 *
 *  1. Chip rule: one chip group at a time, under the newest message only; no "Download the kit" chip anywhere.
 *     (a) a pasted ad: bubble and decision card, no other chips
 *     (b) right after a kit: the kit-ready message carries "Answer screening questions", nothing else
 *     (c) a later plain question: no chips under the reply, and the kit message's chip is gone
 *     (d) a turn where the model calls offer_screening_answers: the chip shows under that reply only, gone after the next message
 *     (e) a tool proposal chip (delete confirm) on an older reply is hidden once a newer message exists
 *     (f) after a reload the newest message's chip shows, older ones do not
 *  2. The paste gap: an ad pasted into a brand-new application stays as a bubble, reaches the model on the next turn,
 *     survives a reload and is stored once in D1.
 *  3. The kit-ready text lists only the documents that came back (a kit whose follow-up email is missing without an error).
 *  5. A local (`session-`) conversation replays at most CHAT_LOCAL_REPLAY_TURNS (8) earlier turns.
 * (4, the history load after a reload, is n-chat-history-load.spec.ts.)
 *
 * The states that move (b, c, d, the reload) are recorded: each recording is a separate context, its video under the
 * test's output folder (cut to frames after the run, see the report).
 */

const AD_MARK = 'Hamburg with a salary band shared at interview';
const AD = [
  'Operations Analyst at Lumen Logistics.',
  'Responsibilities: you will own the weekly forecast, build dashboards and partner with plant managers across three regions to cut late shipments and report every month.',
  'Requirements: three years in finance or operations, strong Excel and SQL, clear written English, and a candidate who likes ownership.',
  'Qualifications: degree in business or similar; nice to have: Power BI. Benefits: 30 days leave, flexible hours, remote days. Apply with your CV.',
  `About the role: this position reports to the head of operations and is based in ${AD_MARK}.`,
].join('\n');
const QUESTION = 'What does this role pay and is it remote?';
const KIT_READY = /Your kit for Northwind Foods is ready/;

const SCREENING_CHIP = 'Answer screening questions';
const SCROLLER = '[data-chat-scroll]';
const BUBBLE = `${SCROLLER} .group\\/msg`;
const CARD_CHIPS = [/^Check my fit/, /^Skip the check, generate the full kit now/, /^Not a job ad, just a question/];

const chatInput = (page: Page) => page.getByPlaceholder(/Ask for a change|Paste a job ad or ask anything/);

async function send(page: Page, text: string): Promise<void> {
  await chatInput(page).fill(text);
  await chatInput(page).press('Enter');
}

/** Send a message and wait until the reply to it is on screen (the bubble count grows by two: the message, the reply). */
async function ask(page: Page, text: string, reply: string | RegExp): Promise<void> {
  const before = await page.locator(BUBBLE).count();
  await send(page, text);
  await expect.poll(() => page.locator(BUBBLE).count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(before + 2);
  // The newest bubble is the reply to this message, not an earlier one with the same words.
  await expect(page.locator(BUBBLE).last()).toContainText(reply, { timeout: 30_000 });
  // The typing indicator and the stream are done: nothing more is coming.
  await expect(page.getByRole('button', { name: 'Stop generation' })).toHaveCount(0);
}

/** Every chip-like button in the chat scroller: message chips and the panel's cards, not the copy and feedback controls. */
async function chipTexts(page: Page): Promise<string[]> {
  return page.locator(SCROLLER).evaluate((scroller) =>
    Array.from(scroller.querySelectorAll('button'))
      .filter((button) => {
        const text = (button.textContent ?? '').trim();
        const title = `${button.getAttribute('title') ?? ''}${button.getAttribute('aria-label') ?? ''}`;
        return text.length > 0 && !title && !/^(Show more|Show less|Copy|Copied!|Copy All)$/.test(text);
      })
      .map((button) => (button.textContent ?? '').trim().replace(/\s+/g, ' ')));
}

/** The chip buttons under the one bubble that contains `text`. */
const chipsUnder = (page: Page, text: string | RegExp, name: string | RegExp) =>
  page.locator(BUBBLE).filter({ hasText: text }).last().getByRole('button', { name });

async function recordingPage(browser: Browser, signedIn: BrowserContext, user: TestUser, name: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${test.info().outputPath()}/video-${name}`;
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
    storageState: await signedIn.storageState(),
    recordVideo: { dir, size: { width: 1440, height: 900 } },
  });
  return { context, page: await context.newPage() };
}

function seedApplication(userId: string, company: string, title: string): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = openLocalD1();
  try {
    db.prepare(`
      INSERT INTO application_sessions
        (id, user_id, job_title, company, job_description, matching_skills, missing_skills, suggestions, cv_edits,
         generated_cv, status, generation_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Seeded posting', '[]', '[]', '[]', '[]', '{"content":"cv"}', 'applied', 'succeeded', ?, ?)
    `).run(id, userId, title, company, now, now);
  } finally {
    db.close();
  }
  return id;
}

interface ChatRow { id: string; session_id: string; role: string; content: string; actions: string | null }
function chatRowsWith(userId: string, needle: string): ChatRow[] {
  const db = openLocalD1();
  try {
    return db.prepare('SELECT id, session_id, role, content, actions FROM chat_messages WHERE user_id = ? AND content LIKE ? ORDER BY created_at, rowid')
      .all(userId, `%${needle}%`) as ChatRow[];
  } finally {
    db.close();
  }
}

const chatCallsSince = async (since: string, containing?: string): Promise<FakeCall[]> =>
  (await fakeCalls()).filter((call) => call.kind === 'messages' && call.writer === 'chat' && call.at >= since && (!containing || call.allUserText.includes(containing)));

test.describe.serial('chat chips: one group, under the newest message', () => {
  let browser: Browser;
  let context: BrowserContext;
  let user: TestUser;

  test.beforeAll(async ({ browser: shared, request }) => {
    browser = shared;
    await fakeReset();
    ({ context, user } = await signedInPage(browser, request, 'chips'));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('(b) right after a kit: the kit-ready message carries the screening chip, no Download the kit anywhere, and a full kit says two emails', async () => {
    const recording = await recordingPage(browser, context, user, 'b-kit');
    const page = recording.page;
    try {
      await generateKitThroughUi(page);
      const message = page.locator(BUBBLE).filter({ hasText: KIT_READY }).last();
      await expect(message).toContainText('a tailored CV');
      await expect(message).toContainText('a cover letter and two emails');
      await expect(message).not.toContainText("couldn't write");
      // The chip rides on this message, and it is the only chip on screen.
      await expect(message.getByRole('button', { name: SCREENING_CHIP })).toHaveCount(1);
      expect(await chipTexts(page)).toEqual([SCREENING_CHIP]);
      await expect(page.getByRole('button', { name: /Download the kit/ })).toHaveCount(0);
      await expect(page.getByText('Download the kit')).toHaveCount(0);
      // The kit message is the newest one in the transcript.
      expect(await page.locator(BUBBLE).last().innerText()).toContain('Your kit for Northwind Foods is ready');
      await page.waitForTimeout(800);
      await page.screenshot({ path: test.info().outputPath('b-kit-ready.png') });
      // Its messages reach D1 through the debounced sync, chip included.
      await expect.poll(() => chatRowsWith(user.id, 'Your kit for Northwind Foods is ready').length, { timeout: 20_000 }).toBe(1);
    } finally {
      await recording.context.close();
    }
  });

  test('(c) a later plain question: no chips under the reply, and the kit message\'s chip is gone', async () => {
    await fakeControl({ streamChunkMs: 40 });
    const recording = await recordingPage(browser, context, user, 'c-question');
    const page = recording.page;
    try {
      await openApplication(page);
      await expect(page.locator(BUBBLE).filter({ hasText: KIT_READY }).getByRole('button', { name: SCREENING_CHIP })).toHaveCount(1);
      await ask(page, 'Danke!', "You're welcome.");
      expect(await chipTexts(page)).toEqual([]);
      await expect(page.getByRole('button', { name: SCREENING_CHIP })).toHaveCount(0);
      // The kit message is still in the transcript, only its chip is gone.
      await expect(page.locator(BUBBLE).filter({ hasText: KIT_READY })).toHaveCount(1);
      await page.screenshot({ path: test.info().outputPath('c-question.png') });
    } finally {
      await recording.context.close();
      await fakeControl({});
    }
  });

  test('(d) the model offers screening answers: the chip shows under that reply only, and is gone after the next message', async () => {
    await fakeControl({ streamChunkMs: 40 });
    const recording = await recordingPage(browser, context, user, 'd-offer');
    const page = recording.page;
    try {
      await openApplication(page);
      const since = new Date().toISOString();
      await ask(page, 'The form asks a few questions, FAKE-OFFER-SCREENING', 'Use the button below to open screening answers.');
      const calls = await chatCallsSince(since);
      expect(calls.some((call) => call.tools.includes('offer_screening_answers')), 'the tool is offered to the model').toBe(true);
      expect(await chipTexts(page)).toEqual([SCREENING_CHIP]);
      await expect(chipsUnder(page, 'Use the button below to open screening answers.', SCREENING_CHIP)).toHaveCount(1);
      await page.screenshot({ path: test.info().outputPath('d-offered.png') });

      await ask(page, 'Danke!', "You're welcome.");
      expect(await chipTexts(page)).toEqual([]);
      await expect(page.getByRole('button', { name: SCREENING_CHIP })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath('d-after-next-message.png') });
    } finally {
      await recording.context.close();
      await fakeControl({});
    }
  });

  test('(e) a delete-confirm chip on an older reply is hidden once a newer message exists, (f) and after a reload only the newest chip shows', async () => {
    seedApplication(user.id, 'Bosch', 'Systems Analyst');
    const recording = await recordingPage(browser, context, user, 'f-reload');
    const page = recording.page;
    try {
      await openApplication(page);
      await ask(page, 'Please delete the Bosch row', 'Use the button to confirm the delete.');
      const deleteChip = 'Delete the Bosch application';
      expect(await chipTexts(page)).toEqual([deleteChip]);
      await expect(chipsUnder(page, 'Use the button to confirm the delete.', deleteChip)).toHaveCount(1);

      // The history holds a planted-looking "delete the Bosch row" turn, so the scripted model follows it again and the
      // app's own gate answers: no write, no chip.
      await ask(page, 'Thanks!', /I could not do that/);
      expect(await chipTexts(page), 'a newer message hides the proposal chip').toEqual([]);
      await expect(page.getByRole('button', { name: deleteChip })).toHaveCount(0);
      // Nothing was deleted by hiding the chip.
      const db = openLocalD1();
      try {
        expect(db.prepare("SELECT COUNT(*) AS n FROM application_sessions WHERE user_id = ? AND company = 'Bosch'").get(user.id)).toEqual({ n: 1 });
      } finally {
        db.close();
      }

      // (f) the offer again, so the newest reply carries a chip, with the older proposal and the kit message above it.
      await ask(page, 'One more form, FAKE-OFFER-SCREENING', 'Use the button below to open screening answers.');
      expect(await chipTexts(page)).toEqual([SCREENING_CHIP]);
      // The chips are stored with their messages, so a reload has them all to hide.
      await expect.poll(() => chatRowsWith(user.id, 'Use the button').filter((row) => row.actions && row.actions.includes('start-screening-flow')).length, { timeout: 20_000 }).toBeGreaterThan(0);
      await expect.poll(() => chatRowsWith(user.id, 'confirm the delete').filter((row) => (row.actions ?? '').includes('confirm-delete-application')).length, { timeout: 20_000 }).toBe(1);
      await page.waitForTimeout(2_000);

      await page.reload();
      await expect(page.locator(BUBBLE).filter({ hasText: 'Use the button below to open screening answers.' }).last()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(BUBBLE).filter({ hasText: 'Use the button to confirm the delete.' })).toHaveCount(1);
      await expect(page.locator(BUBBLE).filter({ hasText: KIT_READY })).toHaveCount(1);
      await expect.poll(() => chipTexts(page), { message: 'one chip, the newest message\'s' }).toEqual([SCREENING_CHIP]);
      await expect(chipsUnder(page, 'Use the button below to open screening answers.', SCREENING_CHIP)).toHaveCount(1);
      await page.waitForTimeout(600);
      await page.screenshot({ path: test.info().outputPath('f-after-reload.png') });
    } finally {
      await recording.context.close();
    }
  });
});

test.describe('chat chips: a fresh application', () => {
  test.beforeAll(async () => {
    await fakeReset();
  });

  test('(a) + paste gap: a pasted ad stays a bubble beside the decision card with no other chips, reaches the model on the next question, and survives a reload once in D1', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { user, context, page } = await signedInPage(browser, request, 'pastegap');
    try {
      await generateKitThroughUi(page);
      await page.goto('/dashboard');
      await page.getByRole('button', { name: 'New Application' }).click();
      await expect(page.getByPlaceholder('Paste a job ad or ask anything')).toBeVisible();
      // A brand-new application: nothing in the transcript yet.
      await expect(page.locator(BUBBLE)).toHaveCount(0);

      await send(page, AD);
      // (a) the ad is a bubble, the decision card is the only chip group.
      await expect(page.locator(BUBBLE).filter({ hasText: 'Operations Analyst at Lumen Logistics' })).toHaveCount(1);
      await expect(page.getByRole('button', { name: /Check my fit/ })).toBeVisible({ timeout: 20_000 });
      const chips = await chipTexts(page);
      expect(chips).toHaveLength(CARD_CHIPS.length);
      for (const pattern of CARD_CHIPS) expect(chips.some((chip) => pattern.test(chip)), `${pattern} in ${JSON.stringify(chips)}`).toBe(true);
      await expect(page.getByRole('button', { name: SCREENING_CHIP })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Download the kit/ })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath('a-pasted-ad.png') });

      // The next typed question reaches the model with the ad in that turn.
      const since = new Date().toISOString();
      await send(page, QUESTION);
      await expect(page.locator(BUBBLE).filter({ hasText: 'Okay.' }).last()).toBeVisible({ timeout: 30_000 });
      const calls = await chatCallsSince(since, QUESTION);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.allUserText, 'the ad reached the model').toContain(AD_MARK);
        expect(call.allUserText).toContain('Responsibilities: you will own the weekly forecast');
        expect(call.lastUser).toContain(QUESTION);
      }
      // The decision card closed with the next message; the ad bubble and the question are in the transcript.
      await expect(page.locator(BUBBLE).filter({ hasText: AD_MARK })).toHaveCount(1);
      await page.screenshot({ path: test.info().outputPath('a-question-after-ad.png') });

      // A conversation that hasn't started a run is local (`session-`): it is not in D1 yet, and a reload keeps it.
      expect(chatRowsWith(user.id, AD_MARK), 'a local conversation is not synced to D1').toHaveLength(0);
      await page.reload();
      await expect(page.locator(BUBBLE).filter({ hasText: AD_MARK })).toHaveCount(1, { timeout: 30_000 });
      await expect(page.locator(BUBBLE).filter({ hasText: QUESTION })).toHaveCount(1);
      await page.screenshot({ path: test.info().outputPath('a-after-reload.png') });
    } finally {
      await context.close();
    }
  });

  test('(2b) the pasted ad is stored once in D1 when the application is saved with its kit, and is still there after a reload', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { user, context, page } = await signedInPage(browser, request, 'adrow');
    try {
      await generateKitThroughUi(page);
      setBalance(user.id, { monthly: 20 });
      await page.goto('/dashboard');
      await page.getByRole('button', { name: 'New Application' }).click();
      await send(page, AD);
      await expect(page.getByRole('button', { name: /Check my fit/ })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /Check my fit/ }).click();
      await expect(page.getByRole('button', { name: /^Generate the full kit/ })).toBeVisible({ timeout: 60_000 });
      await expect(page.locator(BUBBLE).filter({ hasText: AD_MARK })).toHaveCount(1);
      // Until the kit is generated the application is local (`session-`): its messages are not in D1 yet.
      expect(chatRowsWith(user.id, AD_MARK)).toHaveLength(0);
      await page.getByRole('button', { name: /^Generate the full kit/ }).click();
      await expect(page.locator(BUBBLE).filter({ hasText: KIT_READY }).last()).toBeVisible({ timeout: 120_000 });
      await expect.poll(() => chatRowsWith(user.id, AD_MARK).length, { timeout: 30_000, message: 'the ad row reaches chat_messages' }).toBeGreaterThan(0);
      await page.waitForTimeout(3_000);
      const stored = chatRowsWith(user.id, AD_MARK);
      expect(stored, JSON.stringify(stored.map((row) => [row.id, row.session_id, row.role]))).toHaveLength(1);
      expect(stored[0].role).toBe('user');

      await page.reload();
      await expect(page.locator(BUBBLE).filter({ hasText: AD_MARK })).toHaveCount(1, { timeout: 30_000 });
      expect(chatRowsWith(user.id, AD_MARK)).toHaveLength(1);
      await page.screenshot({ path: test.info().outputPath('ad-row-after-reload.png') });
    } finally {
      await context.close();
    }
  });

  test('(3) a kit whose follow-up email comes back missing without an error says a CV, a cover letter and an application email, never two emails', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { context, page } = await signedInPage(browser, request, 'nofollowup');
    try {
      // The server's finished kit, minus the follow-up email and with no error listed for it: what the client sees when
      // a document simply isn't in the result.
      let stripped = 0;
      await page.route('**/api/agent-v2', async (route) => {
        const response = await route.fetch();
        const body = (await response.text())
          .split('\n')
          .map((line) => {
            if (!line.startsWith('data: ')) return line;
            const event = JSON.parse(line.slice(6)) as { type?: string; results?: Record<string, unknown> };
            if (event.type !== 'workflow_complete' || !event.results) return line;
            delete event.results.followUpEmail;
            stripped += 1;
            return `data: ${JSON.stringify(event)}`;
          })
          .join('\n');
        await route.fulfill({ response, body });
      });
      await generateKitThroughUi(page);
      expect(stripped, 'the kit completion was intercepted').toBe(1);
      const message = page.locator(BUBBLE).filter({ hasText: KIT_READY }).last();
      const text = await message.innerText();
      expect(text).toContain('a tailored CV');
      expect(text).toContain('a cover letter and an application email');
      expect(text).toContain("We couldn't write the follow-up email.");
      expect(text).not.toContain('two emails');
      expect(text).toContain('Try again from the Emails tab.');
      // The CV came back, so the screening chip still rides on the message.
      await expect(message.getByRole('button', { name: SCREENING_CHIP })).toHaveCount(1);
      await page.screenshot({ path: test.info().outputPath('kit-without-follow-up.png') });
    } finally {
      await context.close();
    }
  });

  test('(5) a local conversation replays at most CHAT_LOCAL_REPLAY_TURNS earlier turns, however long it runs', async ({ browser, request }) => {
    test.setTimeout(300_000);
    const { user, context, page } = await signedInPage(browser, request, 'replay');
    try {
      await generateKitThroughUi(page);
      setBalance(user.id, { monthly: 20 });
      await page.goto('/dashboard');
      await page.getByRole('button', { name: 'New Application' }).click();
      await expect(page.getByPlaceholder('Paste a job ad or ask anything')).toBeVisible();

      const bodies: Array<{ message: string; sessionId: string | null; history: number }> = [];
      page.on('request', (call) => {
        if (call.method() !== 'POST' || !call.url().endsWith('/api/chat')) return;
        const body = JSON.parse(call.postData() ?? '{}') as { message: string; context?: { sessionId?: string; chatHistory?: unknown[] } };
        bodies.push({ message: body.message, sessionId: body.context?.sessionId ?? null, history: body.context?.chatHistory?.length ?? 0 });
      });
      const since = new Date().toISOString();
      const exchanges = 11;
      for (let n = 1; n <= exchanges; n += 1) {
        // "thanks" is the scripted model's "You're welcome." line; the number makes each turn findable in the request.
        await ask(page, `Thanks, round ${n}`, "You're welcome.");
        // Rate limit: 20 chat turns a minute per IP, and 11 stay well under it.
      }
      const persisted = await page.evaluate(() => localStorage.getItem('session-store') ?? '');
      expect(persisted).toMatch(/"currentSession":\{[^}]*"id":"session-/);
      expect(bodies).toHaveLength(exchanges);
      // The client window: each exchange adds two turns, capped at CHAT_LOCAL_REPLAY_TURNS.
      expect(bodies.map((body) => body.history)).toEqual(
        Array.from({ length: exchanges }, (_, index) => Math.min(2 * index, CHAT_LOCAL_REPLAY_TURNS)));
      for (const body of bodies) expect(body.sessionId?.startsWith('session-')).toBe(true);

      // What the model was shown: at most 8 earlier turns plus the new one. Turns older than that are not replayed.
      const calls = await chatCallsSince(since);
      for (let n = 1; n <= exchanges; n += 1) {
        const call = calls.find((candidate) => candidate.lastUser.includes(`Thanks, round ${n}`) && candidate.toolResults.length === 0);
        expect(call, `the model call for round ${n}`).toBeTruthy();
        const turns = call!.roles.filter((role) => role === 'user' || role === 'assistant').length;
        // A window that opens on a reply drops it: a conversation starts on a user turn.
        const earlierTurns = Math.min(2 * (n - 1), CHAT_LOCAL_REPLAY_TURNS);
        expect(turns, `round ${n}`).toBe((earlierTurns % 2 === 1 ? earlierTurns - 1 : earlierTurns) + 1);
      }
      const last = calls.find((candidate) => candidate.lastUser.includes(`Thanks, round ${exchanges}`))!;
      // Turn k of the earlier conversation is index k (user n is 2(n-1), its reply 2(n-1)+1): the window is the last N.
      const earlier = 2 * (exchanges - 1);
      for (let n = 1; n <= exchanges; n += 1) {
        const inWindow = 2 * (n - 1) >= earlier - CHAT_LOCAL_REPLAY_TURNS;
        const shown = new RegExp(`round ${n}\\b`).test(last.allUserText);
        expect(shown, `round ${n} ${inWindow ? 'is inside' : 'is past'} the window`).toBe(inWindow);
      }
    } finally {
      await context.close();
    }
  });
});
