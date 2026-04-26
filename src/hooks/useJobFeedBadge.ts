'use client';

import { useCallback, useEffect, useState } from 'react';

// Key stores the last run date the user has acknowledged — today's popup is
// gated on this so the "X new jobs today" popup only fires once per new run.
// The number badge on the nav uses the live unprocessed count instead, so
// dismissing the popup does NOT clear the badge — the user still has pending
// jobs to work through.
const LAST_SEEN_KEY_PREFIX = 'karko_job_feed_last_seen_run_date';

type JobFeedSummary = {
  canAccess: boolean;
  latestRunDate: string | null;
  jobCount: number;
  unprocessedCount: number;
};

function getLastSeenKey(userId?: string | null): string {
  return userId ? `${LAST_SEEN_KEY_PREFIX}:${userId}` : LAST_SEEN_KEY_PREFIX;
}

function readLastSeen(userId?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(getLastSeenKey(userId));
  } catch {
    return null;
  }
}

function writeLastSeen(value: string, userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getLastSeenKey(userId), value);
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

// Module-level event bus so any component that records job feedback can ping
// the badge to refetch the unprocessed count immediately — avoids stale badge
// numbers when the user saves/applies/dismisses from the Job Feed panel.
type Listener = () => void;
const listeners = new Set<Listener>();
export function notifyJobFeedBadgeRefresh() {
  for (const listener of listeners) listener();
}

export function useJobFeedBadge(enabled: boolean, userId?: string | null) {
  const [summary, setSummary] = useState<JobFeedSummary | null>(null);
  const [lastSeenDate, setLastSeenDate] = useState<string | null>(() => readLastSeen(userId));
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setLastSeenDate(readLastSeen(userId));
  }, [userId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/job-feed/summary');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as JobFeedSummary;
        if (!cancelled) setSummary(data);
      } catch {
        // swallow — badge is best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, refreshTick]);

  useEffect(() => {
    const listener = () => setRefreshTick((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  // hasNewRun gates the daily popup only — it flips when a run newer than the
  // last acknowledged run arrives.
  const hasNewRun = Boolean(
    summary?.canAccess &&
    summary.latestRunDate &&
    summary.jobCount > 0 &&
    summary.latestRunDate !== lastSeenDate
  );

  // The badge number on the nav uses the live unprocessed count. It persists
  // across page loads until the user actually acts on each job.
  const unprocessedCount = summary?.unprocessedCount ?? 0;
  const hasPending = Boolean(summary?.canAccess && unprocessedCount > 0);

  const latestRunDate = summary?.latestRunDate ?? null;
  const acknowledge = useCallback(() => {
    if (!latestRunDate) return;
    writeLastSeen(latestRunDate, userId);
    setLastSeenDate(latestRunDate);
  }, [latestRunDate, userId]);

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  return {
    hasNewRun,
    hasPending,
    jobCount: summary?.jobCount ?? 0,
    unprocessedCount,
    latestRunDate,
    canAccess: summary?.canAccess ?? false,
    acknowledge,
    refresh,
  };
}
