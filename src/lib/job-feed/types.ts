import type {
  ApplicationSession as SupabaseApplicationSession,
  JobFeedApplicationGeneration,
  JobFeedGenerationStatus,
  JobFeedCanonicalJob,
  JobFeedRun,
  JobFeedSettings,
} from '@/lib/supabase/types';

export type JobFeedOverviewState =
  | 'upgrade_required'
  | 'setup_required'
  | 'no_cv_required'
  | 'paused'
  | 'awaiting_first_run'
  | 'generating'
  | 'ready'
  | 'thin_feed'
  | 'empty'
  | 'error';

export type JobFeedCanonicalWorkMode = JobFeedCanonicalJob['work_mode'];
export type JobFeedFitLabel = 'strong' | 'good';
export type JobFeedFeedbackAction = 'opened' | 'saved' | 'dismissed' | 'apply_started' | 'applied' | 'rated_helpful' | 'rated_not_relevant';
export type JobFeedMatchRating = 'helpful' | 'not_relevant';
export type JobFeedPipelineStage = 'shortlisted' | 'ranked';
export type JobFeedRankingSource = 'deterministic' | 'llm';

export interface JobFeedItemFeedbackState {
  openedAt: string | null;
  savedAt: string | null;
  dismissedAt: string | null;
  applyStartedAt: string | null;
  appliedAt: string | null;
  applicationSessionId: string | null;
  generationStatus: JobFeedGenerationStatus;
  generationError: string | null;
  // Per-job match-quality rating supplied by the user via the details modal.
  // Stored inside job_feed_feedback.metadata so the ranking pipeline can learn
  // from it without a schema change.
  matchRating: JobFeedMatchRating | null;
}

export interface JobFeedOverviewResponse {
  canAccess: boolean;
  settings: JobFeedSettings | null;
  // Most recent run of any kind — used for display state (generating,
  // error banner, preview items).
  latestRun: JobFeedRun | null;
  // Most recent *manual* completed run — the only source the "Run for
  // today" 24h cooldown should consider. Scheduled/system runs must not
  // lock the button.
  latestManualRun: JobFeedRun | null;
  feedRun: JobFeedRun | null;
  latestRunDiagnostics: JobFeedRunDiagnostics | null;
  // First page of the 7-day inbox (JOB_FEED_VISIBLE_DEFAULT_COUNT items).
  // Subsequent pages come from /api/job-feed/inbox.
  jobs: JobFeedFeedItem[];
  // Total visible jobs across the whole 7-day inbox (blocked jobs already
  // stripped). Drives Load More's remaining count.
  jobsTotalCount: number;
  jobsHasMore: boolean;
  // How many jobs today's run delivered, unfiltered by user actions. This
  // is the agent's "how fresh is my feed" signal and stays fixed for the
  // day even as the user dismisses or applies to jobs.
  jobsTodayCount: number;
  // How many visible jobs carried over from earlier days in the 7-day
  // window (excludes jobs the user already applied / dismissed / rated
  // not relevant). Shrinks as the user acts on jobs.
  jobsBacklogCount: number;
  state: JobFeedOverviewState;
  foundationMode: boolean;
  feedCap: number;
  /**
   * True when the saved settings.target_roles differ from the latest AI profile's
   * inferred titles. The editing card surfaces a notice so the user knows to
   * save preferences to apply the updated roles.
   */
  target_roles_outdated: boolean;
}

export interface JobFeedRunDiagnostics {
  orchestrator: 'direct' | 'inngest';
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
  target_market: JobFeedSettings['target_market'];
  target_countries: string[];
  target_cities: string[];
  target_roles: string[];
  preferred_locations: string[];
  remote_preference: JobFeedSettings['remote_preference'];
  remote_preferences: JobFeedSettings['remote_preferences'];
  salary_floor: number | null;
  languages: string[];
  seniority_target: JobFeedSettings['seniority_target'];
  seniority_targets: JobFeedSettings['seniority_targets'];
  employment_types: JobFeedSettings['employment_types'];
  work_authorization_status: JobFeedSettings['work_authorization_status'];
  user_skills: string[];
  /** Titles/companies/keywords the user never wants surfaced. Downweighted hard by the ranker. */
  excluded_terms: string[];
}

export interface JobFeedSettingsSuggestion {
  target_roles: string[];
  preferred_locations: string[];
  target_countries: string[];
  user_skills: string[];
  languages: string[];
  seniority_target: JobFeedSettings['seniority_target'];
  source: 'cv';
}

export interface JobFeedSearchPlanItem {
  query: string;
  targetRole: string;
  market: JobFeedSettings['target_market'];
  /** ISO 3166-1 alpha-2 country code (lowercase). */
  country: string;
  /** Null means "let SerpAPI derive from country" (via COUNTRY_LANGUAGES). */
  language: string | null;
  location: string | null;
  /** Strategy origin: "short_tail" | "long_tail" | "localized" | null (legacy planner). */
  queryType: 'short_tail' | 'long_tail' | 'localized' | null;
  /** Strategy-supplied expected recall band (null when from the legacy planner). */
  expectedRecall: 'high' | 'medium' | 'low' | null;
  /**
   * Index into the same plan array of a fallback to retry when this item
   * returns zero results. Resolved DURING plan construction (not from the
   * raw strategy) so circular pointers can't slip through. Null when no
   * fallback is wired up.
   */
  fallbackToIndex: number | null;
  /**
   * True when this entry was produced as a retry triggered by another
   * entry's `fallbackToIndex`. Lets diagnostics tell main-pass calls apart
   * from fallback calls.
   */
  isFallbackRetry: boolean;
  /**
   * SerpAPI `uds` filter-chip tokens to apply to this query. Empty when
   * the country is in FILTER_CHIP_DISABLED_MARKETS, when no token is
   * cached yet (first run for that country), or when the call is a
   * fallback retry (fallbacks intentionally run unfiltered).
   */
  filterTokens: string[];
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

/**
 * A structured section of a job posting (e.g. "Qualifications",
 * "Responsibilities", "Benefits") as extracted by the provider. Used to render
 * clean sections when the free-text description arrives as one run-on blob.
 */
export interface JobFeedHighlight {
  title: string;
  items: string[];
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
  highlights: JobFeedHighlight[];
  applyUrl: string | null;
  sourceUrl: string | null;
  via: string | null;
  freshnessDays: number | null;
  postedAtText: string | null;
  fitLabel: JobFeedFitLabel | null;
  pipelineStage: JobFeedPipelineStage;
  rankingSource: JobFeedRankingSource | null;
  /**
   * The ranker's written reason for this job, as stored on the ranked item.
   * Null for shortlisted-only rows and for saved jobs read outside a run.
   * Drives "Why it's a match" in the job detail view.
   */
  matchReason: string | null;
  applyOptions: JobFeedApplyOption[];
  feedback: JobFeedItemFeedbackState;
}

export interface JobFeedFeedbackResponse {
  feedback: JobFeedItemFeedbackState;
}

export interface JobFeedApplyResponse {
  created: boolean;
  session: SupabaseApplicationSession;
  generation: JobFeedApplicationGeneration;
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
    skillOverlapScore: number;
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
  companyDisplay?: string | null;
}

export interface JobFeedRankedItemRecord {
  canonicalJobId: string;
  rank: number;
  fitLabel: JobFeedFitLabel;
  rankingSource: JobFeedRankingSource;
  reason: string | null;
  deterministicScore: number;
  companyDisplay?: string | null;
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
