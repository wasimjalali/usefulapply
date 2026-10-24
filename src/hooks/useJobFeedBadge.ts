'use client';

import { useCallback, useEffect, useState } from 'react';

const LAST_SEEN_KEY_PREFIX = 'usefulapply_job_feed_last_seen_run_date';

type JobFeedSummary = {
  canAccess: boolean;
  latestRunDate: string | null;
  jobCount: number;
  lastSeenRunDate: string | null;
};

function getLastSeenKey(userId?: string | null): string {
  return userId ? `${LAST_SEEN_KEY_PREFIX}:${userId}` : LAST_SEEN_KEY_PREFIX;
}

function readLocalCache(userId?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(getLastSeenKey(userId));
  } catch {
    return null;
  }
}

function writeLocalCache(value: string, userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getLastSeenKey(userId), value);
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

// Module-level event bus so any component that records job feedback can ping
// the badge to refetch the unprocessed count immediately.
type Listener = () => void;
const listeners = new Set<Listener>();
export function notifyJobFeedBadgeRefresh() {
  for (const listener of listeners) listener();
}

// The badge hook is mounted in three places, and a save or dismiss pings them
// all at once. Instances of one user share a request while it is in flight. A
// refresh asked for during a flight can't reuse it (it may predate the action),
// so it shares one follow-up that starts when the flight lands. Keyed by user,
// so a result never reaches another account's instance.
const inFlight = new Map<string, Promise<JobFeedSummary | null>>();
const followUp = new Map<string, Promise<JobFeedSummary | null>>();

function startFetch(key: string): Promise<JobFeedSummary | null> {
  const request = (async () => {
    try {
      const res = await fetch('/api/job-feed/summary');
      if (!res.ok) return null;
      return (await res.json()) as JobFeedSummary;
    } catch {
      // swallow, the badge is best-effort
      return null;
    } finally {
      if (inFlight.get(key) === request) inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}

function fetchSummary(userId: string | null | undefined, fresh: boolean): Promise<JobFeedSummary | null> {
  const key = userId ?? '';
  const current = inFlight.get(key);
  if (!current) return startFetch(key);
  if (!fresh) return current;
  let next = followUp.get(key);
  if (!next) {
    next = current.then(() => {
      followUp.delete(key);
      return startFetch(key);
    });
    followUp.set(key, next);
  }
  return next;
}

export function useJobFeedBadge(enabled: boolean, userId?: string | null) {
  const [summary, setSummary] = useState<JobFeedSummary | null>(null);
  const [lastSeenDate, setLastSeenDate] = useState<string | null>(() => readLocalCache(userId));
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setLastSeenDate(readLocalCache(userId));
  }, [userId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const data = await fetchSummary(userId, refreshTick > 0);
      if (!data || cancelled) return;
      setSummary(data);

      // DB is authoritative — sync localStorage cache from DB value
      if (data.lastSeenRunDate) {
        const localValue = readLocalCache(userId);
        if (localValue !== data.lastSeenRunDate) {
          writeLocalCache(data.lastSeenRunDate, userId);
          setLastSeenDate(data.lastSeenRunDate);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, refreshTick, userId]);

  useEffect(() => {
    const listener = () => setRefreshTick((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const hasNewRun = Boolean(
    summary?.canAccess &&
    summary.latestRunDate &&
    summary.jobCount > 0 &&
    summary.latestRunDate !== lastSeenDate
  );

  const latestRunDate = summary?.latestRunDate ?? null;
  const acknowledge = useCallback(() => {
    if (!latestRunDate) return;
    // Write to localStorage immediately for instant UI update
    writeLocalCache(latestRunDate, userId);
    setLastSeenDate(latestRunDate);
    // Persist to DB (fire-and-forget) — this is the authoritative write
    fetch('/api/job-feed/summary', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastSeenRunDate: latestRunDate }),
    }).catch(() => {});
  }, [latestRunDate, userId]);

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  return {
    hasNewRun,
    jobCount: summary?.jobCount ?? 0,
    latestRunDate,
    canAccess: summary?.canAccess ?? false,
    acknowledge,
    refresh,
  };
}
