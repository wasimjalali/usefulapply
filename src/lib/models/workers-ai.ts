/**
 * Workers AI model layer.
 * gpt-oss-120b (Cloudflare-hosted) serves chat and job-feed auxiliary tasks.
 * Kit writing, CV parsing, context extraction and fit analysis stay on Claude
 * (see anthropic.ts). Mirrors callAnthropic's interface and ledger wiring.
 * Not mirrored: Anthropic prompt caching. The messages-shape input has no
 * cache_control, so static system prompts are billed in full on every call.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  completeLlmGeneration,
  failLlmGeneration,
  startLlmGeneration,
  type LlmGenerationContext,
} from '@/db/repos/adminMetrics';
import type { Json } from '@/db/schema';
import type { ConversationMessage, ModelResponse } from './types';

export const WORKERS_AI_TEXT_MODEL = '@cf/openai/gpt-oss-120b';

type WorkersAiBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

/** OpenAI-style function definition passed to the model. */
export interface WorkersAiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A tool call the model asked for, with arguments already parsed. */
export interface WorkersAiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * A message in the tool round-trip. `tool_calls` rides on the assistant turn
 * that asked; `tool_call_id` + `name` mark the result turn that answers it.
 */
export interface WorkersAiChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

// Tool calls arrive in the OpenAI chat.completion shape
// (choices[0].message.tool_calls) or, on some Workers AI responses, at the
// top level; arguments arrive as a JSON string or an object. Accept all four.
type WorkersAiRawToolCall = {
  id?: string;
  type?: string;
  name?: string;
  arguments?: unknown;
  function?: { name?: string; arguments?: unknown };
};

// Workers AI text models answer in the OpenAI chat.completion shape
// (choices[0].message.content); some also mirror the text in `response`.
type WorkersAiTextResponse = {
  id?: string;
  request_id?: string;
  response?: string;
  tool_calls?: WorkersAiRawToolCall[];
  choices?: Array<{ message?: { content?: string | null; tool_calls?: WorkersAiRawToolCall[] } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    neurons?: number;
    total_tokens?: number;
  };
};

function exactUsageNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function workersUsageJson(usage: WorkersAiTextResponse['usage']): Json | null {
  return usage ? JSON.parse(JSON.stringify(usage)) as Json : null;
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed arguments become an empty object; the tool answers with a
      // validation error the model can read, instead of the call crashing.
    }
  }
  return {};
}

function workersAiToolCalls(raw: WorkersAiTextResponse): WorkersAiToolCall[] {
  const rawCalls = raw.choices?.[0]?.message?.tool_calls ?? raw.tool_calls ?? [];
  const calls: WorkersAiToolCall[] = [];
  for (const call of rawCalls) {
    const name = call.function?.name ?? call.name;
    if (typeof name !== 'string' || !name) continue;
    calls.push({
      id: typeof call.id === 'string' && call.id ? call.id : crypto.randomUUID(),
      name,
      arguments: parseToolArguments(call.function?.arguments ?? call.arguments),
    });
  }
  return calls;
}

function workersAiText(raw: WorkersAiTextResponse): string {
  const fromChoices = raw.choices?.[0]?.message?.content;
  if (typeof fromChoices === 'string' && fromChoices.length > 0) return fromChoices;
  // Guard the shape: a non-string response falls through to the
  // empty-response failure path instead of crashing on .trim().
  return typeof raw.response === 'string' ? raw.response : '';
}

/**
 * Reasoning models sometimes wrap the JSON in fences or prose, and the prose
 * can contain braces of its own. Return the last balanced top-level object.
 */
function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let best = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) best = trimmed.slice(start, i + 1);
    }
  }
  return best || trimmed;
}

export interface WorkersAiCallOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  /**
   * gpt-oss is a reasoning model: part of this budget is spent thinking before
   * the visible answer, so budgets must be several times the expected output.
   */
  maxTokens?: number;
  jsonMode?: boolean;
  conversationHistory?: ConversationMessage[];
  /**
   * Full message list for tool round-trips (assistant tool_calls turns and
   * role:"tool" results). Takes precedence over conversationHistory/prompt.
   */
  rawMessages?: WorkersAiChatMessage[];
  /** Function definitions; when present the response may carry toolCalls. */
  tools?: WorkersAiToolDefinition[];
  generationContext?: LlmGenerationContext;
}

export async function callWorkersAI(options: WorkersAiCallOptions): Promise<ModelResponse> {
  const {
    prompt,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 2048,
    jsonMode = false,
    conversationHistory,
  } = options;

  let env: { AI?: WorkersAiBinding } = {};
  try {
    ({ env } = await getCloudflareContext({ async: true }) as { env: typeof env });
  } catch {
    // Outside the Worker (unit scripts) there is no binding; fall through to the throw.
  }
  if (!env.AI) throw new Error('Workers AI binding unavailable');
  const ai = env.AI;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string } | WorkersAiChatMessage> = [];
  let finalSystemPrompt = systemPrompt ?? '';
  if (jsonMode) {
    finalSystemPrompt += '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';
  }
  if (finalSystemPrompt.trim()) {
    messages.push({ role: 'system', content: finalSystemPrompt });
  }
  if (options.rawMessages && options.rawMessages.length > 0) {
    messages.push(...options.rawMessages);
  } else if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const startTime = Date.now();
  const ledger = await startLlmGeneration({
    context: options.generationContext ?? {
      requestExecutionId: crypto.randomUUID(),
      route: 'unattributed',
      feature: 'unattributed',
      operation: 'workers_ai_call',
    },
    provider: 'workers-ai',
    model: WORKERS_AI_TEXT_MODEL,
  });

  let raw: WorkersAiTextResponse;
  try {
    raw = (await ai.run(WORKERS_AI_TEXT_MODEL, {
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(options.tools && options.tools.length > 0
        ? {
            tools: options.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
          }
        : {}),
    })) as WorkersAiTextResponse;
  } catch (error) {
    try {
      await failLlmGeneration({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        errorKind: 'workers_ai_provider_error',
      });
    } catch (ledgerError) {
      console.error('[llm-ledger] Workers AI failure write failed', ledger.id, ledgerError);
    }
    throw error;
  }

  const latencyMs = Date.now() - startTime;
  const exactInputTokens = exactUsageNumber(raw.usage?.prompt_tokens);
  const exactOutputTokens = exactUsageNumber(raw.usage?.completion_tokens);
  const exactCachedTokens = exactUsageNumber(raw.usage?.prompt_tokens_details?.cached_tokens);
  const exactTotalTokens = exactUsageNumber(raw.usage?.total_tokens);

  const text = workersAiText(raw);
  const content = jsonMode ? extractJsonObject(text) : text;
  const toolCalls = options.tools && options.tools.length > 0 ? workersAiToolCalls(raw) : [];
  if (!content.trim() && toolCalls.length === 0) {
    // Reasoning ate the whole budget, or the response shape was unexpected.
    // Record it as a failure so the admin dashboard sees it, then surface it.
    try {
      await failLlmGeneration({
        id: ledger.id,
        latencyMs,
        errorKind: 'workers_ai_empty_response',
      });
    } catch (ledgerError) {
      console.error('[llm-ledger] Workers AI failure write failed', ledger.id, ledgerError);
    }
    throw new Error('Workers AI returned an empty response');
  }

  try {
    await completeLlmGeneration({
      id: ledger.id,
      latencyMs,
      providerRequestId: raw.request_id ?? raw.id ?? null,
      usageReported: exactTotalTokens !== null || (exactInputTokens !== null && exactOutputTokens !== null),
      inputTokens: exactInputTokens,
      outputTokens: exactOutputTokens,
      cacheReadInputTokens: exactCachedTokens,
      providerTotalTokens: exactTotalTokens,
      providerUsage: workersUsageJson(raw.usage),
    });
  } catch (ledgerError) {
    console.error('[llm-ledger] Workers AI completion write failed', ledger.id, ledgerError);
  }

  return {
    content,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    usage: {
      inputTokens: exactInputTokens ?? 0,
      outputTokens: exactOutputTokens ?? 0,
      cacheReadInputTokens: exactCachedTokens ?? undefined,
    },
    model: WORKERS_AI_TEXT_MODEL,
    provider: 'workers-ai',
    latencyMs,
    generationId: ledger.id,
  };
}
