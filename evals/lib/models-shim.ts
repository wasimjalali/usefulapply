/**
 * Stand-in for '@/lib/models' while the harness runs the real agent code.
 *
 * run-eval.ts redirects the import '@/lib/models' to this module (see hooks.ts), so the
 * production context-builder and unified-writer-agent call this callModel() with the
 * exact options they build in production. The request body is built the same way
 * callAnthropic() builds it, then sent through the eval client, which never writes to the
 * production ledger.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { MODEL_CONFIGS, type ModelCallOptions, type ModelResponse, type TaskType } from '../../src/lib/models/types';
import { buildAnthropicParams, callProvider, ProviderCallError, type ProviderRequest } from './client';
import type { ArmConfig, CallRecord, EvalTask, SystemBlock } from './types';

export * from '../../src/lib/models/types';

export interface CallContext {
  runId: string;
  caseId: string;
  rep: number;
  arm: ArmConfig;
  concurrency: number;
  record: (r: CallRecord) => void;
  seq: { n: number };
  /** Last raw output per task in this kit, used to keep the chain going after a validation miss. */
  lastRaw: Map<EvalTask, string>;
}

export const callContext = new AsyncLocalStorage<CallContext>();

const JSON_ONLY =
  'IMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';

export interface ExplicitCall {
  task: EvalTask;
  prompt: string;
  systemPrompt?: string;
  systemBlocks?: SystemBlock[];
  /** Production no longer sends one (src/lib/models); only the parse_cv call of the old A arm still passes it. */
  temperature?: number;
  maxTokens: number;
  jsonMode?: boolean;
}

/** Mirrors the request construction in callAnthropic() (src/lib/models/anthropic.ts). */
export async function executeCall(call: ExplicitCall): Promise<{ text: string; record: CallRecord }> {
  const ctx = callContext.getStore();
  if (!ctx) throw new Error('callModel invoked outside an eval call context');
  const { arm } = ctx;

  let systemParam: string | SystemBlock[] | undefined;
  if (call.systemBlocks && call.systemBlocks.length > 0) {
    const blocks = [...call.systemBlocks];
    if (call.jsonMode) blocks.push({ type: 'text', text: JSON_ONLY });
    systemParam = blocks;
  } else if (call.systemPrompt) {
    systemParam = call.jsonMode ? `${call.systemPrompt}\n\n${JSON_ONLY}` : call.systemPrompt;
  }

  const scale = arm.maxTokensScale;
  const maxTokens = arm.maxTokens[call.task] ?? (scale ? Math.max(scale.floor, scale.multiplier * call.maxTokens) : call.maxTokens);
  const req: ProviderRequest = {
    model: arm.modelId,
    max_tokens: maxTokens,
    ...(arm.dropTemperature || call.temperature === undefined ? {} : { temperature: call.temperature }),
    ...(systemParam && { system: systemParam }),
    messages: [{ role: 'user', content: call.prompt }],
  };

  const systemBlocksArr = Array.isArray(systemParam) ? systemParam : [];
  const record: CallRecord = {
    run_id: ctx.runId,
    call_id: crypto.randomUUID(),
    case_id: ctx.caseId,
    rep: ctx.rep,
    arm: arm.name,
    task: call.task,
    seq: ++ctx.seq.n,
    prompt_variant: arm.promptVariant,
    started_at: new Date().toISOString(),
    concurrency: ctx.concurrency,
    request: {
      provider: arm.provider,
      model: arm.modelId,
      max_tokens: maxTokens,
      temperature: req.temperature ?? null,
      thinking: arm.thinking ?? null,
      effort: arm.effort ?? null,
      json_mode: Boolean(call.jsonMode),
      system_blocks: systemBlocksArr.length,
      system_cached_blocks: systemBlocksArr.filter((b) => b.cache_control).length,
      system_chars: typeof systemParam === 'string' ? systemParam.length : systemBlocksArr.reduce((n, b) => n + b.text.length, 0),
      prompt_chars: call.prompt.length,
      body: arm.provider === 'anthropic' ? buildAnthropicParams(req, arm) : req,
    },
    ok: false,
    error: null,
    raw_output: null,
    content_blocks: null,
    stop_reason: null,
    stop_details: null,
    usage: null,
    latency_ms: 0,
    attempts: 0,
    provider_request_id: null,
  };

  try {
    const result = await callProvider(arm, req);
    record.ok = true;
    record.raw_output = result.text;
    record.content_blocks = result.contentBlocks;
    record.stop_reason = result.stopReason;
    record.stop_details = result.stopDetails;
    record.usage = result.usage;
    record.latency_ms = result.latencyMs;
    record.attempts = result.attempts;
    record.provider_request_id = result.requestId;
    ctx.lastRaw.set(call.task, result.text);
    ctx.record(record);
    return { text: result.text, record };
  } catch (error) {
    record.error = (error as Error).message;
    if (error instanceof ProviderCallError) {
      record.latency_ms = error.latencyMs;
      record.attempts = error.attempts;
    }
    ctx.record(record);
    throw error;
  }
}

/** Same signature as the production callModel(). */
export async function callModel(options: ModelCallOptions): Promise<ModelResponse> {
  const config = MODEL_CONFIGS[options.task as TaskType];
  const { text, record } = await executeCall({
    task: options.task as EvalTask,
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    systemBlocks: options.systemBlocks as SystemBlock[] | undefined,
    maxTokens: options.maxTokens ?? config.maxTokens,
    jsonMode: options.jsonMode,
  });
  return {
    content: text,
    usage: {
      inputTokens: record.usage?.input ?? 0,
      outputTokens: record.usage?.output ?? 0,
      cacheCreationInputTokens: record.usage?.cacheWrite || undefined,
      cacheReadInputTokens: record.usage?.cacheRead || undefined,
    },
    model: record.request.model,
    provider: 'bedrock',
    latencyMs: record.latency_ms,
    generationId: record.call_id,
  };
}

export async function callModelStream(): Promise<never> {
  throw new Error('callModelStream is not part of the eval');
}

export function parseModelJSON<T>(content: string): T {
  return JSON.parse(content) as T;
}

export function estimateCost(): number {
  return 0;
}

export function logModelUsage(): void {
  /* intentionally silent */
}
