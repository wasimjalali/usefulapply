import { createAdminClient } from '@/lib/supabase/admin';
import type {
  ApplicationSession as SupabaseApplicationSession,
  JobFeedApplicationGeneration,
  JobFeedApplicationGenerationStatus,
  JobFeedGenerationStatus,
  JobFeedCanonicalJob,
  JobFeedFeedback,
  JobFeedRankedItem as SupabaseJobFeedRankedItem,
  JobFeedRun,
  JobFeedSettings,
  Json,
} from '@/lib/supabase/types';
import { getLocalDateKey, isJobFeedConfigured } from '@/lib/job-feed/helpers';
import { getJobFeedTierLimits, JOB_FEED_INBOX_RETENTION_DAYS } from '@/lib/job-feed/constants';
import type {
  JobFeedFeedbackAction,
  JobFeedFeedItem,
  JobFeedItemFeedbackState,
  JobFeedPrefilterResult,
  JobFeedRunDiagnostics,
  JobFeedRankedItemRecord,
  JobFeedRankedPreviewItem,
  JobFeedRankingExecutionResult,
  JobFeedRankingPrepResult,
  JobFeedRunWorkflowResult,
} from '@/lib/job-feed/types';
import { ingestJobFeedRunJobs } from '@/lib/job-feed/ingestion';
import { prepareJobFeedRankingCandidates, prefilterJobFeedJobs } from '@/lib/job-feed/prefilter';
import { rankJobFeedCandidates } from '@/lib/job-feed/ranking';
import { captureJobFeedEvent } from '@/lib/job-feed/analytics';
import { estimateTotalExperienceYears } from '@/lib/job-feed/cv-suggestions';
import {
  CAREER_PROFILE_SCHEMA_VERSION,
  isCurrentCareerProfile,
  type CareerProfile,
} from '@/lib/job-feed/career-profile';
import {
  computeSettingsHash,
  generateSearchStrategy,
  isCurrentSearchStrategy,
  SEARCH_STRATEGY_SCHEMA_VERSION,
  type SearchStrategy,
} from '@/lib/job-feed/search-strategy';
import type { StructuredCV } from '@/lib/types/cv-schema';

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
  | 'trigger_source'
>>;

const STALE_RUNNING_JOB_FEED_RUN_MS = 15 * 60 * 1000;

interface LatestJobFeedItemsResult {
  run: JobFeedRun | null;
  items: JobFeedFeedItem[];
}


export interface JobFeedGenerationStatusUpdateResult {
  session: Pick<SupabaseApplicationSession, 'id' | 'job_title' | 'company' | 'generation_status'>;
  feedback: JobFeedFeedback | null;
  generation: JobFeedApplicationGeneration;
}

export interface JobFeedApplicationGenerationIntentResult {
  generation: JobFeedApplicationGeneration;
  created: boolean;
  retried: boolean;
}

async function getUserSubscriptionTierAdmin(userId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();
  return data?.subscription_tier ?? 'plus';
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

export async function authorizeJobFeedJobActionAdmin(params: {
  userId: string;
  jobId: string;
  runId?: string | null;
}): Promise<{ job: JobFeedCanonicalJob; rankedItem: SupabaseJobFeedRankedItem } | null> {
  const { userId, jobId, runId } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;

  const loadRankedItem = async (preferredRunId?: string | null) => {
    let query = admin
      .from('job_feed_ranked_items')
      .select('*')
      .eq('user_id', userId)
      .eq('canonical_job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (preferredRunId) {
      query = query.eq('run_id', preferredRunId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`Failed to authorize job feed item: ${error.message}`);
    }
    return (data ?? null) as SupabaseJobFeedRankedItem | null;
  };

  const rankedItem = await loadRankedItem(runId) ?? await loadRankedItem(null);
  if (!rankedItem) {
    return null;
  }

  const job = await getJobFeedCanonicalJobAdmin(jobId);
  if (!job) {
    return null;
  }

  return { job, rankedItem };
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
      generation_status: 'pending',
      generation_completed: false,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create application session from feed item: ${error.message}`);
  }

  return data as SupabaseApplicationSession;
}

export async function createOrReuseJobFeedApplicationGenerationAdmin(params: {
  userId: string;
  jobId: string;
  rankedItem: SupabaseJobFeedRankedItem;
  applicationSessionId: string;
}): Promise<JobFeedApplicationGenerationIntentResult> {
  const { userId, jobId, rankedItem, applicationSessionId } = params;
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;

  const { data: existingRow, error: loadError } = await admin
    .from('job_feed_application_generations')
    .select('*')
    .eq('user_id', userId)
    .eq('canonical_job_id', jobId)
    .eq('application_session_id', applicationSessionId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load job feed application generation: ${loadError.message}`);
  }

  const existing = (existingRow ?? null) as JobFeedApplicationGeneration | null;
  if (existing) {
    if (existing.status === 'failed' || existing.status === 'cancelled' || existing.status === 'expired') {
      const nextAttempt = existing.attempt + 1;
      const { data: retriedRow, error: retryError } = await admin
        .from('job_feed_application_generations')
        .update({
          ranked_item_id: rankedItem.id,
          run_id: rankedItem.run_id,
          status: 'intent_created',
          attempt: nextAttempt,
          lease_owner: null,
          lease_expires_at: null,
          last_heartbeat_at: null,
          error_code: null,
          error_message: null,
          metadata: mergeMetadata(existing.metadata, {
            retry_requested_at: now,
            retry_previous_status: existing.status,
          }),
          intent_created_at: now,
          queued_at: null,
          started_at: null,
          completed_at: null,
          failed_at: null,
          cancelled_at: null,
          expired_at: null,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (retryError) {
        throw new Error(`Failed to retry job feed application generation: ${retryError.message}`);
      }

      const generation = retriedRow as JobFeedApplicationGeneration;
      await insertJobFeedApplicationGenerationEvent({
        generation,
        fromStatus: existing.status,
        toStatus: generation.status,
        transitionReason: 'retry_requested',
        metadata: {
          previous_attempt: existing.attempt,
        },
      });
      captureJobFeedEvent({
        distinctId: userId,
        event: 'job_feed_application_generation_transition',
        properties: {
          generation_id: generation.id,
          session_id: generation.application_session_id,
          job_id: generation.canonical_job_id,
          feed_run_id: generation.run_id,
          from_status: existing.status,
          to_status: generation.status,
          attempt: generation.attempt,
          transition_reason: 'retry_requested',
          has_error: false,
        },
      });
      await syncJobFeedGenerationReadModels({
        userId,
        sessionId: applicationSessionId,
        generation,
        errorMessage: null,
      });

      return { generation, created: false, retried: true };
    }

    return { generation: existing, created: false, retried: false };
  }

  const { data, error } = await admin
    .from('job_feed_application_generations')
    .insert({
      user_id: userId,
      canonical_job_id: jobId,
      ranked_item_id: rankedItem.id,
      run_id: rankedItem.run_id,
      application_session_id: applicationSessionId,
      status: 'intent_created',
      attempt: 1,
      metadata: {
        source: 'job_feed_apply',
      },
      intent_created_at: now,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create job feed application generation: ${error.message}`);
  }

  const generation = data as JobFeedApplicationGeneration;
  await insertJobFeedApplicationGenerationEvent({
    generation,
    fromStatus: null,
    toStatus: generation.status,
    transitionReason: 'apply_intent_created',
  });
  captureJobFeedEvent({
    distinctId: userId,
    event: 'job_feed_application_generation_transition',
    properties: {
      generation_id: generation.id,
      session_id: generation.application_session_id,
      job_id: generation.canonical_job_id,
      feed_run_id: generation.run_id,
      from_status: null,
      to_status: generation.status,
      attempt: generation.attempt,
      transition_reason: 'apply_intent_created',
      has_error: false,
    },
  });
  await syncJobFeedGenerationReadModels({
    userId,
    sessionId: applicationSessionId,
    generation,
    errorMessage: null,
  });

  return { generation, created: true, retried: false };
}

export async function updateJobFeedApplicationGenerationStatusAdmin(params: {
  userId: string;
  sessionId: string;
  generationId?: string | null;
  status: Exclude<JobFeedGenerationStatus, 'none' | 'pending'>;
  errorMessage?: string | null;
}): Promise<JobFeedGenerationStatusUpdateResult> {
  const { userId, sessionId, generationId = null, status, errorMessage = null } = params;
  const generationStatus = mapLegacyGenerationStatusToApplicationStatus(status);
  return transitionJobFeedApplicationGenerationAdmin({
    userId,
    sessionId,
    generationId,
    status: generationStatus,
    errorMessage,
    transitionReason: `client_reported_${status}`,
  });
}

export async function transitionJobFeedApplicationGenerationAdmin(params: {
  userId: string;
  sessionId?: string | null;
  generationId?: string | null;
  status: JobFeedApplicationGenerationStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  transitionReason?: string | null;
  metadata?: Record<string, Json>;
}): Promise<JobFeedGenerationStatusUpdateResult> {
  const {
    userId,
    sessionId = null,
    generationId = null,
    status,
    errorCode = null,
    errorMessage = null,
    transitionReason = null,
    metadata = {},
  } = params;
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added columns here.
  const admin = createAdminClient() as any;

  const generation = await getJobFeedApplicationGenerationForTransition({
    userId,
    generationId,
    sessionId,
  });

  if (!generation) {
    throw new Error('Application generation was not found for this account.');
  }

  if (generation.application_session_id !== sessionId && sessionId) {
    throw new Error('Application generation does not belong to this application session.');
  }

  if (!isJobFeedApplicationGenerationTransitionAllowed(generation.status, status)) {
    throw new Error(`Invalid job feed application generation transition: ${generation.status} -> ${status}`);
  }

  const statusChanged = generation.status !== status;
  const generationPatch: Record<string, Json | string | number | null> = {
    status,
    error_code: status === 'failed' || status === 'cancelled' || status === 'expired' ? errorCode : null,
    error_message: status === 'failed' || status === 'cancelled' || status === 'expired' ? errorMessage : null,
    metadata: mergeMetadata(generation.metadata, {
      ...metadata,
      last_transition_reason: transitionReason,
      last_transition_at: now,
    }),
    updated_at: now,
  };

  if (status === 'queued') {
    generationPatch.queued_at = generation.queued_at ?? now;
  } else if (status === 'running') {
    generationPatch.started_at = generation.started_at ?? now;
    generationPatch.last_heartbeat_at = now;
    generationPatch.lease_owner = 'chat_sse';
    generationPatch.lease_expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  } else if (status === 'succeeded') {
    generationPatch.completed_at = generation.completed_at ?? now;
    generationPatch.lease_owner = null;
    generationPatch.lease_expires_at = null;
    generationPatch.last_heartbeat_at = now;
  } else if (status === 'failed') {
    generationPatch.failed_at = now;
    generationPatch.lease_owner = null;
    generationPatch.lease_expires_at = null;
  } else if (status === 'cancelled') {
    generationPatch.cancelled_at = now;
    generationPatch.lease_owner = null;
    generationPatch.lease_expires_at = null;
  } else if (status === 'expired') {
    generationPatch.expired_at = now;
    generationPatch.lease_owner = null;
    generationPatch.lease_expires_at = null;
  }

  const { data, error } = await admin
    .from('job_feed_application_generations')
    .update(generationPatch)
    .eq('id', generation.id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to transition job feed application generation: ${error.message}`);
  }

  const updatedGeneration = data as JobFeedApplicationGeneration;
  if (statusChanged) {
    await insertJobFeedApplicationGenerationEvent({
      generation: updatedGeneration,
      fromStatus: generation.status,
      toStatus: status,
      transitionReason,
      errorCode,
      errorMessage,
      metadata,
    });
    captureJobFeedEvent({
      distinctId: userId,
      event: 'job_feed_application_generation_transition',
      logLevel: status === 'failed' || status === 'cancelled' || status === 'expired' ? 'warn' : 'info',
      properties: {
        generation_id: updatedGeneration.id,
        session_id: updatedGeneration.application_session_id,
        job_id: updatedGeneration.canonical_job_id,
        feed_run_id: updatedGeneration.run_id,
        from_status: generation.status,
        to_status: status,
        attempt: updatedGeneration.attempt,
        transition_reason: transitionReason,
        has_error: Boolean(errorMessage),
      },
    });
  }

  return syncJobFeedGenerationReadModels({
    userId,
    sessionId: updatedGeneration.application_session_id,
    generation: updatedGeneration,
    errorMessage,
  });
}

export async function expireStaleJobFeedApplicationGenerations(params?: {
  now?: Date;
  limit?: number;
}): Promise<{ expired: number; checkedAt: string }> {
  const now = params?.now ?? new Date();
  const checkedAt = now.toISOString();
  const limit = params?.limit ?? 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_application_generations')
    .select('*')
    .in('status', ['queued', 'running'])
    .not('lease_expires_at', 'is', null)
    .lt('lease_expires_at', checkedAt)
    .order('lease_expires_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load stale job feed application generations: ${error.message}`);
  }

  const staleGenerations = (data ?? []) as JobFeedApplicationGeneration[];
  let expired = 0;

  for (const generation of staleGenerations) {
    try {
      await transitionJobFeedApplicationGenerationAdmin({
        userId: generation.user_id,
        generationId: generation.id,
        sessionId: generation.application_session_id,
        status: 'expired',
        errorCode: 'lease_expired',
        errorMessage: 'Application generation expired after losing its running worker lease.',
        transitionReason: 'stale_generation_reconciler',
      });
      expired += 1;
    } catch (error) {
      console.error('[job-feed] failed to expire stale application generation:', generation.id, error);
    }
  }

  return { expired, checkedAt };
}

async function getJobFeedApplicationGenerationForTransition(params: {
  userId: string;
  generationId?: string | null;
  sessionId?: string | null;
}): Promise<JobFeedApplicationGeneration | null> {
  const { userId, generationId = null, sessionId = null } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  let query = admin
    .from('job_feed_application_generations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (generationId) {
    query = query.eq('id', generationId);
  } else if (sessionId) {
    query = query.eq('application_session_id', sessionId);
  } else {
    throw new Error('A generation ID or session ID is required.');
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to load job feed application generation: ${error.message}`);
  }

  return (data ?? null) as JobFeedApplicationGeneration | null;
}

async function syncJobFeedGenerationReadModels(params: {
  userId: string;
  sessionId: string;
  generation: JobFeedApplicationGeneration;
  errorMessage?: string | null;
}): Promise<JobFeedGenerationStatusUpdateResult> {
  const { userId, sessionId, generation, errorMessage = null } = params;
  const status = mapApplicationGenerationStatusToLegacyStatus(generation.status);
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added columns here.
  const admin = createAdminClient() as any;
  const sessionPatch: Record<string, Json | string | boolean | null> = {
    generation_status: status,
    generation_error: status === 'failed' || status === 'cancelled' ? generation.error_message ?? errorMessage : null,
    updated_at: now,
  };

  if (status === 'pending') {
    sessionPatch.generation_completed = false;
  } else if (status === 'running') {
    sessionPatch.generation_started_at = generation.started_at ?? now;
    sessionPatch.generation_completed = false;
  } else if (status === 'succeeded') {
    sessionPatch.generation_completed = true;
    sessionPatch.generation_completed_at = generation.completed_at ?? now;
  } else if (status === 'failed') {
    sessionPatch.generation_completed = false;
    sessionPatch.generation_failed_at = generation.failed_at ?? generation.expired_at ?? now;
  } else if (status === 'cancelled') {
    sessionPatch.generation_completed = false;
    sessionPatch.generation_cancelled_at = generation.cancelled_at ?? now;
  }

  const { data: updatedSession, error: sessionError } = await admin
    .from('application_sessions')
    .update(sessionPatch)
    .eq('user_id', userId)
    .eq('id', sessionId)
    .select('id, job_title, company, generation_status')
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Failed to update application generation status: ${sessionError.message}`);
  }

  if (!updatedSession) {
    throw new Error('Application session was not found for this account.');
  }

  const { data: existingFeedback, error: feedbackLoadError } = await admin
    .from('job_feed_feedback')
    .select('*')
    .eq('user_id', userId)
    .eq('application_session_id', sessionId)
    .maybeSingle();

  if (feedbackLoadError) {
    throw new Error(`Failed to load job feed feedback for generation status: ${feedbackLoadError.message}`);
  }

  if (!existingFeedback) {
    return {
      session: updatedSession as JobFeedGenerationStatusUpdateResult['session'],
      feedback: null,
      generation,
    };
  }

  const typedFeedback = existingFeedback as JobFeedFeedback;
  const feedbackPatch: Record<string, Json | string | null> = {
    generation_status: status,
    generation_error: status === 'failed' || status === 'cancelled' ? generation.error_message ?? errorMessage : null,
    metadata: mergeMetadata(typedFeedback.metadata ?? null, {
      application_generation_id: generation.id,
      application_generation_attempt: generation.attempt,
      application_generation_status: generation.status,
      generation_status: status,
      generation_status_at: now,
      generation_error: generation.error_message ?? errorMessage ?? null,
    }),
    updated_at: now,
  };

  if (status === 'pending') {
    feedbackPatch.apply_started_at = typedFeedback.apply_started_at ?? now;
    feedbackPatch.applied_at = null;
  } else if (status === 'running') {
    feedbackPatch.generation_started_at = typedFeedback.generation_started_at ?? generation.started_at ?? now;
  } else if (status === 'succeeded') {
    feedbackPatch.applied_at = typedFeedback.applied_at ?? generation.completed_at ?? now;
    feedbackPatch.generation_completed_at = typedFeedback.generation_completed_at ?? generation.completed_at ?? now;
  } else if (status === 'failed') {
    feedbackPatch.applied_at = null;
    feedbackPatch.generation_failed_at = generation.failed_at ?? generation.expired_at ?? now;
  } else if (status === 'cancelled') {
    feedbackPatch.applied_at = null;
    feedbackPatch.generation_cancelled_at = generation.cancelled_at ?? now;
  }

  const { error: feedbackError } = await admin
    .from('job_feed_feedback')
    .update(feedbackPatch)
    .eq('id', typedFeedback.id);

  if (feedbackError) {
    throw new Error(`Failed to update job feed generation feedback: ${feedbackError.message}`);
  }

  return {
    session: updatedSession as JobFeedGenerationStatusUpdateResult['session'],
    feedback: {
      ...typedFeedback,
      ...feedbackPatch,
    } as JobFeedFeedback,
    generation,
  };
}

async function insertJobFeedApplicationGenerationEvent(params: {
  generation: JobFeedApplicationGeneration;
  fromStatus: JobFeedApplicationGenerationStatus | null;
  toStatus: JobFeedApplicationGenerationStatus;
  transitionReason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, Json>;
}): Promise<void> {
  const {
    generation,
    fromStatus,
    toStatus,
    transitionReason = null,
    errorCode = null,
    errorMessage = null,
    metadata = {},
  } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from('job_feed_application_generation_events')
    .insert({
      generation_id: generation.id,
      user_id: generation.user_id,
      from_status: fromStatus,
      to_status: toStatus,
      attempt: generation.attempt,
      transition_reason: transitionReason,
      error_code: errorCode,
      error_message: errorMessage,
      metadata,
    });

  if (error) {
    throw new Error(`Failed to record job feed application generation event: ${error.message}`);
  }
}

function isJobFeedApplicationGenerationTransitionAllowed(
  from: JobFeedApplicationGenerationStatus,
  to: JobFeedApplicationGenerationStatus
): boolean {
  if (from === to) return true;

  const allowedTransitions: Record<JobFeedApplicationGenerationStatus, JobFeedApplicationGenerationStatus[]> = {
    intent_created: ['queued', 'running', 'failed', 'cancelled', 'expired'],
    queued: ['running', 'failed', 'cancelled', 'expired'],
    running: ['succeeded', 'failed', 'cancelled', 'expired'],
    succeeded: [],
    failed: ['intent_created'],
    cancelled: ['intent_created'],
    expired: ['intent_created'],
  };

  return allowedTransitions[from].includes(to);
}

function mapLegacyGenerationStatusToApplicationStatus(
  status: Exclude<JobFeedGenerationStatus, 'none' | 'pending'>
): JobFeedApplicationGenerationStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
  }
}

function mapApplicationGenerationStatusToLegacyStatus(
  status: JobFeedApplicationGenerationStatus
): JobFeedGenerationStatus {
  switch (status) {
    case 'intent_created':
    case 'queued':
      return 'pending';
    case 'running':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'expired':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
  }
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
  if (existing && isJobFeedbackBlocked(existing)) {
    if (existing.applied_at && action === 'apply_started' && existing.application_session_id) {
      return existing;
    }

    throw new Error('This job feed item has already reached a terminal state.');
  }

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
    case 'apply_started':
      basePatch.opened_at = existing?.opened_at ?? now;
      basePatch.apply_started_at = existing?.apply_started_at ?? now;
      basePatch.application_session_id = applicationSessionId ?? existing?.application_session_id ?? null;
      basePatch.generation_status = 'pending';
      basePatch.generation_error = null;
      basePatch.dismissed_at = null;
      break;
    case 'applied':
      basePatch.opened_at = existing?.opened_at ?? now;
      basePatch.applied_at = existing?.applied_at ?? now;
      basePatch.application_session_id = applicationSessionId ?? existing?.application_session_id ?? null;
      basePatch.dismissed_at = null;
      break;
    case 'rated_helpful':
      // Match-quality rating — persisted inside metadata so the ranker can
      // consume it later without another schema migration. The row still
      // needs a signal column set for the has_signal_check constraint; reuse
      // opened_at since rating implies the job was viewed.
      basePatch.opened_at = existing?.opened_at ?? now;
      metadataPatch.match_rating = 'helpful';
      metadataPatch.match_rating_at = now;
      basePatch.metadata = mergeMetadata(existing?.metadata ?? null, metadataPatch);
      break;
    case 'rated_not_relevant':
      basePatch.opened_at = existing?.opened_at ?? now;
      metadataPatch.match_rating = 'not_relevant';
      metadataPatch.match_rating_at = now;
      basePatch.metadata = mergeMetadata(existing?.metadata ?? null, metadataPatch);
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

  // Ratings imply the user saw the job, so we stamp opened_at to satisfy the
  // has_signal_check constraint. The rating itself lives in metadata.
  const isRatingAction = action === 'rated_helpful' || action === 'rated_not_relevant';
  if (isRatingAction) {
    metadataPatch.match_rating = action === 'rated_helpful' ? 'helpful' : 'not_relevant';
    metadataPatch.match_rating_at = now;
  }

  const insertPayload = {
    user_id: userId,
    canonical_job_id: jobId,
    latest_run_id: latestRunId,
    application_session_id: action === 'applied' || action === 'apply_started' ? applicationSessionId : null,
    opened_at: action === 'opened' || action === 'applied' || action === 'apply_started' || isRatingAction ? now : null,
    saved_at: action === 'saved' ? now : null,
    dismissed_at: action === 'dismissed' ? now : null,
    apply_started_at: action === 'apply_started' ? now : null,
    applied_at: action === 'applied' ? now : null,
    generation_status: action === 'apply_started' ? 'pending' : 'none',
    generation_error: null,
    metadata: mergeMetadata(null, metadataPatch),
  };

  const { data, error } = await admin
    .from('job_feed_feedback')
    .upsert(insertPayload, { onConflict: 'user_id,canonical_job_id' })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to insert job feed feedback: ${error.message}`);
  }

  return data as JobFeedFeedback;
}

export function toJobFeedFeedbackState(feedback: JobFeedFeedback | null): JobFeedItemFeedbackState {
  const metadata = (feedback?.metadata ?? null) as Record<string, unknown> | null;
  const rawRating = metadata && typeof metadata === 'object' ? metadata['match_rating'] : null;
  const matchRating =
    rawRating === 'helpful' || rawRating === 'not_relevant' ? rawRating : null;

  return {
    openedAt: feedback?.opened_at ?? null,
    savedAt: feedback?.saved_at ?? null,
    dismissedAt: feedback?.dismissed_at ?? null,
    applyStartedAt: feedback?.apply_started_at ?? null,
    appliedAt: feedback?.applied_at ?? null,
    applicationSessionId: feedback?.application_session_id ?? null,
    generationStatus: feedback?.generation_status ?? 'none',
    generationError: feedback?.generation_error ?? null,
    matchRating,
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

  const inboxItems = await listRecentJobFeedInboxItemsAdmin({
    userId: params.userId,
    latestCompletedRun: run,
  });
  if (inboxItems.length > 0) {
    return {
      run,
      items: inboxItems,
    };
  }

  const rankedRows = await listJobFeedRankedItemsForRunAdmin(run.id);
  if (rankedRows.length > 0) {
    return {
      run,
      items: await buildFeedItemsForSnapshot({
        userId: params.userId,
        rankedPreview: rankedRows.map(toRankedPreviewItem),
      }),
    };
  }

  const rankedPreview = extractRankedPreviewItems(run.metadata);
  if (hasMetadataKey(run.metadata, 'ranked_preview_jobs')) {
    return {
      run,
      items: await buildFeedItemsForSnapshot({
        userId: params.userId,
        rankedPreview,
      }),
    };
  }

  const jobIds = extractFeedJobIds(run.metadata);
  const items = await buildFeedItemsForSnapshot({
    userId: params.userId,
    jobIds,
  });

  return {
    run,
    items,
  };
}

async function listRecentJobFeedInboxItemsAdmin(params: {
  userId: string;
  latestCompletedRun: JobFeedRun;
}): Promise<JobFeedFeedItem[]> {
  const { rows } = await loadDedupedInboxRows({
    userId: params.userId,
    latestCompletedRun: params.latestCompletedRun,
  });

  return buildFeedItemsForSnapshot({
    userId: params.userId,
    rankedPreview: rows.map(toRankedPreviewItem),
  });
}

/**
 * Build the full 7-day inbox row list once (ordered: today first, then older
 * days, deduped by canonical_job_id, with jobs the user has already
 * applied / dismissed / rated not relevant removed). Returned rows are the
 * authoritative ordering the UI paginates through; callers supply
 * offset/limit when rendering pages.
 *
 * We must strip blocked jobs *before* slicing. If we filter later, the
 * totalCount and hasMore flags include rows the UI never renders, so Load
 * More can return an empty page even when totalCount > visible count.
 */
async function loadDedupedInboxRows(params: {
  userId: string;
  latestCompletedRun: JobFeedRun;
}): Promise<{ rows: SupabaseJobFeedRankedItem[]; totalCount: number }> {
  const since = new Date(Date.now() - JOB_FEED_INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand joined ranked feed rows.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_ranked_items')
    .select(`
      *,
      job_feed_runs!inner(id, user_id, status, completed_at, created_at)
    `)
    .eq('user_id', params.userId)
    .eq('job_feed_runs.user_id', params.userId)
    .eq('job_feed_runs.status', 'completed')
    .gte('job_feed_runs.completed_at', since)
    .order('created_at', { referencedTable: 'job_feed_runs', ascending: false })
    .order('rank_position', { ascending: true });

  if (error) {
    if (isMissingRankedItemsRelationError(error)) {
      return { rows: [], totalCount: 0 };
    }

    throw new Error(`Failed to load recent job feed inbox items: ${error.message}`);
  }

  const olderRows = ((data ?? []) as SupabaseJobFeedRankedItem[])
    .filter((row) => row.run_id !== params.latestCompletedRun.id);
  const todayRows = await listJobFeedRankedItemsForRunAdmin(params.latestCompletedRun.id);

  const seenJobIds = new Set<string>();
  const dedupedRows = [...todayRows, ...olderRows].filter((row) => {
    if (seenJobIds.has(row.canonical_job_id)) return false;
    seenJobIds.add(row.canonical_job_id);
    return true;
  });

  // Exclude jobs the user has already acted on (applied / dismissed /
  // rated not relevant). Keeps the inbox focused on roles the user has
  // yet to decide on.
  const blockedIds = await getBlockedCanonicalJobIdsAdmin(params.userId);
  const visibleRows = blockedIds.size > 0
    ? dedupedRows.filter((row) => !blockedIds.has(row.canonical_job_id))
    : dedupedRows;

  return { rows: visibleRows, totalCount: visibleRows.length };
}

/**
 * Server-paginated inbox page. Used by /api/job-feed/inbox so the UI can
 * "Load more" without the overview payload having to carry every row.
 *
 * `todayCount` is how many *visible* jobs came from today's run; the UI
 * pairs it with the unfiltered today count (from latestRun.ranked_jobs_count)
 * to render "N new jobs today · M from earlier days".
 */
export async function listJobFeedInboxPageAdmin(params: {
  userId: string;
  offset: number;
  limit: number;
}): Promise<{
  items: JobFeedFeedItem[];
  totalCount: number;
  hasMore: boolean;
  todayVisibleCount: number;
  backlogVisibleCount: number;
} | null> {
  const latestCompletedRun = await getLatestCompletedJobFeedRunAdmin(params.userId);
  if (!latestCompletedRun) {
    return { items: [], totalCount: 0, hasMore: false, todayVisibleCount: 0, backlogVisibleCount: 0 };
  }

  const { rows, totalCount } = await loadDedupedInboxRows({
    userId: params.userId,
    latestCompletedRun,
  });

  // "Today" must be the user's local day, not just "the latest completed
  // run." If the user hasn't refreshed in a few days, the latest run is
  // yesterday's or older — those visible jobs belong in the backlog, not
  // the today bucket.
  const settings = await getJobFeedSettingsAdmin(params.userId);
  const userTz = settings?.user_timezone ?? 'UTC';
  const todayKey = getLocalDateKey(new Date(), userTz);
  const latestRunIsToday = latestCompletedRun.local_date === todayKey;

  const todayVisibleCount = latestRunIsToday
    ? rows.filter((row) => row.run_id === latestCompletedRun.id).length
    : 0;
  const backlogVisibleCount = totalCount - todayVisibleCount;

  const offset = Math.max(0, Math.floor(params.offset));
  const limit = Math.max(1, Math.min(50, Math.floor(params.limit)));
  const pageRows = rows.slice(offset, offset + limit);

  const items = await buildFeedItemsForSnapshot({
    userId: params.userId,
    rankedPreview: pageRows.map(toRankedPreviewItem),
  });

  return {
    items,
    totalCount,
    hasMore: offset + pageRows.length < totalCount,
    todayVisibleCount,
    backlogVisibleCount,
  };
}

/**
 * Return canonical jobs the user has saved (saved_at IS NOT NULL) and has NOT
 * since rejected (applied / dismissed / rated_not_relevant). Ordered by
 * saved_at DESC so the most recently saved item appears first. Used by the
 * "Saved jobs" view inside the Job Feed panel.
 */
export async function listSavedJobFeedItemsAdmin(params: {
  userId: string;
}): Promise<JobFeedFeedItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand job_feed_feedback here.
  const admin = createAdminClient() as any;

  const { data: feedbackRows, error: feedbackError } = await admin
    .from('job_feed_feedback')
    .select('*')
    .eq('user_id', params.userId)
    .not('saved_at', 'is', null)
    .order('saved_at', { ascending: false });

  if (feedbackError) {
    throw new Error(`Failed to load saved job feed items: ${feedbackError.message}`);
  }

  const typedRows = ((feedbackRows ?? []) as JobFeedFeedback[])
    .filter((row) => !isJobFeedbackBlocked(row));

  if (typedRows.length === 0) {
    return [];
  }

  const jobIds = typedRows.map((row) => row.canonical_job_id);

  const { data: jobRows, error: jobsError } = await admin
    .from('job_feed_canonical_jobs')
    .select('*')
    .in('id', jobIds);

  if (jobsError) {
    throw new Error(`Failed to load saved canonical jobs: ${jobsError.message}`);
  }

  const jobsById = new Map(
    ((jobRows ?? []) as JobFeedCanonicalJob[]).map((row) => [row.id, row])
  );

  // Preserve the saved_at DESC order from the feedback query.
  return typedRows
    .map((row) => {
      const job = jobsById.get(row.canonical_job_id);
      if (!job) return null;
      return toFeedItem(job, row);
    })
    .filter((item): item is JobFeedFeedItem => item !== null);
}

export function getJobFeedRunDiagnostics(run: JobFeedRun | null): JobFeedRunDiagnostics | null {
  if (!run) {
    return null;
  }

  const metadata = isJsonRecord(run.metadata) ? run.metadata : {};
  const rankingStatus = readRankingStatus(metadata.ranking_status);
  const rankingModel = isJsonRecord(metadata.ranking_model) ? metadata.ranking_model : null;
  const rankingInputTokens = readNumericJsonValue(rankingModel?.input_tokens);
  const rankingOutputTokens = readNumericJsonValue(rankingModel?.output_tokens);
  const rankingLatencyMs = readNumericJsonValue(rankingModel?.latency_ms);
  const orchestrator = metadata.orchestrator === 'inngest' ? 'inngest' : 'direct';
  const rankingEstimatedCostUsd = rankingInputTokens !== null && rankingOutputTokens !== null
    ? estimateJobFeedRankingCost(rankingInputTokens, rankingOutputTokens, rankingModel)
    : null;

  return {
    orchestrator,
    rankingStatus,
    rankingSource: inferRankingSource(rankingStatus),
    rankingInputTokens,
    rankingOutputTokens,
    rankingLatencyMs,
    rankingEstimatedCostUsd,
    canonicalJobsCount: readNumericJsonValue(metadata.canonical_jobs_count),
    prefilterSurvivorsCount: readNumericJsonValue(metadata.prefilter_survivors_count),
    rankingCandidateCount: readNumericJsonValue(metadata.ranking_candidate_count),
    rankedJobsCount: run.ranked_jobs_count ?? null,
    duplicateCount: readNumericJsonValue(metadata.duplicate_count) ?? 0,
    failedFetchCount: Array.isArray(metadata.failed_fetches)
      ? metadata.failed_fetches.length
      : readNumericJsonValue(metadata.failed_fetch_count) ?? 0,
    rankedItemsMaterialized: typeof metadata.ranked_items_materialized === 'boolean'
      ? metadata.ranked_items_materialized
      : null,
  };
}

export async function getLatestCompletedJobFeedRunAdmin(userId: string): Promise<JobFeedRun | null> {
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

// The 24h "Run for today" cooldown is driven only by runs the user kicked
// off themselves. Scheduled/system runs must not lock the manual button.
export const MANUAL_JOB_FEED_TRIGGER_SOURCES = [
  'manual_user',
  'manual_debug',
  'manual_debug_force',
] as const;

export async function getLatestManualCompletedJobFeedRunAdmin(userId: string): Promise<JobFeedRun | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('trigger_source', MANUAL_JOB_FEED_TRIGGER_SOURCES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load latest manual job feed run: ${error.message}`);
  }

  return (data ?? null) as JobFeedRun | null;
}

export function isJobFeedRunStaleRunning(run: JobFeedRun | null, now: Date = new Date()): boolean {
  if (!run || run.status !== 'running') return false;
  return isStaleJobFeedRun(run, now);
}

export async function runJobFeedFoundationWorkflow(params: {
  userId: string;
  triggerSource?: string;
  now?: Date;
  force?: boolean;
  orchestrator?: JobFeedRunDiagnostics['orchestrator'];
}): Promise<JobFeedRunWorkflowResult> {
  const { userId, triggerSource = 'scheduled', now = new Date(), force = false, orchestrator = 'direct' } = params;
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

  if (existingRun?.status === 'completed' && !force) {
    captureJobFeedRunIdempotencyConflict({
      userId,
      run: existingRun,
      localDate,
      triggerSource,
      force,
      reason: 'completed_run_exists',
    });
    return { run: existingRun, created: false, skipped: true };
  }

  if (existingRun?.status === 'running') {
    const isStaleRunningRun = isStaleJobFeedRun(existingRun, now);

    if (!force || !isStaleRunningRun) {
      captureJobFeedRunIdempotencyConflict({
        userId,
        run: existingRun,
        localDate,
        triggerSource,
        force,
        reason: force ? 'running_run_blocks_force' : 'running_run_exists',
      });

      if (force) {
        throw new Error('Cannot force-rerun a job feed run while it is still running.');
      }

      return { run: existingRun, created: false, skipped: true };
    }

    captureJobFeedRunIdempotencyConflict({
      userId,
      run: existingRun,
      localDate,
      triggerSource,
      force,
      reason: 'stale_running_run_force_reset',
    });
    await resetJobFeedRunArtifactsForRerun(existingRun.id);
  }

  if (force && existingRun && existingRun.status !== 'running') {
    await resetJobFeedRunArtifactsForRerun(existingRun.id);
  }

  const run = existingRun ?? await createJobFeedRun({
    user_id: userId,
    local_date: localDate,
    local_timezone: settings.user_timezone,
    delivery_hour_local: settings.delivery_hour_local,
    trigger_source: triggerSource,
    idempotency_key: `${userId}:${localDate}`,
    settings_snapshot: settings as unknown as Json,
    metadata: {
      stage: 'phase_4_ranking',
      foundation_mode: true,
      target_market: settings.target_market,
      orchestrator,
    },
  });

  let runningRun = await updateJobFeedRun(run.id, {
    status: 'running',
    // When a force-rerun reclaims an existing row (e.g. a user clicking
    // "Run for today" over yesterday's scheduled row), promote the row's
    // trigger_source so the manual-run cooldown helper sees it.
    trigger_source: triggerSource,
    started_at: new Date().toISOString(),
    completed_at: null,
    error_message: null,
    result_summary: null,
    metadata: mergeMetadata(run.metadata, {
      stage: 'phase_4_ranking',
      foundation_mode: true,
      last_trigger_source: triggerSource,
      orchestrator,
    }),
  });

  try {
    const subscriptionTier = await getUserSubscriptionTierAdmin(userId);
    const tierLimits = getJobFeedTierLimits(subscriptionTier);

    // Resolve the AI search strategy ahead of ingestion. Falls back to
    // the legacy deterministic planner when no profile / no strategy
    // exists (free tier, paid users on first run before profile sync).
    const careerProfileForStrategy = await getUserCareerProfileAdmin(userId);
    const searchStrategy = await loadOrGenerateSearchStrategyAdmin({
      userId,
      settings,
      profile: careerProfileForStrategy,
    });

    const ingestion = await ingestJobFeedRunJobs({
      runId: run.id,
      userId,
      settings,
      maxQueries: tierLimits.maxDailyQueries,
      maxRawJobs: tierLimits.maxRawJobsPerRun,
      strategy: searchStrategy,
    });

    if (ingestion.rawJobsFetched === 0 && ingestion.failedFetches.length === ingestion.searchPlan.length && ingestion.searchPlan.length > 0) {
      throw new Error('All job feed provider fetches failed for this run.');
    }

    // Exclude canonical jobs the user has already applied to, dismissed, or
    // rated "not relevant" — no point ranking rows the user has already
    // rejected. Keeps the feed fresh and saves LLM budget.
    const blockedIds = await getBlockedCanonicalJobIdsAdmin(userId);
    const rankableJobs = blockedIds.size > 0
      ? ingestion.canonicalJobs.filter((job) => !blockedIds.has(job.id))
      : ingestion.canonicalJobs;

    const prefilter = prefilterJobFeedJobs({
      settings,
      jobs: rankableJobs,
      hardCap: tierLimits.prefilterHardCap,
    });

    // Feed the FULL survivor set to the LLM ranker (not the shortlist cap).
    // Quality > cost: LLM reading 40 descriptions finds better matches than
    // a deterministic-score shortlist of 15 ever could, and the token cost
    // is trivial at our scale. Deterministic shortlist stays wired to the
    // fallback path inside the ranker for the case where the LLM fails.
    const rankingPrep = prepareJobFeedRankingCandidates({
      settings,
      jobs: prefilter.survivors,
    });
    const yearsExperience = await getUserYearsExperienceAdmin(userId);
    const rankingResult = await rankJobFeedCandidates({
      settings,
      candidates: rankingPrep.candidates,
      visibleCap: tierLimits.visibleCount,
      yearsExperience,
      careerProfile: careerProfileForStrategy,
    });
    const rankedPreviewItems = rankingResult.items.map(toRankedPreviewRecord);
    const materializedRanking = await persistJobFeedRankedItemsForRunAdmin({
      runId: run.id,
      userId,
      items: rankingResult.items,
    });

    runningRun = await updateJobFeedRun(run.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
      result_summary: buildWorkflowResultSummary(ingestion, prefilter, rankingPrep, rankingResult),
      raw_jobs_fetched: ingestion.rawJobsFetched,
      jobs_after_prefilter: prefilter.survivors.length,
      ranked_jobs_count: rankingResult.items.length,
      metadata: mergeMetadata(runningRun.metadata, {
        stage: 'phase_4_ranking',
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
        ranking_status: rankingResult.status,
        ranking_error: rankingResult.errorMessage,
        ranking_model: rankingResult.model
          ? toJson({
              provider: rankingResult.model.provider,
              name: rankingResult.model.name,
              input_tokens: rankingResult.model.inputTokens,
              output_tokens: rankingResult.model.outputTokens,
              latency_ms: rankingResult.model.latencyMs,
            })
          : null,
        ranked_preview_jobs: toJson(rankedPreviewItems),
        ranked_items_materialized: materializedRanking,
      }),
    });

    return {
      run: runningRun,
      created: !existingRun,
      skipped: false,
      forced: force,
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
  settings_snapshot?: Json | null;
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

async function resetJobFeedRunArtifactsForRerun(runId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { error: rawFetchDeleteError } = await admin
    .from('job_feed_raw_fetches')
    .delete()
    .eq('run_id', runId);

  if (rawFetchDeleteError) {
    throw new Error(`Failed to clear job feed raw fetches for rerun: ${rawFetchDeleteError.message}`);
  }

  const { error: rankedDeleteError } = await admin
    .from('job_feed_ranked_items')
    .delete()
    .eq('run_id', runId);

  if (rankedDeleteError && !isMissingRankedItemsRelationError(rankedDeleteError)) {
    throw new Error(`Failed to clear ranked job feed items for rerun: ${rankedDeleteError.message}`);
  }
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

function isStaleJobFeedRun(run: JobFeedRun, now: Date): boolean {
  const referenceTime = run.started_at ?? run.created_at;
  const timestamp = referenceTime ? Date.parse(referenceTime) : Number.NaN;
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return now.getTime() - timestamp > STALE_RUNNING_JOB_FEED_RUN_MS;
}

async function buildFeedItemsForSnapshot(params: {
  userId: string;
  rankedPreview?: JobFeedRankedPreviewItem[];
  jobIds?: string[];
}): Promise<JobFeedFeedItem[]> {
  const rankedPreview = params.rankedPreview ?? [];
  const orderedJobIds = rankedPreview.length > 0
    ? rankedPreview.map((item) => item.id)
    : params.jobIds ?? [];

  if (orderedJobIds.length === 0) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_canonical_jobs')
    .select('*')
    .in('id', orderedJobIds);

  if (error) {
    throw new Error(`Failed to load latest job feed items: ${error.message}`);
  }

  const rows = (data ?? []) as JobFeedCanonicalJob[];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const feedbackByJobId = await getJobFeedFeedbackMapAdmin(params.userId, orderedJobIds);
  const rankedPreviewById = new Map(rankedPreview.map((item) => [item.id, item]));

  return orderedJobIds
    .map((jobId) => rowsById.get(jobId))
    .filter((job): job is JobFeedCanonicalJob => Boolean(job))
    .filter((job) => !isJobFeedbackBlocked(feedbackByJobId.get(job.id)))
    .map((job) => {
      const rankedItem = rankedPreviewById.get(job.id);

      return toFeedItem(
        job,
        feedbackByJobId.get(job.id) ?? null,
        rankedItem
          ? {
              fitLabel: rankedItem.fitLabel,
              pipelineStage: 'ranked',
              rankingSource: rankedItem.rankingSource,
            }
          : undefined
      );
    });
}

function extractFeedJobIds(metadata: Json): string[] {
  const rankedIds = extractIdsFromPreviewList(readMetadataArray(metadata, 'ranked_preview_jobs'));
  if (hasMetadataKey(metadata, 'ranked_preview_jobs')) {
    return rankedIds;
  }

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

function hasMetadataKey(metadata: Json, key: string): boolean {
  return isJsonRecord(metadata) && key in metadata;
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

function extractRankedPreviewItems(metadata: Json): JobFeedRankedPreviewItem[] {
  const items = readMetadataArray(metadata, 'ranked_preview_jobs');
  const previewItems: JobFeedRankedPreviewItem[] = [];

  for (const item of items) {
    if (!isJsonRecord(item)) continue;

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const fitLabel = item.fitLabel;
    const rankingSource = item.rankingSource;
    const rank = typeof item.rank === 'number' && Number.isInteger(item.rank) && item.rank > 0
      ? item.rank
      : null;

    if (!id || rank === null) continue;
    if (fitLabel !== 'strong' && fitLabel !== 'good') continue;
    if (rankingSource !== 'deterministic' && rankingSource !== 'llm') continue;

    previewItems.push({
      id,
      rank,
      fitLabel,
      rankingSource,
      reason: typeof item.reason === 'string' && item.reason.trim().length > 0 ? item.reason.trim() : null,
    });
  }

  previewItems.sort((left, right) => left.rank - right.rank);
  return previewItems;
}

async function listJobFeedRankedItemsForRunAdmin(runId: string): Promise<SupabaseJobFeedRankedItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_ranked_items')
    .select('*')
    .eq('run_id', runId)
    .order('rank_position', { ascending: true });

  if (error) {
    if (isMissingRankedItemsRelationError(error)) {
      return [];
    }

    throw new Error(`Failed to load ranked job feed items: ${error.message}`);
  }

  return (data ?? []) as SupabaseJobFeedRankedItem[];
}

async function persistJobFeedRankedItemsForRunAdmin(params: {
  runId: string;
  userId: string;
  items: JobFeedRankedItemRecord[];
}): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { error: deleteError } = await admin
    .from('job_feed_ranked_items')
    .delete()
    .eq('run_id', params.runId);

  if (deleteError) {
    if (isMissingRankedItemsRelationError(deleteError)) {
      return false;
    }

    throw new Error(`Failed to clear ranked job feed items: ${deleteError.message}`);
  }

  if (params.items.length === 0) {
    return true;
  }

  const insertPayload = params.items.map((item) => ({
    run_id: params.runId,
    user_id: params.userId,
    canonical_job_id: item.canonicalJobId,
    rank_position: item.rank,
    fit_label: item.fitLabel,
    ranking_source: item.rankingSource,
    reason: item.reason,
    deterministic_score: item.deterministicScore,
    metadata: {},
  }));

  const { error: insertError } = await admin
    .from('job_feed_ranked_items')
    .insert(insertPayload);

  if (insertError) {
    if (isMissingRankedItemsRelationError(insertError)) {
      return false;
    }

    throw new Error(`Failed to persist ranked job feed items: ${insertError.message}`);
  }

  return true;
}

function toRankedPreviewItem(item: SupabaseJobFeedRankedItem): JobFeedRankedPreviewItem {
  return {
    id: item.canonical_job_id,
    rank: item.rank_position,
    fitLabel: item.fit_label,
    rankingSource: item.ranking_source,
    reason: item.reason,
  };
}

function toRankedPreviewRecord(item: JobFeedRankedItemRecord): JobFeedRankedPreviewItem {
  return {
    id: item.canonicalJobId,
    rank: item.rank,
    fitLabel: item.fitLabel,
    rankingSource: item.rankingSource,
    reason: item.reason,
  };
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

/**
 * A job is "blocked" from the visible feed when the user has taken a definitive
 * negative/terminal action on it: applied, dismissed, or rated not relevant.
 * Applied jobs belong on the Tracker; dismissed and not-relevant jobs should
 * never resurface — the ranker also consumes this signal to avoid re-ranking
 * them in future runs.
 */
export function isJobFeedbackBlocked(feedback: JobFeedFeedback | null | undefined): boolean {
  if (!feedback) return false;
  if (feedback.applied_at || feedback.generation_status === 'succeeded') return true;
  if (feedback.dismissed_at) return true;
  const metadata = (feedback.metadata ?? null) as Record<string, unknown> | null;
  if (metadata && typeof metadata === 'object' && metadata.match_rating === 'not_relevant') {
    return true;
  }
  return false;
}

/**
 * Return the set of canonical_job_ids the user has taken a terminal action on
 * (applied / dismissed / rated not relevant). Used to exclude jobs from
 * ranking so we don't burn LLM budget re-ranking rows the user already
 * rejected, and so they don't re-appear in tomorrow's feed after re-ingestion.
 */
export async function getBlockedCanonicalJobIdsAdmin(userId: string): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand job_feed_feedback here.
  const admin = createAdminClient() as any;
  // `or` covers the three column-based terminal states: applied_at (direct
  // apply or successful generation), dismissed_at, and generation_status =
  // 'succeeded' (belt-and-suspenders in case applied_at was not written).
  const { data, error } = await admin
    .from('job_feed_feedback')
    .select('canonical_job_id, applied_at, dismissed_at, generation_status, metadata')
    .eq('user_id', userId)
    .or('applied_at.not.is.null,dismissed_at.not.is.null,generation_status.eq.succeeded');

  if (error) {
    throw new Error(`Failed to load blocked job feed canonical ids: ${error.message}`);
  }

  const blocked = new Set<string>();
  for (const row of (data ?? []) as Array<Pick<JobFeedFeedback, 'canonical_job_id' | 'applied_at' | 'dismissed_at' | 'generation_status' | 'metadata'>>) {
    if (isJobFeedbackBlocked(row as JobFeedFeedback)) {
      blocked.add(row.canonical_job_id);
    }
  }

  // The `or` filter above covers column-based terminal states. Do a
  // second query for rated_not_relevant which lives in metadata (no
  // column predicate), then merge.
  const { data: ratedData, error: ratedError } = await admin
    .from('job_feed_feedback')
    .select('canonical_job_id, applied_at, dismissed_at, metadata')
    .eq('user_id', userId)
    .contains('metadata', { match_rating: 'not_relevant' });

  if (ratedError) {
    // Non-fatal — just log and continue with what we have.
    console.error('[job-feed] not-relevant exclusion query failed:', ratedError.message);
    return blocked;
  }

  for (const row of (ratedData ?? []) as Array<Pick<JobFeedFeedback, 'canonical_job_id' | 'applied_at' | 'dismissed_at' | 'metadata'>>) {
    blocked.add(row.canonical_job_id);
  }

  return blocked;
}

function toFeedItem(
  job: JobFeedCanonicalJob,
  feedback: JobFeedFeedback | null,
  ranking?: {
    fitLabel: JobFeedFeedItem['fitLabel'];
    pipelineStage: JobFeedFeedItem['pipelineStage'];
    rankingSource: JobFeedFeedItem['rankingSource'];
  }
): JobFeedFeedItem {
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
    fitLabel: ranking?.fitLabel ?? null,
    pipelineStage: ranking?.pipelineStage ?? 'shortlisted',
    rankingSource: ranking?.rankingSource ?? null,
    applyOptions: extractApplyOptions(sourceIdentifiers.apply_options, job),
    feedback: toJobFeedFeedbackState(feedback),
  };
}

function extractApplyOptions(value: Json | undefined, job: JobFeedCanonicalJob): JobFeedFeedItem['applyOptions'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const options: JobFeedFeedItem['applyOptions'] = [];
  for (const item of value) {
    if (!isJsonRecord(item)) continue;

    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const link = typeof item.link === 'string' ? item.link.trim() : '';
    if (!title) continue;
    if (!isSafeExternalUrl(link)) {
      captureJobFeedEvent({
        event: 'job_feed_unsafe_external_link_dropped',
        logLevel: 'warn',
        properties: {
          job_id: job.id,
          company: job.company,
          title: job.title,
          link_protocol: readUrlProtocol(link),
          link_length: link.length,
        },
      });
      continue;
    }

    options.push({ title, link });
  }

  return options;
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function readUrlProtocol(value: string): string | null {
  try {
    return new URL(value).protocol.replace(':', '') || null;
  } catch {
    const separatorIndex = value.indexOf(':');
    return separatorIndex > 0 ? value.slice(0, separatorIndex).toLowerCase() : null;
  }
}

function captureJobFeedRunIdempotencyConflict(params: {
  userId: string;
  run: JobFeedRun;
  localDate: string;
  triggerSource: string;
  force: boolean;
  reason: string;
}): void {
  captureJobFeedEvent({
    distinctId: params.userId,
    event: 'job_feed_run_idempotency_conflict',
    logLevel: 'warn',
    properties: {
      run_id: params.run.id,
      run_status: params.run.status,
      local_date: params.localDate,
      trigger_source: params.triggerSource,
      force: params.force,
      reason: params.reason,
    },
  });
}

function isJsonRecord(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumericJsonValue(value: Json | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRankingStatus(value: Json | undefined): JobFeedRankingExecutionResult['status'] | null {
  if (
    value === 'completed_llm'
    || value === 'completed_deterministic'
    || value === 'llm_failed_fallback'
    || value === 'no_candidates'
  ) {
    return value;
  }

  return null;
}

function inferRankingSource(
  status: JobFeedRankingExecutionResult['status'] | null
): JobFeedRunDiagnostics['rankingSource'] {
  switch (status) {
    case 'completed_llm':
      return 'llm';
    case 'completed_deterministic':
    case 'llm_failed_fallback':
      return 'deterministic';
    default:
      return null;
  }
}

function isMissingRankedItemsRelationError(error: { code?: string; message?: string }): boolean {
  const message = (error.message ?? '').toLowerCase();
  return error.code === '42P01'
    || (message.includes('job_feed_ranked_items') && message.includes('does not exist'));
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
  rankingPrep: JobFeedRankingPrepResult,
  rankingResult: JobFeedRankingExecutionResult
): string {
  if (ingestion.rawJobsFetched === 0 && ingestion.failedFetches.length === 0) {
    return 'Karko checked the current searches, but no jobs matched these settings yet.';
  }

  const summary = `Karko found ${ingestion.rawJobsFetched} job observations across ${ingestion.searchPlan.length} searches and narrowed them to ${prefilter.survivors.length} roles that matched the current filter.`;
  const operationalTail = buildWorkflowOperationalTail(ingestion);

  if (rankingPrep.candidates.length === 0) {
    return `${summary} Nothing stayed strong enough to reach the final shortlist.${operationalTail}`;
  }

  if (rankingResult.items.length === 0) {
    return `${summary} ${rankingPrep.candidates.length} roles reached final review, but none felt strong enough to surface in the feed.${operationalTail}`;
  }

  const strongCount = rankingResult.items.filter((item) => item.fitLabel === 'strong').length;
  const goodCount = rankingResult.items.length - strongCount;

  switch (rankingResult.status) {
    case 'completed_llm':
      return `${summary} ${rankingResult.items.length} jobs made the feed (${strongCount} Strong, ${goodCount} Good).${operationalTail}`;
    case 'completed_deterministic':
      return `${summary} ${rankingResult.items.length} jobs made the feed (${strongCount} Strong, ${goodCount} Good).${operationalTail}`;
    case 'llm_failed_fallback':
      return `${summary} ${rankingResult.items.length} jobs still made the feed after the fallback ranking path ran (${strongCount} Strong, ${goodCount} Good).${operationalTail}`;
    default:
      return `${summary} ${rankingResult.items.length} jobs made the feed (${strongCount} Strong, ${goodCount} Good).${operationalTail}`;
  }
}

function buildWorkflowOperationalTail(ingestion: {
  duplicateCount: number;
  failedFetches: Array<{ error: string }>;
}): string {
  const notes: string[] = [];

  if (ingestion.failedFetches.length > 0) {
    notes.push(`${ingestion.failedFetches.length} provider ${ingestion.failedFetches.length === 1 ? 'fetch failed' : 'fetches failed'} but the run completed with partial data`);
  }

  if (ingestion.duplicateCount > 0) {
    notes.push(`${ingestion.duplicateCount} duplicate job observations were removed during cleanup`);
  }

  if (notes.length === 0) {
    return '';
  }

  return ` ${notes.join(', and ')}.`;
}

// GPT-4.1 Mini pricing: $0.40/M input, $1.60/M output
function estimateJobFeedRankingCost(
  inputTokens: number,
  outputTokens: number,
  _modelMeta: Record<string, Json> | null
): number {
  const inputRate = 0.40;
  const outputRate = 1.60;
  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
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

/**
 * Derive the user's total years of professional experience from their
 * primary CV. Used as an extra signal for the ranker to skip jobs that
 * require dramatically more experience than the candidate has.
 *
 * Primary CV only — master CVs are too dense and broad to use as the
 * source of truth for job-feed signals. Returns null when no primary CV
 * exists or the CV has no dated experience entries.
 */
export async function getUserYearsExperienceAdmin(userId: string): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the documents table here.
  const admin = createAdminClient() as any;

  const { data } = await admin
    .from('documents')
    .select('structured_data')
    .eq('user_id', userId)
    .eq('type', 'primary_cv')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const structured = data?.structured_data;
  if (structured && typeof structured === 'object') {
    const years = estimateTotalExperienceYears(structured as StructuredCV);
    if (years > 0) return years;
  }

  return null;
}

/**
 * Load the latest valid `CareerProfile` for a user from `user_career_profiles`.
 * Returns null when no row exists, the row predates the current schema
 * version, or the payload fails the runtime shape check (e.g. stale row from
 * a prior schema). The ranker treats null as "fall back to settings only."
 *
 * Read-only by the job-feed pipeline. This data must NEVER be loaded by
 * `src/lib/agents/**` — application-kit generation stays grounded in the
 * literal `StructuredCV`.
 */
export async function getUserCareerProfileAdmin(userId: string): Promise<CareerProfile | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the user_career_profiles table here.
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from('user_career_profiles')
    .select('profile, version')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[job-feed/server] career profile fetch error:', error.message);
    return null;
  }

  if (!data || data.version !== CAREER_PROFILE_SCHEMA_VERSION) return null;
  if (!isCurrentCareerProfile(data.profile)) return null;

  return data.profile;
}

/**
 * Resolve the user's search strategy for the current settings, regenerating
 * it via Claude when the cache is missing or stale relative to the profile.
 * Returns null when the prerequisites for a strategy don't exist (no career
 * profile yet, or no target_countries set), in which case the caller falls
 * back to the legacy deterministic search planner.
 *
 * Read-only by the job-feed pipeline. NEVER imported from src/lib/agents/**.
 */
export async function loadOrGenerateSearchStrategyAdmin(params: {
  userId: string;
  settings: JobFeedSettings;
  profile: CareerProfile | null;
}): Promise<SearchStrategy | null> {
  const { userId, settings, profile } = params;

  if (!profile) return null;
  if (!settings.target_countries || settings.target_countries.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the user_search_strategies table here.
  const admin = createAdminClient() as any;
  const settingsHash = computeSettingsHash(settings);

  const { data: cached, error: cacheError } = await admin
    .from('user_search_strategies')
    .select('strategy, version, source_profile_generated_at')
    .eq('user_id', userId)
    .eq('settings_hash', settingsHash)
    .maybeSingle();

  if (cacheError) {
    console.error('[job-feed/server] strategy fetch error:', cacheError.message);
  }

  if (
    cached
    && cached.version === SEARCH_STRATEGY_SCHEMA_VERSION
    && isCurrentSearchStrategy(cached.strategy)
    && cached.source_profile_generated_at === profile.generatedAt
  ) {
    return cached.strategy;
  }

  // Cache miss / stale / version bump — synthesize a fresh one and upsert.
  try {
    const result = await generateSearchStrategy({ profile, settings });
    await admin
      .from('user_search_strategies')
      .upsert({
        user_id: userId,
        settings_hash: settingsHash,
        strategy: result.strategy,
        version: SEARCH_STRATEGY_SCHEMA_VERSION,
        source_profile_generated_at: profile.generatedAt,
        model_provider: result.modelProvider,
        model_name: result.modelName,
      }, { onConflict: 'user_id,settings_hash' });

    console.log(
      `[search-strategy] Generated for user ${userId}: ${result.modelName} | ${result.inputTokens}in/${result.outputTokens}out | ${result.latencyMs}ms | ${result.strategy.queries.length} queries`,
    );
    return result.strategy;
  } catch (error) {
    console.error('[job-feed/server] strategy generation failed:', error instanceof Error ? error.message : String(error));
    // Fall back to the deterministic planner — never block a feed run on
    // strategy generation. The cached strategy (if any, even if stale) is
    // a safer fallback than the legacy planner; return it when available.
    if (cached && isCurrentSearchStrategy(cached.strategy)) return cached.strategy;
    return null;
  }
}
