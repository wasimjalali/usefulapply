/**
 * Model Types and Interfaces
 * Defines the types for multi-model AI system
 * All tasks now use GPT-4o mini for unified, cost-effective AI
 */

export type ModelProvider = 'anthropic' | 'google' | 'openai' | 'deepseek';

export type TaskType =
  // Analysis tasks (GPT-4o mini - fast & cost-effective)
  | 'parse_job_description'
  | 'parse_cv'
  | 'extract_skills'
  | 'gap_analysis'
  | 'evaluate_content'
  | 'validate_ats'
  | 'check_limits'
  | 'orchestrate'
  | 'extract_company_info'
  // 3-Agent Architecture tasks
  | 'extract_applicant'  // Context Agent: extract applicant profile from CV
  | 'parse_job'          // Context Agent: parse job description
  | 'optimize_cv'        // Writer Agent: generate optimized CV
  // Writing tasks (GPT-4o mini - fast & cost-effective)
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
  };
  model: string;
  provider: ModelProvider;
  latencyMs: number;
}

export interface ModelCallOptions {
  task: TaskType;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

// Model configurations - All tasks use GPT-4o mini
export const MODEL_CONFIGS: Record<TaskType, ModelConfig> = {
  // Analysis tasks - GPT-4o mini
  parse_job_description: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.3,
    maxTokens: 4096,
  },
  parse_cv: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.3,
    maxTokens: 4096,
  },
  extract_skills: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.2,
    maxTokens: 2048,
  },
  gap_analysis: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.3,
    maxTokens: 4096,
  },
  evaluate_content: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.2,
    maxTokens: 2048,
  },
  validate_ats: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.1,
    maxTokens: 2048,
  },
  check_limits: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.1,
    maxTokens: 1024,
  },
  orchestrate: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.3,
    maxTokens: 2048,
  },
  extract_company_info: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.2,
    maxTokens: 2048,
  },

  // Writing tasks - GPT-4o mini
  write_summary: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.7,
    maxTokens: 1024,
  },
  write_bullets: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.7,
    maxTokens: 2048,
  },
  write_cover_letter: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.5,  // Lower for more consistent professional tone
    maxTokens: 2048,
  },
  refine_cover_letter: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.4,  // Even lower for editing - we want consistency
    maxTokens: 2048,
  },
  write_email: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.5,  // Lower for consistency
    maxTokens: 1024,
  },
  optimize_content: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.6,
    maxTokens: 4096,
  },
  general_chat: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.7,
    maxTokens: 2048,
  },
  // 3-Agent Architecture tasks
  extract_applicant: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.3,
    maxTokens: 4096,
  },
  parse_job: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.3,
    maxTokens: 4096,
  },
  optimize_cv: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.6,
    maxTokens: 8192,
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
