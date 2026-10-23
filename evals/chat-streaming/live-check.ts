/**
 * Live check of streamed chat replies against the real Anthropic API, on a local production build.
 *
 *   npx opennextjs-cloudflare build
 *   npx opennextjs-cloudflare preview -- --port 8850 --var BETTER_AUTH_URL:http://localhost:8850   (real key from the Worker's own config)
 *   LIVE_BASE_URL=http://localhost:8850 npx tsx evals/chat-streaming/live-check.ts
 *
 * Three real turns on a seeded application with three tracker rows, read the way the browser reads them:
 *  1. a German question that needs the tracker (a tool round mid-reply), streamed;
 *  2. a German question answered in a few sentences without a tool, streamed;
 *  3. a short thanks with no Accept header, as a tab from before streaming sends it: it must come back as JSON.
 *
 * What it records (evals/results/2026-10-23-chat-streaming-live.json): every event with its arrival time, the time to
 * the first text, the reply against the deltas and against the stored row, the ledger rows and their list-price cost.
 * Local D1 only. Nothing here reads a secret.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openLocalD1 } from '../../e2e/lib/sqlite';
import { haiku55CostUsd } from '../../src/lib/models/anthropic';

const BASE_URL = process.env.LIVE_BASE_URL ?? 'http://localhost:8850';
// It seeds the local D1 file, so it only ever talks to a local preview.
if (!['localhost', '127.0.0.1'].includes(new URL(BASE_URL).hostname)) throw new Error(`live-check runs against a local preview only, not ${BASE_URL}`);
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'evals', 'results', '2026-10-23-chat-streaming-live.json');
// A throwaway account on the local D1, with a password made up for this run.
const PASSWORD = `Ls-${crypto.randomUUID()}-Aa1!`;

let cookie = '';
let ipCounter = 0;
const ip = () => `10.78.${Math.floor(Date.now() / 1000) % 250}.${(ipCounter += 1) % 250}`;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const address = ip();
  // The preview's own origin (BETTER_AUTH_URL), which Better Auth trusts: it refuses a cookie-carrying request without one.
  return { 'content-type': 'application/json', origin: BASE_URL, ...(cookie ? { cookie } : {}), 'cf-connecting-ip': address, 'x-forwarded-for': address, ...extra };
}

async function post(pathname: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${BASE_URL}${pathname}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) cookie = setCookie.map((value) => value.split(';')[0]).join('; ');
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

interface TimedEvent { type: string; atMs: number; [key: string]: unknown }

async function streamedTurn(sessionId: string, message: string, n: number) {
  const messageId = `msg-live-stream-${n}-${Date.now()}`;
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: headers({ accept: 'text/event-stream' }),
    body: JSON.stringify({ message, messageId, context: { hasCV: false, hasAnalysis: false, timeZone: 'Europe/Berlin', sessionId } }),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const headersAtMs = Date.now() - startedAt;
  if (!contentType.includes('text/event-stream') || !response.body) {
    throw new Error(`turn ${n}: expected an event stream, got ${response.status} ${contentType}: ${(await response.text()).slice(0, 300)}`);
  }
  const events: TimedEvent[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      if (frame.startsWith('data: ')) events.push({ ...(JSON.parse(frame.slice(6)) as { type: string }), atMs: Date.now() - startedAt });
    }
  }
  const deltas = events.filter((event) => event.type === 'delta');
  const done = events.find((event) => event.type === 'done');
  const streamed = deltas.map((event) => String(event.text)).join('');
  return {
    message,
    messageId,
    status: response.status,
    headersAtMs,
    firstDeltaAtMs: deltas[0]?.atMs ?? null,
    statusEvents: events.filter((event) => event.type === 'status').map((event) => ({ text: event.text, atMs: event.atMs })),
    deltaCount: deltas.length,
    lastDeltaAtMs: deltas.at(-1)?.atMs ?? null,
    endAtMs: Date.now() - startedAt,
    final: done ? 'done' : events.at(-1)?.type ?? 'nothing',
    reply: done?.reply ?? null,
    replyMessageId: done?.replyMessageId ?? null,
    deltasEqualReply: done ? streamed === done.reply : false,
    events,
  };
}

async function main(): Promise<void> {
  const email = `live-streaming-${Date.now().toString(36)}@test.local`;
  const signUp = await post('/api/auth/sign-up/email', { email, password: PASSWORD, name: 'Live Check' });
  if (signUp.status !== 200) throw new Error(`sign-up ${signUp.status}: ${JSON.stringify(signUp.json).slice(0, 300)}`);
  const userId = (signUp.json.user as { id: string }).id;
  const sessionId = crypto.randomUUID();
  const db = openLocalD1();
  try {
    db.prepare('UPDATE user SET email_verified = 1 WHERE id = ?').run(userId);
    const insertSession = db.prepare(`
      INSERT INTO application_sessions
        (id, user_id, job_title, company, job_description, matching_skills, missing_skills, suggestions, cv_edits,
         generated_cv, status, generation_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Seeded posting', '[]', '[]', '[]', '[]', NULL, ?, 'none', ?, ?)
    `);
    const day = 86_400_000;
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
    insertSession.run(sessionId, userId, 'Controller', 'Northwind Foods', 'drafted', at(0), at(0));
    insertSession.run(crypto.randomUUID(), userId, 'Systems Analyst', 'Bosch', 'applied', at(9), at(9));
    insertSession.run(crypto.randomUUID(), userId, 'Finance Lead', 'Zapier', 'interview', at(4), at(4));
  } finally {
    db.close();
  }
  const signIn = await post('/api/auth/sign-in/email', { email, password: PASSWORD });
  if (signIn.status !== 200) throw new Error(`sign-in ${signIn.status}`);

  const turns = [
    await streamedTurn(sessionId, 'Wie viele Bewerbungen habe ich gerade, und bei welcher bin ich am weitesten?', 1),
    await streamedTurn(sessionId, 'Wie formuliere ich eine freundliche Nachfrage bei Bosch, wenn ich seit neun Tagen nichts gehoert habe? Gib mir drei kurze Tipps.', 2),
  ];
  const legacy = await post('/api/chat', {
    message: 'Danke dir!',
    messageId: `msg-live-json-${Date.now()}`,
    context: { hasCV: false, hasAnalysis: false, timeZone: 'Europe/Berlin', sessionId },
  });

  const read = openLocalD1();
  try {
    const stored = read.prepare('SELECT id, role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at, rowid').all(sessionId) as
      Array<{ id: string; role: string; content: string }>;
    const ledger = read.prepare(`
      SELECT operation, provider, model, status, error_kind, usage_reported, input_tokens, output_tokens,
             cache_read_input_tokens, cache_write_input_tokens, latency_ms, provider_usage, request_execution_id
      FROM llm_generations WHERE user_id = ? ORDER BY started_at
    `).all(userId) as Array<Record<string, unknown>>;
    const rows = ledger.map((row) => {
      const usage = row.provider_usage ? JSON.parse(String(row.provider_usage)) : null;
      return { ...row, provider_usage: undefined, iterations: usage?.iterations?.map((it: { type: string }) => it.type) ?? null, costUsd: usage ? haiku55CostUsd(usage).totalCostUsd : null };
    });
    const result = {
      ranAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      turns: turns.map((turn) => ({
        ...turn,
        storedReplyMatches: stored.some((row) => row.id === turn.replyMessageId && row.role === 'assistant' && row.content === turn.reply),
      })),
      legacyJsonTurn: { status: legacy.status, keys: Object.keys(legacy.json).sort(), reply: legacy.json.reply, stored: stored.some((row) => row.id === legacy.json.replyMessageId) },
      ledger: rows,
      totalCostUsd: rows.reduce((sum, row) => sum + (typeof row.costUsd === 'number' ? row.costUsd : 0), 0),
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ ...result, turns: result.turns.map(({ events, ...rest }) => ({ ...rest, events: events.length })) }, null, 2));
  } finally {
    read.close();
  }
}

void main();
