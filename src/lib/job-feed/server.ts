import * as jobFeedRepo from '@/db/repos/jobFeed';
import * as profilesRepo from '@/db/repos/profiles';
import * as documentsRepo from '@/db/repos/documents';
import * as sessionsRepo from '@/db/repos/sessions';
import * as adminRepo from '@/db/repos/admin';
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
import { getLocalDateKey, isJobFeedConfigured, isSafeExternalUrl } from '@/lib/job-feed/helpers';
import { getJobFeedTierLimits, JOB_FEED_DEFAULT_SETTINGS, JOB_FEED_INBOX_RETENTION_DAYS } from '@/lib/job-feed/constants';
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
import { generateCareerProfile } from '@/lib/job-feed/career-profile-synthesis';
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
  const profile = await profilesRepo.getProfile(userId);
  return profile?.subscription_tier ?? 'free';
}

export async function getJobFeedSettingsAdmin(userId: string): Promise<JobFeedSettings | null> {
  return jobFeedRepo.getSettings(userId);
}

/**
 * Derive non-empty seed roles for a free user's auto-provisioned settings from
 * their synthesized career profile. Uses the market-normalized inferred titles
 * (where they are) plus any aspirational titles (where they're heading), deduped
 * case-insensitively and capped. Returns [] only when there's no usable profile,
 * in which case the caller must not provision (the run has nothing to search on).
 */
function deriveFreeFeedSeedRoles(profile: CareerProfile | null): string[] {
  if (!profile) return [];
  const candidates = [
    ...profile.inferredTitles.map((title) => title.canonical),
    ...profile.targetDirection.aspirationalTitles,
  ]
    .map((title) => title.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const title of candidates) {
    const key = title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(title);
    }
  }
  return unique.slice(0, 5);
}

/**
 * For free-tier users who have never completed settings setup (settings row is
 * null), auto-provision a minimal default row so the run can proceed without
 * user configuration. Free users get an automatic feed driven by their
 * synthesized career profile - they never touch the settings UI.
 *
 * `seedRoles` is required and must be non-empty: the job_feed_settings table
 * enforces a non-empty target_roles CHECK, and the caller derives the roles
 * from the user's career profile (see deriveFreeFeedSeedRoles). The rest of the
 * row uses safe defaults; the run still resolves search terms from the career
 * profile and search strategy at run time.
 *
 * Only called for free users. Premium users must configure settings manually
 * through the settings UI (requireJobFeedAccess-gated).
 */
export async function getOrProvisionFreeJobFeedSettingsAdmin(
  userId: string,
  seedRoles: string[],
): Promise<JobFeedSettings> {
  const existing = await getJobFeedSettingsAdmin(userId);
  if (existing) return existing;

  if (seedRoles.length === 0) {
    throw new Error('Cannot provision free-tier job feed settings without at least one seed role from the career profile.');
  }

  try {
    return await jobFeedRepo.upsertSettings(userId, {
      user_id: userId,
      enabled: true,
      consent_accepted_at: new Date().toISOString(),
      user_timezone: JOB_FEED_DEFAULT_SETTINGS.user_timezone,
      target_market: JOB_FEED_DEFAULT_SETTINGS.target_market,
      target_countries: JOB_FEED_DEFAULT_SETTINGS.target_countries,
      target_cities: JOB_FEED_DEFAULT_SETTINGS.target_cities,
      target_roles: seedRoles,
      preferred_locations: JOB_FEED_DEFAULT_SETTINGS.preferred_locations,
      remote_preference: JOB_FEED_DEFAULT_SETTINGS.remote_preference,
      remote_preferences: [...JOB_FEED_DEFAULT_SETTINGS.remote_preferences],
      salary_floor: JOB_FEED_DEFAULT_SETTINGS.salary_floor,
      languages: [...JOB_FEED_DEFAULT_SETTINGS.languages],
      seniority_target: JOB_FEED_DEFAULT_SETTINGS.seniority_target,
      seniority_targets: [...JOB_FEED_DEFAULT_SETTINGS.seniority_targets],
      employment_types: [...JOB_FEED_DEFAULT_SETTINGS.employment_types],
      work_authorization_status: JOB_FEED_DEFAULT_SETTINGS.work_authorization_status,
      user_skills: [],
      excluded_terms: [],
    } as never);
  } catch (error) {
    const raced = await getJobFeedSettingsAdmin(userId);
    if (raced) return raced;
    throw new Error(`Failed to provision free-tier job feed settings: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export async function getLatestJobFeedRunAdmin(userId: string): Promise<JobFeedRun | null> {
  return jobFeedRepo.getLatestRun(userId);
}

export async function getJobFeedCanonicalJobAdmin(jobId: string): Promise<JobFeedCanonicalJob | null> {
  return adminRepo.getCanonicalJob(jobId);
}

export async function authorizeJobFeedJobActionAdmin(params: {
  userId: string;
  jobId: string;
  runId?: string | null;
}): Promise<{ job: JobFeedCanonicalJob; rankedItem: SupabaseJobFeedRankedItem } | null> {
  const { userId, jobId, runId } = params;
  const rankedItem = await jobFeedRepo.getRankedItem(userId, jobId, runId)
    ?? await jobFeedRepo.getRankedItem(userId, jobId);
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
  return jobFeedRepo.getFeedback(userId, jobId);
}

export async function getJobFeedApplicationSessionAdmin(params: {
  userId: string;
  sessionId: string;
}): Promise<SupabaseApplicationSession | null> {
  return sessionsRepo.getSession(params.userId, params.sessionId) as Promise<SupabaseApplicationSession | null>;
}

export async function createJobFeedApplicationSessionAdmin(params: {
  userId: string;
  job: JobFeedCanonicalJob;
}): Promise<SupabaseApplicationSession> {
  const { userId, job } = params;
  const { session, error } = await sessionsRepo.createSession(userId, job.description ?? buildFallbackJobDescription(job), {
    job_title: job.title,
    company: job.company,
    job_url: job.apply_url ?? job.source_url,
  });
  if (error || !session) {
    throw new Error(`Failed to create application session from feed item: ${error?.message ?? 'unknown error'}`);
  }
  await sessionsRepo.updateSession(userId, session.id, {
    generation_status: 'pending',
    generation_completed: false,
  });
  const updated = await sessionsRepo.getSession(userId, session.id);
  return (updated ?? session) as SupabaseApplicationSession;
}

export async function createOrReuseJobFeedApplicationGenerationAdmin(params: {
  userId: string;
  jobId: string;
  rankedItem: SupabaseJobFeedRankedItem;
  applicationSessionId: string;
}): Promise<JobFeedApplicationGenerationIntentResult> {
  const { userId, jobId, rankedItem, applicationSessionId } = params;
  const now = new Date().toISOString();
  const existing = await jobFeedRepo.getGenerationBySessionJob(userId, jobId, applicationSessionId);
  if (existing) {
    if (existing.status === 'failed' || existing.status === 'cancelled' || existing.status === 'expired') {
      const nextAttempt = existing.attempt + 1;
      const generation = await jobFeedRepo.updateGeneration(userId, existing.id, {
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
      });
      if (!generation) {
        throw new Error('Failed to retry job feed application generation');
      }
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

  const generation = await jobFeedRepo.insertGeneration(userId, {
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
  });
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

  const updatedGeneration = await jobFeedRepo.updateGeneration(
    userId,
    generation.id,
    generationPatch as Partial<JobFeedApplicationGeneration>,
  );
  if (!updatedGeneration) {
    throw new Error('Failed to transition job feed application generation');
  }
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
  const staleGenerations = await adminRepo.listStaleGenerations(checkedAt, limit);
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
  if (generationId) {
    return jobFeedRepo.getGeneration(userId, generationId);
  }
  if (sessionId) {
    return jobFeedRepo.getLatestGenerationForSession(userId, sessionId);
  }
  throw new Error('A generation ID or session ID is required.');
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

  await sessionsRepo.updateSession(userId, sessionId, sessionPatch as Parameters<typeof sessionsRepo.updateSession>[2]);
  const updatedSession = await sessionsRepo.getSession(userId, sessionId);
  if (!updatedSession) {
    throw new Error('Application session was not found for this account.');
  }

  const existingFeedback = await jobFeedRepo.getFeedbackBySession(userId, sessionId);

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

  await jobFeedRepo.upsertFeedback(userId, {
    canonical_job_id: typedFeedback.canonical_job_id,
    ...feedbackPatch,
  });

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
  await jobFeedRepo.insertGenerationEvent(generation.user_id, {
    generation_id: generation.id,
    from_status: fromStatus,
    to_status: toStatus,
    attempt: generation.attempt,
    transition_reason: transitionReason,
    error_code: errorCode,
    error_message: errorMessage,
    metadata,
  });
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
    // Reopening a role is always allowed. Blocking it means re-reading the ad
    // for a job whose kit already succeeded throws, and the detail view dies.
    if (action === 'opened') {
      return existing;
    }
    // An apply that already has a session is a no-op, not a new terminal
    // action. Keyed on the session rather than applied_at, because a run that
    // reached 'succeeded' never stamps applied_at. A dismissed or not-relevant
    // row is blocked for a different reason and still throws.
    if (action === 'apply_started' && canReuseBlockedFeedbackSession(existing)) {
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

  if (existing) {
    return jobFeedRepo.upsertFeedback(userId, {
      canonical_job_id: existing.canonical_job_id,
      ...basePatch,
    });
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

  return jobFeedRepo.upsertFeedback(userId, insertPayload as Parameters<typeof jobFeedRepo.upsertFeedback>[1]);
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

/**
 * The completed run the feed should be read from, or null when there is none
 * inside the retention window. Split out from listLatestJobFeedItemsAdmin so
 * callers that only need the run (the overview) do not pay for building and
 * then discarding the whole item list.
 */
export async function resolveJobFeedRunForFeedAdmin(params: {
  userId: string;
  latestRun?: JobFeedRun | null;
}): Promise<JobFeedRun | null> {
  const candidateRun = params.latestRun ?? await getLatestJobFeedRunAdmin(params.userId);
  // Apply the inbox retention window to the candidate too. Without this the
  // fast-path accepts a stale completed run, the inbox path returns empty,
  // and the metadata fallback resurrects ranked_preview_jobs from a run
  // whose ranked_items were already deleted by cleanup at day 7.
  const cutoffMs = Date.now() - JOB_FEED_INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const candidateFresh = candidateRun?.status === 'completed'
    && typeof candidateRun.completed_at === 'string'
    && Date.parse(candidateRun.completed_at) >= cutoffMs;
  const run = candidateFresh
    ? candidateRun
    : await getLatestCompletedJobFeedRunAdmin(params.userId);
  return run && run.status === 'completed' ? run : null;
}

export async function listLatestJobFeedItemsAdmin(params: {
  userId: string;
  latestRun?: JobFeedRun | null;
}): Promise<LatestJobFeedItemsResult> {
  const run = await resolveJobFeedRunForFeedAdmin(params);
  if (!run) {
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
  const data = await jobFeedRepo.listInboxRankedItems(params.userId, since);
  const olderRows = data.filter((row) => row.run_id !== params.latestCompletedRun.id);
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
  // Prefer the run's recorded timezone over the current settings value so
  // "today" is computed consistently even when the user changes timezone
  // between the run and viewing the feed. Fall back to UTC only when both
  // are absent (shouldn't happen in practice, but defensive).
  const userTz = settings?.user_timezone || latestCompletedRun.local_timezone || 'UTC';
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
  const feedbackRows = await jobFeedRepo.listSavedFeedback(params.userId);
  // Saved is a bookmark list, not an inbox. Checking a fit or generating a kit
  // does not un-bookmark a role, so the inbox's blocked set is too aggressive
  // here: only an explicit dismiss or "not relevant" takes a role out.
  const typedRows = feedbackRows.filter((row) => {
    if (row.dismissed_at) return false;
    const metadata = (row.metadata ?? null) as Record<string, unknown> | null;
    return metadata?.match_rating !== 'not_relevant';
  });

  if (typedRows.length === 0) {
    return [];
  }

  const jobIds = typedRows.map((row) => row.canonical_job_id);
  const [jobRows, rankedRows] = await Promise.all([
    adminRepo.getCanonicalJobsByIds(jobIds),
    jobFeedRepo.listRankedItemsByJobIds(params.userId, jobIds),
  ]);
  const jobsById = new Map(jobRows.map((row) => [row.id, row]));
  // Newest run first from the query, so the first row wins for a job that has
  // been ranked on more than one day.
  const rankedByJobId = new Map<string, SupabaseJobFeedRankedItem>();
  for (const row of rankedRows as SupabaseJobFeedRankedItem[]) {
    if (!rankedByJobId.has(row.canonical_job_id)) rankedByJobId.set(row.canonical_job_id, row);
  }

  // Preserve the saved_at DESC order from the feedback query.
  return typedRows
    .map((row) => {
      const job = jobsById.get(row.canonical_job_id);
      if (!job) return null;
      const ranked = rankedByJobId.get(row.canonical_job_id);
      // Without the ranked row there is no badge and no reason to show, and a
      // guess would be worse than the gap. toFeedItem leaves both null.
      if (!ranked) return toFeedItem(job, row);
      const preview = toRankedPreviewItem(ranked);
      return toFeedItem(job, row, {
        fitLabel: preview.fitLabel,
        pipelineStage: 'ranked',
        rankingSource: preview.rankingSource,
        reason: preview.reason,
        companyDisplay: preview.companyDisplay,
      });
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
  const since = new Date(Date.now() - JOB_FEED_INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const run = await jobFeedRepo.getLatestCompletedRun(userId);
  if (!run?.completed_at || run.completed_at < since) return null;
  return run;
}

export async function getLatestManualCompletedJobFeedRunAdmin(userId: string): Promise<JobFeedRun | null> {
  return jobFeedRepo.getLatestManualCompletedRun(userId);
}

export async function runJobFeedFoundationWorkflow(params: {
  userId: string;
  triggerSource?: string;
  now?: Date;
  force?: boolean;
  orchestrator?: JobFeedRunDiagnostics['orchestrator'];
}): Promise<JobFeedRunWorkflowResult> {
  const { userId, triggerSource = 'scheduled', now = new Date(), force = false, orchestrator = 'direct' } = params;

  // Resolve the subscription tier early so we can auto-provision settings for
  // free users who have never gone through the (premium-only) settings UI.
  const subscriptionTierForSetup = await getUserSubscriptionTierAdmin(userId);
  const isFreeUser = subscriptionTierForSetup === 'free';

  let settings: JobFeedSettings;
  if (isFreeUser) {
    // Free users get automatic settings. Seed roles are only needed to CREATE
    // the row, so reuse an existing one first: deriving them up front would
    // fail a user whose feed already works but whose CV was since deleted or
    // whose profile no longer matches the current schema version.
    const existingSettings = await getJobFeedSettingsAdmin(userId);
    if (existingSettings) {
      settings = existingSettings;
    } else {
      // Seed target_roles from the synthesized career profile so the
      // provisioned row satisfies the non-empty target_roles constraint. The
      // profile is reused below for the search strategy
      // (getOrSynthesizeCareerProfileAdmin is cached, so this is one synthesis).
      const careerProfileForSeed = await getOrSynthesizeCareerProfileAdmin(userId);
      const seedRoles = deriveFreeFeedSeedRoles(careerProfileForSeed);
      if (seedRoles.length === 0) {
        // Sparse CV (no inferred or aspirational titles). Provisioning would throw
        // a developer-facing error that surfaces as an opaque 500. Throw a tagged
        // error the route maps to a clear, user-actionable 422 instead.
        throw new Error('JOB_FEED_INSUFFICIENT_CV');
      }
      settings = await getOrProvisionFreeJobFeedSettingsAdmin(userId, seedRoles);
    }
  } else {
    const loaded = await getJobFeedSettingsAdmin(userId);
    if (!loaded) {
      throw new Error('Job feed settings were not found for this user.');
    }
    if (!loaded.enabled) {
      throw new Error('Job feed is paused for this user.');
    }
    if (!isJobFeedConfigured(loaded)) {
      throw new Error('Job feed settings are incomplete.');
    }
    settings = loaded;
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

    if (!isStaleRunningRun) {
      // Active (non-stale) running run — block unconditionally.
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

    // Stale running run (>15 min with no progress): reset and let the
    // function continue so the row is reused below. This allows "Run Today"
    // (force=false) to recover stuck runs without requiring a force flag.
    captureJobFeedRunIdempotencyConflict({
      userId,
      run: existingRun,
      localDate,
      triggerSource,
      force,
      reason: force ? 'stale_running_run_force_reset' : 'stale_running_run_reset',
    });
    await resetJobFeedRunArtifactsForRerun(existingRun.id);
  }

  // A force-rerun of a *completed* run must not clear its ranked items up
  // front: if the rerun then fails (every fetch errored, the ranker is down,
  // the request times out) the user is left with nothing and no way back.
  // replaceRankedItemsForRun batches the delete with the inserts, so the swap
  // happens in one step and only when there is a new ranking to swap in.

  const creation: { run: JobFeedRun; raced: boolean } = existingRun
    ? { run: existingRun, raced: false }
    : await createJobFeedRunForToday({
        userId,
        localDate,
        settings,
        triggerSource,
        orchestrator,
      });

  // Another request created today's row between our read and our insert. The
  // guards above ran against nothing, so run them again over the row that won,
  // or we execute the whole workflow a second time and spend the tier's
  // SerpAPI budget twice on the same day.
  if (creation.raced) {
    const winner = creation.run;

    if (winner.status === 'completed' && !force) {
      captureJobFeedRunIdempotencyConflict({
        userId,
        run: winner,
        localDate,
        triggerSource,
        force,
        reason: 'completed_run_exists',
      });
      return { run: winner, created: false, skipped: true };
    }

    if (winner.status === 'running' && !isStaleJobFeedRun(winner, now)) {
      captureJobFeedRunIdempotencyConflict({
        userId,
        run: winner,
        localDate,
        triggerSource,
        force,
        reason: force ? 'running_run_blocks_force' : 'running_run_exists',
      });

      if (force) {
        throw new Error('Cannot force-rerun a job feed run while it is still running.');
      }

      return { run: winner, created: false, skipped: true };
    }
  }

  const run = creation.run;
  const createdRun = !existingRun && !creation.raced;

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
    // Zero the previous attempt's counters too. Leaving them makes a failed
    // rerun report "12 new roles today" over an empty list.
    raw_jobs_fetched: 0,
    jobs_after_prefilter: 0,
    ranked_jobs_count: 0,
    metadata: mergeMetadata(run.metadata, {
      stage: 'phase_4_ranking',
      foundation_mode: true,
      last_trigger_source: triggerSource,
      orchestrator,
    }),
  });

  try {
    // subscriptionTierForSetup was already resolved before the run row was
    // created — reuse it rather than making a second DB round-trip.
    const tierLimits = getJobFeedTierLimits(subscriptionTierForSetup);

    // Resolve the AI search strategy ahead of ingestion. The career profile is
    // a prerequisite for quality matching, so synthesize it synchronously when
    // missing (first-time runs before async UI synthesis lands, or after a
    // schema bump). Returns null only when there's no primary CV to synthesize
    // from; ingestJobFeedRunJobs then falls back to the legacy planner.
    const careerProfileForStrategy = await getOrSynthesizeCareerProfileAdmin(userId);
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
      // Downweight signal generated by the search strategy but previously
      // dropped before ranking. Null strategy (first-run users) → no terms.
      negativeTerms: searchStrategy?.negativeTerms ?? [],
      // Explicit user exclusions (titles/companies/keywords). Honored more
      // strongly than the auto-derived negativeTerms.
      excludedTerms: settings.excluded_terms ?? [],
    });
    const materializedRanking = await persistJobFeedRankedItemsForRunAdmin({
      runId: run.id,
      userId,
      items: rankingResult.items,
    });
    const rankedPreviewItems = materializedRanking.preview;

    runningRun = await updateJobFeedRun(run.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
      result_summary: buildWorkflowResultSummary(ingestion, prefilter, rankingPrep, rankingResult),
      raw_jobs_fetched: ingestion.rawJobsFetched,
      jobs_after_prefilter: prefilter.survivors.length,
      ranked_jobs_count: rankedPreviewItems.length,
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
        ranked_items_materialized: materializedRanking.materialized,
      }),
    });

    return {
      run: runningRun,
      created: createdRun,
      skipped: false,
      forced: force,
      previewJobs: prefilter.shortlistPreview.length > 0 ? prefilter.shortlistPreview : ingestion.previewJobs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown job feed workflow failure';

    // Marking the run failed must never replace the real cause. If this write
    // throws too, log it and still rethrow the original, otherwise the run is
    // left 'running' AND the operator sees the wrong error.
    try {
      await updateJobFeedRun(run.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
        metadata: mergeMetadata(runningRun.metadata, {
          workflow_status: 'failed',
        }),
      });
    } catch (markFailedError) {
      console.error(
        '[job-feed] could not mark run failed:',
        markFailedError instanceof Error ? markFailedError.message : markFailedError,
      );
    }

    throw error;
  }
}

async function getJobFeedRunByDate(userId: string, localDate: string): Promise<JobFeedRun | null> {
  return jobFeedRepo.getRunByDate(userId, localDate);
}

/**
 * Insert today's run row, tolerating the read-then-insert race. Two clicks in
 * the same tick both see "no run today" and both insert against a unique index
 * on (user_id, local_date); the loser re-reads and reuses the winner's row
 * rather than surfacing a raw 500.
 */
async function createJobFeedRunForToday(params: {
  userId: string;
  localDate: string;
  settings: JobFeedSettings;
  triggerSource: string;
  orchestrator: JobFeedRunDiagnostics['orchestrator'];
}): Promise<{ run: JobFeedRun; raced: boolean }> {
  const { userId, localDate, settings, triggerSource, orchestrator } = params;
  try {
    const run = await createJobFeedRun({
      user_id: userId,
      local_date: localDate,
      local_timezone: settings.user_timezone,
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
    return { run, raced: false };
  } catch (error) {
    const raced = await getJobFeedRunByDate(userId, localDate);
    if (raced) return { run: raced, raced: true };
    throw error;
  }
}

async function createJobFeedRun(insert: {
  user_id: string;
  local_date: string;
  local_timezone: string;
  trigger_source: string;
  idempotency_key: string;
  metadata: Json;
  settings_snapshot?: Json | null;
}): Promise<JobFeedRun> {
  return jobFeedRepo.insertRun(insert.user_id, {
    local_date: insert.local_date,
    local_timezone: insert.local_timezone,
    trigger_source: insert.trigger_source,
    idempotency_key: insert.idempotency_key,
    metadata: insert.metadata,
    settings_snapshot: insert.settings_snapshot,
  });
}

async function updateJobFeedRun(runId: string, updates: JobFeedRunUpdate): Promise<JobFeedRun> {
  return adminRepo.updateRunById(runId, updates);
}

async function resetJobFeedRunArtifactsForRerun(runId: string): Promise<void> {
  await adminRepo.deleteRunArtifactsByRunId(runId);
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

  const rows = await adminRepo.getCanonicalJobsByIds(orderedJobIds);
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
              reason: rankedItem.reason,
              companyDisplay: rankedItem.companyDisplay ?? null,
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
      companyDisplay: typeof item.companyDisplay === 'string' && item.companyDisplay.trim().length > 0
        ? item.companyDisplay.trim()
        : null,
    });
  }

  previewItems.sort((left, right) => left.rank - right.rank);
  return previewItems;
}

async function listJobFeedRankedItemsForRunAdmin(runId: string): Promise<SupabaseJobFeedRankedItem[]> {
  return adminRepo.listRankedItemsByRunId(runId) as Promise<SupabaseJobFeedRankedItem[]>;
}

async function persistJobFeedRankedItemsForRunAdmin(params: {
  runId: string;
  userId: string;
  items: JobFeedRankedItemRecord[];
}): Promise<{ materialized: boolean; preview: JobFeedRankedPreviewItem[] }> {
  if (params.items.length === 0) {
    // A rerun that ranks nothing must not clear a working feed. The previous
    // ranking stays put, and the run reports what actually survived instead of
    // claiming an empty day.
    const kept = await listJobFeedRankedItemsForRunAdmin(params.runId);
    return { materialized: false, preview: kept.map(toRankedPreviewItem) };
  }

  await jobFeedRepo.replaceRankedItemsForRun(params.userId, params.runId, params.items.map((item) => ({
    canonical_job_id: item.canonicalJobId,
    rank_position: item.rank,
    fit_label: item.fitLabel,
    ranking_source: item.rankingSource,
    reason: item.reason,
    deterministic_score: item.deterministicScore,
    metadata: item.companyDisplay ? { company_display: item.companyDisplay } : {},
  })));
  return { materialized: true, preview: params.items.map(toRankedPreviewRecord) };
}

function toRankedPreviewItem(item: SupabaseJobFeedRankedItem): JobFeedRankedPreviewItem {
  const companyDisplay = isJsonRecord(item.metadata) && typeof item.metadata.company_display === 'string'
    ? item.metadata.company_display.trim()
    : '';
  return {
    id: item.canonical_job_id,
    rank: item.rank_position,
    fitLabel: item.fit_label,
    rankingSource: item.ranking_source,
    reason: item.reason,
    companyDisplay: companyDisplay.length > 0 ? companyDisplay : null,
  };
}

function toRankedPreviewRecord(item: JobFeedRankedItemRecord): JobFeedRankedPreviewItem {
  return {
    id: item.canonicalJobId,
    rank: item.rank,
    fitLabel: item.fitLabel,
    rankingSource: item.rankingSource,
    reason: item.reason,
    companyDisplay: item.companyDisplay ?? null,
  };
}

async function getJobFeedFeedbackMapAdmin(userId: string, jobIds: string[]): Promise<Map<string, JobFeedFeedback>> {
  const rows = await jobFeedRepo.listFeedbackForJobs(userId, jobIds);
  return new Map(rows.map((row) => [row.canonical_job_id, row]));
}

/**
 * A job is "blocked" from the visible feed when the user has taken a definitive
 * negative/terminal action on it: applied, dismissed, or rated not relevant.
 * Applied jobs belong on the Tracker; dismissed and not-relevant jobs should
 * never resurface — the ranker also consumes this signal to avoid re-ranking
 * them in future runs.
 */
/**
 * A blocked row can still hand back the session it already has, but only when
 * the block came from an application that actually ran. A dismissed row, or
 * one the user rated not relevant, is a different kind of block and stays
 * closed. Both the apply route and recordJobFeedFeedbackAdmin read this, so
 * the two guards cannot drift apart.
 */
export function canReuseBlockedFeedbackSession(feedback: JobFeedFeedback | null | undefined): boolean {
  if (!feedback?.application_session_id) return false;
  if (feedback.dismissed_at) return false;
  const metadata = (feedback.metadata ?? null) as Record<string, unknown> | null;
  if (metadata && typeof metadata === 'object' && metadata.match_rating === 'not_relevant') {
    return false;
  }
  return true;
}

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
  const data = await jobFeedRepo.listFeedback(userId);
  const blocked = new Set<string>();
  for (const row of data) {
    if (isJobFeedbackBlocked(row)) {
      blocked.add(row.canonical_job_id);
    }
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
    reason?: string | null;
    companyDisplay?: string | null;
  }
): JobFeedFeedItem {
  const sourceIdentifiers = isJsonRecord(job.source_identifiers) ? job.source_identifiers : {};
  const displayCompany = ranking?.companyDisplay?.trim() || job.company;

  return {
    id: job.id,
    title: job.title,
    company: displayCompany,
    location: job.location_text,
    workMode: job.work_mode,
    employmentType: job.employment_type,
    salaryText: job.salary_text,
    description: job.description,
    highlights: extractHighlights(sourceIdentifiers.highlights),
    applyUrl: job.apply_url && isSafeExternalUrl(job.apply_url) ? job.apply_url : null,
    sourceUrl: job.source_url && isSafeExternalUrl(job.source_url) ? job.source_url : null,
    via: typeof sourceIdentifiers.via === 'string' ? sourceIdentifiers.via : null,
    freshnessDays: job.freshness_days,
    postedAtText: job.posted_at_text,
    fitLabel: ranking?.fitLabel ?? null,
    pipelineStage: ranking?.pipelineStage ?? 'shortlisted',
    rankingSource: ranking?.rankingSource ?? null,
    matchReason: ranking?.reason ?? null,
    applyOptions: extractApplyOptions(sourceIdentifiers.apply_options, job),
    feedback: toJobFeedFeedbackState(feedback),
  };
}

// Provider-extracted structured sections (Qualifications / Responsibilities /
// Benefits) captured at ingestion into source_identifiers.highlights. Surfaced
// so the UI can render clean sections when the free-text description is a
// single run-on paragraph with no line breaks.
function extractHighlights(value: Json | undefined): JobFeedFeedItem['highlights'] {
  if (!Array.isArray(value)) return [];

  const highlights: JobFeedFeedItem['highlights'] = [];
  for (const entry of value) {
    if (!isJsonRecord(entry)) continue;
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const items = Array.isArray(entry.items)
      ? entry.items.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [];
    if (items.length === 0) continue;
    highlights.push({ title, items });
  }

  return highlights;
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
    return 'Useful Apply checked the current searches, but no jobs matched these settings yet.';
  }

  const summary = `Useful Apply found ${ingestion.rawJobsFetched} job observations across ${ingestion.searchPlan.length} searches and narrowed them to ${prefilter.survivors.length} roles that matched the current filter.`;
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
// USD per million tokens (input, output) on Workers AI, August 2026 list prices.
const RANKING_MODEL_RATES: Record<string, [number, number]> = {
  '@cf/openai/gpt-oss-120b': [0.35, 0.75],
  '@cf/deepseek-ai/deepseek-v4-flash-0731': [0.44, 1.32],
  '@cf/meta/llama-4-scout-17b-16e-instruct': [0.27, 0.85],
};

function estimateJobFeedRankingCost(
  inputTokens: number,
  outputTokens: number,
  modelMeta: Record<string, Json> | null
): number | null {
  const name = typeof modelMeta?.name === 'string' ? modelMeta.name : null;
  const rates = name ? RANKING_MODEL_RATES[name] : undefined;
  if (!rates) return null;
  return (inputTokens / 1_000_000) * rates[0] + (outputTokens / 1_000_000) * rates[1];
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
  const data = await documentsRepo.getDocumentByType(userId, 'primary_cv');
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
  const data = await jobFeedRepo.getCareerProfileRow(userId);
  if (!data || data.version !== CAREER_PROFILE_SCHEMA_VERSION) return null;
  if (!isCurrentCareerProfile(data.profile)) return null;
  return data.profile as CareerProfile;
}

/**
 * Load the user's CareerProfile, synthesizing it synchronously when missing or
 * stale (e.g. first run before the async UI synthesis lands, or after a schema
 * bump). This makes the rich profile a PREREQUISITE for ranking rather than a
 * best-effort prior: without it, the run falls back to the legacy deterministic
 * planner and the flat CV skill list, which is a measurably worse feed the user
 * never knows they got.
 *
 * Returns null only when there's genuinely no primary CV to synthesize from, in
 * which case the caller falls back to legacy behaviour. Synthesis failures also
 * return null (fall back) rather than failing the whole run.
 *
 * Read-only contract still holds: the synthesized profile is NEVER read by
 * `src/lib/agents/**`.
 */
export async function getOrSynthesizeCareerProfileAdmin(userId: string): Promise<CareerProfile | null> {
  const existing = await getUserCareerProfileAdmin(userId);
  if (existing) return existing;

  const primaryDoc = await documentsRepo.getDocumentByType(userId, 'primary_cv');

  const structured = primaryDoc?.structured_data;
  if (!structured || typeof structured !== 'object') return null;

  try {
    const result = await generateCareerProfile(structured as StructuredCV);
    try {
      await jobFeedRepo.upsertCareerProfile(userId, {
        profile: result.profile as unknown as Json,
        version: CAREER_PROFILE_SCHEMA_VERSION,
        source_document_id: primaryDoc.id ?? null,
        source_document_updated_at: primaryDoc.updated_at ?? null,
        model_provider: result.modelProvider,
        model_name: result.modelName,
      });
    } catch (persistError) {
      console.error(
        '[job-feed/server] career profile persist error:',
        persistError instanceof Error ? persistError.message : persistError,
      );
    }

    console.log(
      `[job-feed/server] synthesized career profile on-demand for user ${userId}: ${result.modelName} | ${result.latencyMs}ms`,
    );
    return result.profile;
  } catch (error) {
    console.error(
      '[job-feed/server] on-demand career profile synthesis failed:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
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

  const settingsHash = computeSettingsHash(settings);
  const cached = await jobFeedRepo.getSearchStrategyRow(userId, settingsHash);

  // Use epoch comparison instead of string equality so minor timestamp
  // formatting differences and same-millisecond profile regenerations still
  // hit the cache. `>=` means a strategy synthesized for the same or an older
  // profile is valid — a newer profile invalidates the cache (regenerate).
  const cachedTs = Number.isFinite(Number(new Date(cached?.source_profile_generated_at ?? '')))
    ? new Date(cached!.source_profile_generated_at!).getTime()
    : NaN;
  const profileTs = Number.isFinite(Number(new Date(profile.generatedAt ?? '')))
    ? new Date(profile.generatedAt).getTime()
    : NaN;

  if (
    cached
    && cached.version === SEARCH_STRATEGY_SCHEMA_VERSION
    && isCurrentSearchStrategy(cached.strategy)
    && Number.isFinite(cachedTs)
    && Number.isFinite(profileTs)
    && cachedTs >= profileTs
  ) {
    return cached.strategy;
  }

  // Cache miss / stale / version bump — synthesize a fresh one and upsert.
  try {
    const result = await generateSearchStrategy({ profile, settings });
    await jobFeedRepo.upsertSearchStrategy(userId, {
      settings_hash: settingsHash,
      strategy: result.strategy as unknown as Json,
      version: SEARCH_STRATEGY_SCHEMA_VERSION,
      source_profile_generated_at: profile.generatedAt,
      model_provider: result.modelProvider,
      model_name: result.modelName,
    });

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
