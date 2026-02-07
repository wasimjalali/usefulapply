/**
 * Model Types and Interfaces
 * Defines the types for multi-model AI system
 * Primary: Claude Sonnet 4.5 | Fallback: Claude Haiku 4.5 (toggle via USE_FALLBACK_MODEL env var)
 */

export type ModelProvider = 'anthropic' | 'bedrock';

export type TaskType =
  // Analysis tasks
  | 'parse_job_description'
  | 'parse_cv'
  | 'extract_skills'
  | 'gap_analysis'
  | 'evaluate_content'
  | 'validate_ats'
  | 'check_limits'
  | 'orchestrate'
  | 'extract_company_info'
  // Karko AI tasks
  | 'extract_applicant'  // Parse applicant profile from CV
  | 'parse_job'          // Analyze job description requirements
  | 'optimize_cv'        // Generate optimized CV
  | 'fit_assessment'     // Pre-generation fit analysis
  | 'skill_matching'     // LLM-based semantic skill matching (cross-language)
  // Writing tasks
  | 'write_summary'
  | 'write_bullets'
  | 'write_cover_letter'
  | 'refine_cover_letter' // Refinement pass for cover letter quality
  | 'write_email'
  | 'optimize_content'
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

// Model configurations - All tasks use Claude Sonnet 4.5 (model ID resolved at runtime in anthropic.ts)
export const MODEL_CONFIGS: Record<TaskType, ModelConfig> = {
  // Analysis tasks
  parse_job_description: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.3,
    maxTokens: 4096,
  },
  parse_cv: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.3,
    maxTokens: 4096,
  },
  extract_skills: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.2,
    maxTokens: 2048,
  },
  gap_analysis: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.3,
    maxTokens: 4096,
  },
  evaluate_content: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.2,
    maxTokens: 2048,
  },
  validate_ats: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.1,
    maxTokens: 2048,
  },
  check_limits: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.1,
    maxTokens: 1024,
  },
  orchestrate: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.3,
    maxTokens: 2048,
  },
  extract_company_info: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.2,
    maxTokens: 2048,
  },

  // Writing tasks
  write_summary: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.65,  // Sonnet: slight decrease from 0.7 — variety without randomness
    maxTokens: 1024,
  },
  write_bullets: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.65,  // Sonnet: slight decrease from 0.7 — variety without randomness
    maxTokens: 2048,
  },
  write_cover_letter: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.6,  // Sonnet: bumped from 0.5 — needs warmth and personality
    maxTokens: 2048,
  },
  refine_cover_letter: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.4,  // Even lower for editing - we want consistency
    maxTokens: 2048,
  },
  write_email: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.55,  // Sonnet: slight bump from 0.5 — emails need warmth
    maxTokens: 1024,
  },
  optimize_content: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.6,
    maxTokens: 4096,
  },
  general_chat: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.7,
    maxTokens: 150,  // Reconciled: was 2048 in config but overridden to 100 in chat route. 150 gives Sonnet headroom for helpful responses.
  },
  // Karko AI tasks
  extract_applicant: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.3,
    maxTokens: 4096,
  },
  parse_job: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.3,
    maxTokens: 4096,
  },
  optimize_cv: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.5,  // Sonnet: bumped from 0.4 — better variety for natural-sounding bullet points
    maxTokens: 8192,
  },
  fit_assessment: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.4,  // Sonnet: lowered from 0.5 — more precise analytical evaluations
    maxTokens: 400,  // Reconciled: was 512 in config but overridden to 300. Sonnet follows "100 words" precisely, 400 is plenty.
  },
  skill_matching: {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.1,  // Low temp for consistent, deterministic matching
    maxTokens: 2048,
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
