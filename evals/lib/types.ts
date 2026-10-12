export type EvalTask =
  | 'parse_cv'
  | 'extract_applicant'
  | 'parse_job'
  | 'skill_matching'
  | 'extract_metrics'
  | 'fit_assessment'
  | 'optimize_cv'
  | 'write_cover_letter'
  | 'write_email'
  | 'write_follow_up_email';

export const KIT_TASKS: EvalTask[] = [
  'parse_cv',
  'extract_applicant',
  'parse_job',
  'skill_matching',
  'extract_metrics',
  'fit_assessment',
  'optimize_cv',
  'write_cover_letter',
  'write_email',
  'write_follow_up_email',
];

export type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };

/** What an arm sends. Arm A is production-identical; B arms only differ where the plan says so. */
export interface ArmConfig {
  name: string;
  provider: 'bedrock' | 'anthropic';
  /** Resolved model id as sent to the provider. */
  modelId: string;
  /** Folder under evals/prompt-variants/ whose files replace same-named production prompt modules. */
  promptVariant: string;
  /** B arms drop temperature (Sonnet 5.5 does not take it). */
  dropTemperature: boolean;
  /** Per-task max_tokens override. Arm A leaves this empty so MODEL_CONFIGS applies unchanged. */
  maxTokens: Partial<Record<EvalTask, number>>;
  /** B arms: max_tokens = max(floor, multiplier x the production value), because thinking counts toward it. */
  maxTokensScale?: { multiplier: number; floor: number };
  thinking?: { type: 'adaptive' };
  effort?: 'low' | 'medium' | 'high';
  /** CLI flag that must be passed before this arm may run. */
  requiresFlag: string | null;
}

export interface UsageRecord {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  raw: unknown;
}

export interface CallRecord {
  run_id: string;
  call_id: string;
  case_id: string;
  rep: number;
  arm: string;
  task: EvalTask;
  /** Order of this call inside the kit, 1-based. */
  seq: number;
  prompt_variant: string;
  started_at: string;
  concurrency: number;
  request: {
    provider: string;
    model: string;
    max_tokens: number;
    temperature: number | null;
    thinking: unknown;
    effort: string | null;
    json_mode: boolean;
    system_blocks: number;
    system_cached_blocks: number;
    system_chars: number;
    prompt_chars: number;
    /** Full request body minus credentials. */
    body: unknown;
  };
  ok: boolean;
  error: string | null;
  raw_output: string | null;
  content_blocks: unknown;
  stop_reason: string | null;
  /** Set when stop_reason is refusal (category, explanation). */
  stop_details: unknown;
  usage: UsageRecord | null;
  latency_ms: number;
  attempts: number;
  provider_request_id: string | null;
}
