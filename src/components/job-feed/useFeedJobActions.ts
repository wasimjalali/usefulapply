'use client';

/**
 * The actions a job card or the job detail can fire. Shared by the canvas and
 * the conversation so a click has the same effect wherever it happens, and so
 * anything worth telling the user lands in the feed conversation.
 */

import { useCallback, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { useToast } from '@/components/ui/Toast';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { useCVStore } from '@/store/useCVStore';
import { selectFeedThreadKey, useFeedStore } from '@/store/useFeedStore';
import { loadFeedOverview, loadMoreFeedJobs, loadSavedFeedJobs, recordFeedFeedback } from './feed-actions';
import { startFeedHandoff, type FeedHandoffMode } from './feed-handoff';
import { getJobFeedPreviewMode } from './preview-utils';

export interface FeedJobActions {
  /** Job ids with an action in flight, so their cards can show it. */
  busyJobIds: ReadonlySet<string>;
  /** Job ids whose dismiss or "not relevant" (both take the role out of the feed) is in flight. */
  dismissingJobIds: ReadonlySet<string>;
  openDetail: (job: JobFeedFeedItem) => void;
  save: (job: JobFeedFeedItem) => Promise<void>;
  /** True when the role left the feed. */
  dismiss: (job: JobFeedFeedItem) => Promise<boolean>;
  /** Records "Good match". Nothing leaves the list. */
  rateHelpful: (job: JobFeedFeedItem) => Promise<void>;
  /** Terminal like dismiss. True when the role left the feed. */
  rateNotRelevant: (job: JobFeedFeedItem) => Promise<boolean>;
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
  const { toast } = useToast();
  const [busyJobIds, setBusyJobIds] = useState<ReadonlySet<string>>(() => new Set());
  const [dismissingJobIds, setDismissingJobIds] = useState<ReadonlySet<string>>(() => new Set());
  // The lock is per job: one action on a job at a time, any number of jobs at once.
  const lockedRef = useRef<Set<string>>(new Set());

  const begin = useCallback((jobId: string, dismissing = false): boolean => {
    if (lockedRef.current.has(jobId)) return false;
    lockedRef.current.add(jobId);
    setBusyJobIds((prev) => new Set(prev).add(jobId));
    if (dismissing) setDismissingJobIds((prev) => new Set(prev).add(jobId));
    return true;
  }, []);

  const end = useCallback((jobId: string) => {
    lockedRef.current.delete(jobId);
    const without = (prev: ReadonlySet<string>) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    };
    setBusyJobIds(without);
    setDismissingJobIds(without);
  }, []);

  const openDetail = useCallback((job: JobFeedFeedItem) => {
    const store = useFeedStore.getState();
    store.openJobDetail(job.id);
    posthog?.capture('job_feed_item_opened', { job_id: job.id, company: job.company });
    void recordFeedFeedback(job, 'opened', actionRunId());
  }, [posthog]);

  const save = useCallback(async (job: JobFeedFeedItem) => {
    if (!begin(job.id)) return;
    const action = job.feedback.savedAt ? 'unsaved' : 'saved';
    try {
      const result = await recordFeedFeedback(job, action, actionRunId());
      if (!result.ok) {
        say(result.error);
        return;
      }
      posthog?.capture(action === 'saved' ? 'job_feed_item_saved' : 'job_feed_item_unsaved', {
        job_id: job.id,
        company: job.company,
      });
      const next = useFeedStore.getState();
      if (next.savedJobs) {
        if (action === 'unsaved') {
          next.setSavedJobs(next.savedJobs.filter((item) => item.id !== job.id));
        } else {
          const updated = { ...job, feedback: result.data };
          const exists = next.savedJobs.some((item) => item.id === job.id);
          next.setSavedJobs(exists
            ? next.savedJobs.map((item) => (item.id === job.id ? updated : item))
            : [...next.savedJobs, updated]);
        }
      }
    } finally {
      end(job.id);
    }
  }, [posthog, begin, end]);

  // Dismiss and "Not relevant" both end the role for good: the server blocks the
  // row, so the card leaves every list the same way.
  const removeFromFeed = useCallback(async (
    job: JobFeedFeedItem,
    action: 'dismissed' | 'rated_not_relevant',
  ): Promise<boolean> => {
    if (!begin(job.id, true)) return false;
    try {
      const result = await recordFeedFeedback(job, action, actionRunId());
      // 404 is a role that's already gone, so the card should leave quietly.
      const alreadyGone = !result.ok && result.status === 404;
      if (!result.ok && result.status === 409) {
        // The server won't do it (applied, kit built, rated not relevant).
        // Nothing changed, so don't tombstone or remove: say so and
        // reload so the screen matches the server.
        // Read the live item: the card in hand may predate the change.
        const state = useFeedStore.getState();
        const live = [...(state.overview?.jobs ?? []), ...state.extraJobs, ...(state.savedJobs ?? [])]
          .find((item) => item.id === job.id) ?? job;
        const rated = live.feedback.matchRating === 'not_relevant';
        // A not-relevant role leaves the list on the reload, so there's nothing to explain.
        if (!rated) {
          toast.error(live.feedback.appliedAt || live.feedback.generationStatus === 'succeeded'
            ? "You've already applied to this role, so it stays in your list."
            : action === 'dismissed'
              ? "That role can't be dismissed now."
              : "That role can't be rated now.");
        }
        void loadFeedOverview({ quiet: true });
        if (useFeedStore.getState().savedJobs !== null) void loadSavedFeedJobs();
        return false;
      }
      if (!result.ok && !alreadyGone) {
        toast.error(result.error);
        return false;
      }
      const event = action === 'dismissed' ? 'job_feed_item_dismissed' : 'job_feed_item_rated_not_relevant';
      posthog?.capture(alreadyGone ? 'job_feed_item_dismiss_gone' : event, { job_id: job.id, company: job.company });
      // Leaves Today and Saved, and closes the detail if it was open. Also what
      // a preview needs, since it never refetches.
      useFeedStore.getState().removeJob(job.id);
      if (!alreadyGone) toast.success("That role won't come back.");
      return true;
    } finally {
      end(job.id);
    }
  }, [posthog, toast, begin, end]);

  const dismiss = useCallback((job: JobFeedFeedItem) => removeFromFeed(job, 'dismissed'), [removeFromFeed]);
  const rateNotRelevant = useCallback((job: JobFeedFeedItem) => removeFromFeed(job, 'rated_not_relevant'), [removeFromFeed]);

  const rateHelpful = useCallback(async (job: JobFeedFeedItem) => {
    if (job.feedback.matchRating === 'helpful') return;
    if (!begin(job.id)) return;
    try {
      const result = await recordFeedFeedback(job, 'rated_helpful', actionRunId());
      if (!result.ok && result.status === 404) {
        // The role left the feed since this screen loaded.
        useFeedStore.getState().removeJob(job.id);
        return;
      }
      if (!result.ok && result.status === 409) {
        toast.error("That role can't be rated now.");
        void loadFeedOverview({ quiet: true });
        if (useFeedStore.getState().savedJobs !== null) void loadSavedFeedJobs();
        return;
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      posthog?.capture('job_feed_item_rated_helpful', { job_id: job.id, company: job.company });
    } finally {
      end(job.id);
    }
  }, [posthog, toast, begin, end]);

  const openEmployerSite = useCallback((job: JobFeedFeedItem) => {
    posthog?.capture('job_feed_external_apply_clicked', { job_id: job.id, company: job.company });
  }, [posthog]);

  const checkFit = useCallback(async (job: JobFeedFeedItem, mode: FeedHandoffMode = 'analyze') => {
    if (!begin(job.id)) return;
    try {
      const hasCV = Boolean(useCVStore.getState().currentCV);
      const result = await startFeedHandoff(job, mode, { hasCV });
      if (!result.ok) {
        say(result.error);
        return;
      }
      posthog?.capture('job_feed_item_applied', { job_id: job.id, company: job.company, mode });
    } finally {
      end(job.id);
    }
  }, [posthog, begin, end]);

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

  return { busyJobIds, dismissingJobIds, openDetail, save, dismiss, rateHelpful, rateNotRelevant, openEmployerSite, checkFit, loadMore, showSaved, showToday };
}
