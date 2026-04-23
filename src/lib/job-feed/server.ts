import { createAdminClient } from '@/lib/supabase/admin';
import type { JobFeedRun, JobFeedSettings, Json } from '@/lib/supabase/types';
import { canAccessJobFeed, getLocalDateKey, getTimeZoneParts, isJobFeedConfigured } from '@/lib/job-feed/helpers';
import type { JobFeedRunWorkflowResult } from '@/lib/job-feed/types';

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

const FOUNDATION_RESULT_SUMMARY =
  'Phase 2 foundation run completed. Feed settings, scheduling, and run tracking are active; ingestion and ranking ship in the next milestone.';

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
      stage: 'phase_2_foundation',
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
      stage: 'phase_2_foundation',
      foundation_mode: true,
      last_trigger_source: triggerSource,
    }),
  });

  try {
    runningRun = await updateJobFeedRun(run.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
      result_summary: FOUNDATION_RESULT_SUMMARY,
      raw_jobs_fetched: 0,
      jobs_after_prefilter: 0,
      ranked_jobs_count: 0,
      metadata: mergeMetadata(runningRun.metadata, {
        workflow_status: 'completed',
      }),
    });

    return { run: runningRun, created: !existingRun, skipped: false };
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
