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
import {
  getBedrockClient,
  getPrimaryClient,
  runWithFailover,
  type FailoverTarget,
  type MessagesClient,
} from './providers';
import type { ModelResponse, ConversationMessage, CacheableContentBlock } from './types';

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
 * Thinking counts toward max_tokens and the Sonnet 5.5 tokenizer produces about 30% more
 * tokens than Sonnet 4.6 for the same text, so the budgets tuned on 4.6 are scaled up.
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
const SONNET_55_PRICING: ModelPricing = { inputPerM: 2, outputPerM: 10, cacheWritePerM: 2.5, cacheReadPerM: 0.1 };

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

/** Request body for a Sonnet 5.5 call (see the file header for the shape). */
function buildSdkParams(params: {
  model: string;
  maxTokens: number;
  system?: SystemParam;
  messages: Anthropic.MessageParam[];
}): Anthropic.MessageCreateParamsNonStreaming {
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

/** Structured system blocks (with cache_control) win over a plain string; jsonMode appends the JSON-only rule. */
function buildSystemParam(options: Pick<AnthropicCallOptions, 'systemPrompt' | 'systemBlocks' | 'jsonMode'>): SystemParam | undefined {
  const { systemPrompt, systemBlocks, jsonMode } = options;
  if (systemBlocks && systemBlocks.length > 0) {
    return jsonMode ? [...systemBlocks, { type: 'text', text: JSON_INSTRUCTION }] : [...systemBlocks];
  }
  if (systemPrompt) return jsonMode ? `${systemPrompt}\n\n${JSON_INSTRUCTION}` : systemPrompt;
  return undefined;
}

/** One SDK Messages call. Streams (and waits for the final message) above STREAM_ABOVE_MAX_TOKENS. */
async function sendSdkMessage(
  client: MessagesClient,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<{ message: Anthropic.Message; requestId: string | null }> {
  if (params.max_tokens > STREAM_ABOVE_MAX_TOKENS) {
    const stream = client.messages.stream(params);
    const message = await stream.finalMessage();
    return { message, requestId: stream.request_id ?? null };
  }
  const { data, request_id } = await client.messages.create(params).withResponse();
  return { message: data, requestId: request_id ?? null };
}

/** A completed response that must not be treated as success (refusal or truncation). */
export class ModelStopError extends Error {
  constructor(
    message: string,
    readonly errorKind: 'provider_refusal' | 'provider_max_tokens' | 'provider_empty_content',
    /** The response was billed, so its usage and request id still go in the failed ledger row. */
    readonly billed: { usage: unknown; providerRequestId: string | null },
  ) {
    super(message);
    this.name = 'ModelStopError';
  }
}

/**
 * Fail loud on a stop reason that leaves no usable answer. A refusal is an HTTP 200 with
 * `stop_reason: "refusal"`; returning its (empty or partial) text as success would ship an empty
 * document. A `max_tokens` stop means thinking plus answer ran out of budget, which truncates the
 * JSON or the letter.
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
}

/** Read text by block type: thinking blocks come first (empty by default) and are skipped. */
function sdkMessageText(message: Anthropic.Message, requestId: string | null, maxTokens: number): string {
  assertUsableStop(message.stop_reason, message.stop_details, maxTokens, {
    usage: message.usage,
    providerRequestId: requestId ?? message.id ?? null,
  });
  return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
}

export function providerErrorKind(error: unknown, fallback: string): string {
  if (error instanceof ModelStopError) return error.errorKind;
  return fallback;
}

/**
 * Usage and request id of a billed response that still failed (refusal or truncation), for the
 * single failed ledger row. Empty for errors where no response came back.
 */
export function billedFailureUsage(error: unknown): Partial<Parameters<typeof failLlmGeneration>[0]> {
  if (!(error instanceof ModelStopError)) return {};
  const normalized = normalizeProviderUsage(error.billed.usage);
  return {
    providerRequestId: error.billed.providerRequestId,
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
  systemPrompt?: string;
  /** Structured system blocks with cache_control for prompt caching */
  systemBlocks?: CacheableContentBlock[];
  maxTokens?: number;
  jsonMode?: boolean;
  conversationHistory?: ConversationMessage[];
  generationContext?: LlmGenerationContext;
}

/** One non-streaming attempt on one provider, with its own ledger row. Throws the original error. */
async function sdkTextAttempt(
  target: FailoverTarget<MessagesClient>,
  call: {
    context: LlmGenerationContext;
    maxTokens: number;
    system?: SystemParam;
    messages: Anthropic.MessageParam[];
    errorKindFallback: string;
  },
): Promise<{ text: string; message: Anthropic.Message; ledgerId: string; latencyMs: number }> {
  const startTime = Date.now();
  const ledger = await startLlmGeneration({ context: call.context, provider: target.provider, model: target.model });
  let providerResponseReceived = false;
  try {
    const params = buildSdkParams({ model: target.model, maxTokens: call.maxTokens, system: call.system, messages: call.messages });
    const { message, requestId } = await sendSdkMessage(target.getClient(), params);
    // Throws on a refusal or truncation before the ledger marks the call complete.
    const text = sdkMessageText(message, requestId, params.max_tokens);
    providerResponseReceived = true;
    await completeProviderGeneration({
      id: ledger.id,
      startedAtMs: startTime,
      response: { usage: message.usage, id: message.id, _request_id: requestId ?? undefined },
    });
    return { text, message, ledgerId: ledger.id, latencyMs: Date.now() - startTime };
  } catch (error) {
    if (!providerResponseReceived) {
      await recordProviderFailure({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        attemptCount: 1,
        errorKind: providerErrorKind(error, call.errorKindFallback),
        httpStatus: providerHttpStatus(error),
        ...billedFailureUsage(error),
      });
    }
    throw error;
  }
}

function sonnetFailover<T>(
  context: LlmGenerationContext,
  attempt: (target: FailoverTarget<MessagesClient>) => Promise<T>,
  canFailOver?: () => boolean,
): Promise<T> {
  return runWithFailover<MessagesClient, T>({
    site: context.operation,
    model: SONNET_MODEL_ID,
    context,
    primary: getPrimaryClient,
    bedrock: getBedrockClient,
    attempt,
    canFailOver,
  });
}

/**
 * Call Claude Sonnet 5.5 for all kit-writing, parsing and analysis tasks.
 */
export async function callAnthropic(options: AnthropicCallOptions): Promise<ModelResponse> {
  const { prompt, maxTokens = 4096, conversationHistory } = options;
  const system = buildSystemParam(options);
  const messages: Anthropic.MessageParam[] = conversationHistory && conversationHistory.length > 0
    ? conversationHistory.map((msg) => ({ role: msg.role, content: msg.content }))
    : [{ role: 'user', content: prompt }];
  const context = options.generationContext ?? fallbackGenerationContext('direct_anthropic_call');

  try {
    const { text: content, message, ledgerId, latencyMs, provider, model } = await sonnetFailover(context, async (target) => ({
      ...(await sdkTextAttempt(target, { context, maxTokens, system, messages, errorKindFallback: 'provider_error' })),
      provider: target.provider,
      model: target.model,
    }));

    const cacheCreation = message.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = message.usage.cache_read_input_tokens ?? 0;
    if (cacheCreation > 0 || cacheRead > 0) {
      console.log(`[Anthropic Cache] write=${cacheCreation} read=${cacheRead} input=${message.usage.input_tokens} output=${message.usage.output_tokens}`);
    }

    return {
      content,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheCreationInputTokens: cacheCreation || undefined,
        cacheReadInputTokens: cacheRead || undefined,
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
  const { prompt, maxTokens = 4096 } = options;
  const system = buildSystemParam(options);
  const context = options.generationContext ?? fallbackGenerationContext('direct_anthropic_stream');
  let textEmitted = false;

  const attempt = async (target: FailoverTarget<MessagesClient>): Promise<ModelResponse> => {
    const startTime = Date.now();
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    let providerRequestId: string | null = null;
    const finalUsage: Record<string, number> = {};
    let stopReason: string | null | undefined;
    let stopDetails: { category?: string | null } | null | undefined;

    const ledger = await startLlmGeneration({ context, provider: target.provider, model: target.model });
    let providerResponseReceived = false;
    try {
      const params = buildSdkParams({ model: target.model, maxTokens, system, messages: [{ role: 'user', content: prompt }] });
      const stream = target.getClient().messages.stream(params);

      for await (const event of stream) {
        // Text deltas only: thinking and signature deltas never reach the caller.
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullContent += text;
          textEmitted = true;
          onChunk(text);
        }

        if (event.type === 'message_delta') {
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
          if (cacheCreationTokens > 0 || cacheReadTokens > 0) {
            console.log(`[Anthropic Cache Stream] write=${cacheCreationTokens} read=${cacheReadTokens} input=${inputTokens}`);
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
      await completeProviderGeneration({
        id: ledger.id,
        startedAtMs: startTime,
        response: {
          usage: Object.keys(finalUsage).length > 0 ? finalUsage : undefined,
          _request_id: providerRequestId ?? undefined,
        },
      });

      return {
        content: fullContent,
        usage: {
          inputTokens,
          outputTokens,
          cacheCreationInputTokens: cacheCreationTokens || undefined,
          cacheReadInputTokens: cacheReadTokens || undefined,
        },
        model: target.model,
        provider: target.provider,
        latencyMs: Date.now() - startTime,
        generationId: ledger.id,
      };
    } catch (error) {
      if (!providerResponseReceived) {
        await recordProviderFailure({
          id: ledger.id,
          latencyMs: Date.now() - startTime,
          attemptCount: 1,
          errorKind: providerErrorKind(error, 'provider_stream_error'),
          httpStatus: providerHttpStatus(error),
          ...billedFailureUsage(error),
        });
      }
      throw error;
    }
  };

  try {
    return await sonnetFailover(context, attempt, () => !textEmitted);
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

  try {
    const { text } = await sonnetFailover(context, (target) => sdkTextAttempt(target, {
      context,
      maxTokens: 8192,
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
          { type: 'text', text: userText },
        ],
      }],
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

  // With citations enabled the answer can arrive as several text blocks, so all are joined.
  const { text } = await sonnetFailover(context, (target) => sdkTextAttempt(target, {
    context,
    maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: [documentBlock, { type: 'text', text: prompt }] }],
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
