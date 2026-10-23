import { mkdirSync } from 'node:fs';
import { expect, request as playwrightRequest, test, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';
import { fakeCalls, fakeReset } from '../lib/fake-control';
import { openLocalD1 } from '../lib/sqlite';
import { generateKitThroughUi, signedInPage, storedApplication } from '../lib/app';
import { setBalance, type TestUser } from '../lib/user';
import { JOB_DESCRIPTION } from '../lib/model-script';
import { FIT_CLOSING_BEFORE_2026_10_23 } from '../../src/components/chat/useAgentWorkflow';

/**
 * Round 2 of the chat UX pass (head 0d3a99ab): the real UI, the real routes and server actions, the real local D1; only
 * the model is scripted.
 *
 *  1. A reload of a saved application with a long history never flickers: once a message is painted the transcript never
 *     goes empty and "Loading the conversation" never comes back, and the sidebar never claims "No applications yet.".
 *  2. A new user's first kit through the guided line (fit then kit, and a direct run), three runs, the first cold: "The kit
 *     didn't finish" never shows on any frame and the workspace ends on the kit.
 *  3. The fit message no longer says "generate the full application below", and an old stored one has the line hidden once a
 *     kit exists (and still shows it before).
 *  4. A job ad's card, the "That was a job ad" card and a fit's chips stay with the application they were raised in.
 *  5. A transcript that fails to load says so and offers Try again, never the empty application's paid first step.
 *  6. A turn is held, with a clear reply and no model call, when an earlier message could not be written.
 */

const SCROLLER = '[data-chat-scroll]';
const BUBBLE = `${SCROLLER} .group\\/msg`;
const KIT_READY = /Your kit for Northwind Foods is ready/;
const OLD_CLOSING = FIT_CLOSING_BEFORE_2026_10_23;
const AD_MARK = 'Hamburg with a salary band shared at interview';
const AD = [
  'Operations Analyst at Lumen Logistics.',
  'Responsibilities: you will own the weekly forecast, build dashboards and partner with plant managers across three regions to cut late shipments and report every month.',
  'Requirements: three years in finance or operations, strong Excel and SQL, clear written English, and a candidate who likes ownership.',
  'Qualifications: degree in business or similar; nice to have: Power BI. Benefits: 30 days leave, flexible hours, remote days. Apply with your CV.',
  `About the role: this position reports to the head of operations and is based in ${AD_MARK}.`,
].join('\n');
/** Ad-shaped (350+ characters, two markers) but not an obvious ad, and the scripted model answers it without propose_application. */
const SHAPED = `FAKE-NO-PROPOSE ${'Our analytics team in Munich is growing and we describe the main responsibilities and the requirements for the role in this note. '.repeat(3)}`;

const chatInput = (page: Page) => page.getByPlaceholder(/Ask for a change|Paste a job ad or ask anything/);
async function send(page: Page, text: string): Promise<void> {
  await chatInput(page).fill(text);
  await chatInput(page).press('Enter');
}

function dir(name: string): string {
  const path = `${test.info().outputPath()}/video-${name}`;
  mkdirSync(path, { recursive: true });
  return path;
}

async function recordingContext(browser: Browser, signedIn: BrowserContext, user: TestUser, name: string): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
    storageState: await signedIn.storageState(),
    recordVideo: { dir: dir(name), size: { width: 1440, height: 900 } },
  });
}

function seedApplication(userId: string, company: string, options: { kit: boolean }): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = openLocalD1();
  try {
    db.prepare(`
      INSERT INTO application_sessions
        (id, user_id, job_title, company, job_description, matching_skills, missing_skills, suggestions, cv_edits,
         generated_cv, status, generation_status, created_at, updated_at)
      VALUES (?, ?, 'Systems Analyst', ?, 'Seeded posting', '[]', '[]', '[]', '[]', ?, 'applied', 'succeeded', ?, ?)
    `).run(id, userId, company, options.kit ? '{"content":"cv"}' : null, now, now);
  } finally {
    db.close();
  }
  return id;
}

function seedHistory(userId: string, sessionId: string, pairs: number, tag: string, offsetMs = 1_000): void {
  const db = openLocalD1();
  try {
    const insert = db.prepare(`INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at, claimed_at)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`);
    const base = Date.now() + offsetMs;
    const filler = 'This line keeps the bubble tall enough that the transcript is several screens long, so a flash of nothing would show. ';
    for (let n = 0; n < pairs; n += 1) {
      const at = new Date(base + n * 2).toISOString();
      insert.run(`msg-${tag}-${base}-${n}-u`, sessionId, userId, 'user', `${tag} question ${n + 1}. ${filler.repeat(2)}`, at, at);
      insert.run(`msg-${tag}-${base}-${n}-a`, sessionId, userId, 'assistant', `${tag} answer ${n + 1}. ${filler.repeat(3)}`, new Date(base + n * 2 + 1).toISOString(), null);
    }
  } finally {
    db.close();
  }
}

function seedMessage(userId: string, sessionId: string, role: 'user' | 'assistant', content: string, id: string): void {
  const db = openLocalD1();
  try {
    const at = new Date().toISOString();
    db.prepare(`INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at, claimed_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`)
      .run(id, sessionId, userId, role, content, at, role === 'user' ? at : null);
  } finally {
    db.close();
  }
}

const jobDescriptionOf = (sessionId: string): string => {
  const db = openLocalD1();
  try {
    return (db.prepare('SELECT job_description AS jd FROM application_sessions WHERE id = ?').get(sessionId) as { jd: string }).jd;
  } finally {
    db.close();
  }
};

const chatRowCount = (sessionId: string): number => {
  const db = openLocalD1();
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?').get(sessionId) as { n: number }).n;
  } finally {
    db.close();
  }
};

/** A kit through the UI, then its messages in D1, so seeded rows land after them. */
async function userWithKit(browser: Browser, request: Parameters<typeof signedInPage>[1], label: string) {
  const signedIn = await signedInPage(browser, request, label);
  await generateKitThroughUi(signedIn.page);
  const application = storedApplication(signedIn.user.id);
  if (!application) throw new Error('the kit left no application row');
  await expect.poll(() => chatRowCount(application.id), { timeout: 20_000 }).toBeGreaterThan(0);
  await signedIn.page.waitForTimeout(1_500);
  return { ...signedIn, application };
}

interface Frame {
  bubbles: number;
  loading: boolean;
  noApps: boolean;
  emptyCard: boolean;
  kitFailed: boolean;
  fitFailed: boolean;
  kitMessage: boolean;
  scroller: boolean;
  snippet: string;
}

async function installSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: Frame[] };
    w.__frames = [];
    const tick = () => {
      const scroller = document.querySelector('[data-chat-scroll]');
      const text = document.body?.innerText ?? '';
      w.__frames.push({
        bubbles: scroller ? scroller.querySelectorAll('.group\\/msg').length : 0,
        loading: text.includes('Loading the conversation'),
        noApps: text.includes('No applications yet.'),
        emptyCard: text.includes('already has the saved job description'),
        kitFailed: text.includes("The kit didn't finish"),
        fitFailed: text.includes("The fit check didn't finish"),
        kitMessage: /Your kit for Northwind Foods is ready/.test(text),
        scroller: Boolean(scroller),
        snippet: scroller && scroller.querySelectorAll('.group\\/msg').length > 0 ? '' : text.replace(/\s+/g, ' ').slice(0, 160),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
/** Run-length form of the sampled frames, for failure messages: "0x12 28x3 ...". */
const runs = (frames: Frame[], pick: (frame: Frame) => string | number): string =>
  frames.reduce<Array<[string | number, number]>>((acc, frame) => {
    const value = pick(frame);
    if (acc.at(-1)?.[0] === value) acc[acc.length - 1][1] += 1;
    else acc.push([value, 1]);
    return acc;
  }, []).map(([value, count]) => `${value}x${count}`).join(' ');
const framesOf = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);

/** The server-action calls of the app are POSTs with a Next-Action header and the arguments as a JSON array. */
function actionArgs(route: Route): unknown[] | null {
  const request = route.request();
  if (request.method() !== 'POST' || !request.headers()['next-action']) return null;
  try {
    const args: unknown = JSON.parse(request.postData() ?? 'null');
    return Array.isArray(args) ? args : null;
  } catch {
    return null;
  }
}

test.describe('chat round 2', () => {
  test.beforeAll(async () => {
    await fakeReset();
  });

  test('(1) a reload with a long history never paints nothing after the first message, never says "Loading" after it, and the sidebar never says "No applications yet."', async ({ browser, request }) => {
    test.setTimeout(300_000);
    const { user, context, page, application } = await userWithKit(browser, request, 'r2reload');
    try {
      seedHistory(user.id, application.id, 14, 'Alpha');
      // This browser loads the 28 seeded messages once, so the next reload has a cached transcript.
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
      await expect(page.getByText(/Alpha answer 14/).first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1_500);
      // Rows only the server has: the reload swaps a longer transcript in under the cached one.
      seedHistory(user.id, application.id, 6, 'Charlie', 5_000);
      const recording = await recordingContext(browser, context, user, 'r2-1-reload');
      const rec = await recording.newPage();
      try {
        await installSampler(rec);
        await rec.goto('/dashboard');
        await expect(rec.getByText(/Charlie answer 6/).first()).toBeVisible({ timeout: 30_000 });
        for (const run of ['reload-1', 'reload-2']) {
          if (run === 'reload-2') {
            await rec.reload();
            await expect(rec.getByText(/Charlie answer 6/).first()).toBeVisible({ timeout: 30_000 });
          }
          await rec.waitForTimeout(1_200);
          const frames = await framesOf(rec);
          expect(frames.length, `${run}: frames`).toBeGreaterThan(20);
          const firstPainted = frames.findIndex((frame) => frame.bubbles > 0);
          expect(firstPainted, `${run}: a message was painted`).toBeGreaterThanOrEqual(0);
          const after = frames.slice(firstPainted);
          expect.soft(after.filter((frame) => frame.bubbles === 0).length, `${run}: frames with an empty transcript after the first message (bubbles: ${runs(frames, (frame) => frame.bubbles)}; empty frames showed: ${JSON.stringify([...new Set(after.filter((frame) => frame.bubbles === 0).map((frame) => `${frame.scroller} ${frame.snippet}`))])})`).toBe(0);
          expect.soft(after.filter((frame) => frame.loading).length, `${run}: "Loading the conversation" after the first message`).toBe(0);
          expect.soft(frames.filter((frame) => frame.noApps).length, `${run}: frames with "No applications yet."`).toBe(0);
          expect.soft(frames.filter((frame) => frame.emptyCard).length, `${run}: frames with the empty-conversation card`).toBe(0);
          // The count only ever grows: the server's transcript replaces a shorter cached one, never a blank in between.
          for (let i = 1; i < after.length; i += 1) expect(after[i].bubbles, `${run}: frame ${i}`).toBeGreaterThanOrEqual(after[i - 1].bubbles);
        }
        await rec.screenshot({ path: test.info().outputPath('r2-reload.png') });
      } finally {
        await recording.close();
      }
    } finally {
      await context.close();
    }
  });

  test('(2) a new user\'s first kit through the guided line: cold fit then kit, a direct kit, and a third run, never "The kit didn\'t finish"', async ({ browser }) => {
    test.setTimeout(420_000);
    for (const run of [
      { name: 'r2-2-run1-cold-fit-then-kit', direct: false },
      { name: 'r2-2-run2-direct', direct: true },
      { name: 'r2-2-run3-fit-then-kit', direct: false },
    ]) {
      // A fresh browser context and a new user each time: nothing cached from the run before.
      const api = await playwrightRequest.newContext();
      const { context, page } = await signedInPage(browser, api, 'r2kit', { videoDir: dir(run.name) });
      try {
        await installSampler(page);
        if (run.direct) {
          await page.goto('/dashboard');
          await page.getByPlaceholder(/Paste the whole ad/).fill(JOB_DESCRIPTION);
          await page.getByRole('button', { name: /Skip the check, generate the full kit now/ }).click();
          await expect(page.getByText(KIT_READY)).toBeVisible({ timeout: 120_000 });
        } else {
          await generateKitThroughUi(page);
        }
        await page.waitForTimeout(1_500);
        const frames = await framesOf(page);
        expect(frames.length, `${run.name}: frames`).toBeGreaterThan(30);
        expect(frames.filter((frame) => frame.kitFailed).length, `${run.name}: frames with "The kit didn't finish"`).toBe(0);
        expect(frames.filter((frame) => frame.fitFailed).length, `${run.name}: frames with "The fit check didn't finish"`).toBe(0);
        // The workspace shows the kit: the message, the tabs, the tailored CV.
        expect(frames.at(-1)?.kitMessage, `${run.name}: the kit message is on the last frame`).toBe(true);
        await expect(page.getByRole('tab', { name: 'Cover letter' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible();
        await page.screenshot({ path: test.info().outputPath(`${run.name}.png`) });
      } finally {
        await context.close();
        await api.dispose();
      }
    }
  });

  test('(3) no message says "generate the full application below" after a fit then a kit; an old stored one has the line hidden once a kit exists and shows it before', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { user, context, page } = await userWithKit(browser, request, 'r2fit');
    try {
      // The real flow (fit, then kit): the fit message is there, without the old line, and so is the rest of the page.
      await expect(page.locator(BUBBLE).filter({ hasText: /(Good|Fair) Fit/ })).toHaveCount(1);
      expect(await page.locator('body').innerText()).not.toContain('generate the full application below');
      expect(await page.locator(SCROLLER).innerText()).not.toContain(OLD_CLOSING);

      // A fit message stored before 2026-10-23, on an application without a kit.
      const withoutKit = seedApplication(user.id, 'Zapier', { kit: false });
      seedMessage(user.id, withoutKit, 'user', 'How well do I fit this role?', `msg-old-fit-q-${Date.now()}`);
      seedMessage(user.id, withoutKit, 'assistant', `🟢 **Good Fit (68%)**\n\n**Role:** Systems Analyst\n\n${OLD_CLOSING}`, `msg-old-fit-a-${Date.now()}`);
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /Zapier/ }).first().click();
      await expect(page.locator(BUBBLE).filter({ hasText: 'Good Fit (68%)' })).toHaveCount(1, { timeout: 30_000 });
      await expect(page.locator(SCROLLER)).toContainText(OLD_CLOSING);

      // The same application once it has a kit: the line is hidden, the rest of the message stays.
      const db = openLocalD1();
      try {
        db.prepare(`UPDATE application_sessions SET generated_cv = '{"content":"cv"}', updated_at = ?, revision = revision + 1 WHERE id = ?`).run(new Date().toISOString(), withoutKit);
      } finally {
        db.close();
      }
      await page.reload();
      await page.getByRole('button', { name: /Zapier/ }).first().click();
      await expect(page.locator(BUBBLE).filter({ hasText: 'Good Fit (68%)' })).toHaveCount(1, { timeout: 30_000 });
      await expect(page.locator(BUBBLE).filter({ hasText: 'Role: Systems Analyst' })).toHaveCount(1);
      expect(await page.locator(SCROLLER).innerText()).not.toContain(OLD_CLOSING);
      await page.screenshot({ path: test.info().outputPath('old-fit-line-hidden.png') });
    } finally {
      await context.close();
    }
  });

  test.describe('(4) cards stay with their application', () => {
    const FIT_CHIPS = [/^Check my fit/, /^Skip the check, generate the full kit now/, /^Not a job ad, just a question/, /^Generate the full kit/];

    async function openShell(browser: Browser, request: Parameters<typeof signedInPage>[1], label: string) {
      const signedIn = await userWithKit(browser, request, label);
      setBalance(signedIn.user.id, { monthly: 20 });
      const saved = seedApplication(signedIn.user.id, 'Zapier', { kit: false });
      await signedIn.page.goto('/dashboard');
      await signedIn.page.getByRole('button', { name: 'New Application' }).click();
      await expect(signedIn.page.getByPlaceholder('Paste a job ad or ask anything')).toBeVisible();
      return { ...signedIn, saved };
    }

    async function openSavedAndExpectNoCards(page: Page, saved: string): Promise<void> {
      await page.getByRole('button', { name: /Zapier/ }).first().click();
      await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });
      for (let tick = 0; tick < 4; tick += 1) {
        for (const chip of FIT_CHIPS) await expect(page.getByRole('button', { name: chip }), String(chip)).toHaveCount(0);
        await expect(page.getByRole('button', { name: /That was a job ad/ })).toHaveCount(0);
        await page.waitForTimeout(400);
      }
      expect(jobDescriptionOf(saved), 'nothing clicked on B changed its job description').toBe('Seeded posting');
    }

    test('a pasted ad\'s decision card does not follow the user to a saved application', async ({ browser, request }) => {
      test.setTimeout(240_000);
      const { context, page, saved } = await openShell(browser, request, 'r2cardA');
      try {
        await send(page, AD);
        await expect(page.getByRole('button', { name: /^Check my fit/ })).toBeVisible({ timeout: 20_000 });
        await openSavedAndExpectNoCards(page, saved);
        await page.screenshot({ path: test.info().outputPath('card-a-to-b.png') });
      } finally {
        await context.close();
      }
    });

    test('the "That was a job ad" card does not follow the user to a saved application', async ({ browser, request }) => {
      test.setTimeout(240_000);
      const { context, page, saved } = await openShell(browser, request, 'r2cardB');
      try {
        await send(page, SHAPED);
        await expect(page.getByRole('button', { name: /That was a job ad, start an application/ })).toBeVisible({ timeout: 30_000 });
        await openSavedAndExpectNoCards(page, saved);
        await page.screenshot({ path: test.info().outputPath('fallback-a-to-b.png') });
      } finally {
        await context.close();
      }
    });

    test('a fit\'s chips on application A are gone on a saved application B', async ({ browser, request }) => {
      test.setTimeout(240_000);
      const { context, page, saved } = await openShell(browser, request, 'r2cardC');
      try {
        await send(page, AD);
        await page.getByRole('button', { name: /^Check my fit/ }).click();
        await expect(page.getByRole('button', { name: /^Generate the full kit/ })).toBeVisible({ timeout: 60_000 });
        await openSavedAndExpectNoCards(page, saved);
        await page.screenshot({ path: test.info().outputPath('fit-a-to-b.png') });
      } finally {
        await context.close();
      }
    });
  });

  test('(5) a transcript that fails to load says so with Try again, never the empty application, and Try again loads it', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { user, context, application } = await userWithKit(browser, request, 'r2fail');
    try {
      seedHistory(user.id, application.id, 14, 'Alpha');
      // A device that never opened the application: cookies only, no cached transcript.
      const fresh = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
        storageState: { cookies: (await context.storageState()).cookies, origins: [] },
      });
      const page = await fresh.newPage();
      try {
        let failing = true;
        let failed = 0;
        // The transcript read: getChatMessagesAction(userId, sessionId). The divider marker read has the same shape and
        // fails with it, which the app tolerates.
        await page.route('**/*', async (route) => {
          const args = actionArgs(route);
          if (failing && args && args.length === 2 && args[1] === application.id) {
            failed += 1;
            await route.fulfill({ status: 500, contentType: 'text/plain', body: 'scripted failure' });
            return;
          }
          await route.continue();
        });
        await page.goto('/dashboard');
        await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
        await expect(page.getByRole('alert').filter({ hasText: "We couldn't load this conversation." })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
        expect(failed, 'the transcript read was refused').toBeGreaterThan(0);
        await page.waitForTimeout(1_000);
        // Not the empty application: no saved-job card, no paid first step.
        await expect(page.getByText('already has the saved job description')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Analyze this job description/ })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /How well do I fit this role/ })).toHaveCount(0);
        await expect(page.getByText('Loading the conversation')).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath('load-failed.png') });

        failing = false;
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByText(/Alpha answer 14/).first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("We couldn't load this conversation.")).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath('load-retried.png') });
      } finally {
        await fresh.close();
      }
    } finally {
      await context.close();
    }
  });

  test('(6) a question after a message that could not be saved is held: the clear reply, no model call, and the next turn works once writes succeed', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { context, page } = await userWithKit(browser, request, 'r2held');
    try {
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
      await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });
      let refuseWrites = true;
      let refused = 0;
      // addChatMessageAction(userId, sessionId, message): a three-argument call carrying a message object.
      await page.route('**/*', async (route) => {
        const args = actionArgs(route);
        const message = args && args.length === 3 ? (args[2] as { role?: unknown } | null) : null;
        if (refuseWrites && message && typeof message === 'object' && typeof message.role === 'string') {
          refused += 1;
          await route.fulfill({ status: 500, contentType: 'text/plain', body: 'scripted failure' });
          return;
        }
        await route.continue();
      });
      // A pasted ad in a saved application is added to the transcript and is not sent to the model: it has to be written
      // before the next question, which reads its history from D1.
      await send(page, AD);
      await expect(page.locator(BUBBLE).filter({ hasText: AD_MARK })).toHaveCount(1, { timeout: 20_000 });
      const since = new Date().toISOString();
      const question = 'What does this role pay and is it remote?';
      await send(page, question);
      await expect(page.locator(BUBBLE).last()).toContainText("I couldn't save your earlier message", { timeout: 30_000 });
      expect(refused, 'writes were refused').toBeGreaterThan(0);
      const held = (await fakeCalls()).filter((call) => call.kind === 'messages' && call.writer === 'chat' && call.at >= since);
      expect(held.map((call) => call.lastUser), 'the model received no chat call for the held turn').toEqual([]);
      await page.screenshot({ path: test.info().outputPath('turn-held.png') });

      // Writes work again: the next turn flushes the ad first, and the model reads it.
      refuseWrites = false;
      await send(page, 'Thanks, that is all.');
      await expect(page.locator(BUBBLE).last()).toContainText("You're welcome.", { timeout: 30_000 });
      const answered = (await fakeCalls()).filter((call) => call.kind === 'messages' && call.writer === 'chat' && call.at >= since && call.lastUser.includes('Thanks, that is all.'));
      expect(answered.length).toBeGreaterThan(0);
      expect(answered[0].allUserText, 'the ad reached the model once the write worked').toContain(AD_MARK);
    } finally {
      await context.close();
    }
  });
});
