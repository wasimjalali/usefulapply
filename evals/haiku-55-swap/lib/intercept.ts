/**
 * How the harness reaches the shipped code without touching production state.
 *
 * Every case runs inside a Scope (AsyncLocalStorage). The shipped call sites call callHaiku (or, in
 * pre-swap code, callWorkersAI), and one of three things answers:
 *
 *   haiku arm, live   the REAL callHaiku runs. A fetch wrapper (installWire) rewrites the outgoing
 *                     /v1/messages body to the arm (output_config.effort, thinking), salts the cached
 *                     prefix so arms never read each other's cache entries, and records the exact request
 *                     and usage (cache read / 5m write / 1h write / uncached) from the response.
 *   gptoss arm        callHaiku is answered by the Workers AI eval worker (worker.ts), after translating
 *                     the Anthropic-shaped request into the OpenAI chat shape callWorkersAI used.
 *   dry               callHaiku is answered by the case's oracle. No network. The request the shipped
 *                     code built is still captured, and cache behaviour is predicted from prefix hashes.
 *
 * No ledger row, PostHog event or D1 write happens in any of them (see installHaikuHooks).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { installHaikuHooks, setHaikuBackend, setOfflineMeasure } from '../../lib/hooks';
import { costUsd, inputTotal, HARNESS_INPUT_BUDGET, wireEffort, type Arm, type CallRecord, type SiteId, type Usage } from './core';

export interface NeutralMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  text: string;
  toolUses?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  toolResultFor?: string;
}

export interface NeutralRequest {
  site: SiteId;
  systemStatic: string;
  systemStable: string;
  messages: NeutralMessage[];
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  jsonSchema: Record<string, unknown> | null;
  maxTokens: number | null;
}

export interface OracleReply {
  text: string;
  /** Dry run of a compaction request (site chat_compaction): the summary the block carries. */
  compactionSummary?: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}
export type Oracle = (req: NeutralRequest, callIndex: number) => OracleReply;

export interface Scope {
  site: SiteId;
  arm: Arm;
  run: number;
  caseId: string;
  group: string;
  dry: boolean;
  /** Per (arm, run) salt for the cached prefix. null = unsalted (steady-state measurement). */
  salt: string | null;
  calls: CallRecord[];
  seq: { n: number };
  oracle?: Oracle;
  gptossUrl?: string;
  countTokens: number;
}

export const scopeStore = new AsyncLocalStorage<Scope>();

export function currentScope(): Scope {
  const s = scopeStore.getStore();
  if (!s) throw new Error('No eval scope: a shipped call ran outside a harness case');
  return s;
}

export const estTokens = (chars: number): number => Math.ceil(chars / 1.8);
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------
// Option shapes (kept structural so this file compiles before W1 lands; the real types are in src)
// ---------------------------------------------------------------------------

interface HaikuOptionsLike {
  site: SiteId | string;
  system: { static: string; stableContext?: string };
  messages: Array<{ role: string; content: unknown }>;
  tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  jsonSchema?: Record<string, unknown>;
  maxTokens: number;
}

interface WorkersAiOptionsLike {
  prompt: string;
  systemPrompt?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  rawMessages?: Array<{ role: string; content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string }>;
  conversationHistory?: Array<{ role: string; content: string }>;
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

function blockText(content: unknown): { text: string; toolUses: NonNullable<NeutralMessage['toolUses']>; results: Array<{ id: string; text: string }> } {
  if (typeof content === 'string') return { text: content, toolUses: [], results: [] };
  const text: string[] = [];
  const toolUses: NonNullable<NeutralMessage['toolUses']> = [];
  const results: Array<{ id: string; text: string }> = [];
  for (const raw of Array.isArray(content) ? content : []) {
    const b = raw as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') text.push(b.text);
    else if (b.type === 'tool_use') toolUses.push({ id: String(b.id), name: String(b.name), input: (b.input ?? {}) as Record<string, unknown> });
    else if (b.type === 'tool_result') results.push({ id: String(b.tool_use_id), text: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) });
    // thinking and compaction blocks carry no text the baseline can use
  }
  return { text: text.join('\n'), toolUses, results };
}

export function neutralFromHaiku(o: HaikuOptionsLike): NeutralRequest {
  const messages: NeutralMessage[] = [];
  for (const m of o.messages) {
    const { text, toolUses, results } = blockText(m.content);
    if (results.length > 0) {
      for (const r of results) messages.push({ role: 'tool', text: r.text, toolResultFor: r.id });
      if (text) messages.push({ role: 'user', text });
    } else {
      const role = m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user';
      messages.push({ role, text, ...(toolUses.length > 0 ? { toolUses } : {}) });
    }
  }
  return {
    site: o.site as SiteId,
    systemStatic: o.system.static,
    systemStable: o.system.stableContext ?? '',
    messages,
    tools: o.tools ?? [],
    jsonSchema: o.jsonSchema ?? null,
    maxTokens: o.maxTokens,
  };
}

export function neutralFromWorkersAi(site: SiteId, o: WorkersAiOptionsLike): NeutralRequest {
  const messages: NeutralMessage[] = [];
  if (o.rawMessages && o.rawMessages.length > 0) {
    for (const m of o.rawMessages) {
      if (m.role === 'tool') messages.push({ role: 'tool', text: m.content ?? '', toolResultFor: m.tool_call_id });
      else if (m.role === 'assistant' && m.tool_calls) {
        messages.push({ role: 'assistant', text: m.content ?? '', toolUses: m.tool_calls.map((t) => ({ id: t.id, name: t.function.name, input: JSON.parse(t.function.arguments) as Record<string, unknown> })) });
      } else messages.push({ role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', text: m.content ?? '' });
    }
  } else if (o.conversationHistory && o.conversationHistory.length > 0) {
    for (const m of o.conversationHistory) messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', text: m.content });
  } else {
    messages.push({ role: 'user', text: o.prompt });
  }
  return {
    site,
    systemStatic: o.systemPrompt ?? '',
    systemStable: '',
    messages,
    tools: (o.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    jsonSchema: o.jsonMode ? {} : null,
    maxTokens: o.maxTokens ?? null,
  };
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

function charsOf(req: NeutralRequest): number {
  return req.systemStatic.length + req.systemStable.length + JSON.stringify(req.tools).length + req.messages.reduce((n, m) => n + m.text.length + JSON.stringify(m.toolUses ?? []).length, 0);
}

function baseRecord(scope: Scope, backend: CallRecord['backend']): CallRecord {
  return {
    seq: ++scope.seq.n,
    site: scope.site,
    arm: scope.arm.id,
    run: scope.run,
    caseId: scope.caseId,
    backend,
    request: { model: '', effort: null, thinking: null, maxTokens: null, systemChars: 0, stableChars: 0, tools: 0, messages: 0, jsonSchema: false, cacheMarkers: 0, prefixHash: null, stablePrefixHash: null, estInputTokens: 0, salted: scope.salt !== null },
    response: null,
    usage: null,
    inputTotal: 0,
    latencyMs: 0,
    costUsd: 0,
    over100k: false,
    countTokensCalls: 0,
    error: null,
  };
}

function finishRecord(scope: Scope, rec: CallRecord, usage: Usage | null): void {
  rec.countTokensCalls = scope.countTokens;
  scope.countTokens = 0;
  if (usage) {
    rec.usage = usage;
    rec.inputTotal = inputTotal(usage);
    rec.costUsd = costUsd(scope.arm, usage);
    rec.over100k = rec.inputTotal > HARNESS_INPUT_BUDGET;
  }
  scope.calls.push(rec);
}

function requestSummary(scope: Scope, req: NeutralRequest, model: string): CallRecord['request'] {
  const effort = scope.arm.kind === 'haiku' ? wireEffort(scope.arm) : null;
  return {
    model,
    effort,
    thinking: scope.arm.kind === 'haiku' ? (scope.arm.effort === 'low-nothink' ? 'disabled' : 'adaptive') : null,
    maxTokens: req.maxTokens,
    systemChars: req.systemStatic.length,
    stableChars: req.systemStable.length,
    tools: req.tools.length,
    messages: req.messages.length,
    jsonSchema: req.jsonSchema !== null,
    cacheMarkers: (req.systemStatic ? 1 : 0) + (req.systemStable ? 1 : 0),
    prefixHash: sha(JSON.stringify(req.tools) + req.systemStatic),
    stablePrefixHash: sha(JSON.stringify(req.tools) + req.systemStatic + req.systemStable),
    estInputTokens: estTokens(charsOf(req)),
    salted: scope.salt !== null,
  };
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

/** What a prefix the size of the cached part of this request would do on the real API: writes the first time, reads after. */
const dryCacheSeen = new Set<string>();

function dryUsage(scope: Scope, req: NeutralRequest, reply: OracleReply, prefixHash: string): Usage {
  const total = estTokens(charsOf(req));
  const prefix = estTokens(JSON.stringify(req.tools).length + req.systemStatic.length + req.systemStable.length);
  const cacheable = prefix >= 512;
  const key = `${scope.salt ?? 'unsalted'}|${scope.arm.id}|${prefixHash}`;
  const hit = cacheable && dryCacheSeen.has(key);
  if (cacheable) dryCacheSeen.add(key);
  return {
    input: cacheable ? total - prefix : total,
    output: estTokens(reply.text.length + JSON.stringify(reply.toolCalls ?? []).length),
    cacheRead: hit ? prefix : 0,
    cacheWrite5m: cacheable && !hit ? prefix : 0,
    cacheWrite1h: 0,
  };
}

export function dryReplyFor(scope: Scope, req: NeutralRequest): OracleReply {
  if (!scope.oracle) throw new Error(`dry run: case ${scope.caseId} has no oracle`);
  return scope.oracle(req, scope.calls.length);
}

/** Old production sampling and budgets per site, so the baseline arm sees what gpt-oss saw. */
const GPTOSS_SETTINGS: Record<SiteId, { temperature: number; maxTokens: number }> = {
  chat: { temperature: 0.6, maxTokens: 4000 },
  chat_ux: { temperature: 0.6, maxTokens: 4000 },
  screening: { temperature: 0.4, maxTokens: 8000 },
  tracker: { temperature: 0.3, maxTokens: 4000 },
  language: { temperature: 0, maxTokens: 2048 },
  ranking: { temperature: 0.2, maxTokens: 12000 },
  search_strategy: { temperature: 0.4, maxTokens: 5000 },
  career_profile: { temperature: 0.4, maxTokens: 6000 },
};

const JSON_ONLY = 'IMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';

interface OpenAiReply {
  model?: string;
  latencyMs?: number;
  result: {
    choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: Array<{ id?: string; function: { name: string; arguments: string } }> } }>;
    response?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
}

async function gptossCall(scope: Scope, req: NeutralRequest): Promise<{ reply: OracleReply; usage: Usage; stop: string | null }> {
  if (!scope.gptossUrl) throw new Error('gpt-oss arm needs --gptoss-url (the eval worker, see evals/haiku-55-swap/worker.ts)');
  const settings = GPTOSS_SETTINGS[scope.site];
  // Production sent gpt-oss a "Reasoning: low" line on chat and tracker chat (harmony). The swap removes it from the
  // shipped prompts, so the baseline gets it here, as it had it.
  const legacyReasoning = (scope.site === 'chat' || scope.site === 'chat_ux' || scope.site === 'tracker') && !/Reasoning:/.test(req.systemStatic) ? '\n\nReasoning: low' : '';
  const system = [req.systemStatic, req.systemStable].filter(Boolean).join('\n\n') + legacyReasoning + (req.jsonSchema ? `\n\n${JSON_ONLY}` : '');
  const messages: Array<Record<string, unknown>> = [];
  if (system.trim()) messages.push({ role: 'system', content: system });
  for (const m of req.messages) {
    if (m.role === 'tool') messages.push({ role: 'tool', tool_call_id: m.toolResultFor, content: m.text });
    else if (m.role === 'assistant' && m.toolUses?.length) {
      messages.push({ role: 'assistant', content: m.text, tool_calls: m.toolUses.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input) } })) });
    } else messages.push({ role: m.role, content: m.text });
  }
  const body = {
    messages,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    ...(req.jsonSchema ? { response_format: { type: 'json_object' } } : {}),
    ...(req.tools.length > 0 ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}),
  };
  const res = await fetch(scope.gptossUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`gpt-oss worker answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as OpenAiReply;
  const choice = json.result.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === 'string' && content.length > 0 ? content : (json.result.response ?? '');
  const toolCalls = (choice?.message?.tool_calls ?? []).map((t, i) => ({ id: t.id ?? `call_${i}`, name: t.function.name, input: JSON.parse(t.function.arguments) as Record<string, unknown> }));
  const u = json.result.usage ?? {};
  if (typeof u.prompt_tokens !== 'number' || typeof u.completion_tokens !== 'number') throw new Error('gpt-oss reply carried no usage');
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    reply: { text, ...(toolCalls.length > 0 ? { toolCalls } : {}) },
    usage: { input: u.prompt_tokens - cached, output: u.completion_tokens, cacheRead: cached, cacheWrite5m: 0, cacheWrite1h: 0 },
    stop: choice?.finish_reason ?? null,
  };
}

async function answer(req: NeutralRequest, scope: Scope): Promise<{ reply: OracleReply; rec: CallRecord }> {
  const backend: CallRecord['backend'] = scope.arm.kind === 'gptoss' ? 'gptoss' : 'dry';
  const rec = baseRecord(scope, backend);
  rec.request = requestSummary(scope, req, scope.arm.kind === 'gptoss' ? '@cf/openai/gpt-oss-120b' : 'claude-haiku-5-5');
  const started = performance.now();
  try {
    let reply: OracleReply;
    let usage: Usage;
    let stop: string | null = 'end_turn';
    if (scope.arm.kind === 'gptoss' && !scope.dry) {
      const out = await gptossCall(scope, req);
      reply = out.reply;
      usage = out.usage;
      stop = out.stop;
    } else {
      reply = dryReplyFor(scope, req);
      usage = dryUsage(scope, req, reply, rec.request.prefixHash ?? '');
      if (reply.toolCalls?.length) stop = 'tool_use';
    }
    rec.latencyMs = Math.round(performance.now() - started);
    rec.response = { text: reply.text, stopReason: stop, requestId: null, toolCalls: (reply.toolCalls ?? []).map((t) => ({ name: t.name, input: t.input })) };
    finishRecord(scope, rec, usage);
    return { reply, rec };
  } catch (error) {
    rec.latencyMs = Math.round(performance.now() - started);
    rec.error = error instanceof Error ? error.message : String(error);
    finishRecord(scope, rec, null);
    throw error;
  }
}

function haikuShaped(reply: OracleReply, rec: CallRecord, req: NeutralRequest) {
  const u = rec.usage!;
  const rawContent: unknown[] = [];
  if (reply.compactionSummary !== undefined) rawContent.push({ type: 'compaction', content: reply.compactionSummary });
  if (reply.text) rawContent.push({ type: 'text', text: reply.text });
  for (const t of reply.toolCalls ?? []) rawContent.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
  return {
    content: reply.text,
    // `arguments` is what ModelResponse types; `input` is what the plan's HaikuResponse names. Both are set.
    toolCalls: reply.toolCalls?.map((t) => ({ id: t.id, name: t.name, arguments: t.input, input: t.input })),
    usage: { inputTokens: u.input, outputTokens: u.output, cacheCreationInputTokens: u.cacheWrite5m + u.cacheWrite1h || undefined, cacheReadInputTokens: u.cacheRead || undefined },
    model: rec.request.model,
    provider: rec.backend === 'gptoss' ? 'workers-ai' : 'anthropic',
    latencyMs: rec.latencyMs,
    generationId: `eval-${rec.seq}`,
    rawContent,
    inputTokensTotal: rec.inputTotal,
    stopReason: rec.response?.stopReason ?? null,
    _req: req.site,
  };
}

/** Installs the module redirects and the backend router. Call once, before any src module is imported. */
export function installHarness(): void {
  installHaikuHooks();
  setOfflineMeasure(() => scopeStore.getStore()?.dry === true);
  setHaikuBackend((kind, options) => {
    const scope = scopeStore.getStore();
    if (!scope) return null;
    if (scope.arm.kind === 'haiku' && !scope.dry) return null; // the real callHaiku, observed by the wire wrapper
    if (kind === 'haiku') {
      const req = neutralFromHaiku(options as HaikuOptionsLike);
      return answer(req, scope).then(({ reply, rec }) => haikuShaped(reply, rec, req));
    }
    if (kind === 'workers-ai-binding') {
      // Pre-swap ranking calls env.AI.run(model, { messages, ... }) directly.
      const input = options as { messages: Array<{ role: string; content: string }>; response_format?: unknown };
      const systemText = input.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const req = neutralFromWorkersAi(scope.site, {
        prompt: '',
        systemPrompt: systemText,
        jsonMode: Boolean(input.response_format),
        rawMessages: input.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
      });
      return answer(req, scope).then(({ reply, rec }) => ({
        choices: [{ message: { content: reply.text } }],
        usage: { prompt_tokens: rec.usage!.input + rec.usage!.cacheRead, completion_tokens: rec.usage!.output, prompt_tokens_details: { cached_tokens: rec.usage!.cacheRead } },
      }));
    }
    const req = neutralFromWorkersAi(scope.site, options as WorkersAiOptionsLike);
    return answer(req, scope).then(({ reply, rec }) => {
      const u = rec.usage!;
      return {
        content: reply.text,
        toolCalls: reply.toolCalls?.map((t) => ({ id: t.id, name: t.name, arguments: t.input })),
        usage: { inputTokens: u.input + u.cacheRead, outputTokens: u.output },
        model: rec.request.model,
        provider: 'workers-ai',
        latencyMs: rec.latencyMs,
        generationId: `eval-${rec.seq}`,
      };
    });
  });
  installWire();
}

// ---------------------------------------------------------------------------
// Wire wrapper for the live Haiku arms
// ---------------------------------------------------------------------------

interface WireBody {
  model?: string;
  max_tokens?: number;
  stream?: boolean;
  system?: string | Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  messages?: Array<{ role: string; content: unknown }>;
  thinking?: { type: string };
  output_config?: Record<string, unknown>;
  cache_control?: unknown;
}

/** Pure, exported for the dry self-test: the arm's effect on a /v1/messages body. */
export function applyArm(body: WireBody, arm: Arm, salt: string | null): WireBody {
  const out = JSON.parse(JSON.stringify(body)) as WireBody;
  out.output_config = { ...(out.output_config ?? {}), effort: wireEffort(arm) };
  if (arm.effort === 'low-nothink') out.thinking = { type: 'disabled' };
  else if (out.thinking?.type === 'disabled') delete out.thinking;
  if (salt) {
    const line = `[eval cache salt ${salt}]`;
    if (typeof out.system === 'string') out.system = `${line}\n${out.system}`;
    else if (Array.isArray(out.system) && out.system.length > 0) {
      const first = out.system[0] as { text?: string };
      first.text = `${line}\n${first.text ?? ''}`;
    } else out.system = line;
  }
  return out;
}

/** Hashes of the cached prefix: up to the first marker, and up to the last marker in tools or system. */
export function wirePrefixHashes(body: WireBody): { first: string | null; stable: string | null; markers: number } {
  const blocks: Array<{ json: string; marked: boolean; zone: 'tools' | 'system' | 'messages' }> = [];
  for (const t of body.tools ?? []) blocks.push({ json: JSON.stringify(t), marked: Boolean(t.cache_control), zone: 'tools' });
  if (typeof body.system === 'string') blocks.push({ json: body.system, marked: false, zone: 'system' });
  else for (const s of body.system ?? []) blocks.push({ json: JSON.stringify(s), marked: Boolean(s.cache_control), zone: 'system' });
  for (const m of body.messages ?? []) {
    if (typeof m.content === 'string') blocks.push({ json: JSON.stringify(m), marked: false, zone: 'messages' });
    else for (const b of m.content as Array<Record<string, unknown>>) blocks.push({ json: JSON.stringify([m.role, b]), marked: Boolean(b.cache_control), zone: 'messages' });
  }
  const marked = blocks.map((b, i) => (b.marked ? i : -1)).filter((i) => i >= 0);
  const hashTo = (end: number) => sha(blocks.slice(0, end + 1).map((b) => b.json).join('\n'));
  const stableEnds = marked.filter((i) => blocks[i].zone !== 'messages');
  return {
    first: marked.length > 0 ? hashTo(marked[0]) : null,
    stable: stableEnds.length > 0 ? hashTo(stableEnds[stableEnds.length - 1]) : null,
    markers: marked.length + (body.cache_control ? 1 : 0),
  };
}

interface WireUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
  iterations?: Array<{ input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }>;
}

/** Usage from a response. With compaction the top level can read zero and the real numbers sit in iterations. */
export function usageFromWire(u: WireUsage): Usage {
  const top = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, read: u.cache_read_input_tokens ?? 0, write: u.cache_creation_input_tokens ?? 0 };
  const iter = (u.iterations ?? []).reduce(
    (a, i) => ({ input: a.input + (i.input_tokens ?? 0), output: a.output + (i.output_tokens ?? 0), read: a.read + (i.cache_read_input_tokens ?? 0), write: a.write + (i.cache_creation_input_tokens ?? 0) }),
    { input: 0, output: 0, read: 0, write: 0 },
  );
  const useIter = iter.input + iter.output + iter.read + iter.write > top.input + top.output + top.read + top.write;
  const pick = useIter ? { input: iter.input, output: iter.output, read: iter.read, write: iter.write } : top;
  const w5 = u.cache_creation?.ephemeral_5m_input_tokens;
  const w1 = u.cache_creation?.ephemeral_1h_input_tokens;
  const split = !useIter && (w5 !== undefined || w1 !== undefined);
  return {
    input: pick.input,
    output: pick.output,
    cacheRead: pick.read,
    cacheWrite5m: split ? (w5 ?? 0) : pick.write,
    cacheWrite1h: split ? (w1 ?? 0) : 0,
  };
}

let wireInstalled = false;

function installWire(): void {
  if (wireInstalled) return;
  wireInstalled = true;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const scope = scopeStore.getStore();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    if (!scope || scope.arm.kind !== 'haiku' || scope.dry) return original(input, init);
    if (path.endsWith('/v1/messages/count_tokens')) {
      scope.countTokens += 1;
      return original(input, init);
    }
    if (!path.endsWith('/v1/messages') || typeof init?.body !== 'string') return original(input, init);
    const sent = JSON.parse(init.body) as WireBody;
    if (typeof sent.model !== 'string' || !sent.model.startsWith('claude-haiku')) return original(input, init);
    if (sent.stream) throw new Error('harness: a streamed Haiku request is not supported by the eval wire recorder');

    const body = applyArm(sent, scope.arm, scope.salt);
    const hashes = wirePrefixHashes(body);
    const rec = baseRecord(scope, 'haiku-live');
    const sysText = typeof body.system === 'string' ? body.system : (body.system ?? []).map((s) => String(s.text ?? '')).join('');
    rec.request = {
      model: String(body.model),
      effort: String(body.output_config?.effort ?? ''),
      thinking: body.thinking?.type ?? 'adaptive (omitted)',
      maxTokens: body.max_tokens ?? null,
      systemChars: sysText.length,
      stableChars: 0,
      tools: body.tools?.length ?? 0,
      messages: body.messages?.length ?? 0,
      jsonSchema: Boolean(body.output_config?.format),
      cacheMarkers: hashes.markers,
      prefixHash: hashes.first,
      stablePrefixHash: hashes.stable,
      estInputTokens: estTokens(JSON.stringify(body).length),
      salted: scope.salt !== null,
    };
    const started = performance.now();
    try {
      const res = await original(input, { ...init, body: JSON.stringify(body) });
      const text = await res.text();
      rec.latencyMs = Math.round(performance.now() - started);
      const requestId = res.headers.get('request-id');
      if (!res.ok) {
        rec.error = `HTTP ${res.status}: ${text.slice(0, 300)}`;
        finishRecord(scope, rec, null);
      } else {
        const json = JSON.parse(text) as { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>; stop_reason?: string | null; usage?: WireUsage };
        if (!json.usage) throw new Error('Anthropic response carried no usage');
        rec.response = {
          text: (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(''),
          stopReason: json.stop_reason ?? null,
          requestId,
          toolCalls: (json.content ?? []).filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name ?? '', input: b.input })),
        };
        finishRecord(scope, rec, usageFromWire(json.usage));
      }
      return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (error) {
      if (!rec.error && !scope.calls.includes(rec)) {
        rec.latencyMs = Math.round(performance.now() - started);
        rec.error = error instanceof Error ? error.message : String(error);
        finishRecord(scope, rec, null);
      }
      throw error;
    }
  };
}
