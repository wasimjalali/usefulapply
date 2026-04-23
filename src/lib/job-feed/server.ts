import { createAdminClient } from '@/lib/supabase/admin';
import type {
  ApplicationSession as SupabaseApplicationSession,
  JobFeedCanonicalJob,
  JobFeedFeedback,
  JobFeedRun,
  JobFeedSettings,
  Json,
} from '@/lib/supabase/types';
import { canAccessJobFeed, getLocalDateKey, getTimeZoneParts, isJobFeedConfigured } from '@/lib/job-feed/helpers';
import type {
  JobFeedFeedbackAction,
  JobFeedFeedItem,
  JobFeedItemFeedbackState,
  JobFeedPrefilterResult,
  JobFeedRankingPrepResult,
  JobFeedRunWorkflowResult,
} from '@/lib/job-feed/types';
import { ingestJobFeedRunJobs } from '@/lib/job-feed/ingestion';
import { prepareJobFeedRankingCandidates, prefilterJobFeedJobs } from '@/lib/job-feed/prefilter';

type JobFeedRunUpdate = Partial<Pick<JobFeedRun,
  | 'status'
  | 'started_at'
  | 'completed_at'
  | 'error_message'
  | 'result_summary'
  | 'raw_jobs_fetched'
  | 'jobs_after_prefilter'
  | 'ranked_jobs_count'
  | 'metadata'
>>;

interface DueJobFeedUser {
  userId: string;
  timeZone: string;
  deliveryHourLocal: number;
}

interface ScheduledJobFeedSweepResult {
  checkedUsers: number;
  dueUsers: number;
  processedRuns: number;
  skippedRuns: number;
  failedRuns: Array<{ userId: string; error: string }>;
}

interface LatestJobFeedItemsResult {
  run: JobFeedRun | null;
  items: JobFeedFeedItem[];
}

export async function getJobFeedSettingsAdmin(userId: string): Promise<JobFeedSettings | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load job feed settings: ${error.message}`);
  }

  return (data ?? null) as JobFeedSettings | null;
}

export async function getLatestJobFeedRunAdmin(userId: string): Promise<JobFeedRun | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_runs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load latest job feed run: ${error.message}`);
  }

  return (data ?? null) as JobFeedRun | null;
}

export async function getJobFeedRunAdmin(userId: string, runId: string): Promise<JobFeedRun | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('id', runId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load job feed run: ${error.message}`);
  }

  return (data ?? null) as JobFeedRun | null;
}

export async function getJobFeedCanonicalJobAdmin(jobId: string): Promise<JobFeedCanonicalJob | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_canonical_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load job feed item: ${error.message}`);
  }

  return (data ?? null) as JobFeedCanonicalJob | null;
}

export async function getJobFeedFeedbackAdmin(userId: string, jobId: string): Promise<JobFeedFeedback | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_feedback')
    .select('*')
    .eq('user_id', userId)
    .eq('canonical_job_id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load job feed feedback: ${error.message}`);
  }

  return (data ?? null) as JobFeedFeedback | null;
}

export async function getJobFeedApplicationSessionAdmin(params: {
  userId: string;
  sessionId: string;
}): Promise<SupabaseApplicationSession | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('application_sessions')
    .select('*')
    .eq('user_id', params.userId)
    .eq('id', params.sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load application session: ${error.message}`);
  }

  return (data ?? null) as SupabaseApplicationSession | null;
}

export async function createJobFeedApplicationSessionAdmin(params: {
  userId: string;
  job: JobFeedCanonicalJob;
}): Promise<SupabaseApplicationSession> {
  const { userId, job } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference is still catching up to some application tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('application_sessions')
    .insert({
      user_id: userId,
      job_title: job.title,
      company: job.company,
      job_description: job.description ?? buildFallbackJobDescription(job),
      job_url: job.apply_url ?? job.source_url,
      matching_skills: [],
      missing_skills: [],
      suggestions: [],
      cv_edits: [],
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create application session from feed item: ${error.message}`);
  }

  return data as SupabaseApplicationSession;
}

export async function recordJobFeedFeedbackAdmin(params: {
  userId: string;
  jobId: string;
  action: JobFeedFeedbackAction;
  latestRunId?: string | null;
  applicationSessionId?: string | null;
}): Promise<JobFeedFeedback> {
  const { userId, jobId, action, latestRunId = null, applicationSessionId = null } = params;
  const existing = await getJobFeedFeedbackAdmin(userId, jobId);
  const now = new Date().toISOString();
  const metadataPatch: Record<string, Json> = {
    last_action: action,
    last_action_at: now,
  };

  const basePatch: Record<string, Json | string | null> = {
    latest_run_id: latestRunId ?? existing?.latest_run_id ?? null,
    metadata: mergeMetadata(existing?.metadata ?? null, metadataPatch),
  };

  switch (action) {
    case 'opened':
      basePatch.opened_at = existing?.opened_at ?? now;
      break;
    case 'saved':
      basePatch.saved_at = existing?.saved_at ?? now;
      basePatch.dismissed_at = null;
      break;
    case 'dismissed':
      basePatch.dismissed_at = existing?.dismissed_at ?? now;
      break;
    case 'applied':
      basePatch.opened_at = existing?.opened_at ?? now;
      basePatch.applied_at = existing?.applied_at ?? now;
      basePatch.application_session_id = applicationSessionId ?? existing?.application_session_id ?? null;
      basePatch.dismissed_at = null;
      break;
    default:
      throw new Error(`Unsupported job feed feedback action: ${String(action)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;

  if (existing) {
    const { data, error } = await admin
      .from('job_feed_feedback')
      .update(basePatch)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update job feed feedback: ${error.message}`);
    }

    return data as JobFeedFeedback;
  }

  const insertPayload = {
    user_id: userId,
    canonical_job_id: jobId,
    latest_run_id: latestRunId,
    application_session_id: action === 'applied' ? applicationSessionId : null,
    opened_at: action === 'opened' || action === 'applied' ? now : null,
    saved_at: action === 'saved' ? now : null,
    dismissed_at: action === 'dismissed' ? now : null,
    applied_at: action === 'applied' ? now : null,
    metadata: mergeMetadata(null, metadataPatch),
  };

  const { data, error } = await admin
    .from('job_feed_feedback')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to insert job feed feedback: ${error.message}`);
  }

  return data as JobFeedFeedback;
}

export function toJobFeedFeedbackState(feedback: JobFeedFeedback | null): JobFeedItemFeedbackState {
  return {
    openedAt: feedback?.opened_at ?? null,
    savedAt: feedback?.saved_at ?? null,
    dismissedAt: feedback?.dismissed_at ?? null,
    appliedAt: feedback?.applied_at ?? null,
    applicationSessionId: feedback?.application_session_id ?? null,
  };
}

export async function listLatestJobFeedItemsAdmin(params: {
  userId: string;
  latestRun?: JobFeedRun | null;
}): Promise<LatestJobFeedItemsResult> {
  const candidateRun = params.latestRun ?? await getLatestJobFeedRunAdmin(params.userId);
  const run = candidateRun?.status === 'completed'
    ? candidateRun
    : await getLatestCompletedJobFeedRunAdmin(params.userId);
  if (!run || run.status !== 'completed') {
    return {
      run: null,
      items: [],
    };
  }

  const jobIds = extractFeedJobIds(run.metadata);
  if (jobIds.length === 0) {
    return {
      run,
      items: [],
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_canonical_jobs')
    .select('*')
    .in('id', jobIds);

  if (error) {
    throw new Error(`Failed to load latest job feed items: ${error.message}`);
  }

  const rows = (data ?? []) as JobFeedCanonicalJob[];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const feedbackByJobId = await getJobFeedFeedbackMapAdmin(params.userId, jobIds);

  const items = jobIds
    .map((jobId) => rowsById.get(jobId))
    .filter((job): job is JobFeedCanonicalJob => Boolean(job))
    .filter((job) => !feedbackByJobId.get(job.id)?.dismissed_at)
    .map((job) => toFeedItem(job, feedbackByJobId.get(job.id) ?? null));

  return {
    run,
    items,
  };
}

export async function listDueJobFeedUsers(now = new Date()): Promise<DueJobFeedUser[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;

  const { data: settingsRows, error: settingsError } = await admin
    .from('job_feed_settings')
    .select('*')
    .eq('enabled', true)
    .not('consent_accepted_at', 'is', null);

  if (settingsError) {
    throw new Error(`Failed to load job feed settings for scheduling: ${settingsError.message}`);
  }

  if (!settingsRows || settingsRows.length === 0) {
    return [];
  }

  const typedSettingsRows = settingsRows as JobFeedSettings[];
  const userIds = typedSettingsRows.map((row) => row.user_id);
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, subscription_tier')
    .in('id', userIds);

  if (profilesError) {
    throw new Error(`Failed to load profile tiers for scheduling: ${profilesError.message}`);
  }

  const typedProfiles = (profiles ?? []) as Array<{ id: string; subscription_tier: string | null }>;
  const tierByUserId = new Map<string, string | null>(typedProfiles.map((profile) => [profile.id, profile.subscription_tier]));

  return typedSettingsRows
    .filter((settings) => {
      if (!isJobFeedConfigured(settings)) return false;
      if (!canAccessJobFeed(tierByUserId.get(settings.user_id))) return false;

      const localParts = getTimeZoneParts(now, settings.user_timezone);
      return localParts.hour === settings.delivery_hour_local;
    })
    .map((settings) => ({
      userId: settings.user_id,
      timeZone: settings.user_timezone,
      deliveryHourLocal: settings.delivery_hour_local,
    }));
}

async function getLatestCompletedJobFeedRunAdmin(userId: string): Promise<JobFeedRun | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load latest completed job feed run: ${error.message}`);
  }

  return (data ?? null) as JobFeedRun | null;
}

export async function runJobFeedFoundationWorkflow(params: {
  userId: string;
  triggerSource?: string;
  now?: Date;
}): Promise<JobFeedRunWorkflowResult> {
  const { userId, triggerSource = 'scheduled', now = new Date() } = params;
  const settings = await getJobFeedSettingsAdmin(userId);

  if (!settings) {
    throw new Error('Job feed settings were not found for this user.');
  }

  if (!settings.enabled) {
    throw new Error('Job feed is paused for this user.');
  }

  if (!isJobFeedConfigured(settings)) {
    throw new Error('Job feed settings are incomplete.');
  }

  const localDate = getLocalDateKey(now, settings.user_timezone);
  const existingRun = await getJobFeedRunByDate(userId, localDate);

  if (existingRun?.status === 'completed') {
    return { run: existingRun, created: false, skipped: true };
  }

  if (existingRun?.status === 'running') {
    return { run: existingRun, created: false, skipped: true };
  }

  const run = existingRun ?? await createJobFeedRun({
    user_id: userId,
    local_date: localDate,
    local_timezone: settings.user_timezone,
    delivery_hour_local: settings.delivery_hour_local,
    trigger_source: triggerSource,
    idempotency_key: `${userId}:${localDate}`,
    metadata: {
      stage: 'phase_4_prefilter',
      foundation_mode: true,
      target_market: settings.target_market,
    },
  });

  let runningRun = await updateJobFeedRun(run.id, {
    status: 'running',
    started_at: new Date().toISOString(),
    completed_at: null,
    error_message: null,
    result_summary: null,
    metadata: mergeMetadata(run.metadata, {
      stage: 'phase_4_prefilter',
      foundation_mode: true,
      last_trigger_source: triggerSource,
    }),
  });

  try {
    const ingestion = await ingestJobFeedRunJobs({
      runId: run.id,
      userId,
      settings,
    });

    if (ingestion.rawJobsFetched === 0 && ingestion.failedFetches.length === ingestion.searchPlan.length && ingestion.searchPlan.length > 0) {
      throw new Error('All job feed provider fetches failed for this run.');
    }

    const prefilter = prefilterJobFeedJobs({
      settings,
      jobs: ingestion.canonicalJobs,
    });

    const rankingPrep = prepareJobFeedRankingCandidates(prefilter.shortlist);

    runningRun = await updateJobFeedRun(run.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
      result_summary: buildWorkflowResultSummary(ingestion, prefilter, rankingPrep),
      raw_jobs_fetched: ingestion.rawJobsFetched,
      jobs_after_prefilter: prefilter.survivors.length,
      ranked_jobs_count: 0,
      metadata: mergeMetadata(runningRun.metadata, {
        stage: 'phase_4_prefilter',
        workflow_status: 'completed',
        search_plan: toJson(ingestion.searchPlan),
        raw_fetch_ids: toJson(ingestion.rawFetchIds),
        canonical_jobs_count: ingestion.canonicalJobs.length,
        canonical_jobs_created: ingestion.canonicalJobsCreated,
        canonical_jobs_updated: ingestion.canonicalJobsUpdated,
        duplicate_count: ingestion.duplicateCount,
        failed_fetches: toJson(ingestion.failedFetches),
        ingestion_preview_jobs: toJson(ingestion.previewJobs),
        prefilter_survivors_count: prefilter.survivors.length,
        prefilter_rejected_count: prefilter.rejectedCount,
        prefilter_rejections_by_reason: toJson(prefilter.rejectionsByReason),
        prefilter_survivors_preview: toJson(prefilter.survivorsPreview),
        shortlist_preview_jobs: toJson(prefilter.shortlistPreview),
        ranking_candidate_count: rankingPrep.candidates.length,
        ranking_fit_labels: toJson(rankingPrep.fitLabels),
        ranking_status: rankingPrep.candidates.length > 0 ? 'pending_llm' : 'no_candidates',
      }),
    });

    return {
      run: runningRun,
      created: !existingRun,
      skipped: false,
      previewJobs: prefilter.shortlistPreview.length > 0 ? prefilter.shortlistPreview : ingestion.previewJobs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown job feed workflow failure';

    await updateJobFeedRun(run.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
      metadata: mergeMetadata(runningRun.metadata, {
        workflow_status: 'failed',
      }),
    });

    throw error;
  }
}

export async function runScheduledJobFeedFoundationSweep(now = new Date()): Promise<ScheduledJobFeedSweepResult> {
  const dueUsers = await listDueJobFeedUsers(now);

  const result: ScheduledJobFeedSweepResult = {
    checkedUsers: dueUsers.length,
    dueUsers: dueUsers.length,
    processedRuns: 0,
    skippedRuns: 0,
    failedRuns: [],
  };

  for (const dueUser of dueUsers) {
    try {
      const workflow = await runJobFeedFoundationWorkflow({
        userId: dueUser.userId,
        triggerSource: 'scheduled',
        now,
      });

      if (workflow.skipped) {
        result.skippedRuns += 1;
      } else {
        result.processedRuns += 1;
      }
    } catch (error) {
      result.failedRuns.push({
        userId: dueUser.userId,
        error: error instanceof Error ? error.message : 'Unknown scheduling error',
      });
    }
  }

  return result;
}

async function getJobFeedRunByDate(userId: string, localDate: string): Promise<JobFeedRun | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load existing job feed run: ${error.message}`);
  }

  return (data ?? null) as JobFeedRun | null;
}

async function createJobFeedRun(insert: {
  user_id: string;
  local_date: string;
  local_timezone: string;
  delivery_hour_local: number;
  trigger_source: string;
  idempotency_key: string;
  metadata: Json;
}): Promise<JobFeedRun> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_runs')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create job feed run: ${error.message}`);
  }

  return data as JobFeedRun;
}

async function updateJobFeedRun(runId: string, updates: JobFeedRunUpdate): Promise<JobFeedRun> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_runs')
    .update(updates)
    .eq('id', runId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update job feed run: ${error.message}`);
  }

  return data as JobFeedRun;
}

function mergeMetadata(existing: Json, patch: Record<string, Json>): Json {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? existing as Record<string, Json | undefined>
    : {};

  return {
    ...base,
    ...patch,
  };
}

function extractFeedJobIds(metadata: Json): string[] {
  const shortlistIds = extractIdsFromPreviewList(readMetadataArray(metadata, 'shortlist_preview_jobs'));
  if (shortlistIds.length > 0) {
    return shortlistIds;
  }

  return extractIdsFromPreviewList(readMetadataArray(metadata, 'ingestion_preview_jobs'));
}

function readMetadataArray(metadata: Json, key: string): Json[] {
  if (!isJsonRecord(metadata)) {
    return [];
  }

  const value = metadata[key];
  return Array.isArray(value) ? value : [];
}

function extractIdsFromPreviewList(items: Json[]): string[] {
  const ids: string[] = [];

  for (const item of items) {
    if (!isJsonRecord(item)) continue;

    const value = item.id;
    if (typeof value !== 'string' || value.length === 0) continue;
    ids.push(value);
  }

  return ids;
}

async function getJobFeedFeedbackMapAdmin(userId: string, jobIds: string[]): Promise<Map<string, JobFeedFeedback>> {
  if (jobIds.length === 0) {
    return new Map();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_feedback')
    .select('*')
    .eq('user_id', userId)
    .in('canonical_job_id', jobIds);

  if (error) {
    throw new Error(`Failed to load job feed feedback map: ${error.message}`);
  }

  const rows = (data ?? []) as JobFeedFeedback[];
  return new Map(rows.map((row) => [row.canonical_job_id, row]));
}

function toFeedItem(job: JobFeedCanonicalJob, feedback: JobFeedFeedback | null): JobFeedFeedItem {
  const sourceIdentifiers = isJsonRecord(job.source_identifiers) ? job.source_identifiers : {};

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location_text,
    workMode: job.work_mode,
    employmentType: job.employment_type,
    salaryText: job.salary_text,
    description: job.description,
    applyUrl: job.apply_url,
    sourceUrl: job.source_url,
    via: typeof sourceIdentifiers.via === 'string' ? sourceIdentifiers.via : null,
    freshnessDays: job.freshness_days,
    postedAtText: job.posted_at_text,
    fitLabel: null,
    pipelineStage: 'shortlisted',
    applyOptions: extractApplyOptions(sourceIdentifiers.apply_options),
    feedback: toJobFeedFeedbackState(feedback),
  };
}

function extractApplyOptions(value: Json | undefined): JobFeedFeedItem['applyOptions'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const options: JobFeedFeedItem['applyOptions'] = [];
  for (const item of value) {
    if (!isJsonRecord(item)) continue;

    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const link = typeof item.link === 'string' ? item.link.trim() : '';
    if (!title || !link) continue;

    options.push({ title, link });
  }

  return options;
}

function isJsonRecord(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildFallbackJobDescription(job: JobFeedCanonicalJob): string {
  const parts = [
    `${job.title} at ${job.company}`,
    job.location_text ? `Location: ${job.location_text}` : null,
    job.work_mode !== 'unknown' ? `Work mode: ${job.work_mode}` : null,
    job.employment_type ? `Employment type: ${job.employment_type}` : null,
    job.salary_text ? `Compensation: ${job.salary_text}` : null,
    job.posted_at_text ? `Posted: ${job.posted_at_text}` : null,
    job.apply_url ? `Apply URL: ${job.apply_url}` : job.source_url ? `Source URL: ${job.source_url}` : null,
  ].filter(Boolean);

  return parts.join('\n');
}

function buildWorkflowResultSummary(
  ingestion: {
    searchPlan: Array<unknown>;
    rawJobsFetched: number;
    canonicalJobs: Array<unknown>;
    duplicateCount: number;
    failedFetches: Array<{ error: string }>;
  },
  prefilter: JobFeedPrefilterResult,
  rankingPrep: JobFeedRankingPrepResult
): string {
  if (ingestion.rawJobsFetched === 0 && ingestion.failedFetches.length === 0) {
    return 'Phase 4 prefilter completed. The provider queries ran, but no jobs matched the current feed settings yet.';
  }

  const summary = `Phase 4 prefilter completed. ${ingestion.rawJobsFetched} raw jobs fetched across ${ingestion.searchPlan.length} queries, normalized into ${ingestion.canonicalJobs.length} canonical jobs, and ${prefilter.survivors.length} survived deterministic filters.`;

  if (rankingPrep.candidates.length > 0) {
    if (ingestion.failedFetches.length > 0) {
      return `${summary} ${rankingPrep.candidates.length} jobs are queued for Strong/Good ranking, and ${ingestion.failedFetches.length} provider fetches failed but the run completed with partial data.`;
    }

    if (ingestion.duplicateCount > 0) {
      return `${summary} ${rankingPrep.candidates.length} jobs are queued for Strong/Good ranking, and ${ingestion.duplicateCount} duplicate observations were collapsed into canonical records.`;
    }

    return `${summary} ${rankingPrep.candidates.length} jobs are queued for Strong/Good ranking.`;
  }

  if (ingestion.failedFetches.length > 0) {
    return `${summary} No jobs survived into the Strong/Good shortlist, and ${ingestion.failedFetches.length} provider fetches failed but the run completed with partial data.`;
  }

  if (ingestion.duplicateCount > 0) {
    return `${summary} No jobs survived into the Strong/Good shortlist, and ${ingestion.duplicateCount} duplicate observations were collapsed into canonical records.`;
  }

  return `${summary} No jobs survived into the Strong/Good shortlist yet.`;
}

function toJson(value: unknown): Json {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item));
  }

  if (typeof value === 'object') {
    const record: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value)) {
      record[key] = toJson(item);
    }
    return record;
  }

  return String(value);
}
