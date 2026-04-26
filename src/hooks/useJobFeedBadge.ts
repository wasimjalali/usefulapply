'use client';

import { useCallback, useEffect, useState } from 'react';

// Key stores the last run date the user has acknowledged (by opening the
// Job Feed tab or dismissing the popup). Runs newer than this count as "new".
const LAST_SEEN_KEY = 'karko_job_feed_last_seen_run_date';

type JobFeedSummary = {
  canAccess: boolean;
  latestRunDate: string | null;
  jobCount: number;
};

function readLastSeen(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, value);
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

export function useJobFeedBadge(enabled: boolean) {
  const [summary, setSummary] = useState<JobFeedSummary | null>(null);
  const [lastSeenDate, setLastSeenDate] = useState<string | null>(() => readLastSeen());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/job-feed/summary');
        if (!res.ok) return;
        const data = (await res.json()) as JobFeedSummary;
        if (!cancelled) setSummary(data);
      } catch {
        // swallow — badge is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const hasNewRun = Boolean(
    summary?.canAccess &&
    summary.latestRunDate &&
    summary.jobCount > 0 &&
    summary.latestRunDate !== lastSeenDate
  );

  // Called when the user acknowledges the new run (opens the tab or closes
  // the popup). Subsequent badges only appear when the next run posts.
  const latestRunDate = summary?.latestRunDate ?? null;
  const acknowledge = useCallback(() => {
    if (!latestRunDate) return;
    writeLastSeen(latestRunDate);
    setLastSeenDate(latestRunDate);
  }, [latestRunDate]);

  return {
    hasNewRun,
    jobCount: hasNewRun ? summary?.jobCount ?? 0 : 0,
    latestRunDate: summary?.latestRunDate ?? null,
    canAccess: summary?.canAccess ?? false,
    acknowledge,
  };
}
