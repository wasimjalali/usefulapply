/**
 * Anthropic Claude Client
 * Primary: Claude Sonnet 4.6 — frontier performance, improved coding, instruction following, agents
 * Previous: Claude Sonnet 4.5 — toggle via USE_PREVIOUS_MODEL=true env var
 * Fallback: Claude Haiku 4.5 — faster, cheaper, toggle via USE_FALLBACK_MODEL env var
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

function normalizeProviderUsage(value: unknown): {
  usageReported: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  providerTotalTokens: number | null;
  providerUsage: Json | null;
} {
  const usage = usageRecord(value);
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

function providerHttpStatus(error: unknown): number | null {
  if (error instanceof ProviderHttpError) return error.status;
  if (error && typeof error === 'object' && 'status' in error) {
    return exactTokenCount((error as { status?: unknown }).status);
  }
  return null;
}

function providerAttemptCount(error: unknown): number {
  return error instanceof ProviderHttpError ? error.attemptCount : 1;
}

async function completeProviderGeneration(params: {
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

async function recordProviderFailure(params: Parameters<typeof failLlmGeneration>[0]): Promise<void> {
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
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Primary model: Claude Sonnet 4.6 — frontier performance, improved coding, agents, instruction following
const BEDROCK_MODEL_ID = `${AWS_REGION === 'us-east-1' ? 'us' : AWS_REGION.startsWith('eu') ? 'eu' : 'us'}.anthropic.claude-sonnet-4-6`;
const DIRECT_MODEL_ID = 'claude-sonnet-4-6';

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
    const payload: any = {
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
// Priority: USE_FALLBACK_MODEL (Haiku) > USE_PREVIOUS_MODEL (Sonnet 4.5) > default (Sonnet 4.6)
const ACTIVE_BEDROCK_MODEL_ID = USE_FALLBACK ? BEDROCK_FALLBACK_MODEL_ID : USE_PREVIOUS ? BEDROCK_PREVIOUS_MODEL_ID : BEDROCK_MODEL_ID;
const ACTIVE_DIRECT_MODEL_ID = USE_FALLBACK ? DIRECT_FALLBACK_MODEL_ID : USE_PREVIOUS ? DIRECT_PREVIOUS_MODEL_ID : DIRECT_MODEL_ID;
const ACTIVE_DO_MODEL_ID = USE_FALLBACK ? DO_FALLBACK_MODEL_ID : USE_PREVIOUS ? DO_PREVIOUS_MODEL_ID : DO_MODEL_ID;

const MODEL_ID = USE_DIGITALOCEAN ? ACTIVE_DO_MODEL_ID : USE_BEDROCK ? ACTIVE_BEDROCK_MODEL_ID : ACTIVE_DIRECT_MODEL_ID;

if (USE_DIGITALOCEAN) {
  console.log(`[Anthropic] Using DigitalOcean Gradient AI provider (model: ${MODEL_ID})`);
} else if (USE_BEDROCK) {
  if (HAS_BEARER_TOKEN) {
    console.log(`[Anthropic] Using Amazon Bedrock provider with Bearer Token (region: ${AWS_REGION}, model: ${MODEL_ID})`);
  } else {
    console.log(`[Anthropic] Using Amazon Bedrock provider with traditional keys (region: ${AWS_REGION}, model: ${MODEL_ID})`);
  }
} else {
  console.log('[Anthropic] Using direct Anthropic API');
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
 * Call Claude Sonnet 4.6 (or Sonnet 4.5 / Haiku 4.5 fallback) for all AI tasks
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
    } else if (HAS_BEARER_TOKEN) {
      // Use cached bearer token client
      const bearerClient = getBearerTokenClient();
      response = await bearerClient.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages,
      });
    } else {
      // Use Anthropic SDK (either Bedrock with traditional keys or direct Anthropic)
      if (!anthropic) throw new Error('Anthropic client not initialized — check API key configuration');
      response = await (anthropic as Anthropic).messages.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages,
      });
    }

    providerResponseReceived = true;
    await completeProviderGeneration({
      id: ledger.id,
      startedAtMs: startTime,
      response: response as LedgerAwareResponse,
    });

    // Extract text content
    const textContent = response.content.find(block => block.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

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
        errorKind: error instanceof ProviderHttpError ? 'provider_http_error' : 'provider_error',
        httpStatus: providerHttpStatus(error),
      });
    }
    console.error('Anthropic API error:', error);
    throw new Error(`Anthropic API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call Claude Sonnet 4.6 with streaming response
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

    if (HAS_BEARER_TOKEN) {
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
      if (!anthropic) throw new Error('Anthropic client not initialized — check API key configuration');
      stream = (anthropic as Anthropic).messages.stream({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages: [{ role: 'user', content: prompt }],
      });
    }

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullContent += text;
        onChunk(text);
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
        errorKind: error instanceof ProviderHttpError ? 'provider_http_error' : 'provider_stream_error',
        httpStatus: providerHttpStatus(error),
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

    if (HAS_BEARER_TOKEN) {
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
    if (!anthropic) throw new Error('Anthropic client not initialized');

    const response = await (anthropic as any).messages.create({
      model: MODEL_ID,
      max_tokens: 8192,
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

    providerResponseReceived = true;
    await completeProviderGeneration({
      id: ledger.id,
      startedAtMs: startTime,
      response: response as LedgerAwareResponse,
    });

    const textContent = response.content.find((b: any) => b.type === 'text');
    const text = textContent?.text || '';
    console.log(`[Anthropic] PDF document extraction: ${text.length} chars in ${Date.now() - startTime}ms`);
    return text;
  } catch (error) {
    if (!providerResponseReceived) {
      await recordProviderFailure({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        attemptCount: providerAttemptCount(error),
        errorKind: error instanceof ProviderHttpError ? 'provider_http_error' : 'document_extraction_provider_error',
        httpStatus: providerHttpStatus(error),
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
  if (!HAS_BEARER_TOKEN && docFormat !== 'pdf') {
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
    if (HAS_BEARER_TOKEN) {
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
    if (!anthropic) throw new Error('Anthropic client not initialized');

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

    const response = await (anthropic as any).messages.create({
      model: MODEL_ID,
      max_tokens: maxTokens,
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

    providerResponseReceived = true;
    await completeProviderGeneration({
      id: ledger.id,
      startedAtMs: startTime,
      response: response as LedgerAwareResponse,
    });

    const textContent = response.content.find((b: any) => b.type === 'text');
    const text = textContent?.text || '';
    console.log(`[Anthropic] CV document parse (visualMode=${visualMode}): ${text.length} chars in ${Date.now() - startTime}ms`);
    return text;
  } catch (error) {
    if (!providerResponseReceived) {
      await recordProviderFailure({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        attemptCount: providerAttemptCount(error),
        errorKind: error instanceof ProviderHttpError ? 'provider_http_error' : 'document_parse_provider_error',
        httpStatus: providerHttpStatus(error),
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
