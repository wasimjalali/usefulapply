/**
 * A stand-in for api.anthropic.com AND for Claude in Amazon Bedrock for the e2e run. The preview Worker is
 * pointed at it with `--var ANTHROPIC_BASE_URL:http://127.0.0.1:18793` (the primary) and
 * `--var ANTHROPIC_BEDROCK_MANTLE_BASE_URL:http://127.0.0.1:18793/bedrock` (the failover), so the real SDKs,
 * the real agents and the real validators run and only the model's answers are scripted (see lib/model-script.ts).
 *
 * Two endpoints, one script. `/v1/...` is the Anthropic API; `/bedrock/v1/...` is the Bedrock mantle endpoint.
 * Each has its own prompt cache, and every call in /__calls says which provider served it. Like the real
 * services: both accept `Authorization: Bearer <key>` (SDK 1.x no longer sends x-api-key; the Anthropic API
 * still accepts it too), Bedrock needs a Bearer token and a model id with the `anthropic.` prefix, and the
 * Anthropic API refuses that prefix. Both reject temperature, top_p and top_k with a 400 (API 2026-10-21).
 * Structured output requests (`output_config.format` json_schema) get a 400 when any object in the schema lacks
 * `additionalProperties: false`, as the real API does, and the fake's own scripted JSON reply is validated against
 * the request's schema (a mismatch is a 500 that names the path), so a schema bug fails E2E instead of production.
 *
 * It answers both model families the app calls: the Sonnet 5.5 kit writers and CV parser, and every Claude
 * Haiku 5.5 site (chat, tracker, screening, language, ranking, search strategy, career profile). The site is
 * read off the system text, as for the kit writers. It speaks the parts of the API the app depends on:
 *   - native tool_use blocks with ids (and a thinking block before each, which the app must pass back
 *     unaltered), and tool_result turns, checked the way the API checks them;
 *   - structured output requests (`output_config.format`), answered with schema-shaped JSON;
 *   - POST /v1/messages/count_tokens, a char-based count (3 chars per token, like English);
 *   - on-demand compaction (`compaction: { type: 'summarize', instructions }`, beta compact-2026-09-04): one signed
 *     `compaction` block, stop_reason compaction, usage only in `usage.iterations` (top level 0, as P0 measured), and a
 *     400 for a `compaction` param or a carried block without the beta header, or a block the fake never issued;
 *   - `usage.iterations` on every response (one `message` entry equal to the top level, as the API sends);
 *   - usage with cache_creation_input_tokens / cache_read_input_tokens and the 5m/1h split, from a
 *     simulation of the prompt cache: an entry is written at a cache_control marker (only by a request the fake
 *     answers; one it refuses writes nothing) and read by a later
 *     request whose prefix, at a marker or within 20 blocks before it, was written before. Prefixes under
 *     512 tokens never cache. Mixed TTLs (1h before 5m) and at most 4 markers are enforced as 400s.
 *
 * Run: npx tsx e2e/fake-anthropic.ts [port]
 *
 * Control for a test: POST /__control with any of (each POST replaces the whole control state)
 *   failWriter   "chat" | ["ranking", ...] | null   those writers answer 500 until reset
 *   primaryFail  { status, count, skip?, writer? } | null   the Anthropic endpoint (never Bedrock) answers `status`
 *                (529 overloaded, 400 invalid_request, 503 and 500 api_error) to the next `count` messages requests, after letting `skip`
 *                requests through, for one writer or all. The SDK retries once, so one logical call is two requests:
 *                count 2 fails one call, count 4 fails two.
 *   primaryStreamCut  { count, skip?, writer? } | null   the Anthropic endpoint (never Bedrock) answers the next `count`
 *                STREAMING requests with a 200, message_start, the first half of the text, and then resets the socket
 *                (a connection lost mid-body, after the headers). `skip` lets that many streaming requests through
 *                first, `writer` limits it to one writer. The SDK does not retry after the headers, so count 1 cuts
 *                one logical call.
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
  issuedCompactionBlocks,
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
type Provider = 'anthropic' | 'bedrock';

/** Bedrock signs the thinking blocks it issues with this prefix; the Anthropic API refuses them. */
const BEDROCK_SIGNATURE_PREFIX = 'bedrock-sig:';

interface MarkerRecord { unit: number; where: 'tools' | 'system' | 'message' | 'automatic'; ttl: Ttl; prefixHash: string; tokens: number }

interface CallRecord {
  kind: 'messages' | 'count_tokens';
  /** The endpoint the request came to: the Anthropic API or the Bedrock mantle path. */
  provider: Provider;
  /** How the request authenticated: `Authorization: Bearer` or `x-api-key`. */
  auth: 'bearer' | 'x-api-key' | 'none';
  writer: string;
  at: string;
  stream: boolean;
  /** primaryStreamCut hit this streaming request: the socket was reset after the first half of the text. */
  streamCut: boolean;
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
  /** The role of every message, in order, mid-conversation system messages included. */
  roles: string[];
  /** The text of the mid-conversation system messages (the per-request state), joined by newlines. */
  state: string;
  markers: MarkerRecord[];
  /** Hash of everything up to the first marker: the static prefix, identical across users when it is. */
  staticPrefixHash: string | null;
  status: number;
  stopReason: string | null;
  usage: { input: number; output: number; cacheCreation: number; cacheRead: number; creation5m: number; creation1h: number; total: number } | null;
  /** count_tokens only: the number returned. */
  countedTokens: number | null;
  /** The `anthropic-beta` header values. */
  betas: string[];
  /** The request asked for on-demand compaction, with these instructions. */
  compaction: boolean;
  compactionInstructions: string | null;
  /** The type of every block of every message, in order (`compaction` for a carried block). */
  blockTypes: string[][];
  /** The summary text of the compaction blocks the request carries. */
  carriedSummary: string;
}

const calls: CallRecord[] = [];
// Each provider has its own prompt cache, like the real services.
const cacheEntries: Record<Provider, Set<string>> = { anthropic: new Set(), bedrock: new Set() };
let failWriters = new Set<string>();
let delayMs = 0;
let primaryFail: { status: number; remaining: number; skip: number; writer: string | null } | null = null;
let primaryStreamCut: { remaining: number; skip: number; writer: string | null } | null = null;
let override: { inputTokens: number; writer: string | null; skip: number } | null = null;
let overrideSeen = 0;

function authOf(request: IncomingMessage): CallRecord['auth'] {
  if (/^Bearer\s+\S+/.test(String(request.headers.authorization ?? ''))) return 'bearer';
  if (String(request.headers['x-api-key'] ?? '').length > 0) return 'x-api-key';
  return 'none';
}

/** Bedrock ids carry the `anthropic.` provider prefix; the Anthropic API does not know them. */
function modelIdError(provider: Provider, model: string | undefined): string | null {
  if (!model) return 'model: Field required';
  if (provider === 'bedrock') {
    return model.startsWith('anthropic.') ? null : `The provided model identifier is invalid: ${model} (Bedrock ids start with "anthropic.")`;
  }
  return model.startsWith('anthropic.') ? `model: ${model}` : null;
}

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

interface CacheOutcome {
  read: number;
  creation: number;
  creation5m: number;
  creation1h: number;
  markers: MarkerRecord[];
  /** Store the entries this request writes. Called only once the response is going out: a refused request writes none. */
  commit: () => void;
}

/**
 * Simulate the prompt cache for one request: what it reads, and what it would write. Nothing is stored until
 * `commit`, which the handler calls after every check that can refuse the request, as the real API writes an entry
 * only when a response starts.
 */
function simulateCache(units: Unit[], provider: Provider): CacheOutcome {
  const entries = cacheEntries[provider];
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
    if (unit.marker) markers.push({ unit: index, where: unit.marker.where, ttl: unit.marker.ttl, prefixHash: hashes[index], tokens: tokensOf(cumChars[index]) });
  });

  // A read: from each marker, the nearest earlier boundary (within 20 blocks) whose prefix was written.
  let hitUnit = -1;
  for (const marker of markers) {
    if (tokensOf(cumChars[marker.unit]) < MIN_CACHEABLE_TOKENS) continue;
    for (let j = marker.unit; j >= Math.max(0, marker.unit - LOOKBACK_BLOCKS + 1); j--) {
      if (entries.has(hashes[j])) { hitUnit = Math.max(hitUnit, j); break; }
    }
  }
  const read = hitUnit >= 0 ? tokensOf(cumChars[hitUnit]) : 0;

  // Writes: every marker past the hit whose prefix is long enough and not already an entry.
  let covered = read;
  let creation5m = 0;
  let creation1h = 0;
  const writes = new Set<string>();
  for (const marker of markers) {
    const prefixTokens = tokensOf(cumChars[marker.unit]);
    if (prefixTokens < MIN_CACHEABLE_TOKENS || marker.unit <= hitUnit) continue;
    if (!entries.has(marker.prefixHash) && !writes.has(marker.prefixHash)) {
      const written = prefixTokens - covered;
      if (marker.ttl === '1h') creation1h += written; else creation5m += written;
      covered = prefixTokens;
    }
    writes.add(marker.prefixHash);
  }
  const commit = () => { for (const hash of writes) entries.add(hash); };
  return { read, creation: creation5m + creation1h, creation5m, creation1h, markers, commit };
}

// ---------------------------------------------------------------------------
// Request checks the API makes, so an app bug shows as the 400 it would be in production
// ---------------------------------------------------------------------------

function validate(body: MessagesBody, writer: Writer | null, markers: MarkerRecord[], provider: Provider, betas: string[]): string | null {
  // Compaction is a beta: the parameter and a carried block are both refused without its header (P0, a 400).
  const carried = (body.messages ?? []).flatMap((message) => blocksOf(message.content)).filter((block) => block.type === 'compaction');
  if ((body.compaction || carried.length > 0) && !betas.includes('compact-2026-09-04')) {
    return body.compaction
      ? 'compaction: Extra inputs are not permitted'
      : "messages.0.content.0: Input tag 'compaction' found using 'type' does not match any of the expected tags";
  }
  // A block goes back exactly as it was issued, every field: the signature covers it.
  for (const block of carried) {
    const issued = issuedCompactionBlocks.get(String(block.signature));
    if (!issued || JSON.stringify(stripCacheControl(block)) !== JSON.stringify(issued)) return 'Invalid `signature` in `compaction` block';
  }
  if (body.compaction && body.compaction.type !== 'summarize') return 'compaction.type: Input should be \'summarize\'';
  // API 2026-10-21: any value of a sampling parameter is a 400, for every model.
  for (const name of ['temperature', 'top_p', 'top_k'] as const) {
    if ((body as Record<string, unknown>)[name] !== undefined) return `${name}: Extra inputs are not permitted (sampling parameters are removed in 2026-10-21)`;
  }
  // A thinking block is signed by the provider that produced it. The Anthropic API rejects one signed by Bedrock,
  // so a loop that moves a request between providers mid-conversation fails here, in CI.
  if (provider === 'anthropic') {
    for (const message of body.messages ?? []) {
      const foreign = blocksOf(message.content).find((block) => block.type === 'thinking' && String(block.signature).startsWith(BEDROCK_SIGNATURE_PREFIX));
      if (foreign) return 'Invalid `signature` in `thinking` block';
    }
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

interface UsageCounts {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number };
}
interface Usage extends UsageCounts {
  iterations?: Array<UsageCounts & { type: 'message' | 'compaction' }>;
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

function sse(response: ServerResponse, model: string, text: string, usage: Usage, cut = false): void {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', {
    type: 'message_start',
    message: { id: 'msg_stub', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } },
  });
  send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  if (cut) {
    // A connection lost mid-body: half the text, then the socket is reset (no message_stop, no clean end).
    send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, Math.floor(text.length / 2)) } });
    setTimeout(() => response.socket?.destroy(), 20);
    return;
  }
  send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
  send('content_block_stop', { type: 'content_block_stop', index: 0 });
  send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
  send('message_stop', { type: 'message_stop' });
  response.end();
}

// ---------------------------------------------------------------------------
// Structured outputs: the schema rules of the API, and a small JSON Schema check of the scripted reply
// ---------------------------------------------------------------------------

type Schema = Record<string, unknown>;

function jsonSchemaOf(body: MessagesBody): Schema | null {
  const format = body.output_config?.format as { type?: string; schema?: Schema } | undefined;
  return format?.type === 'json_schema' && format.schema && typeof format.schema === 'object' ? format.schema : null;
}

/** The API refuses a structured-output schema with an object that does not say `additionalProperties: false`. */
function schemaRuleError(schema: unknown, path = '$'): string | null {
  if (Array.isArray(schema)) {
    for (let i = 0; i < schema.length; i++) {
      const error = schemaRuleError(schema[i], `${path}[${i}]`);
      if (error) return error;
    }
    return null;
  }
  if (schema === null || typeof schema !== 'object') return null;
  const node = schema as Schema;
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if ((types.includes('object') || node.properties !== undefined) && node.additionalProperties !== false) {
    return `output_config.format.schema: ${path} is an object without "additionalProperties": false`;
  }
  // The live API rejects numeric bounds on integers (seen on 2026-10-22): "For 'integer' type, properties maximum, minimum are not supported".
  if (types.includes('integer') && (node.minimum !== undefined || node.maximum !== undefined)) {
    return `output_config.format.schema: For 'integer' type, properties maximum, minimum are not supported (${path})`;
  }
  for (const [key, value] of Object.entries(node)) {
    // Under `properties` and `$defs` every value is a schema; elsewhere recurse into sub-schemas and arrays.
    if (key === 'properties' || key === '$defs' || key === 'definitions') {
      for (const [name, sub] of Object.entries(value as Schema)) {
        const error = schemaRuleError(sub, `${path}.${key}.${name}`);
        if (error) return error;
      }
    } else if (typeof value === 'object' && value !== null && key !== 'enum' && key !== 'const' && key !== 'required' && key !== 'default') {
      const error = schemaRuleError(value, `${path}.${key}`);
      if (error) return error;
    }
  }
  return null;
}

function typeMatches(type: unknown, value: unknown): boolean {
  switch (type) {
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return true;
  }
}

/** The first way `value` breaks `schema` (type, enum, const, required, properties, additionalProperties, items, anyOf), or null. */
function schemaMismatch(value: unknown, schema: unknown, path = '$'): string | null {
  if (schema === null || typeof schema !== 'object') return null;
  const node = schema as Schema;
  if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf)) {
    const options = (node.anyOf ?? node.oneOf) as unknown[];
    if (!options.some((option) => schemaMismatch(value, option, path) === null)) return `${path} matches none of the anyOf options`;
  }
  if (node.type !== undefined) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (!types.some((type) => typeMatches(type, value))) return `${path} should be ${types.join(' or ')}`;
  }
  if (Array.isArray(node.enum) && !node.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))) return `${path} is not one of the allowed values`;
  if ('const' in node && JSON.stringify(node.const) !== JSON.stringify(value)) return `${path} is not the constant value`;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (node.properties ?? {}) as Record<string, unknown>;
    for (const name of (Array.isArray(node.required) ? node.required : []) as string[]) {
      if (!(name in record)) return `${path}.${name} is required`;
    }
    for (const [name, child] of Object.entries(record)) {
      if (name in properties) {
        const mismatch = schemaMismatch(child, properties[name], `${path}.${name}`);
        if (mismatch) return mismatch;
      } else if (node.additionalProperties === false) {
        return `${path}.${name} is not allowed by additionalProperties: false`;
      }
    }
  }
  if (Array.isArray(value) && node.items !== undefined) {
    for (let i = 0; i < value.length; i++) {
      const mismatch = schemaMismatch(value[i], node.items, `${path}[${i}]`);
      if (mismatch) return mismatch;
    }
  }
  return null;
}

/** Null when the request has no structured-output schema, or when every text block of the reply fits it. */
function replySchemaError(body: MessagesBody, content: FakeBlock[]): string | null {
  const schema = jsonSchemaOf(body);
  if (!schema) return null;
  const text = content.filter((block) => block.type === 'text').map((block) => String(block.text ?? '')).join('');
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'the fake scripted a reply that is not JSON for a structured-output request';
  }
  const mismatch = schemaMismatch(parsed, schema);
  return mismatch ? `the fake's scripted reply does not match the request's output schema: ${mismatch}` : null;
}

function overrideApplies(writer: string): boolean {
  return override !== null && (override.writer === null || override.writer === writer);
}

function firstMessageText(body: MessagesBody): string {
  const first = body.messages?.[0]?.content;
  if (typeof first === 'string') return first;
  // An array of blocks (the cache-marked layouts): join the text blocks, as the model reads them.
  return blocksOf(first).filter((block) => block.type === 'text').map((block) => String(block.text ?? '')).join('');
}

function record(body: MessagesBody, kind: CallRecord['kind'], writer: string, markers: MarkerRecord[], provider: Provider, auth: CallRecord['auth']): CallRecord {
  const userTexts = (body.messages ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => blocksOf(message.content).filter((block) => block.type === 'text').map((block) => String(block.text ?? '')).join('\n'))
    .filter(Boolean);
  const entry: CallRecord = {
    kind,
    provider,
    auth,
    writer,
    at: new Date().toISOString(),
    stream: Boolean(body.stream),
    streamCut: false,
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
    roles: (body.messages ?? []).map((message) => String(message.role)),
    state: (body.messages ?? [])
      .filter((message) => message.role === 'system')
      .map((message) => (typeof message.content === 'string'
        ? message.content
        : blocksOf(message.content).filter((block) => block.type === 'text').map((block) => String(block.text ?? '')).join('')))
      .join('\n'),
    markers,
    staticPrefixHash: markers[0]?.prefixHash ?? null,
    status: 200,
    stopReason: null,
    usage: null,
    countedTokens: null,
    betas: [],
    compaction: Boolean(body.compaction),
    compactionInstructions: body.compaction?.instructions ?? null,
    blockTypes: (body.messages ?? []).map((message) => blocksOf(message.content).map((block) => String(block.type))),
    carriedSummary: (body.messages ?? [])
      .flatMap((message) => blocksOf(message.content))
      .filter((block) => block.type === 'compaction')
      .map((block) => String(block.content ?? ''))
      .join('\n'),
  };
  calls.push(entry);
  return entry;
}

function betasOf(request: IncomingMessage): string[] {
  return String(request.headers['anthropic-beta'] ?? '').split(',').map((value) => value.trim()).filter(Boolean);
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
        primaryFail?: { status: number; count: number; skip?: number; writer?: string } | null;
        primaryStreamCut?: { count: number; skip?: number; writer?: string } | null;
      };
      failWriters = new Set(Array.isArray(body.failWriter) ? body.failWriter : body.failWriter ? [body.failWriter] : []);
      delayMs = body.delayMs ?? 0;
      override = typeof body.inputTokens === 'number' ? { inputTokens: body.inputTokens, writer: body.inputTokensFor ?? null, skip: body.skipCalls ?? 0 } : null;
      overrideSeen = 0;
      primaryFail = body.primaryFail
        ? { status: body.primaryFail.status, remaining: body.primaryFail.count, skip: body.primaryFail.skip ?? 0, writer: body.primaryFail.writer ?? null }
        : null;
      primaryStreamCut = body.primaryStreamCut
        ? { remaining: body.primaryStreamCut.count, skip: body.primaryStreamCut.skip ?? 0, writer: body.primaryStreamCut.writer ?? null }
        : null;
      return json(response, 200, { ok: true, failWriters: [...failWriters], delayMs, override, primaryFail, primaryStreamCut });
    }
    if (url.pathname === '/__calls') return json(response, 200, calls);
    if (url.pathname === '/__health') return json(response, 200, { ok: true });
    if (url.pathname === '/__reset') {
      calls.length = 0;
      cacheEntries.anthropic.clear();
      cacheEntries.bedrock.clear();
      primaryFail = null;
      primaryStreamCut = null;
      failWriters = new Set();
      delayMs = 0;
      override = null;
      overrideSeen = 0;
      return json(response, 200, { ok: true });
    }

    const provider: Provider = url.pathname.startsWith('/bedrock/') ? 'bedrock' : 'anthropic';
    const auth = authOf(request);
    if (request.method === 'POST' && (url.pathname.endsWith('/v1/messages') || url.pathname.endsWith('/v1/messages/count_tokens'))) {
      // Neither service answers without a credential. Bedrock's mantle endpoint takes a Bearer token only.
      if (auth === 'none' || (provider === 'bedrock' && auth !== 'bearer')) {
        return apiError(response, 401, 'authentication_error', provider === 'bedrock' ? 'Missing Bearer token' : 'x-api-key header or Authorization: Bearer is required');
      }
    }

    if (request.method === 'POST' && url.pathname.endsWith('/v1/messages/count_tokens')) {
      const body = JSON.parse(await readBody(request)) as MessagesBody;
      const writer = writerFor(body.system) ?? 'unknown';
      const entry = record(body, 'count_tokens', writer, [], provider, auth);
      entry.betas = betasOf(request);
      // The same message checks as a messages call: a carried block without the beta header is a 400 here too.
      const countInvalid = validate({ ...body, compaction: undefined }, null, [], provider, entry.betas);
      if (countInvalid) { entry.status = 400; return apiError(response, 400, 'invalid_request_error', countInvalid); }
      const modelError = modelIdError(provider, body.model);
      if (modelError) { entry.status = 400; return apiError(response, 400, 'invalid_request_error', modelError); }
      const counted = overrideApplies(writer) ? (override as NonNullable<typeof override>).inputTokens : totalTokens(body);
      entry.countedTokens = counted;
      return json(response, 200, { input_tokens: counted });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/v1/messages')) {
      const body = JSON.parse(await readBody(request)) as MessagesBody;
      const writer = writerFor(body.system);
      const units = unitsOf(body);
      const cache = simulateCache(units, provider);
      const entry = record(body, 'messages', writer ?? 'unknown', cache.markers, provider, auth);
      entry.betas = betasOf(request);
      const fail = (status: number, type: string, message: string) => { entry.status = status; apiError(response, status, type, message); };

      if (!writer) return fail(500, 'api_error', 'unscripted writer');
      const modelError = modelIdError(provider, body.model);
      if (modelError) return fail(400, 'invalid_request_error', modelError);
      if (provider === 'anthropic' && primaryFail && (primaryFail.writer === null || primaryFail.writer === writer)) {
        if (primaryFail.skip > 0) {
          primaryFail.skip -= 1;
        } else if (primaryFail.remaining > 0) {
          primaryFail.remaining -= 1;
          if (primaryFail.status === 529) return fail(529, 'overloaded_error', 'Overloaded');
          if (primaryFail.status === 400) return fail(400, 'invalid_request_error', 'scripted 400');
          return fail(primaryFail.status, 'api_error', `scripted ${primaryFail.status}`);
        }
      }
      const invalid = validate(body, writer, cache.markers, provider, entry.betas);
      if (invalid) return fail(400, 'invalid_request_error', invalid);
      const schemaRule = schemaRuleError(jsonSchemaOf(body));
      if (schemaRule) return fail(400, 'invalid_request_error', schemaRule);
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
        content = answer.content.map((block) => {
          if (provider !== 'bedrock' || block.type !== 'thinking') return block;
          const signature = `${BEDROCK_SIGNATURE_PREFIX}${String(block.signature)}`;
          issuedThinkingSignatures.add(signature);
          return { ...block, signature };
        });
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
      const counts = {
        input_tokens: input,
        output_tokens: output,
        cache_creation_input_tokens: cache.creation,
        cache_read_input_tokens: cache.read,
        cache_creation: { ephemeral_5m_input_tokens: cache.creation5m, ephemeral_1h_input_tokens: cache.creation1h },
      };
      // A compaction's counts are only in its iteration; the top level reads 0, as the API sends it.
      const usage: Usage = stopReason === 'compaction'
        ? {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
            iterations: [{ ...counts, type: 'compaction' }],
          }
        : { ...counts, iterations: [{ ...counts, type: 'message' }] };
      entry.stopReason = stopReason;
      entry.usage = {
        input, output, cacheCreation: cache.creation, cacheRead: cache.read,
        creation5m: cache.creation5m, creation1h: cache.creation1h, total: input + cache.read + cache.creation,
      };
      const replyError = replySchemaError(body, content);
      if (replyError) return fail(500, 'api_error', replyError);
      // Every refusal is above: only a request that gets a response writes its cache entries (a cut stream has
      // started its response, so it writes too, as the real API does).
      cache.commit();
      if (body.stream) {
        const text = content.filter((block) => block.type === 'text').map((block) => String(block.text)).join('');
        let cut = false;
        if (provider === 'anthropic' && primaryStreamCut && (primaryStreamCut.writer === null || primaryStreamCut.writer === writer)) {
          if (primaryStreamCut.skip > 0) primaryStreamCut.skip -= 1;
          else if (primaryStreamCut.remaining > 0) { primaryStreamCut.remaining -= 1; cut = true; }
        }
        entry.streamCut = cut;
        return sse(response, model, text, usage, cut);
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
