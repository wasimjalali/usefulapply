/**
 * Claude Sonnet 5.5 for the kit writers, CV parsing, context extraction and fit analysis.
 *
 * Primary: the Anthropic API. Request shape: adaptive thinking, effort low, no temperature/top_p/top_k
 * (the 2026-10-21 API rejects them; voice and variety are steered in the prompts), max_tokens scaled up
 * because thinking counts toward it, no prefill.
 * Failover: Claude in Amazon Bedrock, same model and same request body, sent only after a network failure
 * or a 5xx on the primary (see providers.ts). A failed primary attempt and the Bedrock attempt each write
 * their own ledger row; the ModelResponse says which provider answered.
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
  completeLlmGeneration,
  failLlmGeneration,
  startLlmGeneration,
  type LlmGenerationContext,
} from '@/db/repos/adminMetrics';
import type { Json } from '@/db/schema';
import { getPostHogServer } from '@/lib/posthog-server';
import {
  captureFailoverEvent,
  failoverErrorKind,
  getBedrockClient,
  getPrimaryClient,
  isFailoverError,
  runWithFailover,
  type FailoverTarget,
  type MessagesClient,
  type ProviderName,
} from './providers';
import { createStreamGuard, outputTokensPartial, partialStreamUsage, streamMaxGapOf } from './stream-guard';
import type { ModelResponse, ConversationMessage, CacheableContentBlock, CacheTtl } from './types';

type LedgerAwareResponse = {
  usage?: unknown;
  id?: string;
  _request_id?: string;
};

function exactTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function usageRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function usageJson(value: unknown): Json | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return null;
  }
}

/** Token counts of one usage record (a response's top level or one `usage.iterations` entry). */
export interface UsageParts {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** 5-minute and 1-hour split of cacheCreationInputTokens; a total with no split counts as 5m. */
  cacheCreation5mInputTokens: number;
  cacheCreation1hInputTokens: number;
}

function usagePartsOfRecord(usage: Record<string, unknown>): UsageParts | null {
  const inputTokens = exactTokenCount(usage.input_tokens);
  const outputTokens = exactTokenCount(usage.output_tokens);
  if (inputTokens === null || outputTokens === null) return null;
  // Anthropic sends the cache fields on every record, as 0 when unused. An absent field is
  // a record this code does not understand, so it is rejected, not read as 0.
  const cacheReadInputTokens = exactTokenCount(usage.cache_read_input_tokens);
  const cacheCreationInputTokens = exactTokenCount(usage.cache_creation_input_tokens);
  if (cacheReadInputTokens === null || cacheCreationInputTokens === null) return null;
  const split = usageRecord(usage.cache_creation);
  const write1h = exactTokenCount(split?.ephemeral_1h_input_tokens) ?? 0;
  const write5m = exactTokenCount(split?.ephemeral_5m_input_tokens) ?? 0;
  const splitTotal = write1h + write5m;
  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    cacheCreation1hInputTokens: write1h,
    // Anything the split does not account for is the default 5-minute write.
    cacheCreation5mInputTokens: write5m + Math.max(0, cacheCreationInputTokens - splitTotal),
  };
}

/**
 * Usage records that make up one response. With compaction, top-level counts are 0 (or only the final
 * message) and the real counts are in `usage.iterations`, one entry per iteration (a normal response
 * has one `message` entry equal to the top level). So iterations replace the top level, never add to
 * it. Returns null when the shape is not understood, so callers record a coverage gap, not a zero.
 */
export function usageRecordsOf(value: unknown): UsageParts[] | null {
  const usage = usageRecord(value);
  if (!usage) return null;
  if (Array.isArray(usage.iterations) && usage.iterations.length > 0) {
    const parts: UsageParts[] = [];
    for (const iteration of usage.iterations) {
      const record = usageRecord(iteration);
      const entry = record ? usagePartsOfRecord(record) : null;
      if (!entry) return null;
      parts.push(entry);
    }
    return parts;
  }
  const top = usagePartsOfRecord(usage);
  return top ? [top] : null;
}

export function sumUsageParts(parts: UsageParts[]): UsageParts {
  return parts.reduce<UsageParts>((sum, p) => ({
    inputTokens: sum.inputTokens + p.inputTokens,
    outputTokens: sum.outputTokens + p.outputTokens,
    cacheReadInputTokens: sum.cacheReadInputTokens + p.cacheReadInputTokens,
    cacheCreationInputTokens: sum.cacheCreationInputTokens + p.cacheCreationInputTokens,
    cacheCreation5mInputTokens: sum.cacheCreation5mInputTokens + p.cacheCreation5mInputTokens,
    cacheCreation1hInputTokens: sum.cacheCreation1hInputTokens + p.cacheCreation1hInputTokens,
  }), {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    cacheCreation1hInputTokens: 0,
  });
}

export function normalizeProviderUsage(value: unknown): {
  usageReported: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  providerTotalTokens: number | null;
  providerUsage: Json | null;
} {
  const usage = usageRecord(value);
  const hasIterations = Array.isArray(usage?.iterations) && usage.iterations.length > 0;
  if (hasIterations) {
    // Compaction billing lives only in iterations: sum them. A malformed entry leaves the counts
    // null (usage_reported false) so the row shows as a coverage gap instead of a wrong number.
    const parts = usageRecordsOf(value);
    const total = parts ? sumUsageParts(parts) : null;
    return {
      usageReported: total !== null,
      inputTokens: total?.inputTokens ?? null,
      outputTokens: total?.outputTokens ?? null,
      cacheReadInputTokens: total?.cacheReadInputTokens ?? null,
      cacheWriteInputTokens: total?.cacheCreationInputTokens ?? null,
      providerTotalTokens: null,
      providerUsage: usageJson(value),
    };
  }
  const inputTokens = exactTokenCount(usage?.input_tokens ?? usage?.inputTokens ?? usage?.prompt_tokens);
  const outputTokens = exactTokenCount(usage?.output_tokens ?? usage?.outputTokens ?? usage?.completion_tokens);
  const cacheReadInputTokens = exactTokenCount(
    usage?.cache_read_input_tokens
      ?? usage?.cacheReadInputTokens
      ?? usageRecord(usage?.prompt_tokens_details)?.cached_tokens,
  );
  const cacheWriteInputTokens = exactTokenCount(
    usage?.cache_creation_input_tokens ?? usage?.cacheWriteInputTokens,
  );
  const providerTotalTokens = exactTokenCount(usage?.total_tokens ?? usage?.totalTokens);
  return {
    usageReported: providerTotalTokens !== null || (inputTokens !== null && outputTokens !== null),
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheWriteInputTokens,
    providerTotalTokens,
    providerUsage: usageJson(value),
  };
}

function fallbackGenerationContext(operation: string): LlmGenerationContext {
  return {
    requestExecutionId: crypto.randomUUID(),
    route: 'unattributed',
    feature: 'unattributed',
    operation,
  };
}

export function providerHttpStatus(error: unknown): number | null {
  return typeof error === 'object' && error !== null && 'status' in error ? exactTokenCount(error.status) : null;
}

export async function completeProviderGeneration(params: {
  id: string;
  startedAtMs: number;
  response: LedgerAwareResponse;
}): Promise<void> {
  const normalized = normalizeProviderUsage(params.response.usage);
  try {
    await completeLlmGeneration({
      id: params.id,
      latencyMs: Date.now() - params.startedAtMs,
      attemptCount: 1,
      providerRequestId: params.response._request_id ?? params.response.id ?? null,
      ...normalized,
    });
  } catch (error) {
    // The durable started row remains an explicit coverage gap. Do not discard
    // a valid provider response because its terminal observability write failed.
    console.error('[llm-ledger] completion write failed', params.id, error);
  }
}

export async function recordProviderFailure(params: Parameters<typeof failLlmGeneration>[0]): Promise<void> {
  try {
    await failLlmGeneration(params);
  } catch (error) {
    // Preserve the original provider error. The started row still records that
    // the call has no trustworthy terminal usage.
    console.error('[llm-ledger] failure write failed', params.id, error);
  }
}

/** The primary model. Bedrock serves the same model under providers.ts BEDROCK_MODEL_IDS. */
const SONNET_MODEL_ID = 'claude-sonnet-5-5';
// Effort low won the eval for every task: medium bought nothing measurable on the documents
// and added latency and fit-score inflation.
const SONNET_EFFORT = 'low';
// The SDK refuses non-streaming requests it estimates could run past its HTTP timeout, so
// requests above this budget stream and wait for the final message.
export const STREAM_ABOVE_MAX_TOKENS = 16_000;

/**
 * Per-call HTTP timeouts in place of the SDK's 10 minutes, so a hung primary fails over to Bedrock in
 * minutes, not after 20 (one SDK retry). The SDK arms the timeout until response headers: for a
 * non-streamed call that is the whole generation (Sonnet 5.5 peaked at 30 s in production over 60 days,
 * Sonnet 4.6 at 63 s), for a stream it is the time to the first byte.
 */
export const SONNET_TIMEOUT_MS = 120_000;
export const SONNET_STREAM_FIRST_BYTE_TIMEOUT_MS = 60_000;
/**
 * Idle timeout of a stream after its headers (Sonnet and Haiku): if no byte arrives for this long, ping events
 * included, we abort it and the call fails over (StreamIdleTimeoutError). The SDK has no such timer, and its own
 * `timeout` ends at the headers. Pings arrive during quiet thinking, so 60 s of nothing at all means a dead stream.
 */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

let streamIdleTimeoutOverrideMs: number | null = null;
/** The idle timeout in force: STREAM_IDLE_TIMEOUT_MS, or the test override. */
export function streamIdleTimeoutMs(): number {
  return streamIdleTimeoutOverrideMs ?? STREAM_IDLE_TIMEOUT_MS;
}
/** Shrink the idle timeout for a test. `null` restores the real one. */
export function setStreamIdleTimeoutForTests(ms: number | null): void {
  streamIdleTimeoutOverrideMs = ms;
}

/**
 * Thinking counts toward max_tokens and the Sonnet 5.5 tokenizer produces about 30% more
 * tokens than the old Sonnet 4.6 for the same text, so the budgets first tuned on 4.6 are scaled up.
 */
function sonnetMaxTokens(taskMaxTokens: number): number {
  return Math.max(4000, 4 * taskMaxTokens);
}

export interface ModelPricing {
  /** USD per million tokens */
  inputPerM: number;
  outputPerM: number;
  /** 5-minute cache write, 1.25x input */
  cacheWritePerM: number;
  /** Cache read: 0.05x input on Sonnet 5.5, 0.1x on Haiku 5.5 */
  cacheReadPerM: number;
  /** 1-hour cache write, 2x input. Only the Haiku 5.5 table carries it. */
  cacheWrite1hPerM?: number;
}

// Cache read is $0.10 (5% of input) per the Sonnet 5.5 model page on platform.claude.com.
// The same list prices apply on Amazon Bedrock's global endpoint; regional endpoints carry a 10% premium, not modelled.
const SONNET_55_PRICING: Required<ModelPricing> = { inputPerM: 2, outputPerM: 10, cacheWritePerM: 2.5, cacheWrite1hPerM: 4, cacheReadPerM: 0.1 };

/**
 * Cost in USD of one Sonnet 5.5 response from its raw `usage`, with the 5-minute and 1-hour writes priced
 * apart. Throws on a usage shape it does not understand: a missing cost must not read as $0.
 */
export function sonnet55CostUsd(rawUsage: unknown): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number } {
  const records = usageRecordsOf(rawUsage);
  if (!records) throw new Error('Cannot price Sonnet 5.5 usage: unrecognised usage shape');
  const p = sumUsageParts(records);
  const rate = SONNET_55_PRICING;
  const inputCostUsd = (p.inputTokens * rate.inputPerM
    + p.cacheReadInputTokens * rate.cacheReadPerM
    + p.cacheCreation5mInputTokens * rate.cacheWritePerM
    + p.cacheCreation1hInputTokens * rate.cacheWrite1hPerM) / 1_000_000;
  const outputCostUsd = (p.outputTokens * rate.outputPerM) / 1_000_000;
  return { inputCostUsd, outputCostUsd, totalCostUsd: inputCostUsd + outputCostUsd };
}

/**
 * Claude Haiku 5.5 list price per million tokens (platform.claude.com Haiku 5.5 page, read 2026-10-22).
 * Two tiers by the prompt length of one request or iteration (input + cache read + cache write):
 * up to 100k tokens, and over 100k. The 1-hour write is 2x input; the page lists the 5-minute write
 * for the over-100k tier, so its 1-hour write ($1.00) is derived the same way. We keep every request
 * under 100k, so the upper tier should never fire, but cost stays right if it does.
 */
export const HAIKU_55_PRICING = {
  tierThresholdTokens: 100_000,
  upTo100k: { inputPerM: 0.1, outputPerM: 0.5, cacheWritePerM: 0.125, cacheWrite1hPerM: 0.2, cacheReadPerM: 0.01 },
  over100k: { inputPerM: 0.5, outputPerM: 2.5, cacheWritePerM: 0.625, cacheWrite1hPerM: 1, cacheReadPerM: 0.05 },
} as const satisfies { tierThresholdTokens: number; upTo100k: Required<ModelPricing>; over100k: Required<ModelPricing> };

/** Rates for a request whose prompt is `promptTokens` long (input + cache read + cache write). */
export function haiku55PricingFor(promptTokens: number): Required<ModelPricing> {
  return promptTokens > HAIKU_55_PRICING.tierThresholdTokens ? HAIKU_55_PRICING.over100k : HAIKU_55_PRICING.upTo100k;
}

/**
 * Cost in USD of one Haiku 5.5 response from its raw `usage`. Prices each `usage.iterations` entry
 * at its own tier and sums them, so a compaction iteration is billed. Throws on a usage shape it
 * does not understand: a missing cost must not read as $0.
 */
export function haiku55CostUsd(rawUsage: unknown): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number } {
  const records = usageRecordsOf(rawUsage);
  if (!records) throw new Error('Cannot price Haiku 5.5 usage: unrecognised usage shape');
  let inputCostUsd = 0;
  let outputCostUsd = 0;
  for (const p of records) {
    const rate = haiku55PricingFor(p.inputTokens + p.cacheReadInputTokens + p.cacheCreationInputTokens);
    inputCostUsd += (p.inputTokens * rate.inputPerM
      + p.cacheReadInputTokens * rate.cacheReadPerM
      + p.cacheCreation5mInputTokens * rate.cacheWritePerM
      + p.cacheCreation1hInputTokens * rate.cacheWrite1hPerM) / 1_000_000;
    outputCostUsd += (p.outputTokens * rate.outputPerM) / 1_000_000;
  }
  return { inputCostUsd, outputCostUsd, totalCostUsd: inputCostUsd + outputCostUsd };
}

/** The model id every Sonnet call in this process asks for (what the ledger and PostHog record). */
export const ACTIVE_MODEL_ID = SONNET_MODEL_ID;
/** List price of ACTIVE_MODEL_ID. */
export const ACTIVE_MODEL_PRICING: ModelPricing = SONNET_55_PRICING;

type SystemParam = string | Anthropic.TextBlockParam[];
type SonnetRequest = Anthropic.MessageCreateParamsNonStreaming;

/** Request body for a Sonnet 5.5 call (see the file header for the shape). */
function buildSdkParams(params: {
  model: string;
  maxTokens: number;
  system?: SystemParam;
  messages: Anthropic.MessageParam[];
}): SonnetRequest {
  return {
    model: params.model,
    max_tokens: sonnetMaxTokens(params.maxTokens),
    ...(params.system && { system: params.system }),
    messages: params.messages,
    thinking: { type: 'adaptive' },
    output_config: { effort: SONNET_EFFORT },
  };
}

const JSON_INSTRUCTION = 'IMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';

/** The API marker for a TTL. 5 minutes is the API default, so it is sent without a ttl (the shape the probes measured). */
function cacheControl(ttl: CacheTtl): Anthropic.CacheControlEphemeral {
  return ttl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
}

function textBlockParam(block: CacheableContentBlock): Anthropic.TextBlockParam {
  return block.cache_control
    ? { type: 'text', text: block.text, cache_control: cacheControl(block.cache_control.ttl ?? '5m') }
    : { type: 'text', text: block.text };
}

/**
 * Structured system blocks (with cache_control) win over a plain string; jsonMode appends the JSON-only rule.
 * A plain string with `systemPromptCacheTtl` becomes one marked block holding the same text, JSON rule included.
 */
function buildSystemParam(
  options: Pick<AnthropicCallOptions, 'systemPrompt' | 'systemBlocks' | 'jsonMode' | 'systemPromptCacheTtl'>,
): SystemParam | undefined {
  const { systemPrompt, systemBlocks, jsonMode, systemPromptCacheTtl } = options;
  if (systemBlocks && systemBlocks.length > 0) {
    const blocks = systemBlocks.map(textBlockParam);
    return jsonMode ? [...blocks, { type: 'text', text: JSON_INSTRUCTION }] : blocks;
  }
  if (systemPrompt) {
    const text = jsonMode ? `${systemPrompt}\n\n${JSON_INSTRUCTION}` : systemPrompt;
    return systemPromptCacheTtl ? [{ type: 'text', text, cache_control: cacheControl(systemPromptCacheTtl) }] : text;
  }
  return undefined;
}

/** The user message: split into blocks when the caller marked positions inside it, else the plain string. */
function buildMessages(options: Pick<AnthropicCallOptions, 'prompt' | 'promptBlocks' | 'conversationHistory'>): Anthropic.MessageParam[] {
  const { prompt, promptBlocks, conversationHistory } = options;
  if (conversationHistory && conversationHistory.length > 0) {
    if (promptBlocks) throw new Error('callAnthropic: promptBlocks cannot be combined with conversationHistory');
    return conversationHistory.map((msg) => ({ role: msg.role, content: msg.content }));
  }
  if (promptBlocks) {
    if (promptBlocks.length === 0) throw new Error('callAnthropic: promptBlocks is empty');
    // Splitting is for cache markers only. The model must read exactly the prompt the builder wrote.
    if (promptBlocks.map((block) => block.text).join('') !== prompt) {
      throw new Error('callAnthropic: promptBlocks do not join to the prompt; a cache split must never change the text');
    }
    if (promptBlocks.some((block) => block.text.length === 0)) {
      throw new Error('callAnthropic: promptBlocks contains an empty block (the API rejects empty text blocks)');
    }
    return [{ role: 'user', content: promptBlocks.map(textBlockParam) }];
  }
  return [{ role: 'user', content: prompt }];
}

/** The TTL of every cache marker in a request, in prefix order (system, then messages). */
export function cacheMarkerTtls(params: Pick<SonnetRequest, 'system' | 'messages'>): CacheTtl[] {
  const ttls: CacheTtl[] = [];
  const visit = (block: { cache_control?: Anthropic.CacheControlEphemeral | null }) => {
    if (block.cache_control) ttls.push(block.cache_control.ttl ?? '5m');
  };
  if (Array.isArray(params.system)) params.system.forEach(visit);
  for (const message of params.messages) {
    if (Array.isArray(message.content)) {
      for (const block of message.content) visit(block as { cache_control?: Anthropic.CacheControlEphemeral | null });
    }
  }
  return ttls;
}

/** A 1-hour marker after a 5-minute one in prefix order is a 400. Fail here, before sending. */
export function assertMarkerTtlOrder(ttls: CacheTtl[], label: string): void {
  const first5m = ttls.indexOf('5m');
  if (first5m !== -1 && ttls.indexOf('1h', first5m) !== -1) {
    throw new Error(`${label}: a 1h cache marker after a 5m one (${ttls.join(', ')}); longer TTLs come first`);
  }
}

/** The API allows 4 markers, and a 1-hour marker after a 5-minute one is a 400. Fail here, before sending. */
function assertCacheMarkers(params: SonnetRequest, label: string): void {
  const ttls = cacheMarkerTtls(params);
  if (ttls.length > 4) throw new Error(`${label}: ${ttls.length} cache markers, the API allows 4`);
  assertMarkerTtlOrder(ttls, label);
}

/**
 * The Messages API body of one callAnthropic call. Exported so cache tests can build two requests and compare
 * the cached prefix byte for byte. Throws on options that cannot make a valid request.
 */
export function buildSonnetRequest(options: AnthropicCallOptions, model: string = SONNET_MODEL_ID): SonnetRequest {
  const params = buildSdkParams({
    model,
    maxTokens: options.maxTokens ?? 4096,
    system: buildSystemParam(options),
    messages: buildMessages(options),
  });
  assertCacheMarkers(params, `callAnthropic(${options.site ?? options.generationContext?.operation ?? 'unlabelled'})`);
  return params;
}

/** One SDK Messages call. Streams (and waits for the final message) above STREAM_ABOVE_MAX_TOKENS. */
async function sendSdkMessage(
  client: MessagesClient,
  params: SonnetRequest,
): Promise<{ message: Anthropic.Message; requestId: string | null; streamMaxGapMs: number | null }> {
  if (params.max_tokens > STREAM_ABOVE_MAX_TOKENS) {
    // The caller sees nothing until the final message, so a failure here is always safe to fail over.
    const guard = createStreamGuard(streamIdleTimeoutMs());
    try {
      const stream = client.messages.stream(params, { timeout: SONNET_STREAM_FIRST_BYTE_TIMEOUT_MS, ...guard.requestOptions });
      const message = await guard.finalMessage(stream);
      return { message, requestId: stream.request_id ?? null, streamMaxGapMs: guard.maxGapMs };
    } finally {
      guard.dispose();
    }
  }
  const { data, request_id } = await client.messages.create(params, { timeout: SONNET_TIMEOUT_MS }).withResponse();
  return { message: data, requestId: request_id ?? null, streamMaxGapMs: null };
}

/** The console note for a streamed attempt: its largest gap between bytes against the idle limit. '' when not streamed. */
export function streamGapNote(streamMaxGapMs: number | null): string {
  return streamMaxGapMs === null ? '' : ` stream_max_gap_ms=${streamMaxGapMs} (idle limit ${streamIdleTimeoutMs()})`;
}

/** A completed response that must not be treated as success (refusal or truncation). */
export class ModelStopError extends Error {
  constructor(
    message: string,
    readonly errorKind: 'provider_refusal' | 'provider_max_tokens' | 'provider_empty_content' | 'provider_incomplete',
    /** The response was billed, so its usage and request id still go in the failed ledger row. */
    readonly billed: { usage: unknown; providerRequestId: string | null },
  ) {
    super(message);
    this.name = 'ModelStopError';
  }
}

/** The stop reasons that end a finished answer. `pause_turn` (a server tool paused the turn) is not here: nothing resumes it. */
const USABLE_STOP_REASONS: ReadonlySet<string> = new Set(['end_turn', 'tool_use', 'stop_sequence']);

/**
 * Fail loud on a stop reason that leaves no usable answer. A refusal is an HTTP 200 with
 * `stop_reason: "refusal"`; returning its (empty or partial) text as success would ship an empty
 * document. A `max_tokens` stop means thinking plus answer ran out of budget, which truncates the
 * JSON or the letter. Anything that is not end_turn, tool_use or stop_sequence (a missing stop reason,
 * pause_turn, a context-window stop) is `provider_incomplete`: a stream cut before `message_stop` never gets
 * here (the stream guard throws a failover-eligible StreamTransportError first), so this is a response that
 * completed with a stop reason nobody handles.
 */
export function assertUsableStop(
  stopReason: string | null | undefined,
  stopDetails: { category?: string | null } | null | undefined,
  maxTokens: number,
  billed: { usage: unknown; providerRequestId: string | null },
): void {
  if (stopReason === 'refusal') {
    throw new ModelStopError(
      `Model declined the request (stop_reason refusal, category ${stopDetails?.category ?? 'unknown'})`,
      'provider_refusal',
      billed,
    );
  }
  if (stopReason === 'max_tokens') {
    throw new ModelStopError(`Model output hit max_tokens (${maxTokens}) before finishing`, 'provider_max_tokens', billed);
  }
  if (!stopReason || !USABLE_STOP_REASONS.has(stopReason)) {
    throw new ModelStopError(
      `Model stopped without a finished answer (stop_reason ${stopReason ?? 'missing'})`,
      'provider_incomplete',
      billed,
    );
  }
}

/** Read text by block type: thinking blocks come first (empty by default) and are skipped. */
function sdkMessageText(message: Anthropic.Message, requestId: string | null, maxTokens: number): string {
  assertUsableStop(message.stop_reason, message.stop_details, maxTokens, {
    usage: message.usage,
    providerRequestId: requestId ?? message.id ?? null,
  });
  return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
}

/** The ledger's error kind: the stop kind, the failover kind (connection_timeout, overloaded, ...) or the fallback. */
export function providerErrorKind(error: unknown, fallback: string): string {
  if (error instanceof ModelStopError) return error.errorKind;
  if (isFailoverError(error)) return failoverErrorKind(error);
  return fallback;
}

/**
 * Usage that was billed even though the call failed: a refusal or truncation (the response is complete), or a
 * stream that broke after it reported usage (message_start and deltas, `partialUsage`). Null when none was seen.
 */
export function billedUsageOf(error: unknown): { usage: unknown; providerRequestId: string | null } | null {
  if (error instanceof ModelStopError) return error.billed;
  const partial = typeof error === 'object' && error !== null ? (error as { partialUsage?: unknown }).partialUsage : undefined;
  return partial === undefined || partial === null ? null : { usage: partial, providerRequestId: null };
}

/**
 * Usage and request id of a billed response that still failed (refusal, truncation, or a stream that broke after
 * reporting usage), for the single failed ledger row. Empty for errors where nothing billed was seen.
 */
export function billedFailureUsage(error: unknown): Partial<Parameters<typeof failLlmGeneration>[0]> {
  return billedFailureFields(billedUsageOf(error));
}

function billedFailureFields(billed: { usage: unknown; providerRequestId: string | null } | null): Partial<Parameters<typeof failLlmGeneration>[0]> {
  if (!billed) return {};
  const normalized = normalizeProviderUsage(billed.usage);
  return {
    ...(billed.providerRequestId !== null && { providerRequestId: billed.providerRequestId }),
    inputTokens: normalized.inputTokens,
    outputTokens: normalized.outputTokens,
    cacheReadInputTokens: normalized.cacheReadInputTokens,
    cacheWriteInputTokens: normalized.cacheWriteInputTokens,
    providerTotalTokens: normalized.providerTotalTokens,
    providerUsage: normalized.providerUsage,
  };
}

export interface AnthropicCallOptions {
  prompt: string;
  /** The user message split into blocks for cache markers. Must join to `prompt` exactly (see ModelCallOptions). */
  promptBlocks?: CacheableContentBlock[];
  systemPrompt?: string;
  /** A cache marker on a plain `systemPrompt`. */
  systemPromptCacheTtl?: CacheTtl;
  /** Structured system blocks with cache_control for prompt caching */
  systemBlocks?: CacheableContentBlock[];
  maxTokens?: number;
  jsonMode?: boolean;
  conversationHistory?: ConversationMessage[];
  generationContext?: LlmGenerationContext;
  /** PostHog `$ai_generation` site label. Defaults to the generation context's operation. */
  site?: string;
}

// -------------------------------------------------------------------------------------------------
// Dependencies (real by default, swappable in tests) and the PostHog `$ai_generation` event
// -------------------------------------------------------------------------------------------------

export interface SonnetDeps {
  getClient(): MessagesClient;
  /** The Amazon Bedrock client, or null when it is not configured (failover off). */
  getBedrockClient(): MessagesClient | null;
  startLedger: typeof startLlmGeneration;
  completeLedger: typeof completeProviderGeneration;
  failLedger: typeof recordProviderFailure;
  /** `event` defaults to `$ai_generation`. */
  capture(event: { distinctId: string; event?: string; properties: Record<string, unknown> }): Promise<void>;
}

const defaultSonnetDeps: SonnetDeps = {
  getClient: getPrimaryClient,
  getBedrockClient,
  startLedger: startLlmGeneration,
  completeLedger: completeProviderGeneration,
  failLedger: recordProviderFailure,
  async capture({ distinctId, event, properties }) {
    const posthog = getPostHogServer();
    posthog.capture({ distinctId, event: event ?? '$ai_generation', properties });
    await posthog.flush();
  },
};

let sonnetDeps: SonnetDeps = defaultSonnetDeps;

/** Swap the clients, ledger and PostHog capture for a test. `null` restores the real ones. */
export function setSonnetDepsForTests(deps: Partial<SonnetDeps> | null): void {
  sonnetDeps = deps ? { ...defaultSonnetDeps, ...deps } : defaultSonnetDeps;
}

export interface SonnetGenerationInput {
  site: string;
  provider: ProviderName;
  model: string;
  context: LlmGenerationContext;
  generationId: string;
  latencyMs: number;
  stopReason: string | null;
  providerRequestId: string | null;
  /** The raw `usage` of the response, or null when no response came back. */
  rawUsage: unknown;
  /** TTLs of the request's cache markers, in prefix order. */
  cacheMarkers: CacheTtl[];
  errorKind: string | null;
  httpStatus: number | null;
  /** Largest gap between received bytes of a streamed attempt (stream-guard.ts); null when not streamed. */
  streamMaxGapMs?: number | null;
}

/**
 * Properties of the PostHog `$ai_generation` event for one Sonnet attempt. Counts and labels only: no prompt,
 * no user data. Same fields as callHaiku's event, so one PostHog view covers both models.
 */
export function buildSonnetGenerationProperties(input: SonnetGenerationInput): Record<string, unknown> {
  const records = input.rawUsage === null || input.rawUsage === undefined ? null : usageRecordsOf(input.rawUsage);
  const u = records ? sumUsageParts(records) : null;
  const cost = u ? sonnet55CostUsd(input.rawUsage) : null;
  const read = u?.cacheReadInputTokens ?? null;
  const write = u?.cacheCreationInputTokens ?? null;
  const uncached = u?.inputTokens ?? null;
  const total = u ? u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens : null;
  return {
    // PostHog LLM analytics
    $ai_provider: input.provider,
    $ai_model: input.model,
    $ai_input_tokens: uncached,
    $ai_output_tokens: u?.outputTokens ?? null,
    $ai_cache_read_input_tokens: read,
    $ai_cache_creation_input_tokens: write,
    $ai_input_cost_usd: cost?.inputCostUsd ?? null,
    $ai_output_cost_usd: cost?.outputCostUsd ?? null,
    $ai_total_cost_usd: cost?.totalCostUsd ?? null,
    $ai_latency: input.latencyMs / 1000,
    $ai_is_error: input.errorKind !== null,
    $ai_http_status: input.errorKind === null ? 200 : input.httpStatus,
    $ai_trace_id: input.context.requestExecutionId,
    // Our own, per .claude/rules/posthog.md and prompt-caching.md
    provider: input.provider,
    model: input.model,
    site: input.site,
    effort: SONNET_EFFORT,
    feature: input.context.feature,
    operation: input.context.operation,
    route: input.context.route,
    generation_id: input.generationId,
    provider_request_id: input.providerRequestId,
    stop_reason: input.stopReason,
    input_tokens: uncached,
    output_tokens: u?.outputTokens ?? null,
    cache_read_tokens: read,
    cache_creation_tokens: write,
    cache_creation_5m_tokens: u?.cacheCreation5mInputTokens ?? null,
    cache_creation_1h_tokens: u?.cacheCreation1hInputTokens ?? null,
    input_tokens_total: total,
    // read / (read + write + uncached); null when the response carried no usage
    cache_hit_rate: total ? (read as number) / total : null,
    cache_markers: input.cacheMarkers.join(','),
    cost_usd: cost?.totalCostUsd ?? null,
    latency_ms: input.latencyMs,
    error_kind: input.errorKind,
    stream_max_gap_ms: input.streamMaxGapMs ?? null,
    // A stream that broke before message_delta: input and cache counts are real, the output count is a floor.
    output_tokens_partial: outputTokensPartial(input.rawUsage),
  };
}

async function captureSonnetGeneration(context: LlmGenerationContext, input: Omit<SonnetGenerationInput, 'context'>): Promise<void> {
  const distinctId = context.userId ?? 'unattributed';
  try {
    const properties = buildSonnetGenerationProperties({ ...input, context });
    // No user: keep these events from piling onto one anonymous person profile.
    await sonnetDeps.capture({ distinctId, properties: context.userId ? properties : { ...properties, $process_person_profile: false } });
  } catch (error) {
    // Observability must not take the product down, but a lost event is logged, not swallowed.
    console.error('[anthropic] PostHog $ai_generation capture failed', error);
  }
}

/** One non-streaming attempt on one provider, with its own ledger row and `$ai_generation` event. Throws the original error. */
async function sdkTextAttempt(
  target: FailoverTarget<MessagesClient>,
  call: {
    context: LlmGenerationContext;
    site: string;
    /** Built for the primary model; the target's model id is swapped in. */
    params: SonnetRequest;
    errorKindFallback: string;
  },
): Promise<{ text: string; message: Anthropic.Message; ledgerId: string; latencyMs: number }> {
  const startTime = Date.now();
  const ledger = await sonnetDeps.startLedger({ context: call.context, provider: target.provider, model: target.model });
  const params = target.model === call.params.model ? call.params : { ...call.params, model: target.model };
  const cacheMarkers = cacheMarkerTtls(params);
  let providerResponseReceived = false;
  try {
    const { message, requestId, streamMaxGapMs } = await sendSdkMessage(target.getClient(), params);
    // Throws on a refusal or truncation before the ledger marks the call complete.
    const text = sdkMessageText(message, requestId, params.max_tokens);
    providerResponseReceived = true;
    await sonnetDeps.completeLedger({
      id: ledger.id,
      startedAtMs: startTime,
      response: { usage: message.usage, id: message.id, _request_id: requestId ?? undefined },
    });
    const latencyMs = Date.now() - startTime;
    await captureSonnetGeneration(call.context, {
      site: call.site,
      provider: target.provider,
      model: target.model,
      generationId: ledger.id,
      latencyMs,
      stopReason: message.stop_reason ?? null,
      providerRequestId: requestId ?? message.id ?? null,
      rawUsage: message.usage,
      cacheMarkers,
      errorKind: null,
      httpStatus: null,
      streamMaxGapMs,
    });
    if (streamMaxGapMs !== null) console.log(`[anthropic] ${call.site} streamed on ${target.provider}${streamGapNote(streamMaxGapMs)}`);
    return { text, message, ledgerId: ledger.id, latencyMs };
  } catch (error) {
    if (!providerResponseReceived) {
      const latencyMs = Date.now() - startTime;
      const errorKind = providerErrorKind(error, call.errorKindFallback);
      const httpStatus = providerHttpStatus(error);
      await sonnetDeps.failLedger({
        id: ledger.id,
        latencyMs,
        attemptCount: 1,
        errorKind,
        httpStatus,
        ...billedFailureUsage(error),
      });
      // A refusal, truncation or broken stream was billed: its usage and cost stay on the event.
      const billed = billedUsageOf(error);
      await captureSonnetGeneration(call.context, {
        site: call.site,
        provider: target.provider,
        model: target.model,
        generationId: ledger.id,
        latencyMs,
        stopReason: error instanceof ModelStopError ? error.errorKind : null,
        providerRequestId: billed?.providerRequestId ?? null,
        rawUsage: billed?.usage ?? null,
        cacheMarkers,
        errorKind,
        httpStatus,
        streamMaxGapMs: streamMaxGapOf(error),
      });
      if (streamMaxGapOf(error) !== null) console.error(`[anthropic] ${call.site} stream failed on ${target.provider} (${errorKind})${streamGapNote(streamMaxGapOf(error))}`);
    }
    throw error;
  }
}

function sonnetFailover<T>(
  context: LlmGenerationContext,
  site: string,
  attempt: (target: FailoverTarget<MessagesClient>) => Promise<T>,
  canFailOver?: () => boolean,
): Promise<T> {
  return runWithFailover<MessagesClient, T>({
    site,
    model: SONNET_MODEL_ID,
    context,
    primary: () => sonnetDeps.getClient(),
    bedrock: () => sonnetDeps.getBedrockClient(),
    attempt,
    canFailOver,
    onFailover: (info) => captureFailoverEvent(info, (event) => sonnetDeps.capture(event)),
  });
}

/**
 * Call Claude Sonnet 5.5 for all kit-writing, parsing and analysis tasks.
 */
export async function callAnthropic(options: AnthropicCallOptions): Promise<ModelResponse> {
  const context = options.generationContext ?? fallbackGenerationContext('direct_anthropic_call');
  const site = options.site ?? context.operation;
  // Built before the try: a request that breaks the cache rules is a programming error, not a provider failure.
  const params = buildSonnetRequest({ ...options, site });

  try {
    const { text: content, message, ledgerId, latencyMs, provider, model } = await sonnetFailover(context, site, async (target) => ({
      ...(await sdkTextAttempt(target, { context, site, params, errorKindFallback: 'provider_error' })),
      provider: target.provider,
      model: target.model,
    }));

    const cacheCreation = message.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = message.usage.cache_read_input_tokens ?? 0;
    const records = usageRecordsOf(message.usage);
    const parts = records ? sumUsageParts(records) : null;
    if (cacheCreation > 0 || cacheRead > 0) {
      console.log(`[Anthropic Cache] ${site} write=${cacheCreation} (5m=${parts?.cacheCreation5mInputTokens ?? '?'} 1h=${parts?.cacheCreation1hInputTokens ?? '?'}) read=${cacheRead} input=${message.usage.input_tokens} output=${message.usage.output_tokens}`);
    }

    return {
      content,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheCreationInputTokens: cacheCreation || undefined,
        cacheReadInputTokens: cacheRead || undefined,
        cacheCreation5mInputTokens: parts?.cacheCreation5mInputTokens || undefined,
        cacheCreation1hInputTokens: parts?.cacheCreation1hInputTokens || undefined,
      },
      model,
      provider,
      latencyMs,
      generationId: ledgerId,
    };
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw new Error(`Anthropic API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call Claude with a streaming response (same model and request shape as callAnthropic).
 * Fails over to Bedrock only before the first text chunk reached `onChunk`: after that a failure is a
 * failure, so no caller ever sees duplicated text.
 */
export async function callAnthropicStream(
  options: AnthropicCallOptions,
  onChunk: (chunk: string) => void,
): Promise<ModelResponse> {
  const context = options.generationContext ?? fallbackGenerationContext('direct_anthropic_stream');
  const site = options.site ?? context.operation;
  const baseParams = buildSonnetRequest({ ...options, conversationHistory: undefined, site });
  let textEmitted = false;

  const attempt = async (target: FailoverTarget<MessagesClient>): Promise<ModelResponse> => {
    const startTime = Date.now();
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    let providerRequestId: string | null = null;
    const finalUsage: Record<string, unknown> = {};
    let stopReason: string | null | undefined;
    let stopDetails: { category?: string | null } | null | undefined;
    const params = target.model === baseParams.model ? baseParams : { ...baseParams, model: target.model };
    const cacheMarkers = cacheMarkerTtls(params);

    const ledger = await sonnetDeps.startLedger({ context, provider: target.provider, model: target.model });
    let providerResponseReceived = false;
    // message_delta carries the real output count; until it arrives the usage record's output is a floor.
    let sawMessageDelta = false;
    const guard = createStreamGuard(streamIdleTimeoutMs());
    try {
      const stream = target.getClient().messages.stream(params, { timeout: SONNET_STREAM_FIRST_BYTE_TIMEOUT_MS, ...guard.requestOptions });
      const usageSoFar = () => (Object.keys(finalUsage).length > 0 ? partialStreamUsage(finalUsage, sawMessageDelta) : undefined);

      for await (const event of guard.events(stream, usageSoFar)) {
        // Text deltas only: thinking and signature deltas never reach the caller.
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullContent += text;
          textEmitted = true;
          onChunk(text);
        }

        if (event.type === 'message_delta') {
          sawMessageDelta = true;
          stopReason = event.delta.stop_reason;
          stopDetails = event.delta.stop_details;
          const exactOutputTokens = exactTokenCount(event.usage.output_tokens);
          if (exactOutputTokens !== null) {
            outputTokens = exactOutputTokens;
            finalUsage.output_tokens = exactOutputTokens;
          }
        }

        if (event.type === 'message_start') {
          providerRequestId = event.message.id ?? null;
          const usage = event.message.usage;
          const exactInputTokens = exactTokenCount(usage.input_tokens);
          const exactCacheCreationTokens = exactTokenCount(usage.cache_creation_input_tokens);
          const exactCacheReadTokens = exactTokenCount(usage.cache_read_input_tokens);
          if (exactInputTokens !== null) {
            inputTokens = exactInputTokens;
            finalUsage.input_tokens = exactInputTokens;
          }
          if (exactCacheCreationTokens !== null) {
            cacheCreationTokens = exactCacheCreationTokens;
            finalUsage.cache_creation_input_tokens = exactCacheCreationTokens;
          }
          if (exactCacheReadTokens !== null) {
            cacheReadTokens = exactCacheReadTokens;
            finalUsage.cache_read_input_tokens = exactCacheReadTokens;
          }
          // message_start carries the output so far (about 1); message_delta replaces it with the final count. Kept so a
          // stream that breaks before message_delta still has a priceable record: its input and cache fields are
          // complete, its output is a floor, and it is marked output_tokens_partial (usageSoFar, partialStreamUsage).
          const startOutputTokens = exactTokenCount(usage.output_tokens);
          if (startOutputTokens !== null && finalUsage.output_tokens === undefined) finalUsage.output_tokens = startOutputTokens;
          if (usage.cache_creation) finalUsage.cache_creation = { ...usage.cache_creation };
          if (cacheCreationTokens > 0 || cacheReadTokens > 0) {
            console.log(`[Anthropic Cache Stream] ${site} write=${cacheCreationTokens} read=${cacheReadTokens} input=${inputTokens}`);
          }
        }
      }

      // The HTTP request id is what Anthropic support asks for; the message id is only a fallback.
      providerRequestId = stream.request_id ?? providerRequestId;

      // A refusal or truncation already streamed partial text, but it is not a usable answer.
      assertUsableStop(stopReason, stopDetails, params.max_tokens, {
        usage: Object.keys(finalUsage).length > 0 ? finalUsage : null,
        providerRequestId,
      });

      providerResponseReceived = true;
      await sonnetDeps.completeLedger({
        id: ledger.id,
        startedAtMs: startTime,
        response: {
          usage: Object.keys(finalUsage).length > 0 ? finalUsage : undefined,
          _request_id: providerRequestId ?? undefined,
        },
      });

      const latencyMs = Date.now() - startTime;
      await captureSonnetGeneration(context, {
        site,
        provider: target.provider,
        model: target.model,
        generationId: ledger.id,
        latencyMs,
        stopReason: stopReason ?? null,
        providerRequestId,
        rawUsage: Object.keys(finalUsage).length > 0 ? finalUsage : null,
        cacheMarkers,
        errorKind: null,
        httpStatus: null,
        streamMaxGapMs: guard.maxGapMs,
      });
      console.log(`[anthropic] ${site} streamed on ${target.provider}${streamGapNote(guard.maxGapMs)}`);

      const parts = usageRecordsOf(finalUsage);
      const split = parts ? sumUsageParts(parts) : null;
      return {
        content: fullContent,
        usage: {
          inputTokens,
          outputTokens,
          cacheCreationInputTokens: cacheCreationTokens || undefined,
          cacheReadInputTokens: cacheReadTokens || undefined,
          cacheCreation5mInputTokens: split?.cacheCreation5mInputTokens || undefined,
          cacheCreation1hInputTokens: split?.cacheCreation1hInputTokens || undefined,
        },
        model: target.model,
        provider: target.provider,
        latencyMs,
        generationId: ledger.id,
      };
    } catch (error) {
      if (!providerResponseReceived) {
        const latencyMs = Date.now() - startTime;
        const errorKind = providerErrorKind(error, 'provider_stream_error');
        const httpStatus = providerHttpStatus(error);
        // A refusal carries its own billed usage; a stream that broke part-way keeps what message_start and the
        // deltas reported, so the failed row and its event are not silently free.
        const billed = billedUsageOf(error) ?? (Object.keys(finalUsage).length > 0 ? { usage: partialStreamUsage(finalUsage, sawMessageDelta), providerRequestId } : null);
        await sonnetDeps.failLedger({
          id: ledger.id,
          latencyMs,
          attemptCount: 1,
          errorKind,
          httpStatus,
          ...billedFailureFields(billed),
        });
        await captureSonnetGeneration(context, {
          site,
          provider: target.provider,
          model: target.model,
          generationId: ledger.id,
          latencyMs,
          stopReason: error instanceof ModelStopError ? error.errorKind : null,
          providerRequestId: billed?.providerRequestId ?? providerRequestId,
          rawUsage: billed?.usage ?? null,
          cacheMarkers,
          errorKind,
          httpStatus,
          streamMaxGapMs: guard.maxGapMs,
        });
        console.error(`[anthropic] ${site} stream failed on ${target.provider} (${errorKind})${streamGapNote(guard.maxGapMs)}`);
      }
      throw error;
    } finally {
      guard.dispose();
    }
  };

  try {
    return await sonnetFailover(context, site, attempt, () => !textEmitted);
  } catch (error) {
    console.error('Anthropic streaming error:', error);
    throw new Error(`Anthropic streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from a PDF using Claude's native document understanding.
 * Sends the PDF as a proper document content block, NOT as base64 text.
 * Works for scanned PDFs and PDFs with broken font encoding.
 */
export async function extractDocumentText(
  pdfBuffer: Buffer,
  generationContext?: LlmGenerationContext,
): Promise<string> {
  const base64Data = pdfBuffer.toString('base64');
  const startTime = Date.now();
  const context = generationContext ?? fallbackGenerationContext('extract_document_text');

  const system = 'You are a document text extractor. Extract ALL text content from the provided document faithfully. Preserve the original structure, section headers, dates, bullet points, and formatting. Return ONLY the extracted text, nothing else.';
  const userText = 'Extract ALL text content from this CV/resume document. Preserve the original structure including section headers, dates, company names, job titles, bullet points, skills, education, and languages. Return ONLY the extracted text with proper formatting.';

  // No cache marker: the static part before the document is the short system prompt, under the 512-token minimum.
  const params = buildSdkParams({
    model: SONNET_MODEL_ID,
    maxTokens: 8192,
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
        { type: 'text', text: userText },
      ],
    }],
  });

  try {
    const { text } = await sonnetFailover(context, context.operation, (target) => sdkTextAttempt(target, {
      context,
      site: context.operation,
      params,
      errorKindFallback: 'document_extraction_provider_error',
    }));
    console.log(`[Anthropic] PDF document extraction: ${text.length} chars in ${Date.now() - startTime}ms`);
    return text;
  } catch (error) {
    console.error('[Anthropic] Document extraction failed:', error);
    throw error;
  }
}

/**
 * Parse a CV PDF directly using Claude's native document understanding.
 * One step: sends the document as a content block and returns Claude's raw JSON response string.
 * Eliminates local text extraction (pdfjs-dist, binary fallback, etc.) for PDF files.
 *
 * DOCX has no native document block on the Anthropic API, so it throws before any request is made (and
 * before any ledger row): the caller (parseDocumentWithAIOrFallback) catches that and falls back to
 * extracting the text from the DOCX itself and parsing it as text.
 */
export async function parseDocumentAsCV(options: {
  buffer: Buffer;
  docFormat: 'pdf' | 'docx';
  prompt: string;
  systemPrompt: string;
  maxTokens?: number;
  /**
   * Enable Claude PDF Chat (visual mode) for primary CV parsing.
   * Adds citations: { enabled: true } inside the document block, which activates
   * full page-as-image rendering instead of text-extraction-only mode.
   * Use for primary CVs (1-2 pages). Keep false for Master CVs (3-8 pages, cost saving).
   */
  visualMode?: boolean;
  generationContext?: LlmGenerationContext;
}): Promise<string> {
  const { buffer, docFormat, prompt, systemPrompt, maxTokens = 8192, visualMode = false } = options;
  if (docFormat !== 'pdf') {
    throw new Error('Native DOCX document blocks are not supported by the Anthropic API. Extract the DOCX text and parse it as text.');
  }
  const startTime = Date.now();
  const context = options.generationContext ?? fallbackGenerationContext('parse_cv_document');

  const documentBlock: Anthropic.DocumentBlockParam = {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
    ...(visualMode && { citations: { enabled: true } }),
  };

  // No cache marker: the document comes first in the message, so the only static prefix is the short system
  // prompt, under the 512-token minimum. Each CV is parsed once, so there is no per-user reuse either.
  const params = buildSdkParams({
    model: SONNET_MODEL_ID,
    maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: [documentBlock, { type: 'text', text: prompt }] }],
  });

  // With citations enabled the answer can arrive as several text blocks, so all are joined.
  const { text } = await sonnetFailover(context, context.operation, (target) => sdkTextAttempt(target, {
    context,
    site: context.operation,
    params,
    errorKindFallback: 'document_parse_provider_error',
  }));
  console.log(`[Anthropic] CV document parse (visualMode=${visualMode}): ${text.length} chars in ${Date.now() - startTime}ms`);
  return text;
}

/**
 * Parse JSON response from Claude (handles markdown code blocks)
 */
export function parseAnthropicJSON<T>(content: string): T {
  let jsonString = content.trim();

  // Remove markdown code blocks if present
  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse Anthropic JSON:', error);
    console.error('Content:', content);
    throw new Error('Failed to parse Anthropic response as JSON');
  }
}
