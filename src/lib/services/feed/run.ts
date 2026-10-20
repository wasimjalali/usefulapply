/**
 * Start today's job feed run: the body of POST /api/job-feed/run, shared with the MCP
 * `run_job_feed` tool. The IP gate, the sign-in check and the per-user rate limit stay with the
 * caller. The run is synchronous, as the route has always been: it returns when the run ends.
 */

import { getProfile } from '@/db/repos/profiles';
import { canViewJobFeed, getLocalDateKey, getStartOfNextLocalDay, isJobFeedConfigured, isValidTimeZone } from '@/lib/job-feed/helpers';
import {
  getJobFeedSettingsAdmin,
  getJobFeedRunDiagnostics,
  getLatestManualCompletedJobFeedRunAdmin,
  runJobFeedFoundationWorkflow,
} from '@/lib/job-feed/server';
import { FeedError } from './errors';

const MIN_MANUAL_RUN_INTERVAL_MS = 20 * 60 * 60 * 1000;
const MAX_MANUAL_RUN_INTERVAL_MS = 28 * 60 * 60 * 1000;

export interface FeedRunResponse {
  success: true;
  mode: 'direct';
  runId: string | null;
  status: string | null;
  localDate: string | null;
  created: boolean;
  skipped: boolean;
  cooldown: boolean;
  nextRunAt: string | null;
  remainingMs: number;
  rawJobsFetched: number | null;
  jobsAfterPrefilter: number | null;
  rankedJobsCount: number | null;
  duplicateCount: number | null;
  rankingCandidateCount: number | null;
  failedFetchCount: number | null;
  resultSummary: string | null;
  errorMessage: string | null;
}

/**
 * `consentAccepted` is the caller's explicit assertion that the user agreed to the search. The web
 * route passes what its body says; the MCP tool always passes false, because an agent cannot give
 * that consent for the user.
 */
export async function startFeedRun(params: {
  userId: string;
  clientRequestId: string | null;
  consentAccepted: boolean;
}): Promise<FeedRunResponse> {
  const { userId, consentAccepted } = params;
  const profile = await getProfile(userId);

  if (!profile || !canViewJobFeed(profile.subscription_tier)) {
    throw new FeedError(403, 'Job Feed is not available for this account.', 'plan_not_allowed');
  }

  const settings = await getJobFeedSettingsAdmin(userId);
  const timeZone = settings?.user_timezone && isValidTimeZone(settings.user_timezone)
    ? settings.user_timezone
    : 'UTC';
  const now = new Date();
  const todayKey = getLocalDateKey(now, timeZone);

  // One run per calendar day in the user's persisted timezone, with UTC as
  // the fallback. Changing roles or countries doesn't bypass the daily gate.
  const latestManualRun = await getLatestManualCompletedJobFeedRunAdmin(userId);
  const cooldown = getCalendarDayCooldown({
    latestManualLocalDate: latestManualRun?.local_date ?? null,
    latestManualTimeZone: latestManualRun?.local_timezone ?? null,
    latestManualCompletedAt: latestManualRun?.completed_at ?? latestManualRun?.created_at ?? null,
    latestManualRunAt: latestManualRun?.started_at ?? latestManualRun?.created_at ?? null,
    todayKey,
    timeZone,
    now,
  });

  if (cooldown.blocked) {
    const diagnostics = getJobFeedRunDiagnostics(latestManualRun ?? null);
    return {
      success: true,
      mode: 'direct',
      runId: latestManualRun?.id ?? null,
      status: latestManualRun?.status ?? null,
      localDate: latestManualRun?.local_date ?? null,
      created: false,
      skipped: true,
      cooldown: true,
      nextRunAt: cooldown.nextRunAt,
      remainingMs: cooldown.remainingMs,
      rawJobsFetched: latestManualRun?.raw_jobs_fetched ?? null,
      jobsAfterPrefilter: latestManualRun?.jobs_after_prefilter ?? null,
      rankedJobsCount: latestManualRun?.ranked_jobs_count ?? null,
      duplicateCount: diagnostics?.duplicateCount ?? null,
      rankingCandidateCount: diagnostics?.rankingCandidateCount ?? null,
      failedFetchCount: diagnostics?.failedFetchCount ?? null,
      resultSummary: latestManualRun?.result_summary ?? null,
      errorMessage: latestManualRun?.error_message ?? null,
    };
  }

  let result;
  try {
    result = await runJobFeedFoundationWorkflow({
      userId,
      requestExecutionId: crypto.randomUUID(),
      clientRequestId: params.clientRequestId,
      triggerSource: 'manual_user',
      now,
      orchestrator: 'direct',
      consentAccepted,
      force: cooldown.forceRerun,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'JOB_FEED_CONSENT_REQUIRED') {
      throw new FeedError(400, 'Please confirm I can search public job boards for you.', 'consent_required');
    }
    if (error instanceof Error && error.message === 'JOB_FEED_INSUFFICIENT_CV') {
      throw new FeedError(
        422,
        "We couldn't find enough roles or experience in your CV to build your feed. Add your recent roles or key skills to your CV, then try again.",
        'insufficient_cv',
      );
    }
    throw error;
  }

  const diagnostics = getJobFeedRunDiagnostics(result.run);
  const nextRunAt = result.run.local_date
    ? getStartOfNextLocalDay(now, result.run.local_timezone || timeZone).toISOString()
    : null;

  return {
    success: true,
    mode: 'direct',
    runId: result.run.id,
    status: result.run.status,
    localDate: result.run.local_date,
    created: result.created,
    skipped: result.skipped,
    cooldown: false,
    nextRunAt,
    remainingMs: 0,
    rawJobsFetched: result.run.raw_jobs_fetched,
    jobsAfterPrefilter: result.run.jobs_after_prefilter,
    rankedJobsCount: result.run.ranked_jobs_count,
    duplicateCount: diagnostics?.duplicateCount ?? null,
    rankingCandidateCount: diagnostics?.rankingCandidateCount ?? null,
    failedFetchCount: diagnostics?.failedFetchCount ?? null,
    resultSummary: result.run.result_summary,
    errorMessage: result.run.error_message,
  };
}

/**
 * Why a run could not start for an account that can view the feed, in terms an agent can act on,
 * or null when nothing is in the way. The MCP tool asks before running; the web route does not (it
 * shows the same states from the overview). Paid accounts need the feed set up, consented and on;
 * free accounts need consent, which the workflow itself refuses without.
 */
export async function explainFeedRunBlocker(userId: string): Promise<{ code: string; message: string } | null> {
  const profile = await getProfile(userId);
  if (!profile || !canViewJobFeed(profile.subscription_tier)) {
    return { code: 'plan_not_allowed', message: 'Job Feed is not available for this account.' };
  }
  const settings = await getJobFeedSettingsAdmin(userId);
  if (profile.subscription_tier === 'free') {
    if (!settings?.consent_accepted_at || !settings.enabled) {
      return { code: 'consent_required', message: 'The feed has no consent on file. The account owner gives it by starting the feed in the web app.' };
    }
    return null;
  }
  if (!settings) return { code: 'not_set_up', message: 'The feed is not set up yet. The account owner finishes setup in the web app first.' };
  if (!settings.consent_accepted_at) {
    return { code: 'consent_required', message: 'The feed has no consent on file. The account owner gives it in the web app.' };
  }
  if (!settings.enabled) return { code: 'feed_off', message: 'The daily feed is turned off in the feed settings.' };
  if (!isJobFeedConfigured(settings)) return { code: 'setup_incomplete', message: 'The feed setup is not finished.' };
  return null;
}

function getCalendarDayCooldown(params: {
  latestManualLocalDate: string | null;
  latestManualTimeZone: string | null;
  latestManualCompletedAt: string | null;
  latestManualRunAt: string | null;
  todayKey: string;
  timeZone: string;
  now: Date;
}): { blocked: boolean; nextRunAt: string | null; remainingMs: number; forceRerun: boolean } {
  const completionDate = params.latestManualCompletedAt
    ? new Date(params.latestManualCompletedAt)
    : null;
  const blocksDuringTimezoneCutover = params.latestManualTimeZone !== params.timeZone
    && completionDate !== null
    && !Number.isNaN(completionDate.getTime())
    && getLocalDateKey(completionDate, params.timeZone) === params.todayKey;
  const calendarBlocked = params.latestManualLocalDate === params.todayKey
    || blocksDuringTimezoneCutover;
  const runDate = params.latestManualRunAt
    ? new Date(params.latestManualRunAt)
    : null;
  const hasValidRunDate = runDate !== null && !Number.isNaN(runDate.getTime());

  if (hasValidRunDate) {
    const ageMs = params.now.getTime() - runDate.getTime();
    if (ageMs >= MAX_MANUAL_RUN_INTERVAL_MS) {
      return { blocked: false, nextRunAt: null, remainingMs: 0, forceRerun: calendarBlocked };
    }
    if (ageMs < MIN_MANUAL_RUN_INTERVAL_MS) {
      const floorAt = new Date(runDate.getTime() + MIN_MANUAL_RUN_INTERVAL_MS);
      let nextRunAt = floorAt;
      if (calendarBlocked) {
        const calendarAt = getStartOfNextLocalDay(params.now, params.timeZone);
        const ceilingAt = runDate.getTime() + MAX_MANUAL_RUN_INTERVAL_MS;
        nextRunAt = new Date(Math.min(Math.max(floorAt.getTime(), calendarAt.getTime()), ceilingAt));
      }
      return {
        blocked: true,
        nextRunAt: nextRunAt.toISOString(),
        remainingMs: Math.max(0, nextRunAt.getTime() - params.now.getTime()),
        forceRerun: false,
      };
    }
  }

  // A row already keyed to today locks normally. During a timezone cutover,
  // the latest completed run also locks when its completion instant falls on
  // today in the persisted timezone, even if its old local_date differs.
  if (!calendarBlocked) {
    return { blocked: false, nextRunAt: null, remainingMs: 0, forceRerun: false };
  }

  let nextRunAt = getStartOfNextLocalDay(params.now, params.timeZone);
  if (hasValidRunDate) {
    const ceilingAt = runDate.getTime() + MAX_MANUAL_RUN_INTERVAL_MS;
    if (nextRunAt.getTime() > ceilingAt) nextRunAt = new Date(ceilingAt);
  }
  return {
    blocked: true,
    nextRunAt: nextRunAt.toISOString(),
    remainingMs: Math.max(0, nextRunAt.getTime() - params.now.getTime()),
    forceRerun: false,
  };
}
