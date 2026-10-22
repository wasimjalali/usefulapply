/**
 * Claude Haiku 5.5 on the Anthropic API: the one call path that replaces gpt-oss-120b (Workers AI).
 *
 * Request shape (measured, evals/results/2026-10-22-haiku-55-swap.md): `output_config.effort`, thinking
 * adaptive (the field is omitted) or `{type:'disabled'}` for 'low-nothink', no temperature (a 400),
 * structured output through `output_config.format`, native tool blocks.
 *
 * Caching (.claude/rules/prompt-caching.md): marker on the last tool, on the static system block, on the
 * stable-context block (all with the site's TTL), and optional automatic 5-minute caching of the
 * conversation tail. The 1-hour markers always come first in the prefix, as the API requires.
 *
 * Budget: every request is measured (token-budget.ts) and refused above 90k tokens before it is sent.
 * Every call writes a ledger row (provider 'anthropic') and one PostHog `$ai_generation` event.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  startLlmGeneration,
  type LlmGenerationContext,
} from '@/db/repos/adminMetrics';
import { getPostHogServer } from '@/lib/posthog-server';
import {
  ModelStopError,
  assertUsableStop,
  billedFailureUsage,
  completeProviderGeneration,
  haiku55CostUsd,
  providerAttemptCount,
  providerErrorKind,
  providerHttpStatus,
  recordProviderFailure,
  sumUsageParts,
  usageRecordsOf,
  type UsageParts,
} from './anthropic';
import { resolveHaikuEffort } from './haiku-effort';
import {
  INPUT_HARD_LIMIT,
  INPUT_REFUSE_ABOVE,
  isOverHardLimit,
  isOverRefuseLimit,
  measureInputBudget,
  type InputBudgetCheck,
} from './token-budget';
import type { ModelResponse } from './types';

export const HAIKU_MODEL_ID = 'claude-haiku-5-5';

/** Effort per site lives in haiku-effort.ts. 'low-nothink' = effort low with thinking disabled. */
export type HaikuEffort = 'low-nothink' | 'low' | 'medium' | 'high';

export type HaikuSite =
  | 'chat'
  | 'screening'
  | 'tracker'
  | 'language'
  | 'ranking'
  | 'search_strategy'
  | 'career_profile';

export interface HaikuToolDefinition {
  name: string;
  description: string;
  /** JSON Schema. Serialized with stable key order (cache key). */
  input_schema: Record<string, unknown>;
}

export interface HaikuCallOptions {
  site: HaikuSite;
  /**
   * `static` is byte-identical across requests for this site and carries the cache marker.
   * `stableContext` (optional) is per-user context that repeats across a user's calls (CV, profile);
   * it gets its own marker after `static`. Per-request data (dates, app state) goes in `messages`,
   * as a mid-conversation `{ role: 'system' }` message or in the user turn, never in `static`.
   */
  system: { static: string; stableContext?: string };
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: HaikuToolDefinition[];
  toolChoice?: 'auto' | 'none';
  /** Structured output via output_config.format (json_schema). Validators at the call site still run. */
  jsonSchema?: Record<string, unknown>;
  maxTokens: number;
  /** Cache TTL for the static/stableContext markers. Multi-turn chat uses '1h'; one-shot sites '5m'. */
  cacheTtl?: '5m' | '1h';
  /** Multi-turn: also cache the conversation tail (automatic caching, 5m). */
  cacheConversation?: boolean;
  generationContext: LlmGenerationContext;
}

export interface HaikuResponse extends ModelResponse {
  /** Append verbatim as the assistant turn (keeps thinking and tool_use blocks unaltered). */
  rawContent: Anthropic.Beta.BetaContentBlock[];
  /** input + cache_read + cache_creation (+ compaction iterations). Used by the 100k budget guard. */
  inputTokensTotal: number;
  stopReason: string | null;
  /** Effort the call ran at (the site's setting, or a HAIKU_EFFORT_<SITE> override). */
  effort: HaikuEffort;
  /** List-price cost of this call in USD, summed over usage.iterations. */
  costUsd: number;
}

/** Thrown before sending when a request's total input would exceed the budget (see token-budget.ts). */
export class InputBudgetError extends Error {
  constructor(
    readonly site: HaikuSite,
    readonly projectedTokens: number,
  ) {
    super(`Input budget exceeded for ${site}: ${projectedTokens} tokens`);
    this.name = 'InputBudgetError';
  }
}

// -------------------------------------------------------------------------------------------------
// Request building
// -------------------------------------------------------------------------------------------------

type CacheControl = { type: 'ephemeral'; ttl?: '1h' };
type SystemBlock = { type: 'text'; text: string; cache_control?: CacheControl };

function cacheControl(ttl: '5m' | '1h'): CacheControl {
  // 5 minutes is the API default, so it is sent without a ttl (the shape the probes measured).
  return ttl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
}

/**
 * Deep copy with object keys sorted, so the same schema always serializes to the same bytes (the tool
 * definitions are part of the cache key). Property names under `properties` keep their order: the model
 * reads and fills them in that order, so it is part of the schema's meaning. Arrays keep their order.
 */
export function canonicalizeSchema<T>(value: T, parentKey?: string): T {
  if (Array.isArray(value)) return value.map((item) => canonicalizeSchema(item)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const keys = parentKey === 'properties' ? Object.keys(source) : Object.keys(source).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = canonicalizeSchema(source[key], key);
    return out as T;
  }
  return value;
}

/** `thinking` is omitted (adaptive) except for 'low-nothink'; effort is always sent. */
function effortParams(effort: HaikuEffort): { thinking?: { type: 'disabled' }; effortLevel: 'low' | 'medium' | 'high' } {
  return effort === 'low-nothink'
    ? { thinking: { type: 'disabled' }, effortLevel: 'low' }
    : { effortLevel: effort };
}

/**
 * The Messages API body for a call. Exported so cache tests can build two requests and compare the
 * cached prefix byte for byte. Throws on options that cannot make a valid request.
 */
export function buildHaikuRequest(options: HaikuCallOptions, effort: HaikuEffort): Record<string, unknown> {
  const { site, system, messages, tools, toolChoice, jsonSchema, maxTokens } = options;
  if (!system.static.trim()) throw new Error(`callHaiku(${site}): system.static is empty`);
  if (messages.length === 0) throw new Error(`callHaiku(${site}): messages is empty`);
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new Error(`callHaiku(${site}): maxTokens must be a positive integer, got ${maxTokens}`);
  }
  const hasTools = Boolean(tools && tools.length > 0);
  if (toolChoice && !hasTools) throw new Error(`callHaiku(${site}): toolChoice "${toolChoice}" needs tools`);

  const ttl = options.cacheTtl ?? '5m';
  const marker = cacheControl(ttl);

  const systemBlocks: SystemBlock[] = [{ type: 'text', text: system.static, cache_control: marker }];
  if (system.stableContext && system.stableContext.trim()) {
    systemBlocks.push({ type: 'text', text: system.stableContext, cache_control: marker });
  }

  const params: Record<string, unknown> = {
    model: HAIKU_MODEL_ID,
    max_tokens: maxTokens,
  };

  if (hasTools) {
    const toolBlocks = (tools as HaikuToolDefinition[]).map((tool, index, all) => ({
      name: tool.name,
      description: tool.description,
      input_schema: canonicalizeSchema(tool.input_schema),
      ...(index === all.length - 1 && { cache_control: marker }),
    }));
    params.tools = toolBlocks;
    // 'auto' is the API default, so it is omitted. 'none' keeps the tool list (the cache key) intact.
    if (toolChoice === 'none') params.tool_choice = { type: 'none' };
  }

  params.system = systemBlocks;
  params.messages = messages;

  const { thinking, effortLevel } = effortParams(effort);
  if (thinking) params.thinking = thinking;
  params.output_config = {
    effort: effortLevel,
    ...(jsonSchema && { format: { type: 'json_schema', schema: canonicalizeSchema(jsonSchema) } }),
  };

  // Automatic caching marks the last block of the conversation (5m), after the 1h markers above.
  if (options.cacheConversation) params.cache_control = { type: 'ephemeral' };

  return params;
}

// -------------------------------------------------------------------------------------------------
// Response handling
// -------------------------------------------------------------------------------------------------

export interface HaikuMessage {
  id: string;
  content: Anthropic.Beta.BetaContentBlock[];
  stop_reason: string | null;
  stop_details?: unknown;
  usage: unknown;
  _request_id?: string | null;
}

/**
 * Throws a ModelStopError for a refusal, a max_tokens stop, or content with neither text nor a
 * tool call (observed: tool_choice none on a first round can end with empty content and 1 output
 * token). Returns the joined text and the tool calls.
 */
export function readHaikuContent(
  message: HaikuMessage,
  maxTokens: number,
): { content: string; toolCalls: NonNullable<HaikuResponse['toolCalls']> } {
  const billed = { usage: message.usage, providerRequestId: message._request_id ?? message.id ?? null };
  assertUsableStop(message.stop_reason, message.stop_details, maxTokens, billed, true);

  let content = '';
  const toolCalls: NonNullable<HaikuResponse['toolCalls']> = [];
  for (const block of message.content) {
    if (block.type === 'text') content += block.text;
    else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, arguments: block.input as Record<string, unknown> });
    }
  }
  if (content.trim().length === 0 && toolCalls.length === 0) {
    throw new ModelStopError(
      `Model returned no text and no tool call (stop_reason ${message.stop_reason ?? 'null'})`,
      'provider_empty_content',
      billed,
    );
  }
  return { content, toolCalls };
}

// -------------------------------------------------------------------------------------------------
// PostHog
// -------------------------------------------------------------------------------------------------

export interface AiGenerationInput {
  site: HaikuSite;
  effort: HaikuEffort;
  context: LlmGenerationContext;
  generationId: string;
  latencyMs: number;
  stopReason: string | null;
  providerRequestId: string | null;
  usage: UsageParts | null;
  costUsd: number | null;
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  budget: InputBudgetCheck | null;
  errorKind: string | null;
  httpStatus: number | null;
}

/** Properties of the PostHog `$ai_generation` event. Counts and labels only: no prompt, no user data. */
export function buildAiGenerationProperties(input: AiGenerationInput): Record<string, unknown> {
  const u = input.usage;
  const read = u?.cacheReadInputTokens ?? null;
  const write = u?.cacheCreationInputTokens ?? null;
  const uncached = u?.inputTokens ?? null;
  const total = u ? u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens : null;
  return {
    // PostHog LLM analytics
    $ai_provider: 'anthropic',
    $ai_model: HAIKU_MODEL_ID,
    $ai_input_tokens: uncached,
    $ai_output_tokens: u?.outputTokens ?? null,
    $ai_cache_read_input_tokens: read,
    $ai_cache_creation_input_tokens: write,
    $ai_input_cost_usd: input.inputCostUsd,
    $ai_output_cost_usd: input.outputCostUsd,
    $ai_total_cost_usd: input.costUsd,
    $ai_latency: input.latencyMs / 1000,
    $ai_is_error: input.errorKind !== null,
    $ai_http_status: input.errorKind === null ? 200 : input.httpStatus,
    $ai_trace_id: input.context.requestExecutionId,
    // Our own, per .claude/rules/posthog.md and prompt-caching.md
    provider: 'anthropic',
    model: HAIKU_MODEL_ID,
    site: input.site,
    effort: input.effort,
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
    // read / (read + write + uncached); null when nothing was read from or written to the prompt
    cache_hit_rate: total ? (read as number) / total : null,
    estimated_input_tokens: input.budget?.estimatedTokens ?? null,
    counted_input_tokens: input.budget?.exactTokens ?? null,
    over_hard_budget: total !== null && isOverHardLimit(total),
    cost_usd: input.costUsd,
    latency_ms: input.latencyMs,
    error_kind: input.errorKind,
  };
}

// -------------------------------------------------------------------------------------------------
// Dependencies (real by default, injectable for tests)
// -------------------------------------------------------------------------------------------------

export interface HaikuClient {
  createMessage(params: Record<string, unknown>): Promise<HaikuMessage>;
  /** Exact input tokens for system + tools + messages. Free. */
  countTokens(params: Record<string, unknown>): Promise<number>;
}

export interface HaikuDeps {
  getClient(): HaikuClient;
  startLedger: typeof startLlmGeneration;
  completeLedger: typeof completeProviderGeneration;
  failLedger: typeof recordProviderFailure;
  capture(event: { distinctId: string; properties: Record<string, unknown> }): Promise<void>;
}

// The SDK rejects non-streaming requests it estimates could run past its HTTP timeout, so
// requests above this budget stream and wait for the final message (same as anthropic.ts).
const STREAM_ABOVE_MAX_TOKENS = 16_000;

let cachedSdk: { key: string; client: Anthropic } | null = null;

/** The real client. Throws at call time when ANTHROPIC_API_KEY is missing. */
export function defaultHaikuClient(): HaikuClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set: callHaiku needs the direct Anthropic API key');
  if (!cachedSdk || cachedSdk.key !== apiKey) cachedSdk = { key: apiKey, client: new Anthropic({ apiKey }) };
  const client = cachedSdk.client;
  return {
    async createMessage(params) {
      // The SDK (0.71.2) has no typed `output_config` or top-level `cache_control`, but forwards them.
      if ((params.max_tokens as number) > STREAM_ABOVE_MAX_TOKENS) {
        const stream = client.messages.stream(params as unknown as Anthropic.MessageStreamParams);
        const message = await stream.finalMessage();
        return Object.assign(message, { _request_id: stream.request_id ?? null }) as unknown as HaikuMessage;
      }
      return (await client.messages.create(
        params as unknown as Anthropic.MessageCreateParamsNonStreaming,
      )) as unknown as HaikuMessage;
    },
    async countTokens(params) {
      const result = await client.messages.countTokens(params as unknown as Anthropic.MessageCountTokensParams);
      return result.input_tokens;
    },
  };
}

const defaultDeps: HaikuDeps = {
  getClient: defaultHaikuClient,
  startLedger: startLlmGeneration,
  completeLedger: completeProviderGeneration,
  failLedger: recordProviderFailure,
  async capture({ distinctId, properties }) {
    const posthog = getPostHogServer();
    posthog.capture({ distinctId, event: '$ai_generation', properties });
    await posthog.flush();
  },
};

async function captureGeneration(deps: HaikuDeps, context: LlmGenerationContext, properties: Record<string, unknown>) {
  const distinctId = context.userId ?? 'unattributed';
  // No user: keep these events from piling onto one anonymous person profile.
  const withPerson = context.userId ? properties : { ...properties, $process_person_profile: false };
  try {
    await deps.capture({ distinctId, properties: withPerson });
  } catch (error) {
    // Observability must not take the product down, but a lost event is logged, not swallowed.
    console.error('[haiku] PostHog $ai_generation capture failed', error);
  }
}

function budgetErrorKind(error: unknown): string {
  return error instanceof InputBudgetError ? 'input_budget' : providerErrorKind(error, 'provider_error');
}

// -------------------------------------------------------------------------------------------------
// The call
// -------------------------------------------------------------------------------------------------

export async function callHaiku(options: HaikuCallOptions, deps: HaikuDeps = defaultDeps): Promise<HaikuResponse> {
  const effort = resolveHaikuEffort(options.site);
  const params = buildHaikuRequest(options, effort);
  const context = options.generationContext;
  const startedAtMs = Date.now();

  const ledger = await deps.startLedger({ context, provider: 'anthropic', model: HAIKU_MODEL_ID });
  let budget: InputBudgetCheck | null = null;

  try {
    const client = deps.getClient();

    budget = await measureInputBudget(
      { system: params.system, tools: params.tools, messages: params.messages },
      () => client.countTokens({
        model: HAIKU_MODEL_ID,
        system: params.system,
        ...(params.tools ? { tools: params.tools } : {}),
        messages: params.messages,
      }),
    );
    if (isOverRefuseLimit(budget.totalTokens)) {
      console.error(
        `[haiku] ${options.site}: refusing to send ${budget.totalTokens} input tokens (limit ${INPUT_REFUSE_ABOVE}, hard ${INPUT_HARD_LIMIT})`,
      );
      throw new InputBudgetError(options.site, budget.totalTokens);
    }

    const message = await client.createMessage(params);
    const providerRequestId = message._request_id ?? message.id ?? null;

    const records = usageRecordsOf(message.usage);
    if (!records) throw new Error('Haiku response has no recognisable usage block');
    const usage = sumUsageParts(records);

    // Throws on a refusal, a max_tokens stop or an empty reply, after which the failure handler
    // below records the billed usage on the failed ledger row.
    const { content, toolCalls } = readHaikuContent(message, options.maxTokens);

    const cost = haiku55CostUsd(message.usage);
    const latencyMs = Date.now() - startedAtMs;
    const inputTokensTotal = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;

    await deps.completeLedger({
      id: ledger.id,
      startedAtMs,
      response: { usage: message.usage, id: message.id, _request_id: message._request_id ?? undefined },
    });

    if (isOverHardLimit(inputTokensTotal)) {
      // Already sent and billed: the pre-send estimate drifted. Loud, never silent.
      console.error(`[haiku] ${options.site}: ${inputTokensTotal} input tokens reached the hard limit ${INPUT_HARD_LIMIT}`);
    }

    await captureGeneration(deps, context, buildAiGenerationProperties({
      site: options.site,
      effort,
      context,
      generationId: ledger.id,
      latencyMs,
      stopReason: message.stop_reason,
      providerRequestId,
      usage,
      costUsd: cost.totalCostUsd,
      inputCostUsd: cost.inputCostUsd,
      outputCostUsd: cost.outputCostUsd,
      budget,
      errorKind: null,
      httpStatus: 200,
    }));

    return {
      content,
      ...(toolCalls.length > 0 && { toolCalls }),
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreation5mInputTokens: usage.cacheCreation5mInputTokens,
        cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
      },
      model: HAIKU_MODEL_ID,
      provider: 'anthropic',
      latencyMs,
      generationId: ledger.id,
      rawContent: message.content,
      inputTokensTotal,
      stopReason: message.stop_reason,
      effort,
      costUsd: cost.totalCostUsd,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAtMs;
    const errorKind = budgetErrorKind(error);
    const httpStatus = providerHttpStatus(error);
    const billed = billedFailureUsage(error);
    await deps.failLedger({
      id: ledger.id,
      latencyMs,
      attemptCount: providerAttemptCount(error),
      errorKind,
      httpStatus,
      ...billed,
    });
    // A refusal, truncation or empty reply is billed: keep its usage and cost on the PostHog event.
    const billedUsage = error instanceof ModelStopError ? error.billed.usage : null;
    const billedRecords = billedUsage ? usageRecordsOf(billedUsage) : null;
    const billedCost = billedRecords ? haiku55CostUsd(billedUsage) : null;
    await captureGeneration(deps, context, buildAiGenerationProperties({
      site: options.site,
      effort,
      context,
      generationId: ledger.id,
      latencyMs,
      stopReason: null,
      providerRequestId: billed.providerRequestId ?? null,
      usage: billedRecords ? sumUsageParts(billedRecords) : null,
      costUsd: billedCost?.totalCostUsd ?? null,
      inputCostUsd: billedCost?.inputCostUsd ?? null,
      outputCostUsd: billedCost?.outputCostUsd ?? null,
      budget,
      errorKind,
      httpStatus,
    }));
    console.error(`[haiku] ${options.site} failed (${errorKind})`, error instanceof Error ? error.message : error);
    throw error;
  }
}
