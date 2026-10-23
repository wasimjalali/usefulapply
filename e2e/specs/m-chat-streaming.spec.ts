import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL } from '../lib/env';
import { fakeCalls, fakeControl, fakeReset, type FakeCall } from '../lib/fake-control';
import { openLocalD1 } from '../lib/sqlite';
import { generateKitThroughUi, openApplication, signedInPage, storedApplication } from '../lib/app';
import { nextTestIp, type TestUser } from '../lib/user';

/**
 * Streamed chat replies end to end: the real /api/chat route, the real SDK reading real SSE from the scripted model
 * (e2e/fake-anthropic.ts sends every block in chunks with gaps), the real local D1 and the real ChatPanel.
 *
 * The API turns read the stream from this process with fetch, so every event carries its arrival time: a reply that
 * arrived in one piece would fail the spread checks. The UI turns sample every animation frame of the chat panel
 * (bubble count, text length, the bubble's position in the scroller) and record a video per run.
 *
 * Scenarios:
 *  - a German question with one tool round mid-reply: an opening line, the tool status, then the answer, each as it
 *    is written; the long dash rewritten on the way; the reply stored once, under the id `done` names;
 *  - a 529 before the first byte fails over to Bedrock, and text the client never saw is not duplicated;
 *  - a 500 after the first bytes ends the stream with an error event: no failover, nothing stored as the reply, the
 *    user's turn stays claimed, and the next turn works;
 *  - a model stream idle past 60 s after text: the clear idle message on screen, nothing stored;
 *  - Stop mid-stream: what was shown stays, marked stopped, nothing is stored, and a new message works;
 *  - a long conversation compacts on the streamed turn: the divider appears, the reply streams;
 *  - a request without `Accept: text/event-stream` (a tab from before streaming) still gets JSON.
 */

const MARK = 'Ich schaue kurz in deinen Tracker.';
const QUESTION = 'Wie viele Bewerbungen habe ich gerade im Tracker?';
const ARTIFACTS = () => test.info().outputPath();

interface StreamEvent {
  type: string;
  at: number;
  [key: string]: unknown;
}

let idCounter = 0;
const nextMessageId = () => `msg-e2e-stream-${Date.now()}-${(idCounter += 1)}`;

/** One streamed /api/chat turn from this process, every event stamped with its arrival time (ms from the request). */
async function streamTurn(
  context: BrowserContext,
  sessionId: string,
  message: string,
  options: { accept?: string | null; messageId?: string } = {},
): Promise<{ status: number; contentType: string; events: StreamEvent[]; json: Record<string, unknown> | null; messageId: string }> {
  const cookie = (await context.cookies(BASE_URL)).map((entry) => `${entry.name}=${entry.value}`).join('; ');
  const ip = nextTestIp();
  const messageId = options.messageId ?? nextMessageId();
  const startedAt = Date.now();
  const accept = options.accept === undefined ? 'text/event-stream' : options.accept;
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accept ? { accept } : {}),
      cookie,
      // Better Auth refuses a cookie-carrying request without the app's origin.
      origin: BASE_URL,
      'cf-connecting-ip': ip,
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({
      message,
      messageId,
      context: { hasCV: true, hasAnalysis: false, timeZone: 'Europe/Berlin', sessionId },
    }),
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    return { status: response.status, contentType, events: [], json: (await response.json()) as Record<string, unknown>, messageId };
  }
  const events: StreamEvent[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      if (frame.startsWith('data: ')) events.push({ ...(JSON.parse(frame.slice(6)) as { type: string }), at: Date.now() - startedAt });
    }
  }
  expect(buffer, 'the stream ends on a whole event').toBe('');
  return { status: response.status, contentType, events, json: null, messageId };
}

const deltasOf = (events: StreamEvent[]) => events.filter((event) => event.type === 'delta');
const streamedText = (events: StreamEvent[]) => deltasOf(events).map((event) => String(event.text)).join('');
const finalOf = (events: StreamEvent[]) => {
  const last = events.filter((event) => event.type !== 'ping').at(-1);
  if (!last) throw new Error('the stream sent nothing');
  return last;
};

function chatMessagesOf(sessionId: string): Array<{ id: string; role: string; content: string; claimed_at: string | null }> {
  const db = openLocalD1();
  try {
    return db.prepare('SELECT id, role, content, claimed_at FROM chat_messages WHERE session_id = ? ORDER BY created_at, rowid').all(sessionId) as
      Array<{ id: string; role: string; content: string; claimed_at: string | null }>;
  } finally {
    db.close();
  }
}

/** What follows one user message in the stored history, up to the next user message. */
function repliesAfter(sessionId: string, messageId: string) {
  const rows = chatMessagesOf(sessionId);
  const at = rows.findIndex((row) => row.id === messageId);
  if (at === -1) return null;
  const next = rows.findIndex((row, index) => index > at && row.role === 'user');
  return { turn: rows[at], replies: rows.slice(at + 1, next === -1 ? rows.length : next).filter((row) => row.role === 'assistant') };
}

function ledgerRows(userId: string, since: string): Array<{ provider: string; status: string; error_kind: string | null; operation: string; output_tokens: number | null; provider_usage: string | null; request_execution_id: string }> {
  const db = openLocalD1();
  try {
    return db.prepare(`SELECT provider, status, error_kind, operation, output_tokens, provider_usage, request_execution_id
      FROM llm_generations WHERE user_id = ? AND feature = 'chat' AND started_at >= ? ORDER BY started_at, rowid`).all(userId, since) as
      Array<{ provider: string; status: string; error_kind: string | null; operation: string; output_tokens: number | null; provider_usage: string | null; request_execution_id: string }>;
  } finally {
    db.close();
  }
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

/** Long German notes as already-answered history rows, so the next turn's projected input passes 75k. */
function seedLongHistory(userId: string, sessionId: string, notes: number): void {
  const db = openLocalD1();
  try {
    const insert = db.prepare(`INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at, claimed_at)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`);
    const base = Date.now();
    for (let n = 0; n < notes; n += 1) {
      const sentence = `Notizen zum Lebenslauf, Teil ${n + 1}: acht Jahre Konzerncontrolling, Monatsabschluesse fuer drei Werke, rollierende Prognose in SAP und Power BI. `;
      const note = sentence.repeat(Math.ceil(11_000 / sentence.length)).slice(0, 11_000);
      const at = new Date(base + n * 2).toISOString();
      insert.run(`msg-seed-${base}-${n}-u`, sessionId, userId, 'user', note, at, at);
      insert.run(`msg-seed-${base}-${n}-a`, sessionId, userId, 'assistant', 'Okay, notiert.', new Date(base + n * 2 + 1).toISOString(), null);
    }
  } finally {
    db.close();
  }
}

const chatCallsSince = async (since: string): Promise<FakeCall[]> =>
  (await fakeCalls()).filter((call) => call.kind === 'messages' && call.writer === 'chat' && call.at >= since);

interface FrameSample { t: number; count: number; len: number; top: number | null; scrollTop: number; stopped: number; thinking: boolean; status: boolean }

/** Samples every animation frame of the chat scroller: the new reply bubbles that contain `mark`, and where they sit. */
async function startSampling(page: Page, mark: string): Promise<void> {
  await page.evaluate((needle) => {
    const w = window as unknown as { __samples: FrameSample[]; __sampling: boolean };
    w.__samples = [];
    w.__sampling = true;
    const scroller = document.querySelector('[data-chat-scroll]') as HTMLElement;
    const matching = () => Array.from(scroller.querySelectorAll<HTMLElement>('.group\\/msg')).filter((el) => (el.textContent ?? '').includes(needle));
    // Replies already in the transcript (earlier turns) are not this turn's: only bubbles after them count.
    const before = matching().length;
    const tick = () => {
      const bubbles = matching().slice(before);
      const bubble = bubbles[0];
      w.__samples.push({
        t: performance.now(),
        count: bubbles.length,
        len: bubble ? (bubble.textContent ?? '').length : 0,
        top: bubble ? Math.round(bubble.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop) : null,
        scrollTop: Math.round(scroller.scrollTop),
        stopped: bubbles.filter((el) => (el.textContent ?? '').includes('Stopped')).length,
        thinking: (scroller.textContent ?? '').includes('Useful Apply is thinking...'),
        status: (scroller.textContent ?? '').includes('Checking your applications...'),
      });
      if (w.__sampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, mark);
}

async function stopSampling(page: Page): Promise<FrameSample[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __samples: FrameSample[]; __sampling: boolean };
    w.__sampling = false;
    return w.__samples;
  });
}

/** A page of the same signed-in user in a new context that records video (the run's frames). */
async function recordingPage(browser: Browser, signedIn: BrowserContext, user: TestUser, name: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${ARTIFACTS()}/video-${name}`;
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
    storageState: await signedIn.storageState(),
    recordVideo: { dir, size: { width: 1440, height: 900 } },
  });
  return { context, page: await context.newPage() };
}

const chatInput = (page: Page) => page.getByPlaceholder(/Ask for a change|Paste a job ad or ask anything/);
/** The chat bubbles that contain `text` (earlier turns' replies included: compare counts, never `.last()` alone). */
const bubblesWith = (page: Page, text: string) => page.locator('[data-chat-scroll] .group\\/msg', { hasText: text });

test.describe.serial('chat replies stream as they are written', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let user: TestUser;
  let sessionId: string;
  let companies: string[];

  test.beforeAll(async ({ browser: shared, request }) => {
    browser = shared;
    await fakeReset();
    ({ context, page, user } = await signedInPage(browser, request, 'streaming'));
    await generateKitThroughUi(page);
    const application = storedApplication(user.id);
    if (!application) throw new Error('the kit left no application row');
    sessionId = application.id;
    // The kit's own messages reach D1 through the client's debounced sync. Wait for them, so they never land between
    // a turn of this spec and its reply.
    await expect.poll(() => chatMessagesOf(sessionId).some((row) => row.content.includes('Your kit for Northwind Foods is ready')), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(1_500);
    seedApplication(user.id, 'Bosch', 'Systems Analyst');
    seedApplication(user.id, 'Zapier', 'Finance Lead');
    companies = ['Northwind Foods', 'Bosch', 'Zapier'];
  });

  test.afterEach(async () => {
    await fakeControl({});
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('a German question with a tool round mid-reply streams the opening, the status, then the answer, and stores it once', async () => {
    await fakeControl({ streamChunkMs: 40 });
    const since = new Date().toISOString();
    const result = await streamTurn(context, sessionId, QUESTION);
    expect(result.status).toBe(200);
    expect(result.contentType).toContain('text/event-stream');
    const { events } = result;
    const order = events.filter((event) => event.type !== 'ping').map((event) => event.type);
    const statusAt = order.indexOf('status');
    // The opening line, then the tool status, then the answer: text on both sides of the tool round.
    expect(order.slice(0, statusAt).every((type) => type === 'delta') && statusAt > 0, order.join(',')).toBe(true);
    expect(events.find((event) => event.type === 'status')?.text).toBe('Checking your applications');
    expect(order.at(-1)).toBe('done');
    const answerDeltas = deltasOf(events.slice(events.findIndex((event) => event.type === 'status')));
    // Written a sentence at a time while the model writes: several deltas, spread over time, not one burst.
    expect(answerDeltas.length).toBeGreaterThanOrEqual(4);
    expect(answerDeltas.at(-1)!.at - answerDeltas[0].at).toBeGreaterThan(300);
    const done = finalOf(events);
    // `done` carries the whole reply, and the deltas add up to it exactly: nothing shown that the reply lost.
    const reply = String(done.reply);
    expect(streamedText(events)).toBe(reply);
    expect(reply.startsWith(`${MARK}\n\nDu hast ${companies.length} Bewerbungen`)).toBe(true);
    for (const company of companies) expect(reply).toContain(company);
    // The long dash in the model's text never reached the client, in a delta or the reply.
    expect(reply).not.toContain('—');
    expect(reply).toContain('noch offen, dort wartest du');
    // Stored once, as streamed, under the id done names; the user's turn claimed.
    const stored = repliesAfter(sessionId, result.messageId);
    expect(stored?.turn.claimed_at).not.toBeNull();
    expect(stored?.replies).toHaveLength(1);
    expect(stored?.replies[0].id).toBe(done.replyMessageId);
    expect(stored?.replies[0].content).toBe(reply);
    // Two streamed model calls, the second carrying the tool result and the thinking block back (the fake checks it).
    const calls = await chatCallsSince(since);
    expect(calls.map((call) => [call.provider, call.stream, call.status])).toEqual([['anthropic', true, 200], ['anthropic', true, 200]]);
    expect(calls[1].toolResults.length).toBe(1);
    // The cache layout is the one the non-streamed chat sends (appendToolRound, unchanged): two 1h system markers, the
    // 5m marker on the new turn, and on the tool round one more on the last tool result.
    expect(calls.map((call) => call.markers.map((marker) => `${marker.where}:${marker.ttl}`))).toEqual([
      ['system:1h', 'system:1h', 'message:5m'],
      ['system:1h', 'system:1h', 'message:5m', 'message:5m'],
    ]);
    expect(calls[1].usage?.cacheRead ?? 0).toBeGreaterThan(0);
    // Ledger: one completed row per call, with the usage the stream reported (iterations included).
    const rows = ledgerRows(user.id, since);
    expect(rows.map((row) => [row.provider, row.status, row.operation])).toEqual([
      ['anthropic', 'response_received', 'general_chat'],
      ['anthropic', 'response_received', 'tool_call:get_applications'],
    ]);
    expect(new Set(rows.map((row) => row.request_execution_id)).size).toBe(1);
    for (const row of rows) {
      expect(row.output_tokens ?? 0).toBeGreaterThan(1);
      expect(JSON.parse(row.provider_usage ?? '{}').iterations).toHaveLength(1);
    }
  });

  test('a 529 before the first byte fails over to Bedrock, and text the client never saw is not shown twice', async () => {
    // The first Anthropic stream breaks after its first chunk, which ends mid-sentence, so nothing was sent on yet.
    await fakeControl({ streamFault: { kind: 'error', when: 'after_text', count: 1, writer: 'chat' } });
    let since = new Date().toISOString();
    const buffered = await streamTurn(context, sessionId, QUESTION);
    const bufferedDone = finalOf(buffered.events);
    expect(bufferedDone.type).toBe('done');
    expect(String(bufferedDone.reply).split(MARK)).toHaveLength(2);
    expect(streamedText(buffered.events)).toBe(bufferedDone.reply);
    let calls = await chatCallsSince(since);
    expect(calls.map((call) => [call.provider, call.streamFault])).toEqual([['anthropic', 'error'], ['bedrock', null], ['bedrock', null]]);

    // A 529 answered before any byte (twice: the SDK retries once): Bedrock answers the whole turn.
    await fakeControl({ primaryFail: { status: 529, count: 2, writer: 'chat' } });
    since = new Date().toISOString();
    const result = await streamTurn(context, sessionId, 'Danke dir!');
    const done = finalOf(result.events);
    expect(done.type).toBe('done');
    expect(done.reply).toBe("You're welcome.");
    expect(streamedText(result.events)).toBe("You're welcome.");
    calls = await chatCallsSince(since);
    expect(calls.map((call) => [call.provider, call.status])).toEqual([['anthropic', 529], ['anthropic', 529], ['bedrock', 200]]);
    expect(repliesAfter(sessionId, result.messageId)?.replies.map((row) => row.content)).toEqual(["You're welcome."]);
    const rows = ledgerRows(user.id, since);
    expect(rows.map((row) => [row.provider, row.status, row.error_kind])).toEqual([
      ['anthropic', 'failed', 'overloaded'],
      ['bedrock', 'response_received', null],
    ]);
  });

  test('a 500 after the first bytes ends with an error event: no failover, nothing stored as the reply, the next turn works', async () => {
    // The answer round breaks after six chunks: its first sentence is already on the client.
    await fakeControl({ streamChunkMs: 30, streamFault: { kind: 'error', when: 'after_text', afterChunks: 6, skip: 1, count: 1, writer: 'chat' } });
    const since = new Date().toISOString();
    const result = await streamTurn(context, sessionId, QUESTION);
    const last = finalOf(result.events);
    expect(last.type).toBe('error');
    expect(last.code).toBe('CHAT_STREAM_INTERRUPTED');
    expect(last.status).toBe(502);
    expect(result.events.some((event) => event.type === 'done')).toBe(false);
    expect(streamedText(result.events)).toContain('Du hast');
    // No Bedrock call after text went out: a second provider would write a different answer under the first's opening.
    const calls = await chatCallsSince(since);
    expect(calls.map((call) => [call.provider, call.streamFault])).toEqual([['anthropic', null], ['anthropic', 'error']]);
    const stored = repliesAfter(sessionId, result.messageId);
    expect(stored?.turn.claimed_at, 'the turn stays claimed').not.toBeNull();
    expect(stored?.replies, 'nothing stored as the reply').toHaveLength(0);
    const rows = ledgerRows(user.id, since);
    expect(rows.map((row) => [row.status, row.error_kind])).toEqual([['response_received', null], ['failed', 'server_error']]);

    const next = await streamTurn(context, sessionId, 'Danke, das reicht.');
    expect(finalOf(next.events).type).toBe('done');
    expect(repliesAfter(sessionId, next.messageId)?.replies).toHaveLength(1);
  });

  test('a request without the event-stream Accept header (a tab from before streaming) gets the JSON body', async () => {
    for (const accept of [null, 'application/json', '*/*']) {
      const result = await streamTurn(context, sessionId, 'Danke!', { accept });
      expect(result.contentType, String(accept)).toContain('application/json');
      expect(result.status).toBe(200);
      expect(result.json?.reply).toBe("You're welcome.");
      expect(repliesAfter(sessionId, result.messageId)?.replies.map((row) => row.id)).toEqual([result.json?.replyMessageId]);
    }
  });

  for (const run of ['cold', 'warm-1', 'warm-2']) {
    test(`the reply streams into one bubble that never moves or doubles (${run} run, recorded)`, async () => {
      await fakeControl({ streamChunkMs: 70 });
      const recording = await recordingPage(browser, context, user, run);
      const recPage = recording.page;
      try {
        await openApplication(recPage);
        await recPage.waitForTimeout(500);
        await startSampling(recPage, MARK);
        const replied = recPage.waitForResponse((response) => response.url().endsWith('/api/chat') && response.request().method() === 'POST');
        await chatInput(recPage).fill(QUESTION);
        await chatInput(recPage).press('Enter');
        const response = await replied;
        expect(response.headers()['content-type']).toContain('text/event-stream');
        await response.finished();
        await expect(recPage.getByText(`Du hast ${companies.length} Bewerbungen`).first()).toBeVisible();
        await recPage.waitForTimeout(800);
        const samples = await stopSampling(recPage);
        const shown = samples.filter((sample) => sample.count > 0);
        // The status line showed under the opening line while the tool round ran, and was gone once the answer came.
        expect(shown.some((sample) => sample.status)).toBe(true);
        expect(samples.at(-1)?.status).toBe(false);
        // Every frame: at most one bubble with this reply, never two (the streamed bubble and the stored message).
        expect(Math.max(...samples.map((sample) => sample.count))).toBe(1);
        // The text grew over many frames before the reply landed, never shrinking.
        const lengths = [...new Set(shown.map((sample) => sample.len))];
        expect(lengths.length).toBeGreaterThanOrEqual(5);
        for (let i = 1; i < shown.length; i += 1) expect(shown[i].len, `frame ${i}`).toBeGreaterThanOrEqual(shown[i - 1].len);
        // Once the reply shows, the generic typing indicator never comes back (a frame of it under the landed reply).
        const firstShown = samples.findIndex((sample) => sample.count > 0);
        expect(samples.slice(firstShown).filter((sample) => sample.thinking)).toHaveLength(0);
        // The bubble sits at one place in the conversation from its first frame to the last: no jump at the swap.
        expect(new Set(shown.map((sample) => sample.top)).size, JSON.stringify([...new Set(shown.map((sample) => sample.top))])).toBe(1);
        const finalText = await recPage.locator('[data-chat-scroll] .group\\/msg', { hasText: MARK }).last().innerText();
        expect(finalText).toContain('noch offen, dort wartest du');
        await recPage.screenshot({ path: test.info().outputPath(`after-${run}.png`) });
      } finally {
        await recording.context.close();
      }
    });
  }

  test('scrolling up mid-stream is left alone: no delta and no landing reply pulls the reader back', async () => {
    await fakeControl({ streamChunkMs: 150 });
    await openApplication(page);
    const scroller = page.locator('[data-chat-scroll]');
    const answers = bubblesWith(page, `Du hast ${companies.length} Bewerbungen im Tracker`);
    const shownBefore = await answers.count();
    await startSampling(page, MARK);
    const replied = page.waitForResponse((response) => response.url().endsWith('/api/chat') && response.request().method() === 'POST');
    await chatInput(page).fill(QUESTION);
    await chatInput(page).press('Enter');
    // Mid-stream: this turn's bubble has its first answer sentence, and the rest is still coming (150 ms a chunk).
    await expect(answers).toHaveCount(shownBefore + 1, { timeout: 30_000 });
    await scroller.hover();
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(300);
    const held = await scroller.evaluate((el) => el.scrollTop);
    const scrolledAt = await page.evaluate(() => performance.now());
    expect(held, 'the reader is above the bottom').toBeLessThan(await scroller.evaluate((el) => el.scrollHeight - el.clientHeight - 100));
    await (await replied).finished();
    await page.waitForTimeout(500);
    const samples = (await stopSampling(page)).filter((sample) => sample.t > scrolledAt);
    expect(samples.length).toBeGreaterThan(10);
    // Text kept arriving after the reader scrolled up, then the reply landed: the sampler saw both.
    expect(new Set(samples.map((sample) => sample.len)).size).toBeGreaterThan(3);
    for (const sample of samples) expect(sample.scrollTop).toBe(held);
  });

  test('Stop mid-stream keeps what was shown on screen; the route finishes the turn and stores the whole reply once', async () => {
    await fakeControl({ streamChunkMs: 250 });
    await openApplication(page);
    const before = chatMessagesOf(sessionId).length;
    const answers = bubblesWith(page, `Du hast ${companies.length} Bewerbungen im Tracker`);
    const shownBefore = await answers.count();
    await chatInput(page).fill(QUESTION);
    await chatInput(page).press('Enter');
    // This turn's bubble, with the answer's first sentence on it, mid-stream.
    await expect(answers).toHaveCount(shownBefore + 1, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Stop generation' }).click();
    const stopped = bubblesWith(page, 'Stopped').last();
    await expect(stopped).toContainText(MARK);
    const shownText = await stopped.innerText();
    expect(shownText).not.toContain('Ich kann dir auch zeigen');
    await expect(page.getByText(/Generation stopped/)).toHaveCount(0);
    // The input is free again right away.
    await expect(page.getByRole('button', { name: 'Stop generation' })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('stopped.png') });

    // The route finished the turn without the client: the whole reply, once, after the question. Nothing of the
    // stopped bubble was written (its text is a prefix of the stored reply, and it never syncs).
    const full = () => {
      const rows = chatMessagesOf(sessionId).slice(before);
      const asked = rows.findIndex((row) => row.role === 'user' && row.content === QUESTION);
      return { rows, asked, replies: rows.slice(asked + 1).filter((row) => row.role === 'assistant') };
    };
    await expect.poll(() => full().replies.length, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(2_500);
    const { rows, asked, replies } = full();
    expect(rows[asked].claimed_at).not.toBeNull();
    expect(replies).toHaveLength(1);
    expect(replies[0].content.endsWith('welche Bewerbung am besten zu deinem Profil passt.')).toBe(true);
    expect(replies[0].id.startsWith('msg-')).toBe(true);
    expect(rows.some((row) => row.id.startsWith('stopped-') || row.content.includes('Stopped'))).toBe(false);

    // A reload shows the stored reply in full where the stopped one was.
    await page.reload();
    await openApplication(page);
    await expect(bubblesWith(page, 'Stopped')).toHaveCount(0);
    await expect(bubblesWith(page, MARK).last()).toContainText('welche Bewerbung am besten zu deinem Profil passt.');

    await fakeControl({});
    await chatInput(page).fill('Okay, danke!');
    await chatInput(page).press('Enter');
    await expect(bubblesWith(page, "You're welcome.").last()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_500);
    const after = chatMessagesOf(sessionId).slice(before);
    const assistant = after.filter((row) => row.role === 'assistant');
    expect(assistant.map((row) => row.content)).toEqual([replies[0].content, "You're welcome."]);
  });

  test('a model stream idle past 60 s after text ends with the idle message, and nothing is stored', async () => {
    test.setTimeout(180_000);
    await fakeControl({ streamChunkMs: 30, streamFault: { kind: 'idle', when: 'after_text', afterChunks: 6, skip: 1, count: 1, writer: 'chat', idleMs: 70_000 } });
    await openApplication(page);
    const before = chatMessagesOf(sessionId).length;
    const answers = bubblesWith(page, `Du hast ${companies.length} Bewerbungen im Tracker`);
    const shownBefore = await answers.count();
    await chatInput(page).fill(QUESTION);
    await chatInput(page).press('Enter');
    await expect(answers).toHaveCount(shownBefore + 1, { timeout: 30_000 });
    await expect(page.getByText('The reply stopped coming for a minute, so I ended it. Your message is saved, so try again.'))
      .toBeVisible({ timeout: 90_000 });
    // The half-written bubble went with it.
    await expect(answers).toHaveCount(shownBefore);
    await page.screenshot({ path: test.info().outputPath('idle.png') });
    await page.waitForTimeout(2_500);
    const rows = chatMessagesOf(sessionId).slice(before);
    expect(rows.filter((row) => row.role === 'assistant').map((row) => row.content)).not.toContain(expect.stringContaining('Du hast'));
    expect(rows.filter((row) => row.role === 'user' && row.content === QUESTION)[0]?.claimed_at).not.toBeNull();
  });

  test('a long conversation compacts on the streamed turn: the divider appears and the reply still streams', async () => {
    seedLongHistory(user.id, sessionId, 14);
    await fakeControl({ streamChunkMs: 40 });
    const since = new Date().toISOString();
    await page.reload();
    await openApplication(page);
    await startSampling(page, MARK);
    const replied = page.waitForResponse((response) => response.url().endsWith('/api/chat') && response.request().method() === 'POST');
    await chatInput(page).fill(QUESTION);
    await chatInput(page).press('Enter');
    await (await replied).finished();
    await expect(page.getByText(`Du hast ${companies.length} Bewerbungen`).last()).toBeVisible();
    await page.waitForTimeout(500);
    const samples = (await stopSampling(page)).filter((sample) => sample.count > 0);
    expect(new Set(samples.map((sample) => sample.len)).size).toBeGreaterThanOrEqual(4);
    await expect(page.getByRole('separator', { name: 'Earlier messages summarized' })).toHaveCount(1);
    const calls = await chatCallsSince(since);
    const compactions = (await fakeCalls()).filter((call) => call.at >= since && call.compaction);
    expect(compactions).toHaveLength(1);
    expect(compactions[0].stream).toBe(false);
    expect(calls.filter((call) => !call.compaction).every((call) => call.stream && call.blockTypes[0]?.[0] === 'compaction')).toBe(true);
    const db = openLocalD1();
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM chat_compactions WHERE session_id = ?').get(sessionId)).toEqual({ n: 1 });
    } finally {
      db.close();
    }
    await page.screenshot({ path: test.info().outputPath('compacted.png') });
  });
});
