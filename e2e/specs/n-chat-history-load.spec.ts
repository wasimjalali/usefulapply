import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { fakeReset } from '../lib/fake-control';
import { openLocalD1 } from '../lib/sqlite';
import { generateKitThroughUi, signedInPage, storedApplication } from '../lib/app';

/**
 * (4) The history load after a full reload, and when another saved application is opened from the sidebar. A saved
 * application with a long transcript (28 seeded messages beside the kit's own) must:
 *  - never paint the empty conversation card ("is ready. Useful Apply already has the saved job description") or the empty
 *    state greeting before its history, on any animation frame (a "Loading the conversation" line is allowed);
 *  - land at the bottom of the transcript: on no animation frame is the history on screen scrolled to anywhere but the end.
 * A sampler installed with addInitScript logs the scroller on every frame from the first paint of the document, so a smooth
 * scroll through the history, or a frame of the empty card, can't pass between two screenshots. The run is recorded.
 */


interface Frame {
  t: number;
  bubbles: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  emptyCard: boolean;
  greeting: boolean;
  loading: boolean;
  scroller: boolean;
}

function seedHistory(userId: string, sessionId: string, pairs: number, tag: string): void {
  const db = openLocalD1();
  try {
    const insert = db.prepare(`INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at, claimed_at)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`);
    const base = Date.now() + 1_000;
    const filler = 'This line keeps the bubble tall enough that the transcript is several screens long, so a scroll through it would show. ';
    for (let n = 0; n < pairs; n += 1) {
      const at = new Date(base + n * 2).toISOString();
      insert.run(`msg-${tag}-${base}-${n}-u`, sessionId, userId, 'user', `${tag} question ${n + 1}. ${filler.repeat(2)}`, at, at);
      insert.run(`msg-${tag}-${base}-${n}-a`, sessionId, userId, 'assistant', `${tag} answer ${n + 1}. ${filler.repeat(3)}`, new Date(base + n * 2 + 1).toISOString(), null);
    }
  } finally {
    db.close();
  }
}

function seedApplication(userId: string, company: string): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = openLocalD1();
  try {
    db.prepare(`
      INSERT INTO application_sessions
        (id, user_id, job_title, company, job_description, matching_skills, missing_skills, suggestions, cv_edits,
         generated_cv, status, generation_status, created_at, updated_at)
      VALUES (?, ?, 'Systems Analyst', ?, 'Seeded posting', '[]', '[]', '[]', '[]', '{"content":"cv"}', 'applied', 'succeeded', ?, ?)
    `).run(id, userId, company, now, now);
  } finally {
    db.close();
  }
  return id;
}

/** From the first frame of every document: what the chat scroller shows, once per animation frame. */
async function installSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: Frame[] };
    w.__frames = [];
    const tick = () => {
      const scroller = document.querySelector<HTMLElement>('[data-chat-scroll]');
      const text = document.body?.innerText ?? '';
      w.__frames.push({
        t: performance.now(),
        bubbles: scroller ? scroller.querySelectorAll('.group\\/msg').length : 0,
        scrollTop: scroller ? Math.round(scroller.scrollTop) : 0,
        scrollHeight: scroller ? scroller.scrollHeight : 0,
        clientHeight: scroller ? scroller.clientHeight : 0,
        emptyCard: text.includes('already has the saved job description'),
        greeting: text.includes('What should we work on?'),
        loading: text.includes('Loading the conversation'),
        scroller: Boolean(scroller),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const framesOf = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
const frameCount = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames.length);

/** The rule on every sampled frame: no empty conversation, and any painted history sits at the end. */
function expectCleanFrames(frames: Frame[], label: string): void {
  expect(frames.length, `${label}: frames sampled`).toBeGreaterThan(20);
  expect(frames.filter((frame) => frame.emptyCard).length, `${label}: frames with the empty-conversation card`).toBe(0);
  expect(frames.filter((frame) => frame.greeting).length, `${label}: frames with the empty-state greeting`).toBe(0);
  const painted = frames.filter((frame) => frame.bubbles > 0 && frame.scrollHeight > frame.clientHeight);
  expect(painted.length, `${label}: frames with the history painted and scrollable`).toBeGreaterThan(5);
  const notAtBottom = painted.filter((frame) => frame.scrollTop + frame.clientHeight < frame.scrollHeight - 2);
  expect(
    notAtBottom.slice(0, 5).map((frame) => `${frame.bubbles} bubbles, top ${frame.scrollTop}, ${frame.clientHeight}/${frame.scrollHeight}`),
    `${label}: frames with the history not at the bottom`,
  ).toEqual([]);
}

test('(4) a saved application with a long history, reloaded and then another opened from the sidebar, never paints the empty conversation and lands at the bottom', async ({ browser, request }) => {
  test.setTimeout(300_000);
  await fakeReset();
  const { user, context } = await signedInPage(browser, request, 'histload');
  const setup = await context.newPage();
  await generateKitThroughUi(setup);
  const application = storedApplication(user.id);
  if (!application) throw new Error('the kit left no application row');
  await expect.poll(() => {
    const db = openLocalD1();
    try {
      return (db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?').get(application.id) as { n: number }).n;
    } finally {
      db.close();
    }
  }, { timeout: 20_000 }).toBeGreaterThan(0);
  await setup.waitForTimeout(1_500);
  await setup.close();
  seedHistory(user.id, application.id, 14, 'Alpha');
  const second = seedApplication(user.id, 'Bosch');
  seedHistory(user.id, second, 13, 'Bravo');

  const dir = `${test.info().outputPath()}/video-reload`;
  mkdirSync(dir, { recursive: true });
  const recording = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
    storageState: await context.storageState(),
    recordVideo: { dir, size: { width: 1440, height: 900 } },
  });
  const page = await recording.newPage();
  try {
    await installSampler(page);
    // Open the application (a cold load, then the sidebar), then reload: the open application comes back from storage.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
    await expect(page.getByText(/Alpha answer 14/).first()).toBeVisible({ timeout: 30_000 });

    for (const run of ['reload-1', 'reload-2']) {
      await page.reload();
      // The whole transcript is on screen: the kit's own messages and 28 seeded ones.
      await expect(page.getByText(/Alpha answer 14/).first()).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => page.locator('[data-chat-scroll] .group\\/msg').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(28);
      await page.waitForTimeout(1_200);
      const frames = await framesOf(page);
      expectCleanFrames(frames, run);
      // The scroller is at the end of the transcript, and the newest message is the one in view.
      const atEnd = await page.locator('[data-chat-scroll]').evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 2);
      expect(atEnd, `${run}: at the end after settling`).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${run}.png`) });
    }

    // Another saved application from the sidebar, in the same document: the sampler keeps running across the switch.
    const mark = await frameCount(page);
    await page.getByRole('button', { name: /Bosch/ }).first().click();
    await expect(page.getByText(/Bravo answer 13/).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_200);
    const switched = (await framesOf(page)).slice(mark);
    expectCleanFrames(switched, 'sidebar switch to Bosch');
    await page.screenshot({ path: test.info().outputPath('sidebar-switch.png') });

    // And back, to the first one (its history is already loaded: no loading line, no empty card, still at the end).
    const back = await frameCount(page);
    await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
    await expect(page.getByText(/Alpha answer 14/).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_200);
    expectCleanFrames((await framesOf(page)).slice(back), 'sidebar switch back');
  } finally {
    await recording.close();
    await context.close();
  }
});
