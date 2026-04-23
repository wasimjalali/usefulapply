import type {
  ApplicationSession as SupabaseApplicationSession,
  JobFeedCanonicalJob,
  JobFeedRun,
  JobFeedSettings,
} from '@/lib/supabase/types';

export type JobFeedOverviewState =
  | 'upgrade_required'
  | 'setup_required'
  | 'paused'
  | 'awaiting_first_run'
  | 'generating'
  | 'ready'
  | 'thin_feed'
  | 'empty'
  | 'error';

export type JobFeedCanonicalWorkMode = JobFeedCanonicalJob['work_mode'];
export type JobFeedEmploymentType = NonNullable<JobFeedCanonicalJob['employment_type']>;
export type JobFeedFitLabel = 'strong' | 'good';
export type JobFeedFeedbackAction = 'opened' | 'saved' | 'dismissed' | 'applied';
export type JobFeedPipelineStage = 'shortlisted' | 'ranked';
export type JobFeedRankingSource = 'deterministic' | 'llm';

export interface JobFeedItemFeedbackState {
  openedAt: string | null;
  savedAt: string | null;
  dismissedAt: string | null;
  appliedAt: string | null;
  applicationSessionId: string | null;
}

export interface JobFeedOverviewResponse {
  canAccess: boolean;
  settings: JobFeedSettings | null;
  latestRun: JobFeedRun | null;
  feedRun: JobFeedRun | null;
  latestRunDiagnostics: JobFeedRunDiagnostics | null;
  jobs: JobFeedFeedItem[];
  state: JobFeedOverviewState;
  foundationMode: boolean;
}

export interface JobFeedRunDiagnostics {
  orchestrator: 'direct';
  rankingStatus: JobFeedRankingExecutionResult['status'] | null;
  rankingSource: JobFeedRankingSource | null;
  rankingInputTokens: number | null;
  rankingOutputTokens: number | null;
  rankingLatencyMs: number | null;
  rankingEstimatedCostUsd: number | null;
  canonicalJobsCount: number | null;
  prefilterSurvivorsCount: number | null;
  rankingCandidateCount: number | null;
  rankedJobsCount: number | null;
  duplicateCount: number;
  failedFetchCount: number;
  rankedItemsMaterialized: boolean | null;
}

export interface JobFeedSettingsInput {
  enabled: boolean;
  consent_accepted: boolean;
  user_timezone: string;
  delivery_hour_local: number;
  target_market: JobFeedSettings['target_market'];
  target_roles: string[];
  adjacent_roles_enabled: boolean;
  adjacent_roles: string[];
  preferred_locations: string[];
  remote_preference: JobFeedSettings['remote_preference'];
  salary_floor: number | null;
  languages: string[];
  seniority_target: JobFeedSettings['seniority_target'];
  employment_types: JobFeedSettings['employment_types'];
  work_authorization_status: JobFeedSettings['work_authorization_status'];
  aggressiveness: JobFeedSettings['aggressiveness'];
}

export interface JobFeedSearchPlanItem {
  query: string;
  targetRole: string;
  isAdjacentRole: boolean;
  market: JobFeedSettings['target_market'];
  country: 'us' | 'ca';
  language: string;
  location: string | null;
}

export interface JobFeedJobPreview {
  id: string;
  title: string;
  company: string;
  location: string | null;
  workMode: JobFeedCanonicalWorkMode;
  employmentType: JobFeedCanonicalJob['employment_type'];
  freshnessDays: number | null;
  applyUrl: string | null;
}

export interface JobFeedApplyOption {
  title: string;
  link: string;
}

export interface JobFeedFeedItem {
  id: string;
  title: string;
  company: string;
  location: string | null;
  workMode: JobFeedCanonicalWorkMode;
  employmentType: JobFeedCanonicalJob['employment_type'];
  salaryText: string | null;
  description: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  via: string | null;
  freshnessDays: number | null;
  postedAtText: string | null;
  fitLabel: JobFeedFitLabel | null;
  pipelineStage: JobFeedPipelineStage;
  rankingSource: JobFeedRankingSource | null;
  applyOptions: JobFeedApplyOption[];
  feedback: JobFeedItemFeedbackState;
}

export interface JobFeedFeedbackResponse {
  feedback: JobFeedItemFeedbackState;
}

export interface JobFeedApplyResponse {
  created: boolean;
  session: SupabaseApplicationSession;
  feedback: JobFeedItemFeedbackState;
}

export interface JobFeedIngestionFailure {
  query: string;
  country: string;
  error: string;
}

export interface JobFeedIngestionResult {
  searchPlan: JobFeedSearchPlanItem[];
  rawFetchIds: string[];
  rawJobsFetched: number;
  canonicalJobs: JobFeedCanonicalJob[];
  canonicalJobsCreated: number;
  canonicalJobsUpdated: number;
  duplicateCount: number;
  failedFetches: JobFeedIngestionFailure[];
  previewJobs: JobFeedJobPreview[];
}

export type JobFeedPrefilterRejectReason =
  | 'location_mismatch'
  | 'remote_mismatch'
  | 'employment_type_mismatch'
  | 'salary_mismatch'
  | 'work_authorization_mismatch'
  | 'seniority_mismatch';

export interface JobFeedPrefilterResult {
  survivors: JobFeedCanonicalJob[];
  survivorsPreview: JobFeedJobPreview[];
  shortlist: JobFeedCanonicalJob[];
  shortlistPreview: JobFeedJobPreview[];
  rejectedCount: number;
  rejectionsByReason: Record<JobFeedPrefilterRejectReason, number>;
}

export interface JobFeedRankingCandidate {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  workMode: JobFeedCanonicalWorkMode;
  employmentType: JobFeedCanonicalJob['employment_type'];
  salaryText: string | null;
  description: string | null;
  applyUrl: string | null;
  freshnessDays: number | null;
  deterministicRank: number;
  deterministicScore: number;
  deterministicFitLabel: JobFeedFitLabel;
  scoreBreakdown: {
    targetRoleScore: number;
    adjacentRoleScore: number;
    freshnessScore: number;
    salaryScore: number;
    remoteAlignmentScore: number;
    preferredLocationMatched: boolean;
    hasApplyUrl: boolean;
    hasEmploymentType: boolean;
  };
}

export interface JobFeedRankingPrepResult {
  fitLabels: readonly JobFeedFitLabel[];
  candidates: JobFeedRankingCandidate[];
}

export interface JobFeedRankedPreviewItem {
  id: string;
  rank: number;
  fitLabel: JobFeedFitLabel;
  rankingSource: JobFeedRankingSource;
  reason: string | null;
}

export interface JobFeedRankedItemRecord {
  canonicalJobId: string;
  rank: number;
  fitLabel: JobFeedFitLabel;
  rankingSource: JobFeedRankingSource;
  reason: string | null;
  deterministicScore: number;
}

export interface JobFeedRankingExecutionResult {
  status: 'completed_llm' | 'completed_deterministic' | 'llm_failed_fallback' | 'no_candidates';
  items: JobFeedRankedItemRecord[];
  errorMessage: string | null;
  model: {
    provider: string;
    name: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  } | null;
}

export interface JobFeedRunWorkflowResult {
  run: JobFeedRun;
  created: boolean;
  skipped: boolean;
  forced?: boolean;
  previewJobs?: JobFeedJobPreview[];
}
