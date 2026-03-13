/**
 * Model Types and Interfaces
 * Defines the types for multi-model AI system
 * Primary: Claude Sonnet 4.6 | Fallback: Claude Haiku 4.5 (toggle via USE_FALLBACK_MODEL env var)
 */

export type ModelProvider = 'anthropic' | 'bedrock';

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
  temperature: number;
  maxTokens: number;
}

export interface ModelResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  model: string;
  provider: ModelProvider;
  latencyMs: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CacheableContentBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface ModelCallOptions {
  task: TaskType;
  prompt: string;
  systemPrompt?: string;
  /** Structured system blocks with cache_control for Anthropic prompt caching */
  systemBlocks?: CacheableContentBlock[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  conversationHistory?: ConversationMessage[];
}

// Model configurations - All tasks use Claude Sonnet 4.6 (model ID resolved at runtime in anthropic.ts)
export const MODEL_CONFIGS: Record<TaskType, ModelConfig> = {
  // Extraction & analysis
  extract_applicant: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.3,
    maxTokens: 4096,
  },
  parse_job: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.3,
    maxTokens: 4096,
  },
  skill_matching: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.1,  // Low temp for consistent, deterministic matching
    maxTokens: 2048,
  },
  extract_metrics: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.2,
    maxTokens: 2048,
  },
  fit_assessment: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.4,  // More precise analytical evaluations
    maxTokens: 400,
  },

  // Generation
  optimize_cv: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.5,  // Variety for natural-sounding bullet points
    maxTokens: 8192,
  },
  write_cover_letter: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.6,  // Sonnet 4.6: maintained — needs warmth and personality
    maxTokens: 2048,
  },
  write_email: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.55,  // Sonnet 4.6: maintained — emails need warmth
    maxTokens: 1024,
  },
  write_follow_up_email: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.5,  // Slightly lower than primary email — follow-up needs precision
    maxTokens: 512,
  },
  general_chat: {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    temperature: 0.7,
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
