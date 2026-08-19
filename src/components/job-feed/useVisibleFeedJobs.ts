'use client';

import { useMemo } from 'react';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { matchesFilters, useFeedStore } from '@/store/useFeedStore';

export interface FeedJobLists {
  /** Everything the run delivered, deduplicated. The morning message's record. */
  all: JobFeedFeedItem[];
  /** What the canvas shows: `all` (or the saved list) after the chat's filters. */
  visible: JobFeedFeedItem[];
}

/**
 * Today's list (or the saved list), before and after the chat's filters.
 *
 * Deliberately NOT a zustand selector: it builds new arrays, and a selector
 * that returns a fresh reference on every call re-renders forever. Subscribe
 * to the raw slices and derive once per change instead.
 */
export function useFeedJobLists(): FeedJobLists {
  const listTab = useFeedStore((state) => state.listTab);
  const overviewJobs = useFeedStore((state) => state.overview?.jobs);
  const extraJobs = useFeedStore((state) => state.extraJobs);
  const savedJobs = useFeedStore((state) => state.savedJobs);
  const filters = useFeedStore((state) => state.filters);

  return useMemo(() => {
    const source = listTab === 'saved'
      ? (savedJobs ?? [])
      : [...(overviewJobs ?? []), ...extraJobs];

    const seen = new Set<string>();
    const deduped: JobFeedFeedItem[] = [];
    for (const job of source) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      deduped.push(job);
    }
    return { all: deduped, visible: deduped.filter((job) => matchesFilters(job, filters)) };
  }, [extraJobs, filters, listTab, overviewJobs, savedJobs]);
}

/** The list the canvas renders. */
export function useVisibleFeedJobs(): JobFeedFeedItem[] {
  return useFeedJobLists().visible;
}
