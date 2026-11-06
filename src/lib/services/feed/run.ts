/**
 * Today's job feed run, in two shapes that share one gate (the plan check and the once-a-day
 * cooldown). The IP gate, the sign-in check and the per-user rate limit stay with the caller.
 *
 *   startFeedRun   the body of POST /api/job-feed/run. Synchronous, as the route has always been:
 *                  it returns when the run ends.
 *   queueFeedRun   the MCP `run_job_feed` tool. Puts the run on the agent queue and returns at
 *                  once; the queue consumer (run-queue.ts) runs the feed.
 */

import * as jobFeedRepo from '@/db/repos/jobFeed';
import { getProfile } from '@/db/repos/profiles';
import type { JobFeedRun, Json } from '@/db/types';
import { canViewJobFeed, getLocalDateKey, getStartOfNextLocalDay, isJobFeedConfigured, isValidTimeZone } from '@/lib/job-feed/helpers';
import { getJobFeedTierLimits } from '@/lib/job-feed/constants';
import type { ConfirmedSearchQuery } from '@/lib/job-feed/search-plan';
import {
  getJobFeedSettingsAdmin,
  getJobFeedRunDiagnostics,
  getLatestManualCompletedJobFeedRunAdmin,
  queueJobFeedRunAdmin,
  runJobFeedFoundationWorkflow,
} from '@/lib/job-feed/server';
import { sendFeedRunMessage } from '../generation-runner';
import { FeedError } from './errors';
import { failUnclaimedRun } from './run-queue';
import { getCalendarDayCooldown, nextRunAfter } from './cooldown';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const gate = await readRunGate(userId);
  const { now, cooldown } = gate;

  if (cooldown.blocked) return cooldownResponse(gate);

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
      nextRunSlot: gate.nextRunSlot,
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
  const nextRunAt = gateNextRunAt(gate, result.run);

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

interface RunGate {
  timeZone: string;
  now: Date;
  latestManualRun: JobFeedRun | null;
  cooldown: ReturnType<typeof getCalendarDayCooldown>;
  /** Runs a day: the account's own override, else the plan's. */
  runsPerDay: number;
  /** Completed runs still allowed today (several a day; 0 or 1 at one a day). */
  runsLeftToday: number;
  /** Set when today's latest run completed and another is allowed: the slot the next run takes. */
  nextRunSlot?: number;
  /** Today's runs that had completed when the gate was read (multi-run plans). */
  completedRunIds?: Set<string>;
}

/**
 * When the run after `run` may start. On a one-run plan, the classic calendar-day cooldown. On a plan with
 * more runs a day, at once while today has runs left after this one, else at the start of the next local day.
 */
function gateNextRunAt(gate: RunGate, run: JobFeedRun): string | null {
  if (gate.runsPerDay <= 1) return nextRunAfter(run, gate.timeZone, gate.now);
  if (run.status === 'failed') return null;
  // A run the gate already counted leaves the count as it is; any other run takes one more of today's runs.
  const counted = gate.completedRunIds?.has(run.id) ?? false;
  const leftAfterThis = gate.runsLeftToday - (counted ? 0 : 1);
  return leftAfterThis > 0 ? null : getStartOfNextLocalDay(gate.now, gate.timeZone).toISOString();
}

/**
 * The plan check and the run gate, the same for the synchronous and the queued run. A one-run plan keeps
 * the calendar-day cooldown (one completed run a day, 20 to 28 hours apart). A plan with more runs a day
 * counts today's completed runs instead: while some are left, a completed run opens the next slot.
 */
async function readRunGate(userId: string): Promise<RunGate> {
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
  // An account's own override (set by hand) wins over its plan's runs a day.
  const runsPerDay = profile.job_feed_runs_per_day ?? getJobFeedTierLimits(profile.subscription_tier).runsPerDay;
  if (runsPerDay <= 1) {
    return { timeZone, now, latestManualRun, cooldown, runsPerDay, runsLeftToday: cooldown.blocked ? 0 : 1 };
  }

  const [todaysRuns, lastDay] = await Promise.all([
    jobFeedRepo.listRunsByDate(userId, todayKey),
    jobFeedRepo.listRunsCompletedSince(userId, new Date(now.getTime() - DAY_MS).toISOString()),
  ]);
  // Today's completed runs: those stored under today's date, and those of the last day that fall on today in
  // the current timezone, so a timezone change never opens another day's runs.
  const completedRunIds = new Set([
    ...todaysRuns.filter((run) => run.status === 'completed').map((run) => run.id),
    ...lastDay.filter((run) => getLocalDateKey(new Date(run.completed_at as string), timeZone) === todayKey).map((run) => run.id),
  ]);
  const latestToday = todaysRuns[0] ?? null;
  const open = { blocked: false, nextRunAt: null, remainingMs: 0, forceRerun: false };
  const runsLeftToday = Math.max(0, runsPerDay - completedRunIds.size);
  if (latestToday && latestToday.status !== 'completed') {
    // Today's latest run is queued, running or failed: the workflow takes it from there.
    return { timeZone, now, latestManualRun, cooldown: open, runsPerDay, runsLeftToday, completedRunIds };
  }
  if (runsLeftToday > 0) {
    // Nothing stored under today yet starts slot 0; otherwise the slot after today's latest.
    return { timeZone, now, latestManualRun, cooldown: open, runsPerDay, runsLeftToday, completedRunIds, nextRunSlot: latestToday ? latestToday.run_slot + 1 : undefined };
  }
  const nextRunAt = getStartOfNextLocalDay(now, timeZone);
  return {
    timeZone,
    now,
    latestManualRun,
    cooldown: { blocked: true, nextRunAt: nextRunAt.toISOString(), remainingMs: Math.max(0, nextRunAt.getTime() - now.getTime()), forceRerun: false },
    runsPerDay,
    runsLeftToday: 0,
    completedRunIds,
  };
}

/** What a blocked run reports: the latest completed manual run, and when the next one may start. */
function cooldownResponse({ latestManualRun, cooldown }: RunGate): FeedRunResponse {
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

export interface QueuedFeedRunResponse {
  runId: string | null;
  /** queued or running while the run is in flight, completed or failed once it ended. */
  status: string | null;
  localDate: string | null;
  /** True when this call put the run on the queue. */
  started: boolean;
  /** Today's run already completed (or the daily cooldown applies): nothing was queued. */
  alreadyRanToday: boolean;
  nextRunAt: string | null;
  rawJobsFetched: number | null;
  jobsAfterPrefilter: number | null;
  rankedJobsCount: number | null;
  /** Completed runs still allowed today, not counting this one if it is still to finish. */
  runsLeftToday: number;
  runsPerDay: number;
  /** Which run of the day this is, from 0. */
  runSlot: number | null;
  /** Why the run failed, or why the failed try this call put back on the queue ended. Null otherwise. */
  lastError: string | null;
}

/**
 * Queue today's run for the agent queue consumer and return without running it. Checks the same
 * gate as startFeedRun, then creates (or finds) today's run row in `queued` through
 * queueJobFeedRunAdmin, whose unique run per user, local day and slot keeps it to one per slot. The
 * caller has already ruled out the refusals in explainFeedRunBlocker, so consent is on file.
 * `customQueries` are an agent's own searches for this run, used instead of the search list.
 */
export async function queueFeedRun(
  userId: string,
  options: { customQueries?: ConfirmedSearchQuery[] | null } = {},
): Promise<QueuedFeedRunResponse> {
  const gate = await readRunGate(userId);
  if (gate.cooldown.blocked) {
    const blocked = cooldownResponse(gate);
    return {
      runId: blocked.runId,
      status: blocked.status,
      localDate: blocked.localDate,
      started: false,
      alreadyRanToday: true,
      nextRunAt: blocked.nextRunAt,
      rawJobsFetched: blocked.rawJobsFetched,
      jobsAfterPrefilter: blocked.jobsAfterPrefilter,
      rankedJobsCount: blocked.rankedJobsCount,
      runsLeftToday: 0,
      runsPerDay: gate.runsPerDay,
      runSlot: gate.latestManualRun?.run_slot ?? null,
      lastError: null,
    };
  }

  const queued = await queueJobFeedRunAdmin({
    userId,
    now: gate.now,
    triggerSource: 'manual_user',
    nextRunSlot: gate.nextRunSlot,
    customQueries: options.customQueries ?? null,
  });
  let { run, queuedNow, dispatch } = queued;
  const { retriedError = null } = queued;
  if (gate.cooldown.forceRerun && run.status === 'completed') {
    // The gate lets this run through although today's row already completed (28 hours or more have passed
    // since it ran, as after a timezone change). The synchronous path passes `force` to its workflow; the
    // queued path puts the completed row back on the queue, which is what a forced rerun of it amounts to.
    // The guard on status and updated_at lets one caller win; a loser reports the row as it is now.
    // The rerun searches what this call asked for: an agent's own queries, or the saved list.
    const customQueries = options.customQueries ?? null;
    const metadata = run.metadata && typeof run.metadata === 'object' && !Array.isArray(run.metadata) ? run.metadata : {};
    // Written by the same guarded update as the requeue, so a caller that loses never changes the run.
    const requeued = await jobFeedRepo.requeueRun(
      userId,
      run.id,
      { status: run.status as 'completed', updatedAt: run.updated_at },
      customQueries || 'custom_queries' in metadata
        ? { ...metadata, custom_queries: customQueries ? (customQueries as unknown as Json) : null }
        : undefined,
    );
    if (requeued) {
      run = requeued;
      queuedNow = true;
      dispatch = true;
    } else {
      const current = await jobFeedRepo.getRun(userId, run.id);
      if (!current) throw new Error('Job feed run disappeared while it was being queued.');
      run = current;
      dispatch = current.status === 'queued';
    }
  }
  if (dispatch) {
    try {
      await sendFeedRunMessage(userId, run.id);
    } catch (error) {
      // Nothing will ever claim a run whose message was never sent: end it, so the next call starts a fresh one.
      console.error('[feed-queue] could not send the message for run', run.id, error);
      await failUnclaimedRun(userId, run.id);
      throw error;
    }
  }
  const finished = run.status === 'completed' || run.status === 'failed';
  const counted = gate.completedRunIds?.has(run.id) ?? run.status === 'completed';
  return {
    runId: run.id,
    status: run.status,
    localDate: run.local_date,
    started: queuedNow,
    alreadyRanToday: run.status === 'completed',
    nextRunAt: gateNextRunAt(gate, run),
    rawJobsFetched: finished ? run.raw_jobs_fetched : null,
    jobsAfterPrefilter: finished ? run.jobs_after_prefilter : null,
    rankedJobsCount: finished ? run.ranked_jobs_count : null,
    runsLeftToday: Math.max(0, gate.runsLeftToday - (counted || run.status === 'failed' ? 0 : 1)),
    runsPerDay: gate.runsPerDay,
    runSlot: run.run_slot,
    lastError: run.status === 'failed' ? run.error_message : retriedError,
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

/** Runs the plan still allows today, for the overview: the same gate a run checks. */
export async function readRunsLeftToday(userId: string): Promise<{ runsLeftToday: number; runsPerDay: number }> {
  const gate = await readRunGate(userId);
  return { runsLeftToday: gate.cooldown.blocked ? 0 : gate.runsLeftToday, runsPerDay: gate.runsPerDay };
}
