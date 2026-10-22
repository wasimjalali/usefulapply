/**
 * Claude Haiku 5.5 on the Anthropic API: the one call path that replaces gpt-oss-120b (Workers AI).
 *
 * CONTRACT STUB written by the orchestrator so W2-W6 can build in parallel. W1 implements it and
 * may add fields, but must not rename or remove anything below without telling the orchestrator.
 * Design: ~/.hermes/cache/scratch/ua/haiku-plan.md section 2; caching: .claude/rules/prompt-caching.md.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
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

export async function callHaiku(_options: HaikuCallOptions): Promise<HaikuResponse> {
  throw new Error('callHaiku is not implemented yet (W1)');
}
