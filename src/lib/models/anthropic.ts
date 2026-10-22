/**
 * Anthropic Claude Client
 * Primary: Claude Sonnet 5.5 on the direct Anthropic API (adaptive thinking, effort low, no temperature).
 * Bedrock and DigitalOcean stay on Claude Sonnet 4.6 with the old request shape, as the fallback
 * selected through AI_PROVIDER.
 * Previous: Claude Sonnet 4.5, toggle via USE_PREVIOUS_MODEL=true env var
 * Fallback: Claude Haiku 4.5, faster and cheaper, toggle via USE_FALLBACK_MODEL env var
 */

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import {
  completeLlmGeneration,
  failLlmGeneration,
  startLlmGeneration,
  type LlmGenerationContext,
  type LlmUsageProvider,
} from '@/db/repos/adminMetrics';
import type { Json } from '@/db/schema';
import type { ModelResponse, ConversationMessage, CacheableContentBlock } from './types';

type ProviderLedgerMetadata = {
  attemptCount?: number;
  providerRequestId?: string | null;
  rawUsage?: unknown;
};

type LedgerAwareResponse = {
  usage?: unknown;
  id?: string;
  _request_id?: string;
  __ledger?: ProviderLedgerMetadata;
};

class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly attemptCount: number,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

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
  if (error instanceof ProviderHttpError) return error.status;
  if (error && typeof error === 'object' && 'status' in error) {
    return exactTokenCount((error as { status?: unknown }).status);
  }
  return null;
}

export function providerAttemptCount(error: unknown): number {
  return error instanceof ProviderHttpError ? error.attemptCount : 1;
}

export async function completeProviderGeneration(params: {
  id: string;
  startedAtMs: number;
  response: LedgerAwareResponse;
  fallbackUsage?: unknown;
}): Promise<void> {
  const metadata = params.response.__ledger;
  const rawUsage = metadata && Object.prototype.hasOwnProperty.call(metadata, 'rawUsage')
    ? metadata.rawUsage
    : params.response.usage ?? params.fallbackUsage;
  const normalized = normalizeProviderUsage(rawUsage);
  try {
    await completeLlmGeneration({
      id: params.id,
      latencyMs: Date.now() - params.startedAtMs,
      attemptCount: metadata?.attemptCount ?? 1,
      providerRequestId: metadata?.providerRequestId
        ?? params.response._request_id
        ?? params.response.id
        ?? null,
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

// Provider selection: AI_PROVIDER env var overrides auto-detect
// Values: 'digitalocean' | 'bedrock' | 'anthropic'
// If unset, auto-detects from available credentials (backwards-compatible)
const AI_PROVIDER = process.env.AI_PROVIDER as 'digitalocean' | 'bedrock' | 'anthropic' | undefined;

const HAS_BEARER_TOKEN = !!process.env.AWS_BEARER_TOKEN_BEDROCK;
const HAS_TRADITIONAL_KEYS = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const HAS_DIGITALOCEAN = !!(process.env.DIGITALOCEAN_AGENT_ENDPOINT && process.env.DIGITALOCEAN_ACCESS_KEY);

// Resolve active provider
const USE_DIGITALOCEAN = AI_PROVIDER === 'digitalocean' || (!AI_PROVIDER && HAS_DIGITALOCEAN && !HAS_BEARER_TOKEN && !HAS_TRADITIONAL_KEYS);
const USE_BEDROCK = AI_PROVIDER === 'bedrock' || (!AI_PROVIDER && !USE_DIGITALOCEAN && (HAS_BEARER_TOKEN || HAS_TRADITIONAL_KEYS));
// Request routing uses this, not HAS_BEARER_TOKEN alone: with AI_PROVIDER=anthropic the Bedrock bearer
// secret can stay set for the fallback without pulling calls onto Bedrock.
const USE_BEDROCK_BEARER = USE_BEDROCK && HAS_BEARER_TOKEN;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Primary model. Bedrock stays on Claude Sonnet 4.6 (fallback provider); the direct Anthropic API
// runs Claude Sonnet 5.5, which won the 2026-10-12 eval on grounding, speed and cost.
const BEDROCK_MODEL_ID = `${AWS_REGION === 'us-east-1' ? 'us' : AWS_REGION.startsWith('eu') ? 'eu' : 'us'}.anthropic.claude-sonnet-4-6`;
const DIRECT_MODEL_ID = 'claude-sonnet-5-5';

// Previous model: Claude Sonnet 4.5 — kept as fallback, toggle via USE_PREVIOUS_MODEL=true
const BEDROCK_PREVIOUS_MODEL_ID = `${AWS_REGION === 'us-east-1' ? 'us' : AWS_REGION.startsWith('eu') ? 'eu' : 'us'}.anthropic.claude-sonnet-4-5-20250929-v1:0`;
const DIRECT_PREVIOUS_MODEL_ID = 'claude-sonnet-4-5-20250929';

// Cost fallback: Claude Haiku 4.5 — faster, cheaper, toggle via USE_FALLBACK_MODEL=true
const BEDROCK_FALLBACK_MODEL_ID = `${AWS_REGION === 'us-east-1' ? 'us' : AWS_REGION.startsWith('eu') ? 'eu' : 'us'}.anthropic.claude-haiku-4-5-20251001-v1:0`;
const DIRECT_FALLBACK_MODEL_ID = 'claude-haiku-4-5';

// DigitalOcean Gradient AI model IDs (OpenAI-compatible endpoint)
const DO_MODEL_ID = 'anthropic-claude-4.6-sonnet';
const DO_PREVIOUS_MODEL_ID = 'anthropic-claude-4.5-sonnet';
const DO_FALLBACK_MODEL_ID = 'anthropic-claude-haiku-4.5';

// Toggle: Set USE_PREVIOUS_MODEL=true to roll back to Sonnet 4.5
const USE_PREVIOUS = process.env.USE_PREVIOUS_MODEL === 'true';
// Toggle: Set USE_FALLBACK_MODEL=true to switch to Haiku 4.5 (cheapest)
const USE_FALLBACK = process.env.USE_FALLBACK_MODEL === 'true';

// Initialize the appropriate client
const anthropic = USE_BEDROCK
  ? HAS_BEARER_TOKEN
    ? null // Will use custom fetch for bearer token
    : new AnthropicBedrock({
        // Traditional key authentication
        awsAccessKey: process.env.AWS_ACCESS_KEY_ID!,
        awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY!,
        ...(process.env.AWS_SESSION_TOKEN && { awsSessionToken: process.env.AWS_SESSION_TOKEN }),
        awsRegion: AWS_REGION,
      })
  : new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

// Custom Bedrock client for bearer token authentication
class BedrockBearerTokenClient {
  private bearerToken: string;
  private region: string;
  private baseUrl: string;

  constructor(bearerToken: string, region: string) {
    this.bearerToken = bearerToken;
    this.region = region;
    this.baseUrl = `https://bedrock-runtime.${region}.amazonaws.com`;
  }

  async create(params: {
    model: string;
    max_tokens: number;
    temperature?: number;
    system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const url = `${this.baseUrl}/model/${params.model}/converse`;

    // Convert Anthropic format to Bedrock format
    const bedrockMessages = params.messages.map(msg => ({
      role: msg.role,
      content: [{ text: msg.content }]
    }));

    // Converse API: modelId goes in URL path only, NOT in the request body
    const payload: Record<string, unknown> = {
      messages: bedrockMessages,
      inferenceConfig: {
        maxTokens: params.max_tokens,
        temperature: params.temperature,
      }
    };

    // Add system prompt if provided
    if (params.system) {
      if (typeof params.system === 'string') {
        payload.system = [{ text: params.system }];
      } else {
        // Convert Anthropic cache_control markers to Bedrock cachePoint markers.
        // Bedrock Converse API format: insert { cachePoint: { type: 'default' } }
        // as a SEPARATE element after each block that has cache_control set.
        const systemBlocks: Array<{ text?: string; cachePoint?: { type: string } }> = [];
        for (const block of params.system) {
          systemBlocks.push({ text: block.text });
          if (block.cache_control) {
            systemBlocks.push({ cachePoint: { type: 'default' } });
          }
        }
        payload.system = systemBlocks;
      }
    }

    // Retry with exponential backoff for transient errors (503, 429, 500)
    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        console.log(`[Bedrock] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      });

      if (response.ok) {
        const data = await response.json();

        // Convert Bedrock response back to Anthropic format.
        // Bedrock uses camelCase (inputTokens, cacheReadInputTokens, cacheWriteInputTokens).
        // Anthropic uses snake_case (input_tokens, cache_read_input_tokens, cache_creation_input_tokens).
        return {
          content: [{ type: 'text' as const, text: data.output?.message?.content?.[0]?.text || '' }],
          usage: {
            input_tokens: data.usage?.inputTokens || 0,
            output_tokens: data.usage?.outputTokens || 0,
            cache_read_input_tokens: data.usage?.cacheReadInputTokens || 0,
            cache_creation_input_tokens: data.usage?.cacheWriteInputTokens || 0,
          },
          __ledger: {
            attemptCount: attempt + 1,
            providerRequestId: response.headers.get('x-amzn-requestid'),
            rawUsage: data.usage ?? null,
          },
        };
      }

      const errorText = await response.text();
      lastError = new ProviderHttpError(
        `Bedrock API error: ${response.status} ${errorText}`,
        response.status,
        attempt + 1,
      );

      // Only retry on transient errors
      if (![500, 503, 429].includes(response.status)) {
        throw lastError;
      }
      console.warn(`[Bedrock] Transient error ${response.status}, will retry...`);
    }

    throw lastError!;
  }
}

// DigitalOcean Gradient AI client — OpenAI-compatible chat/completions endpoint
class DigitalOceanClient {
  private endpoint: string;
  private accessKey: string;

  constructor(endpoint: string, accessKey: string) {
    // Strip trailing slash if present
    this.endpoint = endpoint.replace(/\/$/, '');
    this.accessKey = accessKey;
  }

  // Convert Anthropic-style system + messages to OpenAI chat/completions format
  private buildOpenAIMessages(
    system: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ) {
    const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (system) {
      const systemText = typeof system === 'string'
        ? system
        : system.map(b => b.text).join('\n\n');
      openaiMessages.push({ role: 'system', content: systemText });
    }

    for (const msg of messages) {
      openaiMessages.push({ role: msg.role, content: msg.content });
    }

    return openaiMessages;
  }

  async create(params: {
    model: string;
    max_tokens: number;
    temperature?: number;
    system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const url = `${this.endpoint}/v1/chat/completions`;
    const openaiMessages = this.buildOpenAIMessages(params.system, params.messages);

    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        console.log(`[DigitalOcean] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages: openaiMessages,
          max_tokens: params.max_tokens,
          temperature: params.temperature,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const choice = data.choices?.[0];

        // Convert OpenAI response to Anthropic format
        return {
          content: [{ type: 'text' as const, text: choice?.message?.content || '' }],
          usage: {
            input_tokens: data.usage?.prompt_tokens || 0,
            output_tokens: data.usage?.completion_tokens || 0,
          },
          __ledger: {
            attemptCount: attempt + 1,
            providerRequestId: response.headers.get('x-request-id') ?? data.id ?? null,
            rawUsage: data.usage ?? null,
          },
        };
      }

      const errorText = await response.text();
      lastError = new ProviderHttpError(
        `DigitalOcean API error: ${response.status} ${errorText}`,
        response.status,
        attempt + 1,
      );

      if (![500, 503, 429].includes(response.status)) {
        throw lastError;
      }
      console.warn(`[DigitalOcean] Transient error ${response.status}, will retry...`);
    }

    throw lastError!;
  }

  async createStream(params: {
    model: string;
    max_tokens: number;
    temperature?: number;
    system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }, onChunk: (chunk: string) => void): Promise<{
    content: string;
    usage: { input_tokens: number; output_tokens: number };
    __ledger: ProviderLedgerMetadata;
  }> {
    const url = `${this.endpoint}/v1/chat/completions`;
    const openaiMessages = this.buildOpenAIMessages(params.system, params.messages);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: openaiMessages,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderHttpError(
        `DigitalOcean streaming error: ${response.status} ${errorText}`,
        response.status,
        1,
      );
    }

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let rawUsage: unknown = null;
    let providerRequestId = response.headers.get('x-request-id');

    const reader = response.body?.getReader();
    if (!reader) throw new Error('DigitalOcean: No response body for streaming');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (!providerRequestId && typeof parsed.id === 'string') {
            providerRequestId = parsed.id;
          }
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            onChunk(delta.content);
          }
          // Capture usage from the final chunk if present
          if (parsed.usage) {
            rawUsage = parsed.usage;
            inputTokens = parsed.usage.prompt_tokens || 0;
            outputTokens = parsed.usage.completion_tokens || 0;
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    return {
      content: fullContent,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      __ledger: {
        attemptCount: 1,
        providerRequestId,
        rawUsage,
      },
    };
  }
}

// Cached DigitalOcean client
let cachedDOClient: DigitalOceanClient | null = null;
function getDigitalOceanClient(): DigitalOceanClient {
  if (!cachedDOClient) {
    cachedDOClient = new DigitalOceanClient(
      process.env.DIGITALOCEAN_AGENT_ENDPOINT!,
      process.env.DIGITALOCEAN_ACCESS_KEY!,
    );
  }
  return cachedDOClient;
}

// Cached bearer token client — reused across calls to avoid recreating per invocation
let cachedBearerClient: BedrockBearerTokenClient | null = null;
function getBearerTokenClient(): BedrockBearerTokenClient {
  if (!cachedBearerClient) {
    cachedBearerClient = new BedrockBearerTokenClient(
      process.env.AWS_BEARER_TOKEN_BEDROCK!,
      process.env.AWS_BEDROCK_ENDPOINT_URL || AWS_REGION
    );
  }
  return cachedBearerClient;
}

// Export the active model IDs (used by the rest of the codebase)
// Priority: USE_FALLBACK_MODEL (Haiku) > USE_PREVIOUS_MODEL (Sonnet 4.5) > default
// (Sonnet 5.5 on the direct API, Sonnet 4.6 on Bedrock and DigitalOcean)
const ACTIVE_BEDROCK_MODEL_ID = USE_FALLBACK ? BEDROCK_FALLBACK_MODEL_ID : USE_PREVIOUS ? BEDROCK_PREVIOUS_MODEL_ID : BEDROCK_MODEL_ID;
const ACTIVE_DIRECT_MODEL_ID = USE_FALLBACK ? DIRECT_FALLBACK_MODEL_ID : USE_PREVIOUS ? DIRECT_PREVIOUS_MODEL_ID : DIRECT_MODEL_ID;
const ACTIVE_DO_MODEL_ID = USE_FALLBACK ? DO_FALLBACK_MODEL_ID : USE_PREVIOUS ? DO_PREVIOUS_MODEL_ID : DO_MODEL_ID;

const MODEL_ID = USE_DIGITALOCEAN ? ACTIVE_DO_MODEL_ID : USE_BEDROCK ? ACTIVE_BEDROCK_MODEL_ID : ACTIVE_DIRECT_MODEL_ID;

// Sonnet 5.5 request shape: only the direct Anthropic API on the primary model. Bedrock,
// DigitalOcean and the USE_PREVIOUS_MODEL / USE_FALLBACK_MODEL toggles keep the 4.x shape
// (temperature, no thinking, task max_tokens).
const USE_SONNET_55_SHAPE = MODEL_ID === DIRECT_MODEL_ID;
// Effort low won the eval for every task: medium bought nothing measurable on the documents
// and added latency and fit-score inflation.
const SONNET_55_EFFORT = 'low';
// The SDK refuses non-streaming requests it estimates could run past its HTTP timeout, so
// requests above this budget stream and wait for the final message.
const STREAM_ABOVE_MAX_TOKENS = 16_000;

/**
 * Thinking counts toward max_tokens and the Sonnet 5.5 tokenizer produces about 30% more
 * tokens than Sonnet 4.6 for the same text, so the 4.6-tuned task budget is scaled up.
 */
function sonnet55MaxTokens(taskMaxTokens: number): number {
  return Math.max(4000, 4 * taskMaxTokens);
}

export interface ModelPricing {
  /** USD per million tokens */
  inputPerM: number;
  outputPerM: number;
  /** 5-minute cache write, 1.25x input */
  cacheWritePerM: number;
  /** Cache read: 0.1x input on Sonnet 4.x and Haiku 4.5, 0.05x on Sonnet 5.5 */
  cacheReadPerM: number;
  /** 1-hour cache write, 2x input. Only the Haiku 5.5 table carries it. */
  cacheWrite1hPerM?: number;
}

// Cache read is $0.10 (5% of input) per the Sonnet 5.5 model page on platform.claude.com.
const SONNET_55_PRICING: ModelPricing = { inputPerM: 2, outputPerM: 10, cacheWritePerM: 2.5, cacheReadPerM: 0.1 };
const SONNET_4X_PRICING: ModelPricing = { inputPerM: 3, outputPerM: 15, cacheWritePerM: 3.75, cacheReadPerM: 0.3 };
const HAIKU_45_PRICING: ModelPricing = { inputPerM: 1, outputPerM: 5, cacheWritePerM: 1.25, cacheReadPerM: 0.1 };

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

/** The model id every Claude call in this process uses (what the ledger and PostHog record). */
export const ACTIVE_MODEL_ID = MODEL_ID;
/** List price of ACTIVE_MODEL_ID. Same rates on Bedrock, DigitalOcean and the direct API. */
export const ACTIVE_MODEL_PRICING: ModelPricing = USE_FALLBACK
  ? HAIKU_45_PRICING
  : USE_SONNET_55_SHAPE
    ? SONNET_55_PRICING
    : SONNET_4X_PRICING;

type SystemParam = string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;

/**
 * Request body for the Anthropic SDK path (direct API, or Bedrock with traditional keys).
 * Typed loosely on purpose: @anthropic-ai/sdk 0.71.2 has no `adaptive` thinking type and no
 * `output_config`, but forwards unknown body fields unchanged, so it is cast at the call.
 * Sonnet 5.5: no temperature/top_p/top_k (non-default values are a 400; voice and variety are
 * steered in the prompts), adaptive thinking, explicit effort, scaled max_tokens, no prefill,
 * no server-side fallbacks.
 */
function buildSdkParams(params: {
  maxTokens: number;
  temperature: number;
  system?: SystemParam;
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
}): Record<string, unknown> {
  if (!USE_SONNET_55_SHAPE) {
    return {
      model: MODEL_ID,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      ...(params.system && { system: params.system }),
      messages: params.messages,
    };
  }
  return {
    model: MODEL_ID,
    max_tokens: sonnet55MaxTokens(params.maxTokens),
    ...(params.system && { system: params.system }),
    messages: params.messages,
    thinking: { type: 'adaptive' },
    output_config: { effort: SONNET_55_EFFORT },
  };
}

type SdkMessage = Anthropic.Message & { _request_id?: string | null };

/** One SDK Messages call. Streams (and waits for the final message) above STREAM_ABOVE_MAX_TOKENS. */
async function sendSdkMessage(params: Record<string, unknown>): Promise<SdkMessage> {
  if (!anthropic) throw new Error('Anthropic client not initialized. Check API key configuration');
  const client = anthropic as Anthropic;
  if ((params.max_tokens as number) > STREAM_ABOVE_MAX_TOKENS) {
    const stream = client.messages.stream(params as unknown as Anthropic.MessageStreamParams);
    const message = await stream.finalMessage();
    return Object.assign(message, { _request_id: stream.request_id ?? null });
  }
  return client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
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
 * document. On Sonnet 5.5 a `max_tokens` stop means thinking plus answer ran out of budget, which
 * truncates the JSON or the letter.
 */
export function assertUsableStop(
  stopReason: string | null | undefined,
  stopDetails: unknown,
  maxTokens: number,
  billed: { usage: unknown; providerRequestId: string | null },
  /** A `max_tokens` stop is an error. Defaults to the Sonnet 5.5 shape; callHaiku always passes true. */
  enforceMaxTokens: boolean = USE_SONNET_55_SHAPE,
): void {
  if (stopReason === 'refusal') {
    const category = stopDetails && typeof stopDetails === 'object' && 'category' in stopDetails
      ? String((stopDetails as { category?: unknown }).category)
      : 'unknown';
    throw new ModelStopError(`Model declined the request (stop_reason refusal, category ${category})`, 'provider_refusal', billed);
  }
  if (stopReason === 'max_tokens' && enforceMaxTokens) {
    throw new ModelStopError(`Model output hit max_tokens (${maxTokens}) before finishing`, 'provider_max_tokens', billed);
  }
}

/** Read text by block type: thinking blocks come first (empty by default) and are skipped. */
function sdkMessageText(message: SdkMessage, params: Record<string, unknown>): string {
  assertUsableStop(
    message.stop_reason,
    (message as unknown as { stop_details?: unknown }).stop_details,
    params.max_tokens as number,
    { usage: message.usage, providerRequestId: message._request_id ?? message.id ?? null },
  );
  return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
}

export function providerErrorKind(error: unknown, fallback: string): string {
  if (error instanceof ProviderHttpError) return 'provider_http_error';
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

if (USE_DIGITALOCEAN) {
  console.log(`[Anthropic] Using DigitalOcean Gradient AI provider (model: ${MODEL_ID})`);
} else if (USE_BEDROCK) {
  if (HAS_BEARER_TOKEN) {
    console.log(`[Anthropic] Using Amazon Bedrock provider with Bearer Token (region: ${AWS_REGION}, model: ${MODEL_ID})`);
  } else {
    console.log(`[Anthropic] Using Amazon Bedrock provider with traditional keys (region: ${AWS_REGION}, model: ${MODEL_ID})`);
  }
} else {
  console.log(`[Anthropic] Using direct Anthropic API (model: ${MODEL_ID})`);
}

export interface AnthropicCallOptions {
  prompt: string;
  systemPrompt?: string;
  /** Structured system blocks with cache_control for prompt caching */
  systemBlocks?: CacheableContentBlock[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  conversationHistory?: ConversationMessage[];
  generationContext?: LlmGenerationContext;
}

/**
 * Call Claude (Sonnet 5.5 on the direct API, Sonnet 4.6 on Bedrock / DigitalOcean,
 * or the Sonnet 4.5 / Haiku 4.5 toggles) for all AI tasks
 */
export async function callAnthropic(options: AnthropicCallOptions): Promise<ModelResponse> {
  const { prompt, systemPrompt, systemBlocks, temperature = 0.7, maxTokens = 4096, jsonMode = false, conversationHistory } = options;
  
  const startTime = Date.now();
  
  // Build system parameter: use structured blocks (with cache_control) if provided, else plain string
  let systemParam: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined;
  
  if (systemBlocks && systemBlocks.length > 0) {
    // Structured system blocks with cache_control support
    const blocks = [...systemBlocks];
    if (jsonMode) {
      blocks.push({
        type: 'text',
        text: 'IMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.',
      });
    }
    systemParam = blocks;
  } else if (systemPrompt) {
    let finalSystemPrompt = systemPrompt;
    if (jsonMode) {
      finalSystemPrompt += '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';
    }
    systemParam = finalSystemPrompt;
  }
  
  // Build messages array with conversation history if provided
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  } else {
    messages.push({ role: 'user', content: prompt });
  }
  
  const activeProvider: LlmUsageProvider = USE_DIGITALOCEAN ? 'digitalocean' : USE_BEDROCK ? 'bedrock' : 'anthropic';
  const ledger = await startLlmGeneration({
    context: options.generationContext ?? fallbackGenerationContext('direct_anthropic_call'),
    provider: activeProvider,
    model: MODEL_ID,
  });
  let providerResponseReceived = false;

  try {
    let response;
    let content: string;

    if (USE_DIGITALOCEAN) {
      // Use DigitalOcean Gradient AI (OpenAI-compatible endpoint)
      const doClient = getDigitalOceanClient();
      response = await doClient.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages,
      });
      content = response.content[0]?.text || '';
    } else if (USE_BEDROCK_BEARER) {
      // Use cached bearer token client
      const bearerClient = getBearerTokenClient();
      response = await bearerClient.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages,
      });
      content = response.content[0]?.text || '';
    } else {
      // Use Anthropic SDK (either Bedrock with traditional keys or direct Anthropic)
      const params = buildSdkParams({ maxTokens, temperature, system: systemParam, messages });
      response = await sendSdkMessage(params);
      // Throws on a refusal or truncation before the ledger marks the call complete.
      content = sdkMessageText(response, params);
    }

    providerResponseReceived = true;
    await completeProviderGeneration({
      id: ledger.id,
      startedAtMs: startTime,
      response: response as LedgerAwareResponse,
    });

    // Extract cache metrics from usage (if available)
    const usage = response.usage as unknown as Record<string, number>;

    const cacheCreation = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    if (cacheCreation > 0 || cacheRead > 0) {
      console.log(`[Anthropic Cache] write=${cacheCreation} read=${cacheRead} input=${usage.input_tokens} output=${usage.output_tokens}`);
    }

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationInputTokens: cacheCreation || undefined,
        cacheReadInputTokens: cacheRead || undefined,
      },
      model: MODEL_ID,
      provider: activeProvider,
      latencyMs: Date.now() - startTime,
      generationId: ledger.id,
    };
  } catch (error) {
    if (!providerResponseReceived) {
      await recordProviderFailure({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        attemptCount: providerAttemptCount(error),
        errorKind: providerErrorKind(error, 'provider_error'),
        httpStatus: providerHttpStatus(error),
        ...billedFailureUsage(error),
      });
    }
    console.error('Anthropic API error:', error);
    throw new Error(`Anthropic API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call Claude with a streaming response (same model and request shape as callAnthropic)
 */
export async function callAnthropicStream(
  options: AnthropicCallOptions,
  onChunk: (chunk: string) => void
): Promise<ModelResponse> {
  const { prompt, systemPrompt, systemBlocks, temperature = 0.7, maxTokens = 4096, jsonMode = false } = options;

  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let providerRequestId: string | null = null;
  const finalUsage: Record<string, number> = {};
  let stopReason: string | null | undefined;
  let stopDetails: unknown;
  let streamParams: Record<string, unknown> = {};

  // Build system parameter — mirrors callAnthropic: prefer systemBlocks (with cache_control)
  // over plain systemPrompt string
  let systemParam: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined;
  const jsonInstruction = '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';

  if (systemBlocks && systemBlocks.length > 0) {
    const blocks = [...systemBlocks];
    if (jsonMode) {
      blocks.push({ type: 'text', text: jsonInstruction.trim() });
    }
    systemParam = blocks;
  } else if (systemPrompt) {
    systemParam = jsonMode ? systemPrompt + jsonInstruction : systemPrompt;
  }

  const activeProvider: LlmUsageProvider = USE_DIGITALOCEAN ? 'digitalocean' : USE_BEDROCK ? 'bedrock' : 'anthropic';
  const ledger = await startLlmGeneration({
    context: options.generationContext ?? fallbackGenerationContext('direct_anthropic_stream'),
    provider: activeProvider,
    model: MODEL_ID,
  });
  let providerResponseReceived = false;

  try {

    if (USE_DIGITALOCEAN) {
      // DigitalOcean supports true SSE streaming via OpenAI-compatible endpoint
      const doClient = getDigitalOceanClient();
      const result = await doClient.createStream({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages: [{ role: 'user', content: prompt }],
      }, onChunk);

      providerResponseReceived = true;
      await completeProviderGeneration({
        id: ledger.id,
        startedAtMs: startTime,
        response: result as LedgerAwareResponse,
      });

      return {
        content: result.content,
        usage: {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
        },
        model: MODEL_ID,
        provider: activeProvider,
        latencyMs: Date.now() - startTime,
        generationId: ledger.id,
      };
    }

    let stream;

    if (USE_BEDROCK_BEARER) {
      // Bearer token path uses non-streaming (streaming can be added later)
      const bearerClient = getBearerTokenClient();
      const response = await bearerClient.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages: [{ role: 'user', content: prompt }],
      });

      // Simulate streaming for consistency
      fullContent = response.content[0]?.text || '';
      inputTokens = response.usage?.input_tokens || 0;
      outputTokens = response.usage?.output_tokens || 0;

      providerResponseReceived = true;
      await completeProviderGeneration({
        id: ledger.id,
        startedAtMs: startTime,
        response: response as LedgerAwareResponse,
      });

      return {
        content: fullContent,
        usage: {
          inputTokens,
          outputTokens,
        },
        model: MODEL_ID,
        provider: activeProvider,
        latencyMs: Date.now() - startTime,
        generationId: ledger.id,
      };
    } else {
      // Use Anthropic SDK streaming
      if (!anthropic) throw new Error('Anthropic client not initialized. Check API key configuration');
      streamParams = buildSdkParams({
        maxTokens,
        temperature,
        system: systemParam,
        messages: [{ role: 'user', content: prompt }],
      });
      stream = (anthropic as Anthropic).messages.stream(streamParams as unknown as Anthropic.MessageStreamParams);
    }

    for await (const event of stream) {
      // Text deltas only: thinking and signature deltas never reach the caller.
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullContent += text;
        onChunk(text);
      }

      if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason;
        stopDetails = (event.delta as unknown as { stop_details?: unknown }).stop_details;
      }

      if (event.type === 'message_delta' && event.usage) {
        const exactOutputTokens = exactTokenCount(event.usage.output_tokens);
        if (exactOutputTokens !== null) {
          outputTokens = exactOutputTokens;
          finalUsage.output_tokens = exactOutputTokens;
        }
      }

      if (event.type === 'message_start' && event.message.usage) {
        providerRequestId = event.message.id ?? null;
        const exactInputTokens = exactTokenCount(event.message.usage.input_tokens);
        const usage = event.message.usage as unknown as Record<string, unknown>;
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
    providerRequestId = (stream as { request_id?: string | null }).request_id ?? providerRequestId;

    // A refusal or truncation already streamed partial text, but it is not a usable answer.
    assertUsableStop(stopReason, stopDetails, streamParams.max_tokens as number, {
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
      model: MODEL_ID,
      provider: activeProvider,
      latencyMs: Date.now() - startTime,
      generationId: ledger.id,
    };
  } catch (error) {
    if (!providerResponseReceived) {
      await recordProviderFailure({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        attemptCount: providerAttemptCount(error),
        errorKind: providerErrorKind(error, 'provider_stream_error'),
        httpStatus: providerHttpStatus(error),
        ...billedFailureUsage(error),
      });
    }
    console.error('Anthropic streaming error:', error);
    throw new Error(`Anthropic streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from a PDF using Claude's native document understanding.
 * Sends the PDF as a proper document content block — NOT as base64 text.
 * Works for scanned PDFs and PDFs with broken font encoding.
 */
export async function extractDocumentText(
  pdfBuffer: Buffer,
  generationContext?: LlmGenerationContext,
): Promise<string> {
  const base64Data = pdfBuffer.toString('base64');
  const startTime = Date.now();

  const systemPrompt = 'You are a document text extractor. Extract ALL text content from the provided document faithfully. Preserve the original structure, section headers, dates, bullet points, and formatting. Return ONLY the extracted text, nothing else.';
  const userText = 'Extract ALL text content from this CV/resume document. Preserve the original structure including section headers, dates, company names, job titles, bullet points, skills, education, and languages. Return ONLY the extracted text with proper formatting.';
  const activeProvider: LlmUsageProvider = USE_DIGITALOCEAN ? 'digitalocean' : USE_BEDROCK ? 'bedrock' : 'anthropic';
  const ledger = await startLlmGeneration({
    context: generationContext ?? fallbackGenerationContext('extract_document_text'),
    provider: activeProvider,
    model: MODEL_ID,
  });
  let providerResponseReceived = false;

  try {
    if (USE_DIGITALOCEAN) {
      // DigitalOcean: OpenAI-compatible API doesn't support document content blocks
      // Send base64 PDF data as text with extraction instructions
      const doClient = getDigitalOceanClient();
      const response = await doClient.create({
        model: MODEL_ID,
        max_tokens: 8192,
        temperature: 0,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `${userText}\n\n[PDF document provided as base64 — decode and extract text]\n\nBase64 PDF data:\n${base64Data.substring(0, 20000)}`,
        }],
      });

      providerResponseReceived = true;
      await completeProviderGeneration({
        id: ledger.id,
        startedAtMs: startTime,
        response: response as LedgerAwareResponse,
      });

      const text = response.content[0]?.text || '';
      console.log(`[Anthropic] PDF document extraction via DigitalOcean: ${text.length} chars in ${Date.now() - startTime}ms`);
      return text;
    }

    if (USE_BEDROCK_BEARER) {
      // Bedrock Converse API with document content block
      const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK!;
      const region = process.env.AWS_BEDROCK_ENDPOINT_URL || AWS_REGION;
      const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${MODEL_ID}/converse`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              {
                document: {
                  name: 'cv',
                  format: 'pdf',
                  source: { bytes: base64Data },
                },
              },
              { text: userText },
            ],
          }],
          system: [{ text: systemPrompt }],
          inferenceConfig: { maxTokens: 8192, temperature: 0 },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new ProviderHttpError(`Bedrock document extraction error: ${res.status} ${errorText}`, res.status, 1);
      }

      const data = await res.json();
      providerResponseReceived = true;
      await completeProviderGeneration({
        id: ledger.id,
        startedAtMs: startTime,
        response: {
          usage: data.usage,
          _request_id: res.headers.get('x-amzn-requestid') ?? undefined,
        },
      });
      const text = data.output?.message?.content?.[0]?.text || '';
      console.log(`[Anthropic] PDF document extraction via Bedrock: ${text.length} chars in ${Date.now() - startTime}ms`);
      return text;
    }

    // Anthropic SDK (Bedrock traditional keys or direct API)
    const params = buildSdkParams({
      maxTokens: 8192,
      temperature: 0,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Data,
            },
          },
          { type: 'text', text: userText },
        ],
      }],
    });
    const response = await sendSdkMessage(params);
    const text = sdkMessageText(response, params);

    providerResponseReceived = true;
    await completeProviderGeneration({
      id: ledger.id,
      startedAtMs: startTime,
      response: response as LedgerAwareResponse,
    });

    console.log(`[Anthropic] PDF document extraction: ${text.length} chars in ${Date.now() - startTime}ms`);
    return text;
  } catch (error) {
    if (!providerResponseReceived) {
      await recordProviderFailure({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        attemptCount: providerAttemptCount(error),
        errorKind: providerErrorKind(error, 'document_extraction_provider_error'),
        httpStatus: providerHttpStatus(error),
        ...billedFailureUsage(error),
      });
    }
    console.error('[Anthropic] Document extraction failed:', error);
    throw error;
  }
}

/**
 * Parse a CV document (PDF or DOCX) directly using Claude's native document understanding.
 * One-step: sends the document as a content block and returns Claude's raw JSON response string.
 * Eliminates local text extraction (pdfjs-dist, binary fallback, etc.) for PDF files.
 */
export async function parseDocumentAsCV(options: {
  buffer: Buffer;
  docFormat: 'pdf' | 'docx';
  prompt: string;
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Enable Claude PDF Chat (visual mode) for primary CV parsing.
   * Adds citations: { enabled: true } inside the document block, which activates
   * full page-as-image rendering instead of text-extraction-only mode.
   * Use for primary CVs (1-2 pages). Keep false for Master CVs (3-8 pages, cost saving).
   */
  visualMode?: boolean;
  generationContext?: LlmGenerationContext;
}): Promise<string> {
  const { buffer, docFormat, prompt, systemPrompt, maxTokens = 8192, temperature = 0.3, visualMode = false } = options;
  const base64Data = buffer.toString('base64');
  const startTime = Date.now();

  if (USE_DIGITALOCEAN) {
    throw new Error('DigitalOcean provider does not support document content blocks. Switch to Bedrock or direct Anthropic.');
  }
  if (!USE_BEDROCK_BEARER && docFormat !== 'pdf') {
    throw new Error('Native DOCX document blocks are only supported through the Bedrock bearer path in this client.');
  }

  const activeProvider: LlmUsageProvider = USE_BEDROCK ? 'bedrock' : 'anthropic';
  const ledger = await startLlmGeneration({
    context: options.generationContext ?? fallbackGenerationContext('parse_cv_document'),
    provider: activeProvider,
    model: MODEL_ID,
  });
  let providerResponseReceived = false;

  try {
    if (USE_BEDROCK_BEARER) {
      // Bedrock Converse API: native document block support (pdf, docx, txt, md, csv, etc.)
      const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK!;
      const region = process.env.AWS_BEDROCK_ENDPOINT_URL || AWS_REGION;
      const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${MODEL_ID}/converse`;

      // Build document block: add citations: { enabled: true } for visual mode (PDF Chat)
      const documentBlock: Record<string, unknown> = {
        name: 'cv',
        format: docFormat,
        source: { bytes: base64Data },
      };
      if (visualMode && docFormat === 'pdf') {
        documentBlock.citations = { enabled: true };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              { document: documentBlock },
              { text: prompt },
            ],
          }],
          system: [{ text: systemPrompt }],
          inferenceConfig: { maxTokens, temperature },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new ProviderHttpError(`Bedrock document parse error: ${res.status} ${errorText}`, res.status, 1);
      }

      const data = await res.json();
      providerResponseReceived = true;
      await completeProviderGeneration({
        id: ledger.id,
        startedAtMs: startTime,
        response: {
          usage: data.usage,
          _request_id: res.headers.get('x-amzn-requestid') ?? undefined,
        },
      });
      // When citations are enabled, response may include citation content blocks alongside the text block.
      // Find the text block explicitly rather than assuming content[0] is text.
      const contentBlocks: Array<Record<string, unknown>> = data.output?.message?.content || [];
      const textBlock = contentBlocks.find(b => typeof b.text === 'string');
      const text = (textBlock?.text as string) || '';
      console.log(`[Anthropic] CV document parse via Bedrock (visualMode=${visualMode}): ${text.length} chars, ${data.usage?.outputTokens || 0} output tokens in ${Date.now() - startTime}ms`);
      return text;
    }

    // Anthropic SDK (Bedrock traditional keys or direct Anthropic API) - PDF only
    // Build document block with optional citations for visual mode
    const sdkDocumentBlock: Record<string, unknown> = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: base64Data,
      },
    };
    if (visualMode && docFormat === 'pdf') {
      sdkDocumentBlock.citations = { enabled: true };
    }

    const params = buildSdkParams({
      maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          sdkDocumentBlock,
          { type: 'text', text: prompt },
        ],
      }],
    });
    const response = await sendSdkMessage(params);
    // With citations enabled the answer can arrive as several text blocks, so all are joined.
    const text = sdkMessageText(response, params);

    providerResponseReceived = true;
    await completeProviderGeneration({
      id: ledger.id,
      startedAtMs: startTime,
      response: response as LedgerAwareResponse,
    });

    console.log(`[Anthropic] CV document parse (visualMode=${visualMode}): ${text.length} chars in ${Date.now() - startTime}ms`);
    return text;
  } catch (error) {
    if (!providerResponseReceived) {
      await recordProviderFailure({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        attemptCount: providerAttemptCount(error),
        errorKind: providerErrorKind(error, 'document_parse_provider_error'),
        httpStatus: providerHttpStatus(error),
        ...billedFailureUsage(error),
      });
    }
    throw error;
  }
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
