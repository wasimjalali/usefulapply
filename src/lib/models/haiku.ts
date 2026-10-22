/**
 * Claude Haiku 5.5 on the Anthropic API: the one call path that replaces gpt-oss-120b (Workers AI).
 *
 * Request shape (measured, evals/results/2026-10-22-haiku-55-swap.md): `output_config.effort`, thinking
 * adaptive (the field is omitted) or `{type:'disabled'}` for 'low-nothink', no temperature (a 400),
 * structured output through `output_config.format`, native tool blocks.
 *
 * Caching (.claude/rules/prompt-caching.md): marker on the static system block (the prefix before it,
 * the tools, is cached with it; no marker on the last tool) and on the stable-context block (both with the
 * site's TTL), and optional automatic 5-minute caching of the
 * conversation tail. The 1-hour markers always come first in the prefix, as the API requires.
 *
 * Budget: every request is measured (token-budget.ts) and refused above 90k tokens before it is sent.
 * Every attempt writes a ledger row and one PostHog `$ai_generation` event.
 *
 * Failover (providers.ts): after a network failure or a 5xx on the Anthropic API, the same request goes to
 * Claude in Amazon Bedrock (model `anthropic.claude-haiku-5-5`). The failed primary attempt and the Bedrock
 * attempt each have their own ledger row and `$ai_generation` event (`$ai_provider` 'anthropic' / 'bedrock');
 * the cache markers are byte-identical, Bedrock keeps its own cache. The count_tokens guard fails over too:
 * when the primary cannot count and Bedrock can, the message goes to Bedrock as well (the primary just failed),
 * under one failover event; if Bedrock cannot count either the guard fails loud (it never estimates past the cap)
 * and the primary's ledger row says `count_tokens_failed`. Streamed calls (max_tokens over 16k) fail over when the
 * connection is lost or goes idle after the headers too (stream-guard.ts).
 * Beta types and `client.beta.messages` are used because `usage.iterations` and system-message fields exist
 * only there. The messages calls send no `betas` header; the countTokens call adds the SDK's own
 * `anthropic-beta: token-counting` header.
 */
import type Anthropic from '@anthropic-ai/sdk';
import {
  startLlmGeneration,
  type LlmGenerationContext,
} from '@/db/repos/adminMetrics';
import { getPostHogServer } from '@/lib/posthog-server';
import {
  ModelStopError,
  STREAM_ABOVE_MAX_TOKENS,
  assertMarkerTtlOrder,
  assertUsableStop,
  billedFailureUsage,
  billedUsageOf,
  completeProviderGeneration,
  haiku55CostUsd,
  providerErrorKind,
  providerHttpStatus,
  recordProviderFailure,
  streamIdleTimeoutMs,
  sumUsageParts,
  usageRecordsOf,
  type UsageParts,
} from './anthropic';
import {
  bedrockModelId,
  captureFailoverEvent,
  getBedrockClient,
  getPrimaryClient,
  isFailoverError,
  markNotFailoverEligible,
  runWithFailover,
  type FailoverTarget,
  type MessagesClient,
  type ProviderName,
} from './providers';
import { resolveHaikuEffort } from './haiku-effort';
import { createStreamGuard } from './stream-guard';
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

/**
 * Per-call HTTP timeout. The SDK default is 10 minutes, so a hung primary would hold the user for up to
 * 20 minutes (one SDK retry) before the Bedrock failover runs. About 4x the slowest call measured in
 * production over 60 days (gpt-oss, slower than Haiku): interactive sites peaked at 24 s, the job feed at
 * 114 s. Screening is the exception, 90 s: it can write 8000 tokens at about 170 tokens/s with thinking, which
 * is 47 s of generation alone, so 45 s would cut a healthy call. The SDK arms it around the fetch until response
 * headers, which for a non-streamed call is the whole generation. A timeout is a failover error
 * (APIConnectionTimeoutError). A streamed call (max_tokens over 16k) also has STREAM_IDLE_TIMEOUT_MS after its headers.
 */
export const HAIKU_SITE_TIMEOUT_MS: Readonly<Record<HaikuSite, number>> = {
  chat: 45_000,
  screening: 90_000,
  tracker: 45_000,
  language: 45_000,
  ranking: 120_000,
  search_strategy: 120_000,
  career_profile: 120_000,
};
/** count_tokens is a cheap metadata call. */
export const HAIKU_COUNT_TOKENS_TIMEOUT_MS = 15_000;

export interface HaikuRequestOptions {
  timeout: number;
}

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
  /**
   * Pin the call to one provider, with no failover in either direction. A multi-round loop that passes the
   * assistant's content back (thinking and tool_use blocks are signed by whoever produced them) sets this to
   * 'bedrock' once a round was answered by Bedrock, so those blocks never reach the Anthropic API. Unset
   * (the default) tries the Anthropic API and fails over to Bedrock. Per request, never stored anywhere.
   */
  provider?: ProviderName;
}

export interface HaikuResponse extends ModelResponse {
  /** Who answered. A loop passes 'bedrock' back as `provider` for the rounds that follow. */
  provider: ProviderName;
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

/** The Messages API body of one call (non-streaming shape; calls above STREAM_ABOVE_MAX_TOKENS stream). */
export type HaikuRequest = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type CountTokensParams = Anthropic.Beta.Messages.MessageCountTokensParams;
type CacheControl = Anthropic.Beta.BetaCacheControlEphemeral;

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
function effortParams(effort: HaikuEffort): { thinking?: Anthropic.Beta.BetaThinkingConfigDisabled; effortLevel: 'low' | 'medium' | 'high' } {
  return effort === 'low-nothink'
    ? { thinking: { type: 'disabled' }, effortLevel: 'low' }
    : { effortLevel: effort };
}

/** A tool schema in canonical key order. The API wants an object schema; anything else fails loud here. */
function toolInputSchema(tool: HaikuToolDefinition): Anthropic.Beta.BetaTool.InputSchema {
  const schema = canonicalizeSchema(tool.input_schema);
  if (schema.type !== 'object') throw new Error(`callHaiku: tool "${tool.name}" input_schema.type must be "object"`);
  return { ...schema, type: 'object' };
}

/**
 * The Messages API body for a call. Exported so cache tests can build two requests and compare the
 * cached prefix byte for byte. Throws on options that cannot make a valid request.
 */
function markerTtls(
  systemBlocks: Anthropic.Beta.BetaTextBlockParam[],
  messages: HaikuCallOptions['messages'],
  automatic: boolean,
): Array<'5m' | '1h'> {
  const ttls: Array<'5m' | '1h'> = [];
  const visit = (block: { cache_control?: CacheControl | null }) => {
    if (block.cache_control) ttls.push(block.cache_control.ttl === '1h' ? '1h' : '5m');
  };
  systemBlocks.forEach(visit);
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) visit(block as { cache_control?: CacheControl | null });
  }
  // Automatic caching marks the last block of the conversation, always 5m, so it never breaks the order.
  if (automatic) ttls.push('5m');
  return ttls;
}

export function buildHaikuRequest(options: HaikuCallOptions, effort: HaikuEffort): HaikuRequest {
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

  const systemBlocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: system.static, cache_control: marker }];
  if (system.stableContext && system.stableContext.trim()) {
    systemBlocks.push({ type: 'text', text: system.stableContext, cache_control: marker });
  }

  const params: HaikuRequest = {
    model: HAIKU_MODEL_ID,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages,
  };

  if (hasTools) {
    // No marker on the last tool: tools precede system in the prefix, so the system.static marker caches them
    // too, and a fourth marker here would push chat (static, stableContext, its own turn marker) over 4.
    params.tools = (tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: toolInputSchema(tool),
    }));
    // 'auto' is the API default, so it is omitted. 'none' keeps the tool list (the cache key) intact.
    if (toolChoice === 'none') params.tool_choice = { type: 'none' };
  }

  const { thinking, effortLevel } = effortParams(effort);
  if (thinking) params.thinking = thinking;
  params.output_config = {
    effort: effortLevel,
    ...(jsonSchema && { format: { type: 'json_schema', schema: canonicalizeSchema(jsonSchema) } }),
  };

  // Automatic caching marks the last block of the conversation (5m), after the 1h markers above.
  if (options.cacheConversation) params.cache_control = { type: 'ephemeral' };

  const ttls = markerTtls(systemBlocks, messages, Boolean(options.cacheConversation));
  if (ttls.length > 4) {
    throw new Error(`callHaiku(${site}): ${ttls.length} cache markers, the API allows 4`);
  }
  assertMarkerTtlOrder(ttls, `callHaiku(${site})`);

  return params;
}

// -------------------------------------------------------------------------------------------------
// Response handling
// -------------------------------------------------------------------------------------------------

/** What callHaiku reads of a response: a BetaMessage satisfies it, plus the HTTP request id. */
export type HaikuMessage = Pick<Anthropic.Beta.BetaMessage, 'id' | 'content' | 'stop_reason' | 'usage'> & {
  stop_details?: Anthropic.Beta.BetaMessage['stop_details'];
  _request_id?: string | null;
};

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
  assertUsableStop(message.stop_reason, message.stop_details, maxTokens, billed);

  let content = '';
  const toolCalls: NonNullable<HaikuResponse['toolCalls']> = [];
  for (const block of message.content) {
    if (block.type === 'text') content += block.text;
    else if (block.type === 'tool_use') {
      if (block.input === null || typeof block.input !== 'object' || Array.isArray(block.input)) {
        throw new Error(`Haiku returned tool_use "${block.name}" with a non-object input`);
      }
      toolCalls.push({ id: block.id, name: block.name, arguments: Object.fromEntries(Object.entries(block.input)) });
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
  /** Who served the attempt, and under which model id (Bedrock ids are prefixed `anthropic.`). */
  provider: ProviderName;
  model: string;
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
    $ai_provider: input.provider,
    $ai_model: input.model,
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
    provider: input.provider,
    model: input.model,
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
  createMessage(params: HaikuRequest, options?: HaikuRequestOptions): Promise<HaikuMessage>;
  /** Exact input tokens for system + tools + messages. Free. */
  countTokens(params: CountTokensParams): Promise<number>;
}

export interface HaikuDeps {
  getClient(): HaikuClient;
  /** The Amazon Bedrock client, or null when it is not configured (failover off). Absent means off. */
  getBedrockClient?(): HaikuClient | null;
  startLedger: typeof startLlmGeneration;
  completeLedger: typeof completeProviderGeneration;
  failLedger: typeof recordProviderFailure;
  /** `event` defaults to `$ai_generation`. */
  capture(event: { distinctId: string; event?: string; properties: Record<string, unknown> }): Promise<void>;
}

function haikuClientFor(sdk: MessagesClient): HaikuClient {
  return {
    async createMessage(params, options) {
      if (params.max_tokens > STREAM_ABOVE_MAX_TOKENS) {
        // The caller sees nothing until the final message, so a stream that breaks or goes idle is safe to fail over.
        const guard = createStreamGuard(streamIdleTimeoutMs());
        try {
          const stream = sdk.beta.messages.stream(params, { ...options, ...guard.requestOptions });
          const message = await guard.run(() => stream.finalMessage(), () => stream.currentMessage?.usage);
          return { ...message, _request_id: stream.request_id ?? null };
        } finally {
          guard.dispose();
        }
      }
      // The SDK already defines a read-only `_request_id` on the message at runtime, so it is copied, not assigned.
      const { data, request_id } = await sdk.beta.messages.create(params, options).withResponse();
      return { ...data, _request_id: request_id ?? null };
    },
    async countTokens(params) {
      const result = await sdk.beta.messages.countTokens(params, { timeout: HAIKU_COUNT_TOKENS_TIMEOUT_MS });
      return result.input_tokens;
    },
  };
}

/** The Anthropic API client. Throws at call time when ANTHROPIC_API_KEY is missing. */
export function defaultHaikuClient(): HaikuClient {
  return haikuClientFor(getPrimaryClient());
}

/** The Amazon Bedrock client, or null when no Bedrock credentials are configured. */
export function defaultBedrockHaikuClient(): HaikuClient | null {
  const sdk = getBedrockClient();
  return sdk ? haikuClientFor(sdk) : null;
}

const defaultDeps: HaikuDeps = {
  getClient: defaultHaikuClient,
  getBedrockClient: defaultBedrockHaikuClient,
  startLedger: startLlmGeneration,
  completeLedger: completeProviderGeneration,
  failLedger: recordProviderFailure,
  async capture({ distinctId, event, properties }) {
    const posthog = getPostHogServer();
    posthog.capture({ distinctId, event: event ?? '$ai_generation', properties });
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

/** The one failover helper, wired to this call's deps, site and context. */
function haikuFailover<T>(
  deps: HaikuDeps,
  options: HaikuCallOptions,
  attempt: (target: FailoverTarget<HaikuClient>) => Promise<T>,
): Promise<T> {
  return runWithFailover<HaikuClient, T>({
    site: options.site,
    model: HAIKU_MODEL_ID,
    context: options.generationContext,
    primary: () => deps.getClient(),
    bedrock: () => deps.getBedrockClient?.() ?? null,
    attempt,
    pin: options.provider,
    onFailover: (info) => captureFailoverEvent(info, (event) => deps.capture(event)),
  });
}

/**
 * Measure a request outside any call: the local estimate, and an exact count_tokens call only above
 * COUNT_TOKENS_ABOVE. The count fails over to Bedrock like a message does (callers that shrink their input
 * use this). If that fails too, the guard fails loud with the count's error (a budget that could not be
 * checked must not read as "fine"). callHaiku does its own count inside its attempts, see below.
 */
async function measureBudget(deps: HaikuDeps, options: HaikuCallOptions, params: HaikuRequest): Promise<InputBudgetCheck> {
  return measureInputBudget(
    { system: params.system, tools: params.tools, messages: params.messages },
    async () => {
      try {
        return await haikuFailover(deps, options, (target) => target.getClient().countTokens({
          model: target.model,
          system: params.system,
          ...(params.tools ? { tools: params.tools } : {}),
          messages: params.messages,
        }));
      } catch (error) {
        // Bedrock was already tried for the count: do not try it again for the message.
        throw markNotFailoverEligible(error);
      }
    },
  );
}

// -------------------------------------------------------------------------------------------------
// The call
// -------------------------------------------------------------------------------------------------

/**
 * Measure a request exactly the way callHaiku will before sending it. Call sites that shrink their input to
 * fit the budget (job-feed ranking) use this so their numbers match callHaiku's own guard.
 */
export async function measureHaikuRequest(
  options: HaikuCallOptions,
  deps: HaikuDeps = defaultDeps,
): Promise<InputBudgetCheck> {
  return measureBudget(deps, options, buildHaikuRequest(options, resolveHaikuEffort(options.site)));
}

export async function callHaiku(options: HaikuCallOptions, deps: HaikuDeps = defaultDeps): Promise<HaikuResponse> {
  const effort = resolveHaikuEffort(options.site);
  const params = buildHaikuRequest(options, effort);
  const context = options.generationContext;
  let budget: InputBudgetCheck | null = null;
  // Set when the primary could not count but Bedrock could: the Bedrock attempt reuses that number.
  let countedOnBedrock: number | null = null;

  // One attempt on one provider, with its own ledger row and its own $ai_generation event. It throws the
  // original error after recording it, so the failover helper can read it.
  const attempt = async (target: FailoverTarget<HaikuClient>): Promise<HaikuResponse> => {
    const startedAtMs = Date.now();
    const ledger = await deps.startLedger({ context, provider: target.provider, model: target.model });
    let countFailed = false;

    try {
      const client = target.getClient();

      // Measured once per call, on the first attempt: Bedrock gets the same request, so the same budget.
      if (budget === null) {
        try {
          budget = await measureInputBudget(
            { system: params.system, tools: params.tools, messages: params.messages },
            async () => {
              if (countedOnBedrock !== null) return countedOnBedrock;
              const countRequest = (model: string): CountTokensParams => ({
                model,
                system: params.system,
                ...(params.tools ? { tools: params.tools } : {}),
                messages: params.messages,
              });
              try {
                return await client.countTokens(countRequest(target.model));
              } catch (countError) {
                // Only an unpinned call on the primary may try Bedrock for the count.
                if (target.provider !== 'anthropic' || options.provider || !isFailoverError(countError)) throw countError;
                let bedrock: HaikuClient | null = null;
                try {
                  bedrock = deps.getBedrockClient?.() ?? null;
                } catch (clientError) {
                  console.error('[haiku] Bedrock client unavailable for the count_tokens failover', clientError);
                }
                if (!bedrock) throw countError;
                try {
                  countedOnBedrock = await bedrock.countTokens(countRequest(bedrockModelId(HAIKU_MODEL_ID)));
                } catch (bedrockError) {
                  // Bedrock was tried for the count and failed too: the call must not fail over for the message.
                  throw markNotFailoverEligible(bedrockError);
                }
                // The primary just failed to count, so the message is not sent there. Rethrowing its error lets
                // runWithFailover move the call to Bedrock (one failover event), which reuses this count.
                throw countError;
              }
            },
          );
        } catch (measureError) {
          countFailed = true;
          throw measureError;
        }
      }
      if (isOverRefuseLimit(budget.totalTokens)) {
        console.error(
          `[haiku] ${options.site}: refusing to send ${budget.totalTokens} input tokens (limit ${INPUT_REFUSE_ABOVE}, hard ${INPUT_HARD_LIMIT})`,
        );
        throw new InputBudgetError(options.site, budget.totalTokens);
      }

      const message = await client.createMessage(
        target.model === params.model ? params : { ...params, model: target.model },
        { timeout: HAIKU_SITE_TIMEOUT_MS[options.site] },
      );
      const providerRequestId = message._request_id ?? message.id ?? null;

      const records = usageRecordsOf(message.usage);
      if (!records) throw new Error('Haiku response has no recognisable usage block');
      const usage = sumUsageParts(records);

      // Throws on a refusal, a max_tokens stop or an empty reply, after which the failure handler
      // below records the billed usage on the failed ledger row.
      const { content, toolCalls } = readHaikuContent(message, options.maxTokens);

      // List prices of the direct API on both providers. Bedrock's regional endpoints cost 10% more: not modelled.
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
        provider: target.provider,
        model: target.model,
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
        model: target.model,
        provider: target.provider,
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
      const errorKind = countFailed ? 'count_tokens_failed' : budgetErrorKind(error);
      const httpStatus = providerHttpStatus(error);
      const billed = billedFailureUsage(error);
      await deps.failLedger({
        id: ledger.id,
        latencyMs,
        attemptCount: 1,
        errorKind,
        httpStatus,
        ...billed,
      });
      // A refusal, truncation, empty reply or a stream that broke after reporting usage is billed: keep its usage
      // and cost on the PostHog event.
      const billedUsage = billedUsageOf(error)?.usage ?? null;
      const billedRecords = billedUsage ? usageRecordsOf(billedUsage) : null;
      const billedCost = billedRecords ? haiku55CostUsd(billedUsage) : null;
      await captureGeneration(deps, context, buildAiGenerationProperties({
        site: options.site,
        provider: target.provider,
        model: target.model,
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
      console.error(`[haiku] ${options.site} failed on ${target.provider} (${errorKind})`, error instanceof Error ? error.message : error);
      throw error;
    }
  };

  return haikuFailover(deps, options, attempt);
}
