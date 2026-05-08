'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  Building2,
  CalendarClock,
  Loader2,
  PauseCircle,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { KarkoIcon } from '@/components/KarkoLogo';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  JOB_FEED_COUNTRY_OPTIONS,
  JOB_FEED_INBOX_PAGE_SIZE,
  getJobFeedInputCaps,
} from '@/lib/job-feed/constants';
import { createDefaultJobFeedInput, getJobFeedOverviewState, toJobFeedInput } from '@/lib/job-feed/helpers';
import type {
  JobFeedApplyResponse,
  JobFeedFeedbackResponse,
  JobFeedFeedItem,
  JobFeedOverviewResponse,
  JobFeedOverviewState,
  JobFeedRunDiagnostics,
  JobFeedSettingsInput,
} from '@/lib/job-feed/types';
import { notifyJobFeedBadgeRefresh } from '@/hooks/useJobFeedBadge';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore, type ApplicationSession as StoreApplicationSession } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
import {
  type JobFeedPreviewMode,
  getJobFeedPreviewMode,
  buildJobFeedPreviewSnapshot,
  toPreviewJobFeedSettings,
} from './preview-utils';
import {
  FeedResultsCard,
  JobFeedDetailModal,
  RunStatPill,
} from './feed-cards';
import { SmartFeedProgressCard } from './SmartFeedProgressCard';
import { AISearchProfileCard } from './AISearchProfileCard';
import { SearchStrategyPreviewCard } from './SearchStrategyPreviewCard';
import { JobFeedPreferencesCard } from './JobFeedPreferencesCard';
import { JobFeedSetupBuildingCard } from './JobFeedSetupBuildingCard';

type SaveState = 'idle' | 'saving';
type PendingJobAction = {
  jobId: string;
  action: 'apply' | 'save' | 'dismiss' | 'rate';
} | null;
type ManualRunNotice = {
  kind: 'cooldown' | 'success';
  title: string;
  lines: string[];
  stats?: Array<{ label: string; value: string }>;
} | null;

export function JobFeedPanel() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const currentCV = useCVStore((state) => state.currentCV);
  const { toast } = useToast();
  const posthog = usePostHog();
  const [previewMode] = useState<JobFeedPreviewMode>(() => getJobFeedPreviewMode());
  const [overview, setOverview] = useState<JobFeedOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
  // First-time-save flag. While true, the setup view renders the
  // building-progress card while Karko synthesizes the profile and search
  // strategy in the background. Resets when both AI calls complete or fail.
  const [isBuildingFirstFeed, setIsBuildingFirstFeed] = useState(false);
  const [draftForm, setDraftForm] = useState<JobFeedSettingsInput | null>(null);
  const [isRunningManualFeed, setIsRunningManualFeed] = useState(false);
  const [isRunningDebugFlow, setIsRunningDebugFlow] = useState(false);
  // Today's inbox is paginated server-side via /api/job-feed/inbox.
  // overview returns the first page; additionalJobs holds pages 2+ the user
  // has loaded. Reset on tab switch and on each overview reload.
  const [additionalJobs, setAdditionalJobs] = useState<JobFeedFeedItem[]>([]);
  const [isLoadingMoreJobs, setIsLoadingMoreJobs] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobFeedFeedItem | null>(null);
  const [manualRunNotice, setManualRunNotice] = useState<ManualRunNotice>(null);
  const [pendingJobAction, setPendingJobAction] = useState<PendingJobAction>(null);
  const [form, setForm] = useState<JobFeedSettingsInput>(() => createDefaultJobFeedInput(getBrowserTimeZone()));

  // Tab state: "today" shows today's ranked feed, "saved" shows bookmarked jobs.
  // Saved jobs are fetched lazily on first switch so the default view stays fast.
  const [activeTab, setActiveTab] = useState<'today' | 'saved'>('today');
  const [savedJobs, setSavedJobs] = useState<JobFeedFeedItem[] | null>(null);
  const [isLoadingSavedJobs, setIsLoadingSavedJobs] = useState(false);
  // Tracks the run ID the user is currently browsing. Set once on initial
  // load and only updated on explicit user actions (refresh, tab switch).
  // Background polling must NOT update this — doing so would reset
  // additionalJobs mid-browse and lose the user's scroll position.
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const lastTrackedState = useRef<string | null>(null);
  const setupWizardRef = useRef<HTMLDivElement | null>(null);
  const pollAttemptsRef = useRef(0);
  const jobFeedOpenedCapturedRef = useRef(false);
  const pollDeadlineRef = useRef<number | null>(null);
  const isPreviewing = previewMode !== 'off';
  const isSignedIn = isPreviewing ? previewMode !== 'signed_out' : Boolean(user);

  // Stable ref to the toast API. The `toast` object returned by useToast()
  // is a fresh literal on every ToastProvider render, which would otherwise
  // invalidate every useCallback that depends on it and re-run the effects
  // that depend on those callbacks — causing the Job Feed to re-fetch on
  // every toast anywhere in the app.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const showDebugActions = !isPreviewing && process.env.NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG === 'true';
  const getManualRunAvailability = useCallback(() => {
    // One manual run per local calendar day. The cooldown key is the
    // local_date of the last manual run — not its completed_at — so the
    // next window always opens at local midnight regardless of what time
    // the run happened.
    const cooldown = getManualRunCooldown({
      latestManualLocalDate: overview?.latestManualRun?.local_date ?? null,
      timeZone: overview?.settings?.user_timezone ?? null,
    });

    if (overview?.latestRun?.status === 'queued' || overview?.latestRun?.status === 'running') {
      return {
        canStart: false,
        reason: 'preparing' as const,
        remainingMs: cooldown.remainingMs,
        nextRunAt: cooldown.nextRunAt,
      };
    }

    if (cooldown.remainingMs > 0) {
      return {
        canStart: false,
        reason: 'cooldown' as const,
        remainingMs: cooldown.remainingMs,
        nextRunAt: cooldown.nextRunAt,
      };
    }

    return {
      canStart: true,
      reason: null,
      remainingMs: 0,
      nextRunAt: cooldown.nextRunAt,
    };
  }, [overview?.latestManualRun?.local_date, overview?.latestRun?.status, overview?.settings?.user_timezone]);

  const loadOverview = useCallback(async (options?: { quiet?: boolean }): Promise<JobFeedOverviewResponse | null> => {
    if (isPreviewing) {
      setIsLoading(false);
      setIsRefreshing(false);
      return null;
    }

    if (!options?.quiet) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch('/api/job-feed/overview', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load Job Feed.');
      }

      const nextOverview = payload as JobFeedOverviewResponse;
      setOverview(nextOverview);
      setForm(toJobFeedInput(nextOverview.settings, getBrowserTimeZone()));
      setDraftForm(null);
      return nextOverview;
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Failed to load Job Feed.');
      return null;
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isPreviewing]);

  const loadSavedJobs = useCallback(async () => {
    if (isPreviewing) {
      setSavedJobs([]);
      return;
    }
    setIsLoadingSavedJobs(true);
    try {
      const response = await fetch('/api/job-feed/saved', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load saved jobs.');
      }
      setSavedJobs((payload.jobs ?? []) as JobFeedFeedItem[]);
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Failed to load saved jobs.');
      setSavedJobs([]);
    } finally {
      setIsLoadingSavedJobs(false);
    }
  }, [isPreviewing]);

  const handleLoadMoreJobs = useCallback(async () => {
    if (!overview || isLoadingMoreJobs) return;
    const already = overview.jobs.length + additionalJobs.length;
    if (already >= (overview.jobsTotalCount ?? 0)) return;

    setIsLoadingMoreJobs(true);
    try {
      const response = await fetch(`/api/job-feed/inbox?offset=${already}&limit=${JOB_FEED_INBOX_PAGE_SIZE}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load more jobs.');
      }
      const nextItems = (payload.items ?? []) as JobFeedFeedItem[];
      setAdditionalJobs((prev) => [...prev, ...nextItems]);
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Failed to load more jobs.');
    } finally {
      setIsLoadingMoreJobs(false);
    }
  }, [overview, additionalJobs.length, isLoadingMoreJobs]);

  const handleShowSavedJobs = useCallback(() => {
    setActiveTab('saved');
    // Collapse "show all" state when switching tabs so each view starts clean.
    // Resetting activeRunId drives the additionalJobs clear via its effect.
    setActiveRunId(null);
    if (savedJobs === null) {
      void loadSavedJobs();
    }
  }, [loadSavedJobs, savedJobs]);

  const handleShowTodayFeed = useCallback(() => {
    setActiveTab('today');
    // Resetting activeRunId drives the additionalJobs clear via its effect,
    // and the initialise effect above will re-set it from the current overview.
    setActiveRunId(null);
  }, []);

  useEffect(() => {
    if (isPreviewing) {
      const snapshot = buildJobFeedPreviewSnapshot(previewMode, getBrowserTimeZone());
      setOverview(snapshot.overview);
      setForm(snapshot.form);
      setIsEditing(false);
      setIsSetupWizardOpen(false);
      setDraftForm(null);
      setAdditionalJobs([]);
      setSelectedJob(null);
      setIsLoading(false);
      return;
    }

    if (!user) {
      setIsLoading(false);
      return;
    }

    loadOverview();
  }, [isPreviewing, loadOverview, previewMode, user]);

  useEffect(() => {
    if (isPreviewing || !isSignedIn || !profile) return;
    if (jobFeedOpenedCapturedRef.current) return;
    if (!posthog) return;
    jobFeedOpenedCapturedRef.current = true;
    posthog.capture('job_feed_opened', {
      foundation_mode: true,
      subscription_tier: profile.subscription_tier ?? 'unknown',
    });
  }, [isPreviewing, isSignedIn, posthog, profile]);

  // Poll the overview every 5 seconds while a run is in progress so the
  // UI switches from the progress card to the results the moment the
  // server marks the run completed. Survives tab/panel switches because
  // it's driven by the server row, not a local setTimeout on the fetch.
  // Capped at 240 attempts (~20 min) so a stuck run never polls forever.
  useEffect(() => {
    if (isPreviewing) return;
    const status = overview?.latestRun?.status;
    const isInFlight = status === 'running' || status === 'queued' || isRunningManualFeed;

    if (!isInFlight) {
      pollAttemptsRef.current = 0;
      pollDeadlineRef.current = null;
      return;
    }

    if (pollDeadlineRef.current === null) {
      pollDeadlineRef.current = Date.now() + 20 * 60_000;
      pollAttemptsRef.current = 0;
    }

    const id = setInterval(async () => {
      pollAttemptsRef.current += 1;
      if (
        pollAttemptsRef.current > 240 ||
        (pollDeadlineRef.current !== null && Date.now() > pollDeadlineRef.current)
      ) {
        clearInterval(id);
        return;
      }
      await loadOverview({ quiet: true });
    }, 5000);
    return () => clearInterval(id);
  }, [isPreviewing, isRunningManualFeed, loadOverview, overview?.latestRun?.id, overview?.latestRun?.status]);

  useEffect(() => {
    if (isPreviewing) return;
    if (!posthog || !overview?.state) return;
    if (lastTrackedState.current === overview.state) return;

    lastTrackedState.current = overview.state;
    posthog.capture('job_feed_state_viewed', {
      state: overview.state,
      foundation_mode: true,
    });
  }, [isPreviewing, overview?.state, posthog]);

  // Initialise activeRunId once on first load. Background polling updates
  // overview?.feedRun?.id without changing activeRunId so additionalJobs
  // (the "Load more" pages) stay intact during polling.
  useEffect(() => {
    if (overview?.feedRun?.id && activeRunId === null) {
      setActiveRunId(overview.feedRun.id);
    }
  }, [overview?.feedRun?.id, activeRunId]);

  // Reset additionalJobs only when the user intentionally navigates to a
  // new run (activeRunId changes), not on every background poll.
  useEffect(() => {
    setAdditionalJobs([]);
  }, [activeRunId]);

  useEffect(() => {
    if (isSignedIn) {
      return;
    }

    setIsEditing(false);
    setIsSetupWizardOpen(false);
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSetupWizardOpen) {
      return;
    }

    setupWizardRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [isSetupWizardOpen]);

  const updateJobFeedbackState = useCallback((jobId: string, feedback: JobFeedFeedbackResponse['feedback']) => {
    setOverview((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        jobs: prev.jobs.map((job) => (
          job.id === jobId
            ? { ...job, feedback }
            : job
        )),
      };
    });

    setSelectedJob((prev) => (
      prev?.id === jobId
        ? { ...prev, feedback }
        : prev
    ));
  }, []);

  const applyPreviewFeedback = useCallback((jobId: string, action: 'opened' | 'saved' | 'dismissed' | 'applied' | 'rated_helpful' | 'rated_not_relevant') => {
    const now = new Date().toISOString();

    const mutateFeedback = (feedback: JobFeedFeedItem['feedback']) => {
      switch (action) {
        case 'opened':
          return {
            ...feedback,
            openedAt: feedback.openedAt ?? now,
          };
        case 'saved':
          return {
            ...feedback,
            savedAt: feedback.savedAt ?? now,
          };
        case 'dismissed':
          return {
            ...feedback,
            dismissedAt: now,
          };
        case 'applied':
          return {
            ...feedback,
            applyStartedAt: feedback.applyStartedAt ?? now,
            appliedAt: feedback.appliedAt ?? now,
            applicationSessionId: feedback.applicationSessionId ?? 'preview-session',
            generationStatus: 'succeeded' as const,
            generationError: null,
          };
        case 'rated_helpful':
          return {
            ...feedback,
            openedAt: feedback.openedAt ?? now,
            matchRating: 'helpful' as const,
          };
        case 'rated_not_relevant':
          return {
            ...feedback,
            openedAt: feedback.openedAt ?? now,
            matchRating: 'not_relevant' as const,
          };
      }
    };

    setOverview((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        jobs: prev.jobs.map((job) => (
          job.id === jobId
            ? { ...job, feedback: mutateFeedback(job.feedback) }
            : job
        )),
      };
    });

    setSelectedJob((prev) => (
      prev?.id === jobId
        ? { ...prev, feedback: mutateFeedback(prev.feedback) }
        : prev
    ));
  }, []);

  const removeJobFromOverview = useCallback((jobId: string) => {
    // Optimistic removal from the visible arrays so the card disappears
    // immediately. Counts (jobsTodayCount / jobsBacklogCount / total)
    // intentionally stay untouched here; a follow-up quiet overview
    // reload will rehydrate them from the server, which is the one
    // place that knows whether the removed job was from today's run or
    // an earlier day. Trying to guess locally risks off-by-one in the
    // header counter the user sees every time they dismiss.
    setOverview((prev) => {
      if (!prev) return prev;
      const jobs = prev.jobs.filter((job) => job.id !== jobId);
      if (jobs.length === prev.jobs.length) return prev;
      return { ...prev, jobs };
    });
    setAdditionalJobs((prev) => prev.filter((job) => job.id !== jobId));
    setSavedJobs((prev) => (prev ? prev.filter((job) => job.id !== jobId) : prev));
  }, []);

  const syncApplicationSession = useCallback((payload: Pick<JobFeedApplyResponse, 'session' | 'generation'>) => {
    const mappedSession = toStoreApplicationSession(payload.session, payload.generation);
    const sessionStore = useSessionStore.getState();
    sessionStore.setSessions([
      mappedSession,
      ...sessionStore.sessions.filter((item) => item.id !== mappedSession.id),
    ]);
    sessionStore.loadSession(mappedSession.id);
  }, []);

  const recordJobFeedback = useCallback(async (
    job: JobFeedFeedItem,
    action: 'opened' | 'saved' | 'dismissed' | 'rated_helpful' | 'rated_not_relevant'
  ) => {
    const response = await fetch('/api/job-feed/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: job.id,
        action,
        runId: overview?.feedRun?.id ?? null,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to update job feed feedback.');
    }

    const typedPayload = payload as JobFeedFeedbackResponse;
    updateJobFeedbackState(job.id, typedPayload.feedback);
    // Ping the dashboard badge so the unprocessed count refetches.
    notifyJobFeedBadgeRefresh();
    return typedPayload.feedback;
  }, [overview?.feedRun?.id, updateJobFeedbackState]);

  const handleOpenDetails = useCallback((job: JobFeedFeedItem) => {
    setSelectedJob(job);

    if (isPreviewing) {
      applyPreviewFeedback(job.id, 'opened');
      return;
    }

    posthog?.capture('job_feed_item_opened', {
      foundation_mode: true,
      job_id: job.id,
      job_title: job.title,
      company: job.company,
      feed_run_id: overview?.feedRun?.id ?? null,
    });

    void recordJobFeedback(job, 'opened').catch((error) => {
      console.error('[JobFeedPanel] Failed to record opened feedback:', error);
    });
  }, [applyPreviewFeedback, isPreviewing, overview?.feedRun?.id, posthog, recordJobFeedback]);

  const handleSaveJob = useCallback(async (job: JobFeedFeedItem) => {
    setPendingJobAction({ jobId: job.id, action: 'save' });

    try {
      if (isPreviewing) {
        applyPreviewFeedback(job.id, 'saved');
        toastRef.current.success('Preview updated locally.');
        return;
      }

      await recordJobFeedback(job, 'saved');
      posthog?.capture('job_feed_item_saved', {
        foundation_mode: true,
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        feed_run_id: overview?.feedRun?.id ?? null,
      });
      // Invalidate the cached Saved list so it refetches fresh on next open.
      setSavedJobs(null);
      toastRef.current.success('Saved. Find it later under the Saved tab.');
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Failed to save this job.');
    } finally {
      setPendingJobAction(null);
    }
  }, [applyPreviewFeedback, isPreviewing, overview?.feedRun?.id, posthog, recordJobFeedback]);

  const handleDismissJob = useCallback(async (job: JobFeedFeedItem) => {
    setPendingJobAction({ jobId: job.id, action: 'dismiss' });

    try {
      if (isPreviewing) {
        applyPreviewFeedback(job.id, 'dismissed');
        removeJobFromOverview(job.id);
        if (selectedJob?.id === job.id) {
          setSelectedJob(null);
        }
        toastRef.current.success('Preview updated locally.');
        return;
      }

      await recordJobFeedback(job, 'dismissed');
      removeJobFromOverview(job.id);
      if (selectedJob?.id === job.id) {
        setSelectedJob(null);
      }

      posthog?.capture('job_feed_item_dismissed', {
        foundation_mode: true,
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        feed_run_id: overview?.feedRun?.id ?? null,
      });
      toastRef.current.success('Dismissed from your current feed.');
      // Rehydrate the header counts from the server. Local optimistic
      // counts can't know whether the removed job was from today's run
      // or earlier, so we let the server recompute.
      void loadOverview({ quiet: true });
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Failed to dismiss this job.');
    } finally {
      setPendingJobAction(null);
    }
  }, [applyPreviewFeedback, isPreviewing, loadOverview, overview?.feedRun?.id, posthog, recordJobFeedback, removeJobFromOverview, selectedJob?.id]);

  const handleRateMatch = useCallback(async (job: JobFeedFeedItem, rating: 'helpful' | 'not_relevant') => {
    // If the user clicks the same rating twice in a row, treat as no-op so we
    // don't POST duplicate events.
    if (job.feedback.matchRating === rating) {
      return;
    }

    const action = rating === 'helpful' ? 'rated_helpful' : 'rated_not_relevant';
    setPendingJobAction({ jobId: job.id, action: 'rate' });

    try {
      if (isPreviewing) {
        applyPreviewFeedback(job.id, action);
        toastRef.current.success('Thanks, preview updated locally.');
        return;
      }

      const feedback = await recordJobFeedback(job, action);
      // Mirror state into the currently open details modal so the selection
      // reflects immediately without waiting on a re-render from the list.
      if (selectedJob?.id === job.id) {
        setSelectedJob((prev) => (prev ? { ...prev, feedback } : prev));
      }

      posthog?.capture('job_feed_item_rated', {
        foundation_mode: true,
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        rating,
        feed_run_id: overview?.feedRun?.id ?? null,
      });

      if (rating === 'not_relevant') {
        // Hide the job right away. Rating as not relevant is a terminal
        // action, same as dismissing. Close the modal if it was open.
        removeJobFromOverview(job.id);
        if (selectedJob?.id === job.id) {
          setSelectedJob(null);
        }
        // Rehydrate header counts (today vs. earlier days).
        void loadOverview({ quiet: true });
      }

      toastRef.current.success(
        rating === 'helpful'
          ? 'Thanks. We\'ll keep sending roles like this.'
          : 'Got it. We\'ll tune your feed away from this.'
      );
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Failed to save your rating.');
    } finally {
      setPendingJobAction(null);
    }
  }, [applyPreviewFeedback, isPreviewing, loadOverview, overview?.feedRun?.id, posthog, recordJobFeedback, removeJobFromOverview, selectedJob?.id]);

  // Shared handler for both "Apply with Karko" (full generation) and
  // "Check fit first" (0.5-credit analyze-first). Posts to the same
  // apply endpoint to create/reuse the session + generation row, then
  // routes into the Application Kit with a different autostart signal.
  const startKarkoHandoff = useCallback(async (job: JobFeedFeedItem, mode: 'apply' | 'analyze') => {
    const isRetry =
      job.feedback.generationStatus === 'failed' ||
      job.feedback.generationStatus === 'cancelled';
    setPendingJobAction({ jobId: job.id, action: 'apply' });

    try {
      if (isPreviewing) {
        applyPreviewFeedback(job.id, 'applied');
        toastRef.current.success('Preview updated locally. This local preview does not create an application session.');
        return;
      }

      if (isRetry) {
        posthog?.capture('job_feed_retry_clicked', {
          foundation_mode: true,
          job_id: job.id,
          job_title: job.title,
          company: job.company,
          feed_run_id: overview?.feedRun?.id ?? null,
          previous_generation_status: job.feedback.generationStatus,
          session_id: job.feedback.applicationSessionId,
        });
      }

      const response = await fetch('/api/job-feed/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: job.id,
          runId: overview?.feedRun?.id ?? null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to start the application handoff.');
      }

      const typedPayload = payload as JobFeedApplyResponse;
      updateJobFeedbackState(job.id, typedPayload.feedback);
      syncApplicationSession(typedPayload);
      setSelectedJob(null);
      const shouldAutostartGeneration = Boolean(currentCV) && typedPayload.generation.status === 'intent_created';

      // Fire the in-memory signal for the current tab. The URL carries the
      // same autostart intent so refresh/new-tab recovery can still work.
      if (shouldAutostartGeneration) {
        useUIStore.getState().setPendingJobFeedAutostart({
          sessionId: typedPayload.session.id,
          generationId: typedPayload.generation.id,
          generationAttempt: typedPayload.generation.attempt,
          mode,
        });
      }

      posthog?.capture('job_feed_item_applied', {
        foundation_mode: true,
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        feed_run_id: overview?.feedRun?.id ?? null,
        created_session: typedPayload.created,
      });

      const handoffLabel = mode === 'analyze' ? 'Checking fit' : 'Generating your application';
      toastRef.current.success(
        shouldAutostartGeneration
          ? `${job.title} at ${job.company}. ${handoffLabel}...`
          : currentCV
            ? `${job.title} at ${job.company}. Opening your application workspace.`
            : `${job.title} at ${job.company}. Upload your CV to continue.`
      );

      router.push(buildJobFeedApplyPath({
        sessionId: typedPayload.session.id,
        generationId: typedPayload.generation.id,
        generationAttempt: typedPayload.generation.attempt,
        autostart: shouldAutostartGeneration,
        mode,
      }));
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Failed to start the Karko AI application handoff.');
    } finally {
      setPendingJobAction(null);
    }
  }, [applyPreviewFeedback, currentCV, isPreviewing, overview?.feedRun?.id, posthog, router, syncApplicationSession, updateJobFeedbackState]);

  const handleApplyWithKarko = useCallback(
    (job: JobFeedFeedItem) => startKarkoHandoff(job, 'apply'),
    [startKarkoHandoff],
  );
  const handleAnalyzeFirst = useCallback(
    (job: JobFeedFeedItem) => startKarkoHandoff(job, 'analyze'),
    [startKarkoHandoff],
  );

  const handleExternalApply = useCallback((job: JobFeedFeedItem) => {
    if (isPreviewing) {
      return;
    }

    posthog?.capture('job_feed_external_apply_clicked', {
      foundation_mode: true,
      job_id: job.id,
      job_title: job.title,
      company: job.company,
      feed_run_id: overview?.feedRun?.id ?? null,
    });
  }, [isPreviewing, overview?.feedRun?.id, posthog]);

  const handleSave = async (nextForm: JobFeedSettingsInput) => {
    setSaveState('saving');

    try {
      const consentReady = nextForm.consent_accepted || Boolean(overview?.settings?.consent_accepted_at);

      if (isPreviewing) {
        const previewSettings = toPreviewJobFeedSettings(nextForm);

        setOverview((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            settings: previewSettings,
            state: getJobFeedOverviewState({
              canAccess: prev.canAccess,
              settings: previewSettings,
              latestRun: prev.latestRun,
              jobsCount: prev.jobs.length,
            }),
          };
        });
        setForm(nextForm);
        setDraftForm(null);

        toast.success(
          nextForm.enabled && consentReady
            ? 'Preview updated. The feed would be eligible to run with these settings.'
            : 'Preview updated. These settings are saved locally for layout verification.'
        );
        setIsEditing(false);
        setIsSetupWizardOpen(false);
        return;
      }

      // First-time setup: synthesize the AI career profile FIRST so the
      // settings PUT below can mirror target_roles / skills / seniority
      // from it. The settings handler rejects payloads where final
      // target_roles is empty, which is exactly what happens on first save
      // when user_career_profiles has no row yet.
      const wasFirstTimeSetup = !overview?.settings;
      if (wasFirstTimeSetup) {
        setIsBuildingFirstFeed(true);
      }

      try {
        if (wasFirstTimeSetup) {
          const profileResponse = await fetch('/api/job-feed/career-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true }),
          });
          const profilePayload = await profileResponse.json().catch(() => ({}));
          if (!profileResponse.ok || profilePayload?.status === 'no_cv') {
            throw new Error(
              profilePayload?.status === 'no_cv'
                ? 'Upload your CV first so Karko can build your search profile.'
                : (profilePayload?.error || 'Could not build your AI search profile. Please try again.')
            );
          }
        }

        const response = await fetch('/api/job-feed/settings', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nextForm),
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to save Job Feed settings.');
        }

        posthog?.capture('job_feed_setup_completed', {
          foundation_mode: true,
          enabled: nextForm.enabled,
          target_market: nextForm.target_market,
          roles_count: nextForm.target_roles.length,
        });

        setForm(nextForm);
        setDraftForm(null);

        // Reload overview immediately after settings save so we can check
        // whether this was genuinely a first-time setup (not a race where
        // settings already existed). Uses the fresh server state, not the
        // stale pre-save overview that wasFirstTimeSetup was derived from.
        await loadOverview({ quiet: true });

        // Fire on every successful save — the endpoint is cache-aware and only
        // regenerates when the underlying profile or settings hash changed.
        // Non-fatal: a failure here is logged and ignored. The next feed run
        // will regenerate the strategy lazily via loadOrGenerateSearchStrategyAdmin.
        try {
          const strategyRes = await fetch('/api/job-feed/search-strategy', { method: 'POST' });
          if (!strategyRes.ok) {
            const strategyBody = await strategyRes.json().catch(() => ({}));
            console.error('[job-feed] search-strategy POST failed:', strategyRes.status, strategyBody?.error ?? '');
          }
        } catch (error) {
          console.error('[job-feed] search-strategy generation failed:', error);
        }

        toast.success(nextForm.enabled && consentReady ? 'Your AI feed is ready.' : 'Preferences saved.');
        setIsEditing(false);
        setIsSetupWizardOpen(false);
      } finally {
        if (wasFirstTimeSetup) {
          setIsBuildingFirstFeed(false);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save Job Feed settings.');
    } finally {
      setSaveState('idle');
    }
  };

  const handleDebugRun = async (options?: { force?: boolean }) => {
    const force = options?.force === true;
    setIsRunningDebugFlow(true);

    try {
      const response = await fetch('/api/job-feed/dev/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to run the diagnostics workflow.');
      }

      posthog?.capture('job_feed_foundation_run_requested', {
        foundation_mode: true,
        forced: force,
      });

      const toastMessage = payload.skipped
        ? 'Today already has a completed run. Use "Force rerun" to recompute.'
        : `Direct run completed: ${payload.rawJobsFetched ?? 0} raw jobs → ${payload.jobsAfterPrefilter ?? 0} after filter → ${payload.rankedJobsCount ?? 0} ranked.`;

      toast.success(toastMessage);
      await loadOverview({ quiet: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run the diagnostics workflow.');
    } finally {
      setIsRunningDebugFlow(false);
    }
  };

  const handleRunTodayFeed = async () => {
    const availability = getManualRunAvailability();
    if (!availability.canStart) {
      setManualRunNotice(buildManualRunBlockedNotice({
        reason: availability.reason,
        nextRunAt: availability.nextRunAt,
      }));
      return;
    }

    setIsRunningManualFeed(true);

    try {
      const response = await fetch('/api/job-feed/run', {
        method: 'POST',
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || 'Failed to run today\'s Job Feed.');
      }

      posthog?.capture('job_feed_manual_run_requested', {
        foundation_mode: true,
        skipped: Boolean(payload.skipped),
        status: payload.status ?? null,
      });

      if (payload.cooldown) {
        setManualRunNotice(buildManualRunBlockedNotice({
          reason: 'cooldown',
          nextRunAt: payload.nextRunAt ?? null,
        }));
      } else if (payload.skipped) {
        setManualRunNotice(buildManualRunBlockedNotice({
          reason: payload.status === 'completed' ? 'cooldown' : 'preparing',
          nextRunAt: payload.nextRunAt ?? null,
        }));
      } else {
        // New run completed — reset activeRunId so additionalJobs clears
        // and reinitialises from the fresh run's feed.
        setActiveRunId(null);
        const nextOverview = await loadOverview({ quiet: true });
        setManualRunNotice(buildManualRunSuccessNotice(payload, nextOverview));
        return;
      }

      await loadOverview({ quiet: true });
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Failed to run today\'s Job Feed.');
    } finally {
      setIsRunningManualFeed(false);
    }
  };

  const openSetupWizard = useCallback(() => {
    setDraftForm(toJobFeedInput(overview?.settings ?? null, getBrowserTimeZone()));
    setIsEditing(true);

    if (isSetupWizardOpen) {
      setupWizardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    setIsSetupWizardOpen(true);
  }, [isSetupWizardOpen, overview?.settings]);
  const updateDraftForm = useCallback((updater: (prev: JobFeedSettingsInput) => JobFeedSettingsInput) => {
    // openSetupWizard always initialises draftForm before this is called,
    // so prev should never be null here. The nullish coalesce is defensive only.
    setDraftForm((prev) => updater(prev ?? createDefaultJobFeedInput(getBrowserTimeZone())));
  }, []);

  const currentState = isSignedIn ? (overview?.state ?? 'setup_required') : 'sign_in_required';
  const setupOpen = isSignedIn && (isEditing || isSetupWizardOpen);
  const canAccess = Boolean(overview?.canAccess);
  const shellForm = isSignedIn && overview?.settings
    ? toJobFeedInput(overview.settings, getBrowserTimeZone())
    : form;
  const userTimeZone = overview?.settings?.user_timezone ?? shellForm.user_timezone;
  const todayLocalDate = getLocalDateKeyForTimeZone(new Date(), userTimeZone);
  const latestRunIsToday = overview?.latestRun?.local_date === todayLocalDate;
  const completedToday = latestRunIsToday && overview?.latestRun?.status === 'completed';
  const manualRunCooldown = getManualRunCooldown({
    latestManualLocalDate: overview?.latestManualRun?.local_date ?? null,
    timeZone: userTimeZone ?? null,
  });
  const isInManualRunCooldown = manualRunCooldown.remainingMs > 0;
  const isPreparingToday = latestRunIsToday && (overview?.latestRun?.status === 'queued' || overview?.latestRun?.status === 'running');
  const canUseManualRun = activeTab === 'today'
    && canAccess
    && Boolean(overview?.settings)
    && currentState !== 'setup_required'
    && currentState !== 'paused'
    && currentState !== 'upgrade_required';
  const hasFeedCards = Boolean(overview?.jobs && overview.jobs.length > 0);
  const showHeaderRunButton = canUseManualRun && hasFeedCards;
  const showCenteredRunButton = canUseManualRun && !hasFeedCards;
  const wizardForm = draftForm ?? form;
  const inputCaps = getJobFeedInputCaps(profile?.subscription_tier ?? null);
  const showStateSupportCard = isSignedIn
    && !setupOpen
    && currentState !== 'upgrade_required'
    && currentState !== 'ready'
    && currentState !== 'thin_feed';
  const showFeedResults = isSignedIn
    && !setupOpen
    && !isLoading
    && Boolean(overview?.jobs && overview.jobs.length > 0);
  return (
    <div className="min-h-full bg-cream-100">
      <div className={`mx-auto flex flex-col gap-5 px-4 py-4 sm:px-6 ${setupOpen ? 'max-w-5xl' : 'max-w-7xl'}`}>
        {isLoading ? (
          <LoadingState />
        ) : !isSignedIn ? (
          <SignedOutStage />
        ) : currentState === 'upgrade_required' ? (
          <UpgradeStage />
        ) : (
          <>
            {!setupOpen && (
              <FeedPageHeader
                currentState={currentState}
                form={shellForm}
                jobsTodayCount={overview?.jobsTodayCount ?? 0}
                jobsBacklogCount={overview?.jobsBacklogCount ?? 0}
                savedJobsCount={savedJobs?.length ?? null}
                activeTab={activeTab}
                latestRun={overview?.feedRun ?? overview?.latestRun ?? null}
                isRefreshing={isRefreshing || isLoadingSavedJobs}
                canRunTodayFeed={showHeaderRunButton}
                hasCompletedToday={completedToday || isInManualRunCooldown}
                isPreparingToday={isPreparingToday}
                isRunningManualFeed={isRunningManualFeed}
                nextManualRunAt={manualRunCooldown.nextRunAt}
                onEditSettings={openSetupWizard}
                onRunTodayFeed={handleRunTodayFeed}
                onRefresh={() => activeTab === 'saved' ? loadSavedJobs() : loadOverview({ quiet: true })}
                onShowTodayFeed={handleShowTodayFeed}
                onShowSavedJobs={handleShowSavedJobs}
              />
            )}

            {showStateSupportCard && activeTab === 'today' && (
              <InlineStateMessage
                state={overview?.state ?? 'setup_required'}
                overview={overview}
                showManualRunAction={showCenteredRunButton}
                isRunningManualFeed={isRunningManualFeed}
                isPreparingToday={isPreparingToday}
                isInManualRunCooldown={isInManualRunCooldown}
                nextManualRunAt={manualRunCooldown.nextRunAt}
                onStartSetup={openSetupWizard}
                onRunTodayFeed={handleRunTodayFeed}
              />
            )}

            {setupOpen && (
              <div ref={setupWizardRef} className="space-y-4">
                {isBuildingFirstFeed ? (
                  <JobFeedSetupBuildingCard />
                ) : !overview?.settings ? (
                  <JobFeedPreferencesCard
                    variant="onboarding"
                    form={wizardForm}
                    saveState={saveState}
                    hasRecordedConsent={Boolean(overview?.settings?.consent_accepted_at)}
                    maxCountries={inputCaps.maxCountries}
                    onFormChange={updateDraftForm}
                    onSave={handleSave}
                    onClose={() => {
                      setDraftForm(null);
                      setIsEditing(false);
                      setIsSetupWizardOpen(false);
                    }}
                  />
                ) : (
                  <>
                    <AISearchProfileCard />
                    <SearchStrategyPreviewCard />
                    <JobFeedPreferencesCard
                      variant="editing"
                      form={wizardForm}
                      saveState={saveState}
                      hasRecordedConsent={Boolean(overview?.settings?.consent_accepted_at)}
                      maxCountries={inputCaps.maxCountries}
                      onFormChange={updateDraftForm}
                      onSave={handleSave}
                      targetRolesOutdated={Boolean(overview?.target_roles_outdated)}
                      onClose={() => {
                        setDraftForm(null);
                        setIsEditing(false);
                        setIsSetupWizardOpen(false);
                      }}
                    />
                  </>
                )}
              </div>
            )}

            {activeTab === 'today' && showFeedResults && overview && (
              <FeedResultsCard
                jobs={[...overview.jobs, ...additionalJobs]}
                hasMore={additionalJobs.length > 0
                  ? (additionalJobs.length + overview.jobs.length) < (overview.jobsTotalCount ?? 0)
                  : Boolean(overview.jobsHasMore)}
                remainingCount={Math.max(0, (overview.jobsTotalCount ?? 0) - overview.jobs.length - additionalJobs.length)}
                isLoadingMore={isLoadingMoreJobs}
                pendingJobAction={pendingJobAction}
                feedSummary={buildFeedSummary(shellForm)}
                onLoadMore={handleLoadMoreJobs}
                onOpenDetails={handleOpenDetails}
                onApplyWithKarko={handleApplyWithKarko}
                onAnalyzeFirst={handleAnalyzeFirst}
                onExternalApply={handleExternalApply}
              />
            )}

            {activeTab === 'saved' && (
              <SavedJobsView
                jobs={savedJobs}
                isLoading={isLoadingSavedJobs}
                pendingJobAction={pendingJobAction}
                onOpenDetails={handleOpenDetails}
                onApplyWithKarko={handleApplyWithKarko}
                onAnalyzeFirst={handleAnalyzeFirst}
                onExternalApply={handleExternalApply}
                onBackToFeed={handleShowTodayFeed}
              />
            )}


            {showDebugActions && overview?.latestRun && overview.latestRunDiagnostics && (
              <OperationalSnapshotCard
                latestRunDate={overview.latestRun.local_date}
                diagnostics={overview.latestRunDiagnostics}
              />
            )}

            {showDebugActions && (
              <Card className="rounded-2xl border-dashed border-navy-200 bg-navy-50/60 p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-600">Diagnostics</p>
                <h2 className="mt-2 text-lg font-semibold text-charcoal">Run feed diagnostics for this account</h2>
                <p className="mt-2 text-sm leading-6 text-warm-gray">
                  Diagnostic runs call SerpAPI now and block on the result. Use them to verify the pipeline end-to-end without affecting the daily cooldown.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="gold" onClick={() => handleDebugRun({ force: true })} disabled={isRunningDebugFlow}>
                    {isRunningDebugFlow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Run live now (force rerun)
                  </Button>
                  <Button variant="outline" onClick={() => handleDebugRun()} disabled={isRunningDebugFlow}>
                    Run live now (skip if done)
                  </Button>
                  <Button variant="ghost" onClick={() => loadOverview({ quiet: true })} disabled={isRefreshing}>
                    Refresh status
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {manualRunNotice && (
        <ManualRunNoticeDialog
          notice={manualRunNotice}
          onClose={() => setManualRunNotice(null)}
        />
      )}

      {selectedJob && (
        <JobFeedDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          isApplying={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'apply'}
          isSaving={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'save'}
          isDismissing={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'dismiss'}
          isRating={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'rate'}
          onApplyWithKarko={() => handleApplyWithKarko(selectedJob)}
          onAnalyzeFirst={() => handleAnalyzeFirst(selectedJob)}
          onSave={() => handleSaveJob(selectedJob)}
          onDismiss={() => handleDismissJob(selectedJob)}
          onExternalApply={() => handleExternalApply(selectedJob)}
          onRateMatch={(rating) => handleRateMatch(selectedJob, rating)}
        />
      )}
    </div>
  );
}

function SignedOutStage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="max-w-lg">
        <div className="mb-6 flex justify-center">
          <KarkoIcon theme="light" size="lg" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-charcoal sm:text-5xl">
          Jobs picked for you, every day
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-warm-gray">
          Tell Karko what you&apos;re looking for. Each morning, your best matches are ready when you open this page.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link href="/auth/signup" className="inline-flex">
            <Button variant="gold" className="px-7 py-3 text-base">
              Sign up free
            </Button>
          </Link>
          <Link
            href="/auth/login"
            className="text-sm font-medium text-navy-600 transition-colors hover:text-navy-700"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>

      <div className="mt-14 w-full max-w-2xl">
        <FeedPreviewCards />
      </div>
    </div>
  );
}

function UpgradeStage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="max-w-lg">
        <div className="mb-6 flex justify-center">
          <KarkoIcon theme="dark" size="lg" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-charcoal sm:text-5xl">
          Get jobs picked for you, every morning
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-warm-gray">
          Upgrade to Plus and Karko will search for jobs while you sleep. When you open this page, your top matches are already here.
        </p>

        <ul className="mx-auto mt-6 flex max-w-sm flex-col gap-2 text-left text-sm text-charcoal">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold-400" />
            Fresh picks delivered at your chosen hour
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold-400" />
            Search across roles, countries, and cities
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold-400" />
            Up to 15 ranked matches visible per day on Plus
          </li>
        </ul>

        <div className="mt-8 flex flex-col items-center gap-2">
          <Link href="/pricing" className="inline-flex">
            <Button variant="gold" className="px-8 py-3 text-base">
              Upgrade to Plus
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <p className="text-xs text-warm-gray">Plus plan · Cancel anytime</p>
        </div>
      </div>

      <div className="mt-14 w-full max-w-2xl">
        <FeedPreviewCards />
      </div>
    </div>
  );
}

function FeedPreviewCards() {
  const previewJobs = [
    { title: 'Senior Product Manager', company: 'Northstar Labs', location: 'Remote', fit: 'Strong' },
    { title: 'Growth Product Manager', company: 'SignalPath', location: 'New York, NY', fit: 'Strong' },
    { title: 'Platform Product Manager', company: 'Orbit Systems', location: 'Toronto, ON', fit: 'Good' },
  ];

  return (
    <div className="relative select-none" aria-hidden>
      <div className="space-y-3">
        {previewJobs.map((job) => (
          <div key={job.title} className="flex items-center gap-4 rounded-2xl border border-cream-200 bg-cream-50 px-5 py-4 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-cream-200">
              <Building2 className="h-5 w-5 text-navy-600" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold text-charcoal">{job.title}</p>
              <p className="text-xs text-warm-gray">{job.company} · {job.location}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className={`h-1.5 w-1.5 rounded-full ${job.fit === 'Strong' ? 'bg-sage-500' : 'bg-navy-400'}`} />
              <span className="text-xs font-medium text-charcoal">{job.fit} match</span>
            </span>
          </div>
        ))}
      </div>
      {/* Soft bottom fade so the list teases more without a hard blur wall */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-cream-100 to-transparent" />
    </div>
  );
}

function SavedJobsView({
  jobs,
  isLoading,
  pendingJobAction,
  onOpenDetails,
  onApplyWithKarko,
  onAnalyzeFirst,
  onExternalApply,
  onBackToFeed,
}: {
  jobs: JobFeedFeedItem[] | null;
  isLoading: boolean;
  pendingJobAction: PendingJobAction;
  onOpenDetails: (job: JobFeedFeedItem) => void;
  onApplyWithKarko: (job: JobFeedFeedItem) => void;
  onAnalyzeFirst: (job: JobFeedFeedItem) => void;
  onExternalApply: (job: JobFeedFeedItem) => void;
  onBackToFeed: () => void;
}) {
  if (isLoading && jobs === null) {
    return (
      <Card className="rounded-2xl border-cream-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-navy-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Loading your saved jobs…</span>
        </div>
      </Card>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <Card className="rounded-2xl border-cream-200 bg-cream-50 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
          <Bookmark className="h-5 w-5 text-warm-gray" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-charcoal">No saved jobs yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-warm-gray">
          Open a job from your feed and click <span className="font-medium text-charcoal">Save</span> to bookmark it. You will find your saved jobs here.
        </p>
        <div className="mt-5">
          <Button variant="outline" size="sm" onClick={onBackToFeed}>
            Back to today&apos;s feed
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <FeedResultsCard
      jobs={jobs}
      hasMore={false}
      remainingCount={0}
      isLoadingMore={false}
      onLoadMore={() => {}}
      pendingJobAction={pendingJobAction}
      feedSummary={`${jobs.length} saved ${jobs.length === 1 ? 'job' : 'jobs'}`}
      onOpenDetails={onOpenDetails}
      onApplyWithKarko={onApplyWithKarko}
      onAnalyzeFirst={onAnalyzeFirst}
      onExternalApply={onExternalApply}
    />
  );
}

function FeedPageHeader({
  currentState,
  form,
  jobsTodayCount,
  jobsBacklogCount,
  savedJobsCount,
  activeTab,
  latestRun,
  isRefreshing,
  canRunTodayFeed,
  hasCompletedToday,
  isPreparingToday,
  isRunningManualFeed,
  nextManualRunAt,
  onEditSettings,
  onRunTodayFeed,
  onRefresh,
  onShowTodayFeed,
  onShowSavedJobs,
}: {
  currentState: string;
  form: JobFeedSettingsInput;
  // Jobs today's run delivered, before user actions (0 when today has no
  // completed run yet).
  jobsTodayCount: number;
  // Jobs still visible from earlier days in the 7-day window (already
  // excludes applied/dismissed/not-relevant).
  jobsBacklogCount: number;
  savedJobsCount: number | null;
  activeTab: 'today' | 'saved';
  latestRun: JobFeedOverviewResponse['latestRun'];
  isRefreshing: boolean;
  canRunTodayFeed: boolean;
  hasCompletedToday: boolean;
  isPreparingToday: boolean;
  isRunningManualFeed: boolean;
  nextManualRunAt: string | null;
  onEditSettings: () => void;
  onRunTodayFeed: () => void;
  onRefresh: () => void;
  onShowTodayFeed: () => void;
  onShowSavedJobs: () => void;
}) {
  const isReady = currentState === 'ready' || currentState === 'thin_feed';
  const runButtonDisabled = isRunningManualFeed;
  const runButtonLabel = hasCompletedToday
    ? 'Updated today'
    : isPreparingToday
      ? 'Preparing'
      : 'Run today';
  const runButtonTitle = hasCompletedToday
    ? `Next refresh ${formatCooldownTarget(nextManualRunAt)}`
    : isPreparingToday
      ? 'Today’s feed is already being prepared'
      : 'Run today’s feed now';

  // Headline owns the "what's new today" signal. Backlog (untouched roles
  // from the last 7 days) goes in the Delivered meta row below.
  const todayHeadline = isReady
    ? jobsTodayCount > 0
      ? `${jobsTodayCount} new ${jobsTodayCount === 1 ? 'job' : 'jobs'} today`
      : 'Your feed for today'
    : currentState === 'setup_required'
      ? 'Set up your daily feed'
      : currentState === 'paused'
        ? 'Your feed is paused'
        : currentState === 'awaiting_first_run'
          ? 'Your first feed is on the way'
          : currentState === 'generating'
            ? 'Preparing your jobs...'
            : 'Daily Job Feed';

  const headline = activeTab === 'saved'
    ? savedJobsCount !== null && savedJobsCount > 0
      ? `${savedJobsCount} saved ${savedJobsCount === 1 ? 'job' : 'jobs'}`
      : 'Saved jobs'
    : todayHeadline;

  const todaySubtitle = isReady && form.target_roles.length > 0
    ? `${summarizeList(form.target_roles)} · ${summarizeCountries(form.target_countries, form.target_market)}`
    : null;

  const subtitle = activeTab === 'saved'
    ? 'Jobs you bookmarked to revisit later.'
    : todaySubtitle;

  const deliveredAt = activeTab === 'today' && isReady && latestRun?.completed_at
    ? formatDeliveredAtLabel(latestRun.completed_at)
    : null;
  const backlogLabel = activeTab === 'today' && isReady && jobsBacklogCount > 0
    ? `${jobsBacklogCount} unseen from earlier ${jobsBacklogCount === 1 ? 'day' : 'days'}`
    : null;
  // Saved view still uses the old role-summary subtitle (the bookmarked
  // list doesn't repeat it on every card). The today view drops it — the
  // same role/country info already shows on every job card.
  const savedSubtitle = activeTab === 'saved' ? subtitle : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-charcoal">{headline}</h1>
        {backlogLabel && (
          <p className="mt-1.5 text-base font-medium text-navy-700">{backlogLabel}</p>
        )}
        {savedSubtitle && (
          <p className="mt-1 text-sm text-warm-gray">{savedSubtitle}</p>
        )}
        {deliveredAt && (
          <p className="mt-1 text-xs text-warm-gray">Delivered {deliveredAt}</p>
        )}
      </div>

      {currentState !== 'setup_required' && (
        <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          <div className="inline-flex items-center rounded-full border border-cream-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={onShowTodayFeed}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'today'
                  ? 'bg-navy-600 text-white shadow-sm'
                  : 'text-warm-gray hover:text-navy-700'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={onShowSavedJobs}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'saved'
                  ? 'bg-navy-600 text-white shadow-sm'
                  : 'text-warm-gray hover:text-navy-700'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Saved
              {savedJobsCount !== null && savedJobsCount > 0 && (
                <span className={`ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                  activeTab === 'saved' ? 'bg-white/20 text-white' : 'bg-cream-100 text-charcoal'
                }`}>
                  {savedJobsCount}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onEditSettings}
            className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 shadow-sm transition-colors hover:border-navy-300 hover:bg-navy-50 cursor-pointer"
          >
            <Settings2 className="h-4 w-4" />
            Edit feed
          </button>

          {canRunTodayFeed && (
            <button
              type="button"
              onClick={onRunTodayFeed}
              disabled={runButtonDisabled}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${
                hasCompletedToday
                  ? 'border border-cream-300 bg-white text-warm-gray'
                  : 'border border-gold-500 bg-gold-500 text-white hover:bg-gold-600'
              }`}
              title={runButtonTitle}
            >
              {isRunningManualFeed || isPreparingToday ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {runButtonLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-warm-gray transition-colors hover:bg-cream-100 hover:text-navy-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            title="Refresh"
            aria-label="Refresh feed"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

function InlineStateMessage({
  state,
  overview,
  showManualRunAction,
  isRunningManualFeed,
  isPreparingToday,
  isInManualRunCooldown,
  nextManualRunAt,
  onStartSetup,
  onRunTodayFeed,
}: {
  state: JobFeedOverviewState | 'setup_required';
  overview: JobFeedOverviewResponse | null;
  showManualRunAction: boolean;
  isRunningManualFeed: boolean;
  isPreparingToday: boolean;
  isInManualRunCooldown: boolean;
  nextManualRunAt: string | null;
  onStartSetup: () => void;
  onRunTodayFeed: () => void;
}) {
  type Tone = 'neutral' | 'warning' | 'primary';
  const config: Record<string, {
    icon: typeof Sparkles;
    message: string;
    action?: string;
    tone: Tone;
    ctaVariant?: 'gold' | 'outline';
  }> = {
    setup_required: {
      icon: Settings2,
      message: 'Add your roles and timezone so Karko knows what to look for.',
      action: 'Start setup',
      tone: 'primary',
      ctaVariant: 'gold',
    },
    paused: {
      icon: PauseCircle,
      message: 'Your settings are saved. Turn the feed back on when you\'re ready.',
      action: 'Edit settings',
      tone: 'neutral',
      ctaVariant: 'outline',
    },
    awaiting_first_run: {
      icon: CalendarClock,
      message: 'Everything is set. Run today’s feed when you’re ready.',
      tone: 'neutral',
    },
    generating: {
      icon: Loader2,
      message: overview?.jobs?.length
        ? 'Karko is finding your latest jobs right now. The cards below are from your most recent completed feed.'
        : 'Karko is finding your jobs right now. This usually takes a few minutes.',
      tone: 'neutral',
    },
    empty: {
      icon: AlertCircle,
      message: 'Nothing matched today. Try broadening your countries, loosening seniority, or removing a minimum salary to improve tomorrow\'s results.',
      action: 'Adjust settings',
      tone: 'warning',
      ctaVariant: 'outline',
    },
    error: {
      icon: AlertCircle,
      message: overview?.latestRun?.error_message || 'Something went wrong with the latest run. Try refreshing or checking your settings.',
      action: 'Review settings',
      tone: 'warning',
      ctaVariant: 'outline',
    },
  };

  const stateConfig = config[state];
  if (!stateConfig) return null;

  const Icon = stateConfig.icon;
  const isAnimated = state === 'generating';

  const toneClasses: Record<Tone, { tile: string; icon: string }> = {
    neutral: { tile: 'bg-navy-50', icon: 'text-navy-600' },
    warning: { tile: 'bg-gold-50 border border-gold-200', icon: 'text-gold-700' },
    primary: { tile: 'bg-gold-50 border border-gold-200', icon: 'text-gold-700' },
  };
  const tone = toneClasses[stateConfig.tone];
  const manualRunButtonLabel = isInManualRunCooldown
    ? 'Updated today'
    : isPreparingToday
      ? 'Preparing'
      : 'Find jobs now';

  // A run is in flight — either the local fetch hasn't returned yet, or
  // the server already flipped the row to 'running'. Show the detailed
  // progress card so the user knows it takes 1-2 minutes and can keep
  // working elsewhere. Survives tab switches because it's driven by the
  // server row, not a local timer.
  if (isRunningManualFeed || isPreparingToday) {
    const startedAt = overview?.latestRun?.started_at ?? overview?.latestRun?.created_at ?? null;
    return <SmartFeedProgressCard startedAt={startedAt} />;
  }

  if (showManualRunAction && (state === 'awaiting_first_run' || state === 'empty')) {
    return (
      <Card className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border-cream-200 bg-white px-6 py-10 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-50 text-gold-700">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="mt-5 max-w-xl text-2xl font-semibold tracking-tight text-charcoal">
          Click to let Karko hand-pick jobs for today
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-warm-gray">
          Karko will search live, rank the strongest matches, and keep the results in your 7-day feed.
        </p>
        <Button
          variant="gold"
          size="lg"
          onClick={onRunTodayFeed}
          disabled={isRunningManualFeed}
          className="mt-6 rounded-full"
        >
          {isRunningManualFeed || isPreparingToday ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          {manualRunButtonLabel}
        </Button>
        {(isInManualRunCooldown || isPreparingToday) && (
          <p className="mt-3 text-xs text-warm-gray">
            {isPreparingToday
              ? 'Your feed is already being prepared.'
              : `Your next refresh opens ${formatCooldownTarget(nextManualRunAt)}.`}
          </p>
        )}
      </Card>
    );
  }

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-cream-200 bg-cream-50 px-5 py-4 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone.tile}`}>
        <Icon className={`h-5 w-5 ${tone.icon} ${isAnimated ? 'animate-spin' : ''}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-charcoal">{stateConfig.message}</p>
      </div>
      {stateConfig.action && (
        <Button
          variant={stateConfig.ctaVariant ?? 'outline'}
          size="sm"
          onClick={onStartSetup}
          className="shrink-0"
        >
          {stateConfig.action}
        </Button>
      )}
    </div>
  );
}

function ManualRunNoticeDialog({
  notice,
  onClose,
}: {
  notice: NonNullable<ManualRunNotice>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy-900/30 px-4">
      <div className="w-full max-w-md rounded-[24px] border border-cream-200 bg-white p-6 text-center shadow-lg">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${
          notice.kind === 'success' ? 'bg-sage-50 text-sage-700' : 'bg-gold-50 text-gold-700'
        }`}>
          {notice.kind === 'success' ? <CalendarClock className="h-6 w-6" /> : <PauseCircle className="h-6 w-6" />}
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight text-charcoal">{notice.title}</h2>
        <div className="mt-3 space-y-1 text-sm font-medium leading-6 text-warm-gray">
          {notice.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {notice.stats && notice.stats.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2 text-left">
            {notice.stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-cream-200 bg-cream-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-warm-gray">{stat.label}</p>
                <p className="mt-0.5 text-base font-semibold text-charcoal">{stat.value}</p>
              </div>
            ))}
          </div>
        )}
        <Button variant="gold" onClick={onClose} className="mt-6 rounded-full px-7">
          Got it
        </Button>
      </div>
    </div>
  );
}


function LoadingState() {
  return (
    <Card className="rounded-2xl border-cream-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 text-navy-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading your daily feed…</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-24 rounded-2xl bg-cream-100 animate-pulse" />
        ))}
      </div>
    </Card>
  );
}

function buildFeedSummary(form: JobFeedSettingsInput): string {
  const roles = summarizeTargetRoles(form.target_roles);
  const countries = summarizeCountries(form.target_countries, form.target_market);
  return `${roles}  ·  ${countries}`;
}

function OperationalSnapshotCard({
  latestRunDate,
  diagnostics,
}: {
  latestRunDate: string;
  diagnostics: JobFeedRunDiagnostics | null;
}) {
  if (!diagnostics) {
    return null;
  }

  return (
    <Card className="rounded-2xl border-dashed border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Run snapshot</p>
      <h2 className="mt-2 text-lg font-semibold text-charcoal">Latest run operational summary</h2>
      <p className="mt-2 text-sm leading-6 text-warm-gray">
        Lightweight visibility for {latestRunDate}. This keeps ranking cost, fetch health, and materialization status readable without opening raw JSON metadata.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <RunStatPill label="Dispatch" value={diagnostics.orchestrator} />
        <RunStatPill label="Ranking" value={formatRankingStatusLabel(diagnostics.rankingStatus)} />
        <RunStatPill label="Candidates" value={`${diagnostics.rankingCandidateCount ?? 0} -> ${diagnostics.rankedJobsCount ?? 0}`} />
        <RunStatPill label="Fetch failures" value={String(diagnostics.failedFetchCount)} />
        <RunStatPill label="Duplicates" value={String(diagnostics.duplicateCount)} />
        <RunStatPill label="Materialized" value={formatYesNoUnknown(diagnostics.rankedItemsMaterialized)} />
        <RunStatPill label="Tokens" value={formatTokenUsage(diagnostics)} />
        <RunStatPill label="Est. LLM cost" value={formatUsdAmount(diagnostics.rankingEstimatedCostUsd)} />
      </div>
    </Card>
  );
}

function formatRankingStatusLabel(value: JobFeedRunDiagnostics['rankingStatus']): string {
  switch (value) {
    case 'completed_llm':
      return 'LLM ranked';
    case 'completed_deterministic':
      return 'Deterministic only';
    case 'llm_failed_fallback':
      return 'LLM fallback';
    case 'no_candidates':
      return 'No candidates';
    default:
      return 'Not available';
  }
}

function formatTokenUsage(diagnostics: JobFeedRunDiagnostics): string {
  if (diagnostics.rankingInputTokens === null || diagnostics.rankingOutputTokens === null) {
    return 'n/a';
  }

  return `${diagnostics.rankingInputTokens} in / ${diagnostics.rankingOutputTokens} out`;
}

function formatUsdAmount(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }

  return `$${value.toFixed(4)}`;
}

function formatYesNoUnknown(value: boolean | null): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}


function summarizeTargetRoles(roles: string[]): string {
  if (roles.length === 0) {
    return 'Choose roles';
  }

  return summarizeList(roles);
}

function summarizeList(values: string[], fallback = 'Not set yet'): string {
  if (values.length === 0) {
    return fallback;
  }

  if (values.length <= 2) {
    return values.join(', ');
  }

  return `${values.slice(0, 2).join(', ')} +${values.length - 2} more`;
}

function readableMarket(value: string): string {
  if (value === 'us_canada') return 'United States + Canada';
  if (value === 'us') return 'United States';
  if (value === 'canada') return 'Canada';
  return value;
}

function summarizeCountries(
  countries: string[],
  fallbackMarket: JobFeedSettingsInput['target_market'],
): string {
  if (!countries || countries.length === 0) {
    return readableMarket(fallbackMarket);
  }

  const labels = countries.map((code) => {
    const option = JOB_FEED_COUNTRY_OPTIONS.find((item) => item.value === code);
    return option?.label ?? code.toUpperCase();
  });

  if (labels.length <= 2) return labels.join(' + ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
}




function toSessionGenerationStatus(
  status: JobFeedApplyResponse['generation']['status']
): StoreApplicationSession['generationStatus'] {
  switch (status) {
    case 'intent_created':
    case 'queued':
      return 'pending';
    case 'running':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'expired':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
  }
}

function toStoreApplicationSession(
  session: JobFeedApplyResponse['session'],
  generation: JobFeedApplyResponse['generation']
): StoreApplicationSession {
  const companyResearch = session.company_research && typeof session.company_research === 'object' && !Array.isArray(session.company_research)
    ? {
        ...(session.company_research as Record<string, unknown>),
        address: session.company_address ?? (session.company_research as Record<string, unknown>).address as string | undefined,
        contactPerson: session.company_contact_person ?? (session.company_research as Record<string, unknown>).contactPerson as string | undefined,
      } as unknown as StoreApplicationSession['companyResearch']
    : null;

  return {
    id: session.id,
    jobTitle: session.job_title ?? '',
    company: session.company ?? '',
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    jobDescription: session.job_description,
    matchScore: session.match_score ?? undefined,
    matchingSkills: session.matching_skills ?? [],
    missingSkills: session.missing_skills ?? [],
    suggestions: session.suggestions ?? [],
    requirements: session.requirements as unknown as StoreApplicationSession['requirements'],
    gaps: session.gaps as unknown as StoreApplicationSession['gaps'],
    generatedCV: session.generated_cv as unknown as StoreApplicationSession['generatedCV'],
    coverLetter: session.cover_letter as unknown as StoreApplicationSession['coverLetter'],
    email: session.email as unknown as StoreApplicationSession['email'],
    followUpEmail: session.follow_up_email as unknown as StoreApplicationSession['followUpEmail'],
    fitAssessment: session.fit_assessment as unknown as StoreApplicationSession['fitAssessment'],
    generationStatus: toSessionGenerationStatus(generation.status),
    generationError: generation.error_message ?? session.generation_error,
    generationStartedAt: session.generation_started_at,
    generationCompletedAt: session.generation_completed_at,
    generationFailedAt: session.generation_failed_at,
    generationCancelledAt: session.generation_cancelled_at,
    jobFeedGenerationId: generation.id,
    jobFeedGenerationAttempt: generation.attempt,
    companyResearch,
    screeningUsageCount: 0,
    cvEdits: Array.isArray(session.cv_edits) ? session.cv_edits as unknown as StoreApplicationSession['cvEdits'] : [],
    chatMessages: [],
  };
}

function buildJobFeedApplyPath(params: {
  sessionId: string;
  generationId: string;
  generationAttempt: number;
  autostart: boolean;
  // 'apply' → fire the full-generation workflow immediately.
  // 'analyze' → fire a fit analysis first so the user can decide before
  // spending the full 1.5 credits on generation.
  mode?: 'apply' | 'analyze';
}): string {
  const searchParams = new URLSearchParams({
    workspace: 'application-kit',
    tab: 'cv',
    session: params.sessionId,
    generation: params.generationId,
    generationAttempt: String(params.generationAttempt),
  });

  if (params.autostart) {
    searchParams.set('autostart', params.mode === 'analyze' ? 'job-feed-analyze' : 'job-feed-apply');
  }

  return `/dashboard?${searchParams.toString()}`;
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function getLocalDateKeyForTimeZone(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const lookup = new Map(parts.map((part) => [part.type, part.value]));
    const year = lookup.get('year');
    const month = lookup.get('month');
    const day = lookup.get('day');

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall through to UTC if the browser rejects the stored timezone.
  }

  return date.toISOString().slice(0, 10);
}

function buildManualRunBlockedNotice(params: {
  reason: 'preparing' | 'cooldown' | null;
  nextRunAt: string | null;
}): NonNullable<ManualRunNotice> {
  if (params.reason === 'preparing') {
    return {
      kind: 'cooldown',
      title: 'Your feed is already running',
      lines: [
        'Karko is preparing your jobs right now.',
        'New cards will appear as soon as ranking finishes.',
      ],
    };
  }

  const target = formatCooldownTarget(params.nextRunAt);
  return {
    kind: 'cooldown',
    title: 'Today’s feed is ready',
    lines: [
      'You can refresh your feed once per day.',
      target === 'tomorrow'
        ? 'Your next refresh opens at the start of tomorrow in your local time.'
        : `Your next refresh opens ${target}.`,
    ],
  };
}

function buildManualRunSuccessNotice(
  payload: {
    rawJobsFetched?: number | null;
    rankedJobsCount?: number | null;
    duplicateCount?: number | null;
    failedFetchCount?: number | null;
  },
  overview: JobFeedOverviewResponse | null
): NonNullable<ManualRunNotice> {
  const rawJobsFetched = toDisplayNumber(payload.rawJobsFetched);
  const rankedJobsCount = toDisplayNumber(payload.rankedJobsCount);
  const duplicateCount = toDisplayNumber(payload.duplicateCount);
  const failedFetchCount = toDisplayNumber(payload.failedFetchCount);
  const visibleJobs = overview?.jobs.length ?? rankedJobsCount;
  const recentInboxJobs = Math.max(0, visibleJobs - rankedJobsCount);

  return {
    kind: 'success',
    title: 'Today’s feed is ready',
    lines: [
      `${rawJobsFetched} jobs found and ${rankedJobsCount} hand-picked for your feed.`,
      recentInboxJobs > 0
        ? `${recentInboxJobs} still-active jobs from recent feeds stayed in your inbox.`
        : 'No previous feed jobs needed to be carried over.',
    ],
    stats: [
      { label: 'Found', value: String(rawJobsFetched) },
      { label: 'Ranked', value: String(rankedJobsCount) },
      { label: 'Duplicates', value: String(duplicateCount) },
      { label: 'Fetch failures', value: String(failedFetchCount) },
    ],
  };
}

function toDisplayNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Calendar-day cooldown. One manual run per local date: if the most recent
 * manual run's local_date equals today's local_date, the next window opens
 * at the start of tomorrow in the user's timezone.
 */
function getManualRunCooldown(params: {
  latestManualLocalDate: string | null;
  timeZone: string | null;
}): { remainingMs: number; nextRunAt: string | null } {
  if (!params.latestManualLocalDate) {
    return { remainingMs: 0, nextRunAt: null };
  }

  const tz = params.timeZone || getBrowserTimeZone() || 'UTC';
  const now = new Date();
  const todayKey = localDateKeyFromClient(now, tz);

  if (params.latestManualLocalDate !== todayKey) {
    return { remainingMs: 0, nextRunAt: null };
  }

  const nextMidnight = getStartOfNextLocalDayClient(now, tz);
  return {
    remainingMs: Math.max(0, nextMidnight.getTime() - now.getTime()),
    nextRunAt: nextMidnight.toISOString(),
  };
}

// Small client-side mirrors of server helpers so the UI can compute the
// cooldown locally without an extra round trip.
function localDateKeyFromClient(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function getStartOfNextLocalDayClient(from: Date, timeZone: string): Date {
  const startKey = localDateKeyFromClient(from, timeZone);
  let probe = new Date(from.getTime() + 60 * 60 * 1000);
  for (let i = 0; i < 48; i += 1) {
    if (localDateKeyFromClient(probe, timeZone) !== startKey) break;
    probe = new Date(probe.getTime() + 60 * 60 * 1000);
  }
  let fine = new Date(probe.getTime() - 60 * 60 * 1000);
  for (let i = 0; i < 60; i += 1) {
    const next = new Date(fine.getTime() + 60 * 1000);
    if (localDateKeyFromClient(next, timeZone) !== startKey) return next;
    fine = next;
  }
  return probe;
}

function formatCooldownTarget(value: string | null): string {
  if (!value) return 'tomorrow';

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return 'tomorrow';

  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  // If next window is less than ~12h away, use relative time for clarity.
  if (diffMs > 0 && diffMs < 12 * 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
    if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    return `in about ${hours} hour${hours === 1 ? '' : 's'}`;
  }

  return 'tomorrow';
}

function formatDeliveredAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  }
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
