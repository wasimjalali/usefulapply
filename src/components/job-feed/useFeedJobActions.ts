'use client';

/**
 * The actions a job card or the job detail can fire. Shared by the canvas and
 * the conversation so a click has the same effect wherever it happens, and so
 * anything worth telling the user lands in the feed conversation.
 */

import { useCallback, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { useCVStore } from '@/store/useCVStore';
import { selectFeedThreadKey, useFeedStore } from '@/store/useFeedStore';
import { loadMoreFeedJobs, loadSavedFeedJobs, recordFeedFeedback } from './feed-actions';
import { startFeedHandoff, type FeedHandoffMode } from './feed-handoff';
import { getJobFeedPreviewMode } from './preview-utils';

export interface FeedJobActions {
  /** Job id with an action in flight, so its card can show it. */
  busyJobId: string | null;
  openDetail: (job: JobFeedFeedItem) => void;
  save: (job: JobFeedFeedItem) => Promise<void>;
  openEmployerSite: (job: JobFeedFeedItem) => void;
  checkFit: (job: JobFeedFeedItem, mode?: FeedHandoffMode) => Promise<void>;
  loadMore: () => Promise<void>;
  showSaved: () => void;
  showToday: () => void;
}

function say(content: string) {
  const state = useFeedStore.getState();
  state.addMessage(selectFeedThreadKey(state), { role: 'assistant', content });
}

/**
 * The run to attribute an action to. A role opened from Saved may have been
 * ranked days ago, so sending today's run id would mis-attribute it. Null lets
 * the server resolve the job's own run.
 */
function actionRunId(): string | null {
  const state = useFeedStore.getState();
  if (state.listTab === 'saved') return null;
  return state.overview?.feedRun?.id ?? null;
}

export function useFeedJobActions(): FeedJobActions {
  const posthog = usePostHog();
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const openDetail = useCallback((job: JobFeedFeedItem) => {
    const store = useFeedStore.getState();
    store.openJobDetail(job.id);
    posthog?.capture('job_feed_item_opened', { job_id: job.id, company: job.company });
    void recordFeedFeedback(job, 'opened', actionRunId());
  }, [posthog]);

  const save = useCallback(async (job: JobFeedFeedItem) => {
    setBusyJobId(job.id);
    try {
      const result = await recordFeedFeedback(job, 'saved', actionRunId());
      if (!result.ok) {
        say(result.error);
        return;
      }
      posthog?.capture('job_feed_item_saved', { job_id: job.id, company: job.company });
      const next = useFeedStore.getState();
      if (next.savedJobs) {
        const updated = { ...job, feedback: result.data };
        const exists = next.savedJobs.some((item) => item.id === job.id);
        next.setSavedJobs(exists
          ? next.savedJobs.map((item) => (item.id === job.id ? updated : item))
          : [...next.savedJobs, updated]);
      }
    } finally {
      setBusyJobId(null);
    }
  }, [posthog]);

  const openEmployerSite = useCallback((job: JobFeedFeedItem) => {
    posthog?.capture('job_feed_external_apply_clicked', { job_id: job.id, company: job.company });
  }, [posthog]);

  const checkFit = useCallback(async (job: JobFeedFeedItem, mode: FeedHandoffMode = 'analyze') => {
    setBusyJobId(job.id);
    try {
      const hasCV = Boolean(useCVStore.getState().currentCV);
      const result = await startFeedHandoff(job, mode, { hasCV });
      if (!result.ok) {
        say(result.error);
        return;
      }
      posthog?.capture('job_feed_item_applied', { job_id: job.id, company: job.company, mode });
    } finally {
      setBusyJobId(null);
    }
  }, [posthog]);

  const loadMore = useCallback(async () => {
    const result = await loadMoreFeedJobs();
    if (!result.ok) say(result.error);
  }, []);

  const showSaved = useCallback(() => {
    const store = useFeedStore.getState();
    store.setListTab('saved');
    store.backToList();
    if (store.savedJobs !== null) return;
    if (getJobFeedPreviewMode() !== 'off') {
      // A preview never hits the network. Bookmarked items are already in the
      // snapshot, so the Saved tab reads them straight off today's list.
      store.setSavedJobs((store.overview?.jobs ?? []).filter((job) => job.feedback.savedAt));
      return;
    }
    void loadSavedFeedJobs().then((result) => {
      if (!result.ok) say(result.error);
    });
  }, []);

  const showToday = useCallback(() => {
    const store = useFeedStore.getState();
    store.setListTab('today');
    store.backToList();
  }, []);

  return { busyJobId, openDetail, save, openEmployerSite, checkFit, loadMore, showSaved, showToday };
}
