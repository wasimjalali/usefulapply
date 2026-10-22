/**
 * P0b caching probe for Claude Haiku 5.5 and Claude Sonnet 5.5 (2026-10-22).
 *
 * Question: how does prompt caching behave on the two models we will run, for the layouts the app plans to
 * use (see .claude/rules/prompt-caching.md): pre-warm with max_tokens 0, parallel fan-out, effort and
 * tool_choice changes, mid-conversation system messages, mixed TTLs, chat growth, cache diagnostics and a
 * prefix shared by two call sites.
 *
 *   npx tsx evals/haiku-55-swap/cache-probe.ts
 *   PROBES=3b npx tsx evals/haiku-55-swap/cache-probe.ts   (run only the listed steps, e.g. 3b,8)
 *
 * Writes evals/results/2026-10-22-haiku-55-swap/p0b-cache-probe-<timestamp>.json (never overwrites an
 * earlier run; no headers, no key). Paid: well under $1. Aborts above MAX_SPEND_USD.
 *
 * Request shape follows src/lib/models/anthropic.ts (adaptive thinking, output_config.effort low, no
 * temperature). @anthropic-ai/sdk 0.71.2 has no typed `cache_control` at the top level, `diagnostics`,
 * `output_config` or `role: "system"` messages, so requests are cast; the SDK forwards unknown body fields.
 *
 * Every probe prefix is over 512 tokens (a ~2.6k-token system block plus a small tool) and starts with a
 * unique nonce, so no probe can read another probe's cache entry.
 *
 * Credentials: loads .env.local / .dev.vars from the cwd or the main checkout (never printed).
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'evals', 'results', '2026-10-22-haiku-55-swap');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const MAX_SPEND_USD = 0.9;

type R = Record<string, unknown>;
const rec = (v: unknown): R => (v !== null && typeof v === 'object' ? (v as R) : {});
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function loadEnv(): void {
  const mainCheckout = path.resolve(ROOT, '..', '..', '..');
  for (const file of [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.dev.vars'),
    path.join(mainCheckout, '.env.local'),
    path.join(mainCheckout, '.dev.vars'),
  ]) {
    try {
      process.loadEnvFile(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') console.warn(`env file ${path.basename(file)} not loaded: ${code ?? 'unknown error'}`);
    }
  }
}
loadEnv();
if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in .env.local or .dev.vars');
// maxRetries 0: a 429 or 5xx is a result worth seeing, not something to hide behind a retry.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });

// -----------------------------------------------------
// Models and prices (USD per million tokens, prompts up to 100k)
// -----------------------------------------------------

interface Model {
  key: 'haiku' | 'sonnet';
  id: string;
  price: { input: number; output: number; write5m: number; write1h: number; read: number };
}
const HAIKU: Model = { key: 'haiku', id: 'claude-haiku-5-5', price: { input: 0.1, output: 0.5, write5m: 0.125, write1h: 0.2, read: 0.01 } };
const SONNET: Model = { key: 'sonnet', id: 'claude-sonnet-5-5', price: { input: 2, output: 10, write5m: 2.5, write1h: 4, read: 0.1 } };

// -----------------------------------------------------
// Bookkeeping
// -----------------------------------------------------

let spendUsd = 0;
function costOf(m: Model, usage: R): number {
  const cc = rec(usage.cache_creation);
  const write = num(usage.cache_creation_input_tokens);
  const w5m = 'ephemeral_5m_input_tokens' in cc ? num(cc.ephemeral_5m_input_tokens) : write;
  const w1h = num(cc.ephemeral_1h_input_tokens);
  return (
    (num(usage.input_tokens) * m.price.input +
      num(usage.output_tokens) * m.price.output +
      w5m * m.price.write5m +
      w1h * m.price.write1h +
      num(usage.cache_read_input_tokens) * m.price.read) /
    1e6
  );
}
function addSpend(cost: number): void {
  spendUsd += cost;
  if (spendUsd > MAX_SPEND_USD) throw new Error(`Probe spend ${spendUsd.toFixed(4)} passed the cap ${MAX_SPEND_USD}`);
}

/** Strips signatures and truncates long strings so raw results stay readable. */
function slim(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 1500 ? `${value.slice(0, 1500)}...[${value.length} chars]` : value;
  if (Array.isArray(value)) return value.map(slim);
  if (value !== null && typeof value === 'object') {
    const out: R = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = k === 'signature' && typeof v === 'string' ? `<signature ${v.length} chars>` : slim(v);
    }
    return out;
  }
  return value;
}

/** Request summary for the raw file: shapes, lengths and markers, not the 10 kB of fixture text. */
function summarize(params: R): R {
  const blockSummary = (b: unknown): R => {
    const x = rec(b);
    return { type: x.type, chars: typeof x.text === 'string' ? x.text.length : undefined, ...(x.cache_control ? { cache_control: x.cache_control } : {}) };
  };
  return {
    model: params.model,
    max_tokens: params.max_tokens,
    thinking: params.thinking,
    output_config: params.output_config,
    tool_choice: params.tool_choice,
    cache_control: params.cache_control,
    diagnostics: params.diagnostics,
    tools: arr(params.tools).map((t) => rec(t).name),
    system: Array.isArray(params.system) ? params.system.map(blockSummary) : params.system,
    messages: arr(params.messages).map((msg) => {
      const x = rec(msg);
      return { role: x.role, content: Array.isArray(x.content) ? x.content.map(blockSummary) : { chars: String(x.content).length } };
    }),
  };
}

interface Attempt {
  model: Model['key'];
  probe: number;
  step: string;
  ok: boolean;
  status: number | null;
  error?: string;
  latencyMs: number;
  costUsd: number;
  request: R;
  body?: R;
}
const attempts: Attempt[] = [];

function errorMessage(error: unknown): { status: number | null; message: string } {
  if (error instanceof Anthropic.APIError) {
    const inner = rec(rec(error.error).error);
    return { status: error.status ?? null, message: typeof inner.message === 'string' ? inner.message : error.message };
  }
  return { status: null, message: error instanceof Error ? error.message : String(error) };
}

function newAttempt(m: Model, probe: number, step: string, params: R): Attempt {
  return { model: m.key, probe, step, ok: false, status: null, latencyMs: 0, costUsd: 0, request: summarize(params) };
}

async function send(m: Model, probe: number, step: string, params: R): Promise<Attempt> {
  const started = Date.now();
  const a = newAttempt(m, probe, step, params);
  try {
    const msg = await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
    a.ok = true;
    a.status = 200;
    a.body = JSON.parse(JSON.stringify(msg)) as R;
    a.costUsd = costOf(m, rec(a.body.usage));
    addSpend(a.costUsd);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Probe spend')) throw error;
    const { status, message } = errorMessage(error);
    a.status = status;
    a.error = message;
  }
  a.latencyMs = Date.now() - started;
  attempts.push(a);
  return a;
}

/** Streams a call; `started` resolves on message_start (or on failure) so a caller can launch more calls. */
function sendStream(m: Model, probe: number, step: string, params: R): { started: Promise<void>; done: Promise<Attempt> } {
  const t0 = Date.now();
  const a = newAttempt(m, probe, step, params);
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const done = (async (): Promise<Attempt> => {
    try {
      const stream = client.messages.stream(params as unknown as Anthropic.MessageStreamParams);
      stream.on('streamEvent', (event) => {
        if (event.type === 'message_start') {
          a.request = { ...a.request, messageStartMs: Date.now() - t0 };
          markStarted();
        }
      });
      const msg = await stream.finalMessage();
      a.ok = true;
      a.status = 200;
      a.body = JSON.parse(JSON.stringify(msg)) as R;
      a.costUsd = costOf(m, rec(a.body.usage));
      addSpend(a.costUsd);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Probe spend')) throw error;
      const { status, message } = errorMessage(error);
      a.status = status;
      a.error = message;
    } finally {
      markStarted();
    }
    a.latencyMs = Date.now() - t0;
    attempts.push(a);
    return a;
  })();
  return { started, done };
}

interface Row {
  step: string;
  ok: boolean;
  status: number | null;
  error?: string;
  input?: number;
  write?: number;
  read?: number;
  write5m?: number;
  write1h?: number;
  output?: number;
  note?: string;
  diagnostics?: unknown;
}
function row(a: Attempt, note?: string): Row {
  if (!a.ok) return { step: a.step, ok: false, status: a.status, error: a.error, ...(note && { note }) };
  const usage = rec(a.body?.usage);
  const cc = rec(usage.cache_creation);
  return {
    step: a.step,
    ok: true,
    status: a.status,
    input: num(usage.input_tokens),
    write: num(usage.cache_creation_input_tokens),
    read: num(usage.cache_read_input_tokens),
    write5m: 'ephemeral_5m_input_tokens' in cc ? num(cc.ephemeral_5m_input_tokens) : undefined,
    write1h: 'ephemeral_1h_input_tokens' in cc ? num(cc.ephemeral_1h_input_tokens) : undefined,
    output: num(usage.output_tokens),
    ...('diagnostics' in (a.body ?? {}) ? { diagnostics: a.body?.diagnostics } : {}),
    ...(note && { note }),
  };
}

interface ProbeResult {
  id: number;
  name: string;
  model: Model['key'];
  rows: Row[];
  findings: string[];
}
const results: ProbeResult[] = [];

// -----------------------------------------------------
// Fixtures (public ads and constructed CVs from evals/dataset)
// -----------------------------------------------------

interface DatasetCase {
  id: string;
  language: 'en' | 'de';
  origin: string;
  jd?: string;
  cv_ref: string;
}
const cases: DatasetCase[] = fs
  .readFileSync(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as DatasetCase)
  .filter((c) => c.origin === 'synthetic' && c.jd && c.language === 'en');
const cvText = (ref: string): string => fs.readFileSync(path.join(ROOT, 'evals', 'dataset', 'cvs', `${ref.replace(/^cv:/, '')}.txt`), 'utf8');

const SHARED_BODY = [`## Job description A\n${cases[0].jd}`, `## Candidate CV\n${cvText(cases[0].cv_ref)}`].join('\n\n');
const SECOND_AD = `Here is a second job ad I am considering:\n\n${cases[1].jd}\n\nAcknowledge in one word.`;
const sharedSystem = (nonce: string): string => `[${nonce}] You answer questions about the candidate below. Keep every answer to one or two short sentences.\n\n${SHARED_BODY}`;

const EPHEMERAL = { type: 'ephemeral' };
const EPHEMERAL_1H = { type: 'ephemeral', ttl: '1h' };
const txt = (text: string, cc?: R): R => ({ type: 'text', text, ...(cc && { cache_control: cc }) });
const um = (text: string, cc?: R): R => ({ role: 'user', content: [txt(text, cc)] });
const am = (text: string): R => ({ role: 'assistant', content: [txt(text)] });
const sysMsg = (text: string): R => ({ role: 'system', content: text });
/** The assistant turn from a response, passed back unchanged (thinking blocks included). */
const asst = (a: Attempt): R => {
  const content = arr(a.body?.content);
  return { role: 'assistant', content: content.length ? content : [txt('Noted.')] };
};
const textOf = (a: Attempt): string =>
  arr(a.body?.content)
    .map((b) => (rec(b).type === 'text' ? String(rec(b).text) : ''))
    .join('');

function tools(description = 'Read one tracked job application by id.'): R[] {
  return [
    {
      name: 'get_application',
      description,
      input_schema: {
        type: 'object',
        properties: { application_id: { type: 'string' }, fields: { type: 'array', items: { type: 'string', enum: ['status', 'company', 'interview_at'] } } },
        required: ['application_id'],
        additionalProperties: false,
      },
    },
  ];
}

const FORMAT = {
  type: 'json_schema',
  schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false },
};

interface Opts {
  system: R[];
  messages: R[];
  effort?: string;
  thinking?: 'adaptive' | 'none' | 'disabled';
  withTools?: boolean;
  toolDescription?: string;
  toolChoice?: R;
  topCache?: R;
  format?: R;
  maxTokens?: number;
  diag?: string | null;
  effortOmitted?: boolean;
}
/** The anthropic.ts Sonnet 5.5 request shape: adaptive thinking, effort low, no temperature. */
function req(m: Model, o: Opts): R {
  const thinking = o.thinking ?? 'adaptive';
  const outputConfig: R = { ...(o.effortOmitted ? {} : { effort: o.effort ?? 'low' }), ...(o.format && { format: o.format }) };
  return {
    model: m.id,
    max_tokens: o.maxTokens ?? 3000,
    system: o.system,
    messages: o.messages,
    ...(o.withTools !== false && { tools: tools(o.toolDescription) }),
    ...(o.toolChoice && { tool_choice: o.toolChoice }),
    ...(thinking === 'adaptive' && { thinking: { type: 'adaptive' } }),
    ...(thinking === 'disabled' && { thinking: { type: 'disabled' } }),
    ...(Object.keys(outputConfig).length > 0 && { output_config: outputConfig }),
    ...(o.topCache && { cache_control: o.topCache }),
    ...(o.diag !== undefined && { diagnostics: { previous_message_id: o.diag } }),
  };
}

let nonceCounter = 0;
const nonceFor = (m: Model, probe: string): string => `cache-probe ${RUN_ID} ${m.key} ${probe} #${++nonceCounter}`;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const Q_TITLE = 'What was the candidate\'s most recent job title? One sentence.';
const makeResult = (id: number, name: string, m: Model): ProbeResult => ({ id, name, model: m.key, rows: [], findings: [] });

// Three messages: a long first turn (the second ad, ~1.4k tokens), a short assistant turn, a question.
const conv = (cc?: R): R[] => [um(SECOND_AD), am('Noted.'), um('Which of the two ads fits the candidate better? One sentence.', cc)];

// -----------------------------------------------------
// 1. Pre-warm with max_tokens 0
// -----------------------------------------------------

async function probePrewarm(m: Model): Promise<void> {
  const r = makeResult(1, 'Pre-warm (max_tokens 0)', m);
  results.push(r);
  const sys = [txt(sharedSystem(nonceFor(m, 'p1a')), EPHEMERAL)];

  const warm = await send(m, 1, '1a warm: max_tokens 0, adaptive, effort low, marker on system', { ...req(m, { system: sys, messages: [um('warmup')] }), max_tokens: 0 });
  r.rows.push(row(warm, `stop_reason ${String(warm.body?.stop_reason)}, content blocks ${arr(warm.body?.content).length}`));
  const real = await send(m, 1, '1a real call, same prefix, reads the warm entry', req(m, { system: sys, messages: [um(Q_TITLE)] }));
  r.rows.push(row(real));

  const warmFormat = await send(m, 1, '1b warm WITH output_config.format (docs: rejected)', { ...req(m, { system: sys, messages: [um('warmup')], format: FORMAT }), max_tokens: 0 });
  r.rows.push(row(warmFormat));

  const realFormat = await send(m, 1, '1c real call WITH format against the 1a entry written without format', req(m, { system: sys, messages: [um(Q_TITLE)], format: FORMAT }));
  r.rows.push(row(realFormat, `answer: ${textOf(realFormat).slice(0, 80)}`));

  const sysB = [txt(sharedSystem(nonceFor(m, 'p1d')), EPHEMERAL)];
  const f1 = await send(m, 1, '1d format call, first (writes)', req(m, { system: sysB, messages: [um(Q_TITLE)], format: FORMAT }));
  r.rows.push(row(f1));
  const f2 = await send(m, 1, '1d format call, second (reads the format-written entry?)', req(m, { system: sysB, messages: [um('What is the candidate\'s name or top skill? One sentence.')], format: FORMAT }));
  r.rows.push(row(f2));

  const sysC = [txt(sharedSystem(nonceFor(m, 'p1e')), EPHEMERAL)];
  const warmNoThink = await send(m, 1, '1e warm WITHOUT thinking field (effort low)', { ...req(m, { system: sysC, messages: [um('warmup')], thinking: 'none' }), max_tokens: 0 });
  r.rows.push(row(warmNoThink));
  const realAdaptive = await send(m, 1, '1e real call WITH adaptive thinking (config mismatch)', req(m, { system: sysC, messages: [um(Q_TITLE)] }));
  r.rows.push(row(realAdaptive));

  const sysD = [txt(sharedSystem(nonceFor(m, 'p1f')), EPHEMERAL)];
  const warmEffort = await send(m, 1, '1f warm at effort medium', { ...req(m, { system: sysD, messages: [um('warmup')], effort: 'medium' }), max_tokens: 0 });
  r.rows.push(row(warmEffort));
  const realEffortLow = await send(m, 1, '1f real call at effort low (effort mismatch)', req(m, { system: sysD, messages: [um(Q_TITLE)] }));
  r.rows.push(row(realEffortLow));
}

// -----------------------------------------------------
// 2. Parallel fan-out
// -----------------------------------------------------

async function probeParallel(m: Model): Promise<void> {
  const r = makeResult(2, 'Parallel fan-out', m);
  results.push(r);
  const questions = ['What was the most recent job title? One sentence.', 'Name one skill from the CV. One sentence.', 'Which city is the job in? One sentence.'];
  const call = (sys: R[], q: string, step: string): Promise<Attempt> => send(m, 2, step, req(m, { system: sys, messages: [um(q)] }));

  const sysA = [txt(sharedSystem(nonceFor(m, 'p2a')), EPHEMERAL)];
  const a = await Promise.all(questions.map((q, i) => call(sysA, q, `2a all three at once, call ${i + 1}`)));
  a.forEach((x) => r.rows.push(row(x)));

  const sysB = [txt(sharedSystem(nonceFor(m, 'p2b')), EPHEMERAL)];
  const first = await call(sysB, questions[0], '2b first call, awaited to completion');
  r.rows.push(row(first));
  const rest = await Promise.all(questions.slice(1).map((q, i) => call(sysB, q, `2b rest at once after the first finished, call ${i + 2}`)));
  rest.forEach((x) => r.rows.push(row(x)));

  const sysC = [txt(sharedSystem(nonceFor(m, 'p2c')), EPHEMERAL)];
  const stream = sendStream(m, 2, '2c first call, streamed', req(m, { system: sysC, messages: [um(questions[0])] }));
  await stream.started;
  const rest2 = await Promise.all(questions.slice(1).map((q, i) => call(sysC, q, `2c rest launched at the first message_start, call ${i + 2}`)));
  const firstDone = await stream.done;
  r.rows.push(row(firstDone, `message_start at ${String(firstDone.request.messageStartMs)} ms, total ${firstDone.latencyMs} ms`));
  rest2.forEach((x) => r.rows.push(row(x)));
}

// -----------------------------------------------------
// 3 and 4. A change between two calls with the same prefix: what survives?
// -----------------------------------------------------

/**
 * call0 writes tools+system (S) with only the system marker, call1 adds a marker on the last message and
 * writes the messages part (M), then each change is sent against that entry. A read of S means
 * tools+system survived, S+M means nothing was invalidated, 0 means everything was.
 */
async function probeSplit(m: Model, id: number, name: string, seed: string, base: Partial<Opts>, changes: Array<{ step: string; over: Partial<Opts> }>): Promise<void> {
  const r = makeResult(id, name, m);
  results.push(r);
  const sys = [txt(sharedSystem(nonceFor(m, seed)), EPHEMERAL)];
  const c0 = await send(m, id, `${id}.0 write tools+system only (marker on system)`, req(m, { ...base, system: sys, messages: conv() }));
  const S = num(rec(c0.body?.usage).cache_creation_input_tokens);
  r.rows.push(row(c0, `S (tools+system) = ${S}`));
  const c1 = await send(m, id, `${id}.1 same, adding a marker on the last message`, req(m, { ...base, system: sys, messages: conv(EPHEMERAL) }));
  const M = num(rec(c1.body?.usage).cache_creation_input_tokens);
  r.rows.push(row(c1, `read ${num(rec(c1.body?.usage).cache_read_input_tokens)} (S), wrote M = ${M}`));
  for (const ch of changes) {
    const c = await send(m, id, `${id} ${ch.step}`, req(m, { ...base, ...ch.over, system: sys, messages: conv(EPHEMERAL) }));
    const read = num(rec(c.body?.usage).cache_read_input_tokens);
    const verdict = !c.ok ? 'request failed' : read === 0 ? 'everything invalidated' : Math.abs(read - S) <= 8 ? 'tools+system kept, messages invalidated' : Math.abs(read - S - M) <= 8 ? 'nothing invalidated' : `partial read (S=${S}, S+M=${S + M})`;
    r.rows.push(row(c, verdict));
    r.findings.push(`${ch.step}: ${verdict}`);
  }
}

// -----------------------------------------------------
// 5. Mid-conversation system message
// -----------------------------------------------------

async function probeSystemMessage(m: Model): Promise<void> {
  const r = makeResult(5, 'Mid-conversation system message', m);
  results.push(r);
  const sys = [txt(sharedSystem(nonceFor(m, 'p5')), EPHEMERAL)];
  const c0 = await send(m, 5, '5.0 write tools+system', req(m, { system: sys, messages: conv() }));
  r.rows.push(row(c0));
  const c1 = await send(m, 5, '5.1 conversation with marker on the last user message (writes M)', req(m, { system: sys, messages: conv(EPHEMERAL) }));
  r.rows.push(row(c1));
  const prefix = conv(EPHEMERAL);
  const msgs2 = [...prefix, asst(c1), um('Thanks. Now name one concrete gap in the candidate. One sentence.'), sysMsg('From now on, end every answer with the word DONE.')];
  const c2 = await send(m, 5, '5.2 prefix + assistant + user + {role:"system"} appended, marker unchanged', req(m, { system: sys, messages: msgs2 }));
  r.rows.push(row(c2, `answer: ${textOf(c2).slice(0, 100)}`));
  const msgs3 = [...prefix, asst(c1), um('Thanks. Now name one concrete gap in the candidate. One sentence.'), sysMsg('From now on, end every answer with the word DONE.')];
  const c3 = await send(m, 5, '5.3 same conversation with automatic caching (top-level marker), system message last', req(m, { system: sys, messages: msgs3, topCache: EPHEMERAL }));
  r.rows.push(row(c3));
  const msgs4 = [...msgs3.slice(0, -1), sysMsg('From now on, end every answer with the word FINISHED.')];
  const c4 = await send(m, 5, '5.4 same, system message text changed (only the last entry differs)', req(m, { system: sys, messages: msgs4, topCache: EPHEMERAL }));
  r.rows.push(row(c4));
}

// -----------------------------------------------------
// 6. Mixed TTL
// -----------------------------------------------------

async function probeMixedTtl(m: Model): Promise<void> {
  const r = makeResult(6, 'Mixed TTL (1h system marker, 5m automatic)', m);
  results.push(r);
  const sys = [txt(sharedSystem(nonceFor(m, 'p6a')), EPHEMERAL_1H)];
  const c1 = await send(m, 6, '6a 1h marker on system + top-level 5m automatic, turn 1', req(m, { system: sys, messages: conv(), topCache: EPHEMERAL }));
  r.rows.push(row(c1));
  const msgs2 = [...conv(), asst(c1), um('Thanks. Now name one concrete gap in the candidate. One sentence.')];
  const c2 = await send(m, 6, '6a turn 2 (conversation grew)', req(m, { system: sys, messages: msgs2, topCache: EPHEMERAL }));
  r.rows.push(row(c2));
  const sysWrongOrder = [txt(sharedSystem(nonceFor(m, 'p6b')), EPHEMERAL)];
  const c3 = await send(m, 6, '6b reverse order: 5m marker on system + top-level 1h automatic', req(m, { system: sysWrongOrder, messages: conv(), topCache: EPHEMERAL_1H }));
  r.rows.push(row(c3));
}

// -----------------------------------------------------
// 7. Chat-like growth
// -----------------------------------------------------

async function probeChat(m: Model): Promise<void> {
  const r = makeResult(7, 'Chat growth, 6 turns, automatic caching', m);
  results.push(r);
  const sys = [txt(sharedSystem(nonceFor(m, 'p7')), EPHEMERAL_1H)];
  const ad = cases[2].jd ?? '';
  const turns = [0, 1, 2, 3, 4, 5].map((i) => `Turn ${i + 1}. Here is an excerpt from another ad:\n${ad.slice(i * 500, i * 500 + 500)}\n\nIn one sentence, what does this excerpt ask for?`);
  const messages: R[] = [];
  for (let i = 0; i < turns.length; i++) {
    messages.push(um(turns[i]));
    const a = await send(m, 7, `7 turn ${i + 1}`, req(m, { system: sys, messages: [...messages], topCache: EPHEMERAL }));
    const u = rec(a.body?.usage);
    const total = num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
    r.rows.push(row(a, a.ok ? `prompt ${total}, hit rate ${((num(u.cache_read_input_tokens) / total) * 100).toFixed(1)}%` : undefined));
    if (!a.ok) return;
    messages.push(asst(a));
  }
}

// -----------------------------------------------------
// 8. Cache diagnostics
// -----------------------------------------------------

async function probeDiagnostics(m: Model): Promise<void> {
  const r = makeResult(8, 'Cache diagnostics', m);
  results.push(r);
  const nonce = nonceFor(m, 'p8');
  const sysText = sharedSystem(nonce);
  const sys = [txt(sysText, EPHEMERAL)];
  const mk = (over: Partial<Opts>, diag: string | null, messages: R[] = conv(EPHEMERAL), system: R[] = sys): R => req(m, { system, messages, diag, ...over });

  const base = await send(m, 8, '8.0 base call, diagnostics opt-in with previous_message_id null', mk({}, null));
  r.rows.push(row(base));
  if (!base.ok) return;
  const id = String(base.body?.id);
  const variants: Array<[string, R]> = [
    ['8.1 identical request (expect diagnostics null, cache read)', mk({}, id)],
    ['8.2 system text changed (one word appended)', mk({}, id, conv(EPHEMERAL), [txt(`${sysText} Extra.`, EPHEMERAL)])],
    ['8.3 tool description changed', mk({ toolDescription: 'Read one tracked job application by its id (changed).' }, id)],
    ['8.4 earlier message edited', mk({}, id, [um(`${SECOND_AD} (edited)`), am('Noted.'), um('Which of the two ads fits the candidate better? One sentence.', EPHEMERAL)])],
    ['8.5 effort changed low to medium', mk({ effort: 'medium' }, id)],
    ['8.6 unknown previous_message_id', mk({}, 'msg_doesnotexist0000000000')],
  ];
  for (const [step, params] of variants) {
    const a = await send(m, 8, step, params);
    const d = rec(a.body?.diagnostics);
    r.rows.push(row(a, a.ok ? `diagnostics: ${a.body?.diagnostics === null ? 'null' : JSON.stringify(a.body?.diagnostics ?? 'absent')}` : undefined));
    r.findings.push(`${step}: ${a.ok ? JSON.stringify(d.cache_miss_reason ?? a.body?.diagnostics ?? null) : `failed ${a.status} ${a.error}`}`);
  }
}

// -----------------------------------------------------
// 9. Two call sites sharing a CV block
// -----------------------------------------------------

async function probeSites(m: Model): Promise<void> {
  const r = makeResult(9, 'Two call sites sharing the CV block', m);
  results.push(r);
  const shared = txt(sharedSystem(nonceFor(m, 'p9')), EPHEMERAL);
  const siteA = [shared, txt('Site A. Write one sentence that could open a cover letter.')];
  const siteB = [shared, txt('Site B. List three screening-question answers as short bullet points.')];
  const a = await send(m, 9, '9 site A (writes the shared block)', req(m, { system: siteA, messages: [um('Go.')] }));
  r.rows.push(row(a));
  const b = await send(m, 9, '9 site B, different trailing system block and message', req(m, { system: siteB, messages: [um('Answer: why do you want this role?')] }));
  r.rows.push(row(b, `read ${num(rec(b.body?.usage).cache_read_input_tokens)} vs site A write ${num(rec(a.body?.usage).cache_creation_input_tokens)}`));
  const c = await send(m, 9, '9 site C, different tool list (control: expect a full miss)', req(m, { system: siteB, messages: [um('Answer: why do you want this role?')], toolDescription: 'A different tool description.' }));
  r.rows.push(row(c));
}

// -----------------------------------------------------
// Main
// -----------------------------------------------------

async function runModel(m: Model): Promise<void> {
  const steps: Array<[string, () => Promise<void>]> = [
    ['1 prewarm', () => probePrewarm(m)],
    ['2 parallel', () => probeParallel(m)],
    ['3 effort', () => probeSplit(m, 3, 'Effort change', 'p3', {}, [{ step: 'effort low to medium', over: { effort: 'medium' } }, { step: 'back to effort low', over: {} }])],
    ['3b thinking', () => probeSplit(m, 3, 'Thinking and effort field changes', 'p3b', {}, [{ step: 'thinking disabled (effort low)', over: { thinking: 'disabled' } }, { step: 'thinking field omitted (effort low)', over: { thinking: 'none' } }, { step: 'effort field omitted (adaptive)', over: { effortOmitted: true } }, { step: 'effort high', over: { effort: 'high' } }, { step: 'back to adaptive, effort low', over: {} }])],
    ['4 tool_choice', () => probeSplit(m, 4, 'tool_choice auto to none', 'p4', { toolChoice: { type: 'auto' } }, [{ step: 'tool_choice none', over: { toolChoice: { type: 'none' } } }, { step: 'back to tool_choice auto', over: {} }])],
    ['5 system message', () => probeSystemMessage(m)],
    ['6 mixed ttl', () => probeMixedTtl(m)],
    ['7 chat', () => probeChat(m)],
    ['8 diagnostics', () => probeDiagnostics(m)],
    ['9 sites', () => probeSites(m)],
  ];
  const only = process.env.PROBES?.split(',');
  for (const [name, fn] of steps) {
    if (only && !only.some((o) => name.startsWith(o))) continue;
    try {
      await fn();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Probe spend')) throw error;
      const { message } = errorMessage(error);
      results.push({ id: -1, name: `${name} crashed`, model: m.key, rows: [], findings: [message] });
      console.error(`${m.key} ${name} crashed: ${message}`);
    }
  }
}

function printResults(): void {
  for (const res of results) {
    console.log(`\n== [${res.id}] ${res.model}: ${res.name}`);
    for (const x of res.rows) {
      const nums = x.ok ? `in ${x.input} write ${x.write}${x.write5m !== undefined ? ` (5m ${x.write5m}, 1h ${x.write1h})` : ''} read ${x.read} out ${x.output}` : `FAILED ${x.status} ${String(x.error).slice(0, 160)}`;
      console.log(`  ${x.step}\n    ${nums}${x.note ? ` | ${x.note}` : ''}`);
    }
  }
}

async function main(): Promise<void> {
  const started = new Date().toISOString();
  let failure: string | null = null;
  try {
    await Promise.all([runModel(HAIKU), runModel(SONNET)]);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    console.error(failure);
  }
  printResults();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `p0b-cache-probe-${RUN_ID}.json`);
  const out = {
    runId: RUN_ID,
    sdkVersion: (JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', '@anthropic-ai', 'sdk', 'package.json'), 'utf8')) as { version: string }).version,
    models: [HAIKU.id, SONNET.id],
    startedAt: started,
    finishedAt: new Date().toISOString(),
    spendUsd: Number(spendUsd.toFixed(5)),
    spendByModelUsd: {
      haiku: Number(attempts.filter((a) => a.model === 'haiku').reduce((s, a) => s + a.costUsd, 0).toFixed(5)),
      sonnet: Number(attempts.filter((a) => a.model === 'sonnet').reduce((s, a) => s + a.costUsd, 0).toFixed(5)),
    },
    priceUsdPerMillion: { haiku: HAIKU.price, sonnet: SONNET.price },
    failure,
    results,
    attempts: attempts.map((a) => ({ ...a, body: a.body ? slim(a.body) : undefined })),
  };
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(ROOT, file)}; spend $${spendUsd.toFixed(4)}`);
  if (failure) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
