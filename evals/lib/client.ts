/**
 * Thin eval-only provider client.
 *
 * Why not src/lib/models/anthropic.ts: callAnthropic() writes every call to the production
 * D1 usage ledger (startLlmGeneration) and imports the D1 client. The eval must not touch
 * either. So this file builds its own requests and adds what the eval needs: stop_reason,
 * full usage, retries and the raw response. The Anthropic arms use the Messages API shape of
 * production. The Bedrock arm (unused) reproduces the Sonnet 4.6 Bedrock paths production
 * had until 2026-10-22 (Converse with a bearer token, or the InvokeModel SDK client); those
 * paths are gone from src/lib/models, which now only fails over to Claude in Amazon Bedrock.
 *
 * Deliberate differences from production, all in observability only:
 *  - the SDK path sets maxRetries 0 and retries here (same statuses plus 408/409) so the
 *    retry count can be logged;
 *  - no ledger writes, no console noise.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type { ArmConfig, SystemBlock, UsageRecord } from './types';

export interface ProviderRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string | SystemBlock[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ProviderResult {
  text: string;
  contentBlocks: unknown;
  stopReason: string | null;
  /** Present on refusals: { type, category, explanation }. */
  stopDetails: unknown;
  usage: UsageRecord;
  latencyMs: number;
  attempts: number;
  requestId: string | null;
}

export class ProviderCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly attempts: number,
    readonly latencyMs: number,
  ) {
    super(message);
    this.name = 'ProviderCallError';
  }
}

const TRANSIENT = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

export function loadEnv(): void {
  for (const f of ['.env.local', '.dev.vars']) {
    try {
      process.loadEnvFile(f);
    } catch {
      // Credentials may already be in the environment. Presence is checked in bedrockAuthMode().
    }
  }
}

export type BedrockAuthMode = 'bearer' | 'keys' | 'none';

/** Same precedence as production: a bearer token wins over traditional keys. */
export function bedrockAuthMode(): BedrockAuthMode {
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) return 'bearer';
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) return 'keys';
  return 'none';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 4000);
}

async function callBedrockBearer(req: ProviderRequest): Promise<Omit<ProviderResult, 'latencyMs'>> {
  const region = process.env.AWS_REGION || 'us-east-1';
  // Production passes AWS_BEDROCK_ENDPOINT_URL (when set) in the region slot. Mirrored as is.
  const regionSlot = process.env.AWS_BEDROCK_ENDPOINT_URL || region;
  const url = `https://bedrock-runtime.${regionSlot}.amazonaws.com/model/${req.model}/converse`;

  const payload: Record<string, unknown> = {
    messages: req.messages.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
    inferenceConfig: { maxTokens: req.max_tokens, temperature: req.temperature },
  };
  if (req.system) {
    if (typeof req.system === 'string') {
      payload.system = [{ text: req.system }];
    } else {
      const blocks: Array<{ text?: string; cachePoint?: { type: string } }> = [];
      for (const block of req.system) {
        blocks.push({ text: block.text });
        if (block.cache_control) blocks.push({ cachePoint: { type: 'default' } });
      }
      payload.system = blocks;
    }
  }

  let lastError: ProviderCallError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoff(attempt));
    const t0 = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      lastError = new ProviderCallError(`Bedrock fetch failed: ${(error as Error).name}`, null, attempt + 1, Date.now() - t0);
      continue; // network error or timeout: retry, bounded by MAX_RETRIES
    }
    if (response.ok) {
      const data = (await response.json()) as {
        output?: { message?: { content?: Array<{ text?: string }> } };
        stopReason?: string;
        usage?: Record<string, number>;
      };
      const blocks = data.output?.message?.content ?? [];
      const text = blocks.map((b) => b.text ?? '').join('');
      return {
        text,
        contentBlocks: blocks,
        stopReason: data.stopReason ?? null,
        stopDetails: null,
        usage: {
          input: data.usage?.inputTokens ?? 0,
          output: data.usage?.outputTokens ?? 0,
          cacheWrite: data.usage?.cacheWriteInputTokens ?? 0,
          cacheRead: data.usage?.cacheReadInputTokens ?? 0,
          raw: data.usage ?? null,
        },
        attempts: attempt + 1,
        requestId: response.headers.get('x-amzn-requestid'),
      };
    }
    const errorText = await response.text();
    lastError = new ProviderCallError(`Bedrock API error: ${response.status} ${errorText.slice(0, 300)}`, response.status, attempt + 1, Date.now() - t0);
    if (![500, 503, 429].includes(response.status)) throw lastError;
  }
  throw lastError ?? new ProviderCallError('Bedrock call failed', null, MAX_RETRIES + 1, 0);
}

let sdkClient: AnthropicBedrock | null = null;

async function callBedrockSdk(req: ProviderRequest): Promise<Omit<ProviderResult, 'latencyMs'>> {
  if (!sdkClient) {
    sdkClient = new AnthropicBedrock({
      awsAccessKey: process.env.AWS_ACCESS_KEY_ID!,
      awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY!,
      ...(process.env.AWS_SESSION_TOKEN && { awsSessionToken: process.env.AWS_SESSION_TOKEN }),
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      maxRetries: 0,
    });
  }
  let lastError: ProviderCallError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoff(attempt));
    const t0 = Date.now();
    try {
      const { data, request_id } = await sdkClient.messages
        .create({
          model: req.model,
          max_tokens: req.max_tokens,
          // No temperature: @anthropic-ai/sdk 1.x and the 2026-10-21 API reject it. This arm is unused.
          ...(req.system && { system: req.system }),
          messages: req.messages,
        })
        .withResponse();
      const usage = data.usage as unknown as Record<string, number>;
      return {
        text: data.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
        contentBlocks: data.content,
        stopReason: data.stop_reason ?? null,
        stopDetails: null,
        usage: {
          input: usage.input_tokens ?? 0,
          output: usage.output_tokens ?? 0,
          cacheWrite: usage.cache_creation_input_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? 0,
          raw: data.usage,
        },
        attempts: attempt + 1,
        requestId: request_id ?? null,
      };
    } catch (error) {
      const status = (error as { status?: number }).status ?? null;
      lastError = new ProviderCallError(`Bedrock SDK error: ${status ?? (error as Error).name}`, status, attempt + 1, Date.now() - t0);
      if (status !== null && !TRANSIENT.has(status)) throw lastError;
    }
  }
  throw lastError ?? new ProviderCallError('Bedrock SDK call failed', null, MAX_RETRIES + 1, 0);
}

/** Above this max_tokens the client streams (SDK HTTP timeouts, per the Claude API docs). */
const STREAM_ABOVE = 16000;

let dryRun = false;
export function setDryRun(v: boolean): void {
  dryRun = v;
}

/**
 * Request body for the Anthropic API. Typed loosely on purpose: the 2026-10-12 run used
 * @anthropic-ai/sdk 0.71.2, which had no `adaptive` thinking type and no `output_config` on
 * MessageCreateParams. SDK 1.x types both; the loose type stays so the request stays byte-identical to that run.
 * B arms: no temperature/top_p/top_k, adaptive thinking, output_config.effort, no prefill,
 * no tool_choice, no server-side fallbacks (another model answering would contaminate the eval).
 */
export function buildAnthropicParams(req: ProviderRequest, arm: ArmConfig): Record<string, unknown> {
  return {
    model: req.model,
    max_tokens: req.max_tokens,
    ...(req.temperature !== undefined && { temperature: req.temperature }),
    ...(req.system && { system: req.system }),
    messages: req.messages,
    ...(arm.thinking && { thinking: arm.thinking }),
    ...(arm.effort && { output_config: { effort: arm.effort } }),
  };
}

export const SYNTHETIC_ANTHROPIC_MESSAGE = { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 0, output_tokens: 0 } };

let anthropicClient: Anthropic | null = null;

/** One Messages API call with retries, shared by the arms and the judge. Streams above 16000 max_tokens. */
export async function callAnthropicMessages(params: Record<string, unknown>): Promise<Omit<ProviderResult, 'latencyMs'>> {
  if (dryRun) return fromAnthropicMessage(SYNTHETIC_ANTHROPIC_MESSAGE, 'dry-run');
  if (!process.env.ANTHROPIC_API_KEY) throw new ProviderCallError('ANTHROPIC_API_KEY is not set', null, 0, 0);
  anthropicClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const client = anthropicClient;
  let lastError: ProviderCallError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoff(attempt));
    const t0 = Date.now();
    try {
      if ((params.max_tokens as number) > STREAM_ABOVE) {
        const stream = client.messages.stream(params as never);
        const msg = await stream.finalMessage();
        return { ...fromAnthropicMessage(msg, stream.request_id ?? null), attempts: attempt + 1 };
      }
      const { data, request_id } = await client.messages.create(params as never).withResponse();
      return { ...fromAnthropicMessage(data, request_id ?? null), attempts: attempt + 1 };
    } catch (error) {
      const status = (error as { status?: number }).status ?? null;
      lastError = new ProviderCallError(`Anthropic API error: ${status ?? (error as Error).name}`, status, attempt + 1, Date.now() - t0);
      if (status !== null && !TRANSIENT.has(status)) throw lastError;
    }
  }
  throw lastError ?? new ProviderCallError('Anthropic call failed', null, MAX_RETRIES + 1, 0);
}

function fromAnthropicMessage(m: unknown, requestId: string | null): Omit<ProviderResult, 'latencyMs'> {
  const msg = m as { content: Array<{ type: string; text?: string }>; stop_reason?: string | null; stop_details?: unknown; usage: Record<string, number> };
  return {
    // Read by block type: skip thinking (and redacted_thinking) blocks, keep text only.
    text: msg.content.map((b) => (b.type === 'text' ? (b.text ?? '') : '')).join(''),
    contentBlocks: msg.content.map((b) => (b.type === 'text' ? b : { type: b.type })),
    stopReason: msg.stop_reason ?? null,
    stopDetails: msg.stop_details ?? null,
    usage: {
      input: msg.usage.input_tokens ?? 0,
      output: msg.usage.output_tokens ?? 0,
      cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
      cacheRead: msg.usage.cache_read_input_tokens ?? 0,
      raw: msg.usage,
    },
    attempts: 1,
    requestId,
  };
}

async function callAnthropicApi(req: ProviderRequest, arm: ArmConfig): Promise<Omit<ProviderResult, 'latencyMs'>> {
  return callAnthropicMessages(buildAnthropicParams(req, arm));
}

export async function callProvider(arm: ArmConfig, req: ProviderRequest): Promise<ProviderResult> {
  const t0 = Date.now();
  try {
    let result: Omit<ProviderResult, 'latencyMs'>;
    if (arm.provider === 'anthropic') {
      result = await callAnthropicApi(req, arm);
    } else {
      const mode = bedrockAuthMode();
      if (mode === 'none') throw new ProviderCallError('No Bedrock credentials in the environment', null, 0, 0);
      result = mode === 'bearer' ? await callBedrockBearer(req) : await callBedrockSdk(req);
    }
    return { ...result, latencyMs: Date.now() - t0 };
  } catch (error) {
    if (error instanceof ProviderCallError) {
      throw new ProviderCallError(error.message, error.status, error.attempts, Date.now() - t0);
    }
    throw error;
  }
}
