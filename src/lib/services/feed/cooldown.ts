/**
 * The once-a-day gate for feed runs, with no I/O: run.ts reads the rows and calls these.
 * Moved out of run.ts so tests reach it without the server module graph.
 */
import type { JobFeedRun } from '@/db/types';
import { getLocalDateKey, getStartOfNextLocalDay } from '@/lib/job-feed/helpers';

const MIN_MANUAL_RUN_INTERVAL_MS = 20 * 60 * 60 * 1000;
const MAX_MANUAL_RUN_INTERVAL_MS = 28 * 60 * 60 * 1000;

/**
 * When the run after this one may start: the gate readRunGate will apply once this run is the
 * latest completed one, so a run in flight reports what its completed row will.
 * - failed: null. The gate only counts completed runs, and a failed one is retried at once.
 * - queued: from when it was queued (`updated_at`). `started_at` may belong to an earlier
 *   attempt (a requeued failed row, or a completed row forced to rerun after 28 hours), and the
 *   consumer replaces it when it claims the run, so it says nothing about this attempt. The
 *   value moves once, by the queue latency, when the run is claimed.
 * - running or completed: from `started_at`, which the claim set for this attempt.
 * A run not completed yet is taken to complete now, for the timezone cutover check.
 */
export function nextRunAfter(run: JobFeedRun, timeZone: string, now: Date): string | null {
  if (!run.local_date || run.status === 'failed') return null;
  const attemptStart = run.status === 'queued'
    ? run.updated_at ?? run.created_at
    : run.started_at ?? run.created_at;
  return getCalendarDayCooldown({
    latestManualLocalDate: run.local_date,
    latestManualTimeZone: run.local_timezone ?? null,
    latestManualCompletedAt: run.completed_at ?? now.toISOString(),
    latestManualRunAt: attemptStart ?? null,
    todayKey: getLocalDateKey(now, timeZone),
    timeZone,
    now,
  }).nextRunAt;
}

export function getCalendarDayCooldown(params: {
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
