/**
 * Model Types and Interfaces
 * Defines the types for multi-model AI system
 * Sonnet 5.5 on the Anthropic API for the kit tasks, Haiku 5.5 for chat and the other sites (haiku.ts),
 * with Claude in Amazon Bedrock as the failover for both (providers.ts).
 */

import type { LlmGenerationContext } from '@/db/repos/adminMetrics';

export type ModelProvider = 'anthropic' | 'bedrock' | 'workers-ai';

export type TaskType =
  // Extraction & analysis
  | 'extract_applicant'  // Parse applicant profile from CV
  | 'parse_job'          // Analyze job description requirements
  | 'skill_matching'     // LLM-based semantic skill matching (cross-language)
  | 'extract_metrics'    // Extract verified metrics from source CVs
  | 'fit_assessment'     // Pre-generation fit analysis
  // Generation
  | 'optimize_cv'        // Generate optimized CV
  | 'write_cover_letter'
  | 'write_email'
  | 'write_follow_up_email'
  // Chat
  | 'general_chat';

export interface ModelConfig {
  model: string;
  provider: ModelProvider;
  maxTokens: number;
}

export interface ModelResponse {
  content: string;
  /** Tool calls the model asked for (callHaiku, and Workers AI function calling until it is removed). */
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    /** 5-minute and 1-hour split of cacheCreationInputTokens (callHaiku and callAnthropic). */
    cacheCreation5mInputTokens?: number;
    cacheCreation1hInputTokens?: number;
  };
  model: string;
  provider: ModelProvider;
  latencyMs: number;
  generationId: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Cache lifetime of one marker. 5 minutes is the API default (write 1.25x), 1 hour writes at 2x. */
export type CacheTtl = '5m' | '1h';

export interface CacheableContentBlock {
  type: 'text';
  text: string;
  /** A cache marker. No `ttl` means 5 minutes; markers with a longer TTL must come first in a request. */
  cache_control?: { type: 'ephemeral'; ttl?: CacheTtl };
}

export interface ModelCallOptions {
  task: TaskType;
  /** The whole user message. With `promptBlocks`, it must equal their texts joined. */
  prompt: string;
  /**
   * The same user message split into blocks so markers can sit inside it. Splitting never changes the text:
   * the blocks must join to `prompt` exactly, or the call throws before anything is sent.
   */
  promptBlocks?: CacheableContentBlock[];
  systemPrompt?: string;
  /** A cache marker on a plain `systemPrompt` (the JSON rule jsonMode appends is inside the marked block). */
  systemPromptCacheTtl?: CacheTtl;
  /** Structured system blocks with cache_control for Anthropic prompt caching */
  systemBlocks?: CacheableContentBlock[];
  maxTokens?: number;
  jsonMode?: boolean;
  conversationHistory?: ConversationMessage[];
  generationContext?: LlmGenerationContext;
  /** The call site's label on the PostHog `$ai_generation` event. Defaults to the task. */
  site?: string;
}

// Model configurations. The model ID is resolved at runtime in anthropic.ts; `model` here is informational.
// No sampling parameters: Sonnet 5.5 rejects them, so its voice and variety live in the prompts. maxTokens is
// scaled to max(4000, 4x) in anthropic.ts because thinking counts toward it and the tokenizer is ~30% larger.
export const MODEL_CONFIGS: Record<TaskType, ModelConfig> = {
  // Extraction & analysis
  extract_applicant: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 4096,
  },
  parse_job: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 4096,
  },
  skill_matching: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 2048,
  },
  extract_metrics: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 2048,
  },
  fit_assessment: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 400,
  },

  // Generation
  optimize_cv: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 10000,  // Covers 3-page CV (~5K tokens) + analysis + headroom
  },
  write_cover_letter: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 2048,
  },
  write_email: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 1024,
  },
  write_follow_up_email: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 512,
  },
  general_chat: {
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    maxTokens: 150,  // Reconciled: was 2048 in config but overridden to 100 in chat route. 150 gives Sonnet 4.6 headroom for helpful responses.
  },
};

// Helper to get config for a task
export function getModelConfig(task: TaskType): ModelConfig {
  return MODEL_CONFIGS[task];
}

// Check if task uses premium model (for cost tracking)
export function isPremiumTask(task: TaskType): boolean {
  return MODEL_CONFIGS[task].provider === 'anthropic';
}
