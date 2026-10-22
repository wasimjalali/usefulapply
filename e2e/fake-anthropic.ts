/**
 * A stand-in for api.anthropic.com for the e2e run. The preview Worker is
 * pointed at it with `--var ANTHROPIC_BASE_URL:http://127.0.0.1:18793`, so the
 * real SDK, the real agents and the real validators run and only the model's
 * answers are scripted (see lib/model-script.ts).
 *
 * It answers both model families the app calls: the Sonnet 5.5 kit writers and CV parser, and every Claude
 * Haiku 5.5 site (chat, tracker, screening, language, ranking, search strategy, career profile). The site is
 * read off the system text, as for the kit writers. It speaks the parts of the API the app depends on:
 *   - native tool_use blocks with ids (and a thinking block before each, which the app must pass back
 *     unaltered), and tool_result turns, checked the way the API checks them;
 *   - structured output requests (`output_config.format`), answered with schema-shaped JSON;
 *   - POST /v1/messages/count_tokens, a char-based count (3 chars per token, like English);
 *   - usage with cache_creation_input_tokens / cache_read_input_tokens and the 5m/1h split, from a
 *     simulation of the prompt cache: an entry is written at a cache_control marker and read by a later
 *     request whose prefix, at a marker or within 20 blocks before it, was written before. Prefixes under
 *     512 tokens never cache. Mixed TTLs (1h before 5m) and at most 4 markers are enforced as 400s.
 *
 * Run: npx tsx e2e/fake-anthropic.ts [port]
 *
 * Control for a test: POST /__control with any of
 *   failWriter   "chat" | ["ranking", ...] | null   those writers answer 500 until reset
 *   delayMs      delay every answer
 *   inputTokens  number | null   force the input size: count_tokens returns it, and so does the usage of a
 *                messages call (input + cache reads + cache writes), so the 100k budget paths can be driven
 *   inputTokensFor  writer name   limit the override to one writer
 *   skipCalls    n   answer the first n messages calls of that writer with their real size, then override
 * GET /__calls returns the call log, GET /__reset clears it, the cache and the control state.
 * A question containing FAKE-AI-FAIL makes the screening call fail (500); FAKE-AI-ECHO-PROMPT makes it
 * answer with the application block it was shown.
 */

import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  HAIKU_WRITERS,
  answerFor,
  blocksOf,
  haikuAnswerFor,
  issuedThinkingSignatures,
  lastUserText,
  writerFor,
  type FakeBlock,
  type MessagesBody,
  type Writer,
} from './lib/model-script';

const port = Number(process.argv[2] ?? process.env.FAKE_ANTHROPIC_PORT ?? 18793);

// Cache simulation constants.
const CHARS_PER_TOKEN = 3;
const MIN_CACHEABLE_TOKENS = 512;
const LOOKBACK_BLOCKS = 20;
const MAX_MARKERS = 4;

type Ttl = '5m' | '1h';

interface MarkerRecord { unit: number; where: 'tools' | 'system' | 'message' | 'automatic'; ttl: Ttl; prefixHash: string }

interface CallRecord {
  kind: 'messages' | 'count_tokens';
  writer: string;
  at: string;
  stream: boolean;
  /** The first message of the request, as the kit writers' specs read it. */
  user: string;
  /** The newest user text, and every user text, so a spec can see the history the model was shown. */
  lastUser: string;
  allUserText: string;
  /** The tool_result contents the request carries, so a spec can see what a tool answered the model. */
  toolResults: string[];
  model: string | null;
  effort: string | null;
  thinking: string | null;
  toolChoice: string | null;
  tools: string[];
  structuredOutput: boolean;
  maxTokens: number | null;
  messageCount: number;
  markers: MarkerRecord[];
  /** Hash of everything up to the first marker: the static prefix, identical across users when it is. */
  staticPrefixHash: string | null;
  status: number;
  stopReason: string | null;
  usage: { input: number; output: number; cacheCreation: number; cacheRead: number; creation5m: number; creation1h: number; total: number } | null;
  /** count_tokens only: the number returned. */
  countedTokens: number | null;
}

const calls: CallRecord[] = [];
const cacheEntries = new Set<string>();
let failWriters = new Set<string>();
let delayMs = 0;
let override: { inputTokens: number; writer: string | null; skip: number } | null = null;
let overrideSeen = 0;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk as Buffer));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    request.on('error', reject);
  });
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function apiError(response: ServerResponse, status: number, type: string, message: string): void {
  json(response, status, { type: 'error', error: { type, message } });
}

// ---------------------------------------------------------------------------
// The request as cacheable blocks
// ---------------------------------------------------------------------------

interface Unit { json: string; marker: { ttl: Ttl; where: MarkerRecord['where'] } | null }

const stripCacheControl = <T extends Record<string, unknown>>(block: T): T => {
  const copy = { ...block };
  delete copy.cache_control;
  return copy;
};

function ttlOf(control: unknown): Ttl {
  return (control as { ttl?: string } | undefined)?.ttl === '1h' ? '1h' : '5m';
}

/** tools, then system, then each message block, in the order the API hashes them. */
function unitsOf(body: MessagesBody): Unit[] {
  const units: Unit[] = [];
  const tools = (body.tools ?? []) as Array<Record<string, unknown>>;
  if (tools.length > 0) {
    const marked = tools.findLast((tool) => tool.cache_control);
    units.push({
      json: JSON.stringify(tools.map((tool) => stripCacheControl(tool))),
      marker: marked ? { ttl: ttlOf(marked.cache_control), where: 'tools' } : null,
    });
  }
  const system = typeof body.system === 'string' ? [{ type: 'text', text: body.system } as FakeBlock] : blocksOf(body.system);
  for (const block of system) {
    units.push({ json: JSON.stringify({ system: stripCacheControl(block) }), marker: block.cache_control ? { ttl: ttlOf(block.cache_control), where: 'system' } : null });
  }
  for (const message of body.messages ?? []) {
    for (const block of blocksOf(message.content)) {
      units.push({
        json: JSON.stringify({ role: message.role, block: stripCacheControl(block) }),
        marker: block.cache_control ? { ttl: ttlOf(block.cache_control), where: 'message' } : null,
      });
    }
  }
  // Automatic caching marks the last block of the request.
  if (body.cache_control && units.length > 0 && !units[units.length - 1].marker) {
    units[units.length - 1].marker = { ttl: ttlOf(body.cache_control), where: 'automatic' };
  }
  return units;
}

const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/** The whole request in tokens: every character the model would read. */
function totalTokens(body: MessagesBody): number {
  return tokensOf(unitsOf(body).reduce((sum, unit) => sum + unit.json.length, 0));
}

interface CacheOutcome { read: number; creation: number; creation5m: number; creation1h: number; markers: MarkerRecord[] }

/** Simulate the prompt cache for one request and remember what it wrote. */
function simulateCache(units: Unit[]): CacheOutcome {
  const cumChars: number[] = [];
  const hashes: string[] = [];
  const hash = createHash('sha256');
  let chars = 0;
  for (const unit of units) {
    hash.update(unit.json);
    hash.update('\n');
    chars += unit.json.length;
    cumChars.push(chars);
    hashes.push(hash.copy().digest('hex'));
  }
  const markers: MarkerRecord[] = [];
  units.forEach((unit, index) => {
    if (unit.marker) markers.push({ unit: index, where: unit.marker.where, ttl: unit.marker.ttl, prefixHash: hashes[index] });
  });

  // A read: from each marker, the nearest earlier boundary (within 20 blocks) whose prefix was written.
  let hitUnit = -1;
  for (const marker of markers) {
    if (tokensOf(cumChars[marker.unit]) < MIN_CACHEABLE_TOKENS) continue;
    for (let j = marker.unit; j >= Math.max(0, marker.unit - LOOKBACK_BLOCKS + 1); j--) {
      if (cacheEntries.has(hashes[j])) { hitUnit = Math.max(hitUnit, j); break; }
    }
  }
  const read = hitUnit >= 0 ? tokensOf(cumChars[hitUnit]) : 0;

  // Writes: every marker past the hit whose prefix is long enough and not already an entry.
  let covered = read;
  let creation5m = 0;
  let creation1h = 0;
  for (const marker of markers) {
    const prefixTokens = tokensOf(cumChars[marker.unit]);
    if (prefixTokens < MIN_CACHEABLE_TOKENS || marker.unit <= hitUnit) continue;
    if (!cacheEntries.has(marker.prefixHash)) {
      const written = prefixTokens - covered;
      if (marker.ttl === '1h') creation1h += written; else creation5m += written;
      covered = prefixTokens;
    }
    cacheEntries.add(marker.prefixHash);
  }
  return { read, creation: creation5m + creation1h, creation5m, creation1h, markers };
}

// ---------------------------------------------------------------------------
// Request checks the API makes, so an app bug shows as the 400 it would be in production
// ---------------------------------------------------------------------------

function validate(body: MessagesBody, writer: Writer | null, markers: MarkerRecord[]): string | null {
  if (body.temperature !== undefined && writer && HAIKU_WRITERS.has(writer)) {
    return '`temperature` may only be set to 1 when thinking is enabled or adaptive.';
  }
  if (markers.length > MAX_MARKERS) return `A maximum of ${MAX_MARKERS} blocks with cache_control may be provided. Found ${markers.length}.`;
  const firstShort = markers.findIndex((marker) => marker.ttl === '5m');
  if (firstShort !== -1 && markers.slice(firstShort).some((marker) => marker.ttl === '1h')) {
    return "a ttl='1h' cache_control block must not come after a ttl='5m' cache_control block.";
  }
  const messages = body.messages ?? [];
  for (let i = 0; i < messages.length; i++) {
    const blocks = blocksOf(messages[i].content);
    const uses = blocks.filter((block) => block.type === 'tool_use');
    if (messages[i].role !== 'assistant' || uses.length === 0) continue;
    const next = blocksOf(messages[i + 1]?.content);
    for (const use of uses) {
      if (!next.some((block) => block.type === 'tool_result' && block.tool_use_id === use.id)) {
        return `\`tool_use\` ids were found without \`tool_result\` blocks immediately after: ${String(use.id)}.`;
      }
    }
    // The chat's thinking blocks must come back exactly as they were sent.
    if (writer === 'chat') {
      const thinking = blocks.find((block) => block.type === 'thinking');
      if (!thinking || !issuedThinkingSignatures.has(String(thinking.signature))) {
        return 'The thinking block of a tool_use turn must be passed back unmodified.';
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number };
}

function messageBody(model: string, content: FakeBlock[], stopReason: string, usage: Usage) {
  return {
    id: `msg_stub_${Math.random().toString(36).slice(2)}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}

function sse(response: ServerResponse, model: string, text: string, usage: Usage): void {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', {
    type: 'message_start',
    message: { id: 'msg_stub', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } },
  });
  send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
  send('content_block_stop', { type: 'content_block_stop', index: 0 });
  send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
  send('message_stop', { type: 'message_stop' });
  response.end();
}

function overrideApplies(writer: string): boolean {
  return override !== null && (override.writer === null || override.writer === writer);
}

function firstMessageText(body: MessagesBody): string {
  const first = body.messages?.[0]?.content;
  return typeof first === 'string' ? first : JSON.stringify(first ?? '');
}

function record(body: MessagesBody, kind: CallRecord['kind'], writer: string, markers: MarkerRecord[]): CallRecord {
  const userTexts = (body.messages ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => blocksOf(message.content).filter((block) => block.type === 'text').map((block) => String(block.text ?? '')).join('\n'))
    .filter(Boolean);
  const entry: CallRecord = {
    kind,
    writer,
    at: new Date().toISOString(),
    stream: Boolean(body.stream),
    user: firstMessageText(body).slice(0, 20_000),
    lastUser: lastUserText(body.messages).slice(0, 20_000),
    allUserText: userTexts.join('\n---\n').slice(0, 60_000),
    toolResults: (body.messages ?? [])
      .flatMap((message) => blocksOf(message.content))
      .filter((block) => block.type === 'tool_result')
      .map((block) => (typeof block.content === 'string' ? block.content : JSON.stringify(block.content)).slice(0, 20_000)),
    model: body.model ?? null,
    effort: body.output_config?.effort ?? null,
    thinking: body.thinking?.type ?? null,
    toolChoice: (body as { tool_choice?: { type?: string } }).tool_choice?.type ?? null,
    tools: (body.tools ?? []).map((tool) => tool.name),
    structuredOutput: Boolean(body.output_config?.format),
    maxTokens: body.max_tokens ?? null,
    messageCount: body.messages?.length ?? 0,
    markers,
    staticPrefixHash: markers[0]?.prefixHash ?? null,
    status: 200,
    stopReason: null,
    usage: null,
    countedTokens: null,
  };
  calls.push(entry);
  return entry;
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/__control' && request.method === 'POST') {
      const body = JSON.parse((await readBody(request)) || '{}') as {
        failWriter?: string | string[] | null;
        delayMs?: number;
        inputTokens?: number | null;
        inputTokensFor?: string | null;
        skipCalls?: number;
      };
      failWriters = new Set(Array.isArray(body.failWriter) ? body.failWriter : body.failWriter ? [body.failWriter] : []);
      delayMs = body.delayMs ?? 0;
      override = typeof body.inputTokens === 'number' ? { inputTokens: body.inputTokens, writer: body.inputTokensFor ?? null, skip: body.skipCalls ?? 0 } : null;
      overrideSeen = 0;
      return json(response, 200, { ok: true, failWriters: [...failWriters], delayMs, override });
    }
    if (url.pathname === '/__calls') return json(response, 200, calls);
    if (url.pathname === '/__health') return json(response, 200, { ok: true });
    if (url.pathname === '/__reset') {
      calls.length = 0;
      cacheEntries.clear();
      failWriters = new Set();
      delayMs = 0;
      override = null;
      overrideSeen = 0;
      return json(response, 200, { ok: true });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/v1/messages/count_tokens')) {
      const body = JSON.parse(await readBody(request)) as MessagesBody;
      const writer = writerFor(body.system) ?? 'unknown';
      const entry = record(body, 'count_tokens', writer, []);
      const counted = overrideApplies(writer) ? (override as NonNullable<typeof override>).inputTokens : totalTokens(body);
      entry.countedTokens = counted;
      return json(response, 200, { input_tokens: counted });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/v1/messages')) {
      const body = JSON.parse(await readBody(request)) as MessagesBody;
      const writer = writerFor(body.system);
      const units = unitsOf(body);
      const cache = simulateCache(units);
      const entry = record(body, 'messages', writer ?? 'unknown', cache.markers);
      const fail = (status: number, type: string, message: string) => { entry.status = status; apiError(response, status, type, message); };

      if (!writer) return fail(500, 'api_error', 'unscripted writer');
      const invalid = validate(body, writer, cache.markers);
      if (invalid) return fail(400, 'invalid_request_error', invalid);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (failWriters.has(writer)) return fail(500, 'api_error', `scripted failure for ${writer}`);
      if (writer === 'screening' && lastUserText(body.messages).includes('FAKE-AI-FAIL')) return fail(500, 'api_error', 'scripted model failure');

      const haiku = HAIKU_WRITERS.has(writer);
      const model = body.model ?? (haiku ? 'claude-haiku-5-5' : 'claude-sonnet-5-5');
      let content: FakeBlock[];
      let stopReason = 'end_turn';
      if (body.max_tokens === 0) {
        // A cache warm-up: the cache is written, nothing is generated.
        content = [];
        stopReason = 'max_tokens';
      } else if (haiku) {
        if (body.stream) return fail(500, 'api_error', 'the fake does not script a streamed Haiku answer');
        const answer = haikuAnswerFor(writer, body);
        content = answer.content;
        stopReason = answer.stopReason;
      } else {
        content = [{ type: 'text', text: answerFor(writer, firstMessageText(body)) }];
      }

      const total = totalTokens(body);
      let input = Math.max(0, total - cache.read - cache.creation);
      if (overrideApplies(writer)) {
        const seen = overrideSeen;
        overrideSeen += 1;
        if (seen >= (override as NonNullable<typeof override>).skip) {
          input = Math.max(0, (override as NonNullable<typeof override>).inputTokens - cache.read - cache.creation);
        }
      }
      const output = Math.max(1, tokensOf(JSON.stringify(content).length));
      const usage: Usage = {
        input_tokens: input,
        output_tokens: output,
        cache_creation_input_tokens: cache.creation,
        cache_read_input_tokens: cache.read,
        cache_creation: { ephemeral_5m_input_tokens: cache.creation5m, ephemeral_1h_input_tokens: cache.creation1h },
      };
      entry.stopReason = stopReason;
      entry.usage = {
        input, output, cacheCreation: cache.creation, cacheRead: cache.read,
        creation5m: cache.creation5m, creation1h: cache.creation1h, total: input + cache.read + cache.creation,
      };
      if (body.stream) {
        const text = content.filter((block) => block.type === 'text').map((block) => String(block.text)).join('');
        return sse(response, model, text, usage);
      }
      return json(response, 200, messageBody(model, content, stopReason, usage));
    }
    json(response, 404, { error: 'not found' });
  } catch (error) {
    json(response, 500, { error: String(error) });
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`[fake-anthropic] listening on http://127.0.0.1:${port}`);
});
