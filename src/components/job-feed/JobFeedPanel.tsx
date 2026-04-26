'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  PauseCircle,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { KarkoIcon } from '@/components/KarkoLogo';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  JOB_FEED_AGGRESSIVENESS_OPTIONS,
  JOB_FEED_COUNTRY_OPTIONS,
  JOB_FEED_EMPLOYMENT_TYPE_OPTIONS,
  JOB_FEED_REMOTE_PREFERENCE_OPTIONS,
  JOB_FEED_SENIORITY_OPTIONS,
  JOB_FEED_SUGGESTED_LANGUAGES,
  JOB_FEED_SUGGESTED_LOCATIONS,
  JOB_FEED_SUGGESTED_ROLES,
  JOB_FEED_TIMEZONE_GROUPS,
  JOB_FEED_TIMEZONE_LOOKUP,
  JOB_FEED_WORK_AUTH_OPTIONS,
  formatDeliveryHourLabel,
  getJobFeedInputCaps,
  getJobFeedTimeZoneLabel,
  legacyMarketFromCountries,
  type JobFeedInputCaps,
} from '@/lib/job-feed/constants';
import { createDefaultJobFeedInput, getJobFeedOverviewState, isValidTimeZone, toJobFeedInput } from '@/lib/job-feed/helpers';
import type {
  JobFeedApplyResponse,
  JobFeedFeedbackResponse,
  JobFeedFeedItem,
  JobFeedOverviewResponse,
  JobFeedOverviewState,
  JobFeedRunDiagnostics,
  JobFeedSettingsInput,
  JobFeedSettingsSuggestion,
} from '@/lib/job-feed/types';
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
  ChipField,
  GroupedSelectField,
  MultiSelectDropdown,
  SelectField,
  InputField,
  RoleEntryField,
  FieldGroup,
} from './form-controls';
import {
  FeedResultsCard,
  JobFeedDetailModal,
  RunStatPill,
} from './feed-cards';

type SaveState = 'idle' | 'saving';
type PendingJobAction = {
  jobId: string;
  action: 'apply' | 'save' | 'dismiss' | 'rate';
} | null;

const JOB_FEED_DELIVERY_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: formatDeliveryHourLabel(hour),
}));

function normalizeTimeZoneValue(value: string): string {
  if (JOB_FEED_TIMEZONE_LOOKUP.has(value)) {
    return value;
  }
  // Fall back to the first curated zone so the <select> always has a valid selection.
  return JOB_FEED_TIMEZONE_GROUPS[0]?.zones[0]?.value ?? 'UTC';
}
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
  const [draftForm, setDraftForm] = useState<JobFeedSettingsInput | null>(null);
  const [isRunningDebugFlow, setIsRunningDebugFlow] = useState(false);
  const [isShowingAllJobs, setIsShowingAllJobs] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobFeedFeedItem | null>(null);
  const [pendingJobAction, setPendingJobAction] = useState<PendingJobAction>(null);
  const [form, setForm] = useState<JobFeedSettingsInput>(() => createDefaultJobFeedInput(getBrowserTimeZone()));
  const lastTrackedState = useRef<string | null>(null);
  const setupWizardRef = useRef<HTMLDivElement | null>(null);
  const isPreviewing = previewMode !== 'off';
  const isSignedIn = isPreviewing ? previewMode !== 'signed_out' : Boolean(user);

  const showDebugActions = !isPreviewing && process.env.NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG === 'true';

  const loadOverview = useCallback(async (options?: { quiet?: boolean }) => {
    if (isPreviewing) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
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

      setOverview(payload as JobFeedOverviewResponse);
      setForm(toJobFeedInput(payload.settings, getBrowserTimeZone()));
      setDraftForm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load Job Feed.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isPreviewing, toast]);

  useEffect(() => {
    if (isPreviewing) {
      const snapshot = buildJobFeedPreviewSnapshot(previewMode, getBrowserTimeZone());
      setOverview(snapshot.overview);
      setForm(snapshot.form);
      setIsEditing(false);
      setIsSetupWizardOpen(false);
      setDraftForm(null);
      setIsShowingAllJobs(false);
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
    if (isPreviewing || !isSignedIn) return;
    if (!posthog) return;

    posthog.capture('job_feed_opened', {
      foundation_mode: true,
      subscription_tier: profile?.subscription_tier ?? 'unknown',
    });
  }, [isPreviewing, isSignedIn, posthog, profile?.subscription_tier]);

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

  useEffect(() => {
    setIsShowingAllJobs(false);
  }, [overview?.feedRun?.id]);

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
            appliedAt: feedback.appliedAt ?? now,
            applicationSessionId: feedback.applicationSessionId ?? 'preview-session',
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
    setOverview((prev) => {
      if (!prev) return prev;

      const jobs = prev.jobs.filter((job) => job.id !== jobId);
      return {
        ...prev,
        jobs,
        state: getJobFeedOverviewState({
          canAccess: prev.canAccess,
          settings: prev.settings,
          latestRun: prev.latestRun,
          jobsCount: jobs.length,
        }),
      };
    });
  }, []);

  const syncApplicationSession = useCallback((session: JobFeedApplyResponse['session']) => {
    const mappedSession = toStoreApplicationSession(session);
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
        toast.success('Preview updated locally.');
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
      toast.success('Saved to your feed decisions so you can come back to it.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save this job.');
    } finally {
      setPendingJobAction(null);
    }
  }, [applyPreviewFeedback, isPreviewing, overview?.feedRun?.id, posthog, recordJobFeedback, toast]);

  const handleDismissJob = useCallback(async (job: JobFeedFeedItem) => {
    setPendingJobAction({ jobId: job.id, action: 'dismiss' });

    try {
      if (isPreviewing) {
        applyPreviewFeedback(job.id, 'dismissed');
        removeJobFromOverview(job.id);
        if (selectedJob?.id === job.id) {
          setSelectedJob(null);
        }
        toast.success('Preview updated locally.');
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
      toast.success('Dismissed from your current feed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to dismiss this job.');
    } finally {
      setPendingJobAction(null);
    }
  }, [applyPreviewFeedback, isPreviewing, overview?.feedRun?.id, posthog, recordJobFeedback, removeJobFromOverview, selectedJob?.id, toast]);

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
        toast.success('Thanks — preview updated locally.');
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

      toast.success(
        rating === 'helpful'
          ? 'Thanks — we\'ll keep sending roles like this.'
          : 'Got it — we\'ll tune your feed away from this.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save your rating.');
    } finally {
      setPendingJobAction(null);
    }
  }, [applyPreviewFeedback, isPreviewing, overview?.feedRun?.id, posthog, recordJobFeedback, selectedJob?.id, toast]);

  const handleApplyWithKarko = useCallback(async (job: JobFeedFeedItem) => {
    setPendingJobAction({ jobId: job.id, action: 'apply' });

    try {
      if (isPreviewing) {
        applyPreviewFeedback(job.id, 'applied');
        toast.success('Preview updated locally. This local preview does not create an application session.');
        return;
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
      syncApplicationSession(typedPayload.session);
      setSelectedJob(null);

      // Fire the autostart signal BEFORE navigation so the agent workflow
      // begins even if the user stays on the Job Feed tab. The ChatPanel
      // (always mounted on /dashboard) consumes and clears this flag on
      // its next render.
      if (currentCV) {
        useUIStore.getState().setPendingJobFeedAutostart({
          sessionId: typedPayload.session.id,
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

      toast.success(
        currentCV
          ? `${job.title} at ${job.company} — Karko is generating your application`
          : `${job.title} at ${job.company} — upload your CV to continue`
      );

      router.push(buildJobFeedApplyPath({
        sessionId: typedPayload.session.id,
        autostart: Boolean(currentCV),
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start the Karko AI application handoff.');
    } finally {
      setPendingJobAction(null);
    }
  }, [applyPreviewFeedback, currentCV, isPreviewing, overview?.feedRun?.id, posthog, router, syncApplicationSession, toast, updateJobFeedbackState]);

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
      toast.success(nextForm.enabled && consentReady ? 'Daily feed is on and scheduled.' : 'Job Feed settings saved.');
      setIsEditing(false);
      setIsSetupWizardOpen(false);
      await loadOverview({ quiet: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save Job Feed settings.');
    } finally {
      setSaveState('idle');
    }
  };

  const handleDebugRun = async (options?: { force?: boolean; direct?: boolean }) => {
    const force = options?.force === true;
    const direct = options?.direct === true;
    setIsRunningDebugFlow(true);

    try {
      const response = await fetch('/api/job-feed/dev/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force, direct }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to run the background workflow.');
      }

      posthog?.capture('job_feed_foundation_run_requested', {
        foundation_mode: true,
        forced: force,
        direct,
      });

      const toastMessage = direct
        ? payload.skipped
          ? 'Today already has a completed run. Use "Force rerun" to recompute.'
          : `Direct run completed: ${payload.rawJobsFetched ?? 0} raw jobs → ${payload.jobsAfterPrefilter ?? 0} after filter → ${payload.rankedJobsCount ?? 0} ranked.`
        : payload.workflow?.skipped
          ? 'A feed run already exists for today, so no new run was started.'
          : payload.execution === 'inline'
            ? force
              ? 'Background rerun completed for this account.'
              : 'Background run completed for this account.'
            : force
              ? 'Background rerun queued for this account.'
              : 'Background run queued for this account.';

      toast.success(toastMessage);
      await loadOverview({ quiet: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run the background workflow.');
    } finally {
      setIsRunningDebugFlow(false);
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
  const updateDraftForm = useCallback((nextValue: React.SetStateAction<JobFeedSettingsInput>) => {
    setDraftForm((prev) => {
      const baseValue = prev ?? form;
      return typeof nextValue === 'function'
        ? (nextValue as (value: JobFeedSettingsInput) => JobFeedSettingsInput)(baseValue)
        : nextValue;
    });
  }, [form]);

  const currentState = isSignedIn ? (overview?.state ?? 'setup_required') : 'sign_in_required';
  const setupOpen = isSignedIn && (isEditing || isSetupWizardOpen);
  const canAccess = Boolean(overview?.canAccess);
  const shellForm = isSignedIn && overview?.settings
    ? toJobFeedInput(overview.settings, getBrowserTimeZone())
    : form;
  const wizardForm = draftForm ?? form;
  const inputCaps = getJobFeedInputCaps(profile?.subscription_tier ?? 'plus');
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
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(215,180,58,0.12),transparent_32%),linear-gradient(180deg,#fbfaf6_0%,#f5f0e4_100%)]">
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
                jobsCount={overview?.jobs.length ?? 0}
                latestRun={overview?.latestRun ?? null}
                isRefreshing={isRefreshing}
                onEditSettings={openSetupWizard}
                onRefresh={() => loadOverview({ quiet: true })}
              />
            )}

            {showStateSupportCard && (
              <InlineStateMessage state={overview?.state ?? 'setup_required'} overview={overview} onStartSetup={openSetupWizard} />
            )}

            {setupOpen && (
              <div ref={setupWizardRef}>
                <JobFeedOnboardingWizard
                  form={wizardForm}
                  overview={overview}
                  saveState={saveState}
                  inputCaps={inputCaps}
                  onFormChange={updateDraftForm}
                  onSave={handleSave}
                  onClose={() => {
                    setDraftForm(null);
                    setIsEditing(false);
                    setIsSetupWizardOpen(false);
                  }}
                />
              </div>
            )}

            {showFeedResults && overview && (
              <FeedResultsCard
                jobs={overview.jobs}
                isShowingAllJobs={isShowingAllJobs}
                onToggleShowAll={() => setIsShowingAllJobs((prev) => !prev)}
                pendingJobAction={pendingJobAction}
                feedSummary={buildFeedSummary(shellForm)}
                onOpenDetails={handleOpenDetails}
                onApplyWithKarko={handleApplyWithKarko}
                onEditSettings={openSetupWizard}
              />
            )}


            {showDebugActions && overview?.latestRun && overview.latestRunDiagnostics && (
              <OperationalSnapshotCard
                latestRunDate={overview.latestRun.local_date}
                diagnostics={overview.latestRunDiagnostics}
              />
            )}

            {showDebugActions && (
              <Card className="rounded-[24px] border-dashed border-navy-200 bg-navy-50/60 p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-600">Diagnostics</p>
                <h2 className="mt-2 text-lg font-semibold text-charcoal">Run feed diagnostics for this account</h2>
                <p className="mt-2 text-sm leading-6 text-warm-gray">
                  Live runs call SerpAPI right now and block on the result. Background runs queue via Inngest and may not execute in dev. Use the live buttons when you need to verify the pipeline end-to-end.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="gold" onClick={() => handleDebugRun({ direct: true, force: true })} disabled={isRunningDebugFlow}>
                    {isRunningDebugFlow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Run live now (force rerun)
                  </Button>
                  <Button variant="outline" onClick={() => handleDebugRun({ direct: true })} disabled={isRunningDebugFlow}>
                    Run live now (skip if done)
                  </Button>
                  <Button variant="ghost" onClick={() => handleDebugRun()} disabled={isRunningDebugFlow}>
                    Queue background (async)
                  </Button>
                  <Button variant="ghost" onClick={() => handleDebugRun({ force: true })} disabled={isRunningDebugFlow}>
                    Force async rerun
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

      {selectedJob && (
        <JobFeedDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          isApplying={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'apply'}
          isSaving={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'save'}
          isDismissing={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'dismiss'}
          isRating={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'rate'}
          onApplyWithKarko={() => handleApplyWithKarko(selectedJob)}
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
        <h1 className="text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
          Jobs picked for you, every day
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-warm-gray">
          Tell Karko what you're looking for. Each morning, your best matches are ready when you open this page.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/auth/signup" className="inline-flex">
            <Button variant="gold" className="px-6 py-3 text-base">
              Sign up free
            </Button>
          </Link>
          <Link href="/auth/login" className="inline-flex">
            <Button variant="outline" className="px-6 py-3 text-base">
              Sign in
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-12 w-full max-w-2xl">
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
        <h1 className="text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
          Get jobs picked for you, every morning
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-warm-gray">
          Upgrade to Plus and Karko will search for jobs while you sleep. When you open this page, your top matches are already here.
        </p>
        <div className="mt-8">
          <Link href="/pricing" className="inline-flex">
            <Button variant="gold" className="px-8 py-3 text-base">
              Upgrade to Plus
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-12 w-full max-w-2xl">
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
    <div className="space-y-3 opacity-50 select-none" aria-hidden>
      {previewJobs.map((job) => (
        <div key={job.title} className="flex items-center gap-4 rounded-2xl border border-cream-200 bg-white/80 px-5 py-4 shadow-sm blur-[1px]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream-100">
            <Building2 className="h-5 w-5 text-warm-gray" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold text-charcoal">{job.title}</p>
            <p className="text-xs text-warm-gray">{job.company} · {job.location}</p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            {job.fit}
          </span>
        </div>
      ))}
    </div>
  );
}

function FeedPageHeader({
  currentState,
  form,
  jobsCount,
  latestRun,
  isRefreshing,
  onEditSettings,
  onRefresh,
}: {
  currentState: string;
  form: JobFeedSettingsInput;
  jobsCount: number;
  latestRun: JobFeedOverviewResponse['latestRun'];
  isRefreshing: boolean;
  onEditSettings: () => void;
  onRefresh: () => void;
}) {
  const isReady = currentState === 'ready' || currentState === 'thin_feed';

  const headline = isReady
    ? jobsCount > 0
      ? `${jobsCount} ${jobsCount === 1 ? 'job' : 'jobs'} for you today`
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

  const subtitle = isReady && form.target_roles.length > 0
    ? `${summarizeList(form.target_roles)} · ${summarizeCountries(form.target_countries, form.target_market)}`
    : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-charcoal">{headline}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-warm-gray">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {currentState !== 'setup_required' && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-warm-gray transition-colors hover:bg-cream-100 hover:text-navy-600 disabled:opacity-50"
            title="Refresh"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={onEditSettings}
          className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 shadow-sm transition-colors hover:border-navy-300 hover:bg-navy-50"
        >
          <Settings2 className="h-4 w-4" />
          Edit feed
        </button>
      </div>
    </div>
  );
}

function InlineStateMessage({
  state,
  overview,
  onStartSetup,
}: {
  state: JobFeedOverviewState | 'setup_required';
  overview: JobFeedOverviewResponse | null;
  onStartSetup: () => void;
}) {
  const config: Record<string, { icon: typeof Sparkles; message: string; action?: string }> = {
    setup_required: {
      icon: Settings2,
      message: 'Add your roles and delivery time so Karko knows what to look for.',
      action: 'Start setup',
    },
    paused: {
      icon: PauseCircle,
      message: 'Your settings are saved. Turn the feed back on when you\'re ready.',
      action: 'Edit settings',
    },
    awaiting_first_run: {
      icon: CalendarClock,
      message: 'Everything is set. Your first jobs will arrive at your chosen delivery time.',
    },
    generating: {
      icon: Loader2,
      message: 'Karko is finding your jobs right now. This usually takes a few minutes.',
    },
    empty: {
      icon: AlertCircle,
      message: 'Nothing looked strong enough today. Try widening a filter for better results tomorrow.',
      action: 'Adjust settings',
    },
    error: {
      icon: AlertCircle,
      message: overview?.latestRun?.error_message || 'Something went wrong with the latest run. Try refreshing or checking your settings.',
      action: 'Review settings',
    },
  };

  const stateConfig = config[state];
  if (!stateConfig) return null;

  const Icon = stateConfig.icon;
  const isAnimated = state === 'generating';

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-cream-200 bg-white/90 px-5 py-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50">
        <Icon className={`h-5 w-5 text-navy-600 ${isAnimated ? 'animate-spin' : ''}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-charcoal">{stateConfig.message}</p>
      </div>
      {stateConfig.action && (
        <Button variant="outline" size="sm" onClick={onStartSetup} className="shrink-0">
          {stateConfig.action}
        </Button>
      )}
    </div>
  );
}

function JobFeedOnboardingWizard({
  form,
  overview,
  saveState,
  inputCaps,
  onFormChange,
  onSave,
  onClose,
}: {
  form: JobFeedSettingsInput;
  overview: JobFeedOverviewResponse | null;
  saveState: SaveState;
  inputCaps: JobFeedInputCaps;
  onFormChange: React.Dispatch<React.SetStateAction<JobFeedSettingsInput>>;
  onSave: (form: JobFeedSettingsInput) => void;
  onClose: () => void;
}) {
  // Recommended "fine-tune" block is expanded by default for non-technical users.
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(true);
  const [isLoadingCVSuggestions, setIsLoadingCVSuggestions] = useState(false);
  const [cvSuggestionApplied, setCVSuggestionApplied] = useState(false);
  const browserTimeZone = getBrowserTimeZone();
  const hasRecordedConsent = Boolean(overview?.settings?.consent_accepted_at);
  const canSave = canSaveJobFeedSettings(form, hasRecordedConsent);
  const consentReady = form.consent_accepted || hasRecordedConsent;
  const deliveryLabel = `${formatDeliveryHourLabel(form.delivery_hour_local)} in ${form.user_timezone}`;
  const isEditing = Boolean(overview?.settings);

  const applyCVSuggestion = useCallback((
    suggestion: JobFeedSettingsSuggestion,
    options: { onlyIfEmpty?: boolean } = {},
  ) => {
    onFormChange((prev) => {
      const shouldFill = (current: string[]) => !options.onlyIfEmpty || current.length === 0;
      const next: JobFeedSettingsInput = { ...prev };

      if (suggestion.target_roles.length > 0 && shouldFill(prev.target_roles)) {
        next.target_roles = suggestion.target_roles;
      }
      if (suggestion.preferred_locations.length > 0 && shouldFill(prev.preferred_locations)) {
        next.preferred_locations = suggestion.preferred_locations;
      }
      if (suggestion.target_countries && suggestion.target_countries.length > 0 && shouldFill(prev.target_countries)) {
        next.target_countries = suggestion.target_countries;
        next.target_market = legacyMarketFromCountries(suggestion.target_countries);
      }
      if (suggestion.user_skills.length > 0 && shouldFill(prev.user_skills)) {
        next.user_skills = suggestion.user_skills;
      }
      if (suggestion.languages.length > 0 && shouldFill(prev.languages.filter((l) => l !== 'English'))) {
        next.languages = suggestion.languages;
      }
      if (suggestion.seniority_target) {
        const current = prev.seniority_targets ?? [];
        if (!options.onlyIfEmpty || current.length === 0) {
          next.seniority_targets = [suggestion.seniority_target] as JobFeedSettingsInput['seniority_targets'];
          next.seniority_target = suggestion.seniority_target;
        }
      }
      return next;
    });
  }, [onFormChange]);

  const handleTakeFromCV = useCallback(async () => {
    setIsLoadingCVSuggestions(true);
    try {
      const response = await fetch('/api/job-feed/settings/suggest');
      const data = await response.json();
      if (!response.ok || !data.suggestion) return;

      applyCVSuggestion(data.suggestion as JobFeedSettingsSuggestion);
      setCVSuggestionApplied(true);
    } catch {
      // silently ignore — user can still fill manually
    } finally {
      setIsLoadingCVSuggestions(false);
    }
  }, [applyCVSuggestion]);

  // Auto-prefill from CV on first open (for new users without settings saved yet).
  // Only fills fields that are currently empty, so we never overwrite choices.
  const autoPrefillAttemptedRef = useRef(false);
  useEffect(() => {
    if (isEditing) return;
    if (autoPrefillAttemptedRef.current) return;
    if (form.target_roles.length > 0) return;

    autoPrefillAttemptedRef.current = true;

    (async () => {
      setIsLoadingCVSuggestions(true);
      try {
        const response = await fetch('/api/job-feed/settings/suggest');
        if (!response.ok) return;
        const data = await response.json();
        if (!data.suggestion) return;

        applyCVSuggestion(data.suggestion as JobFeedSettingsSuggestion, { onlyIfEmpty: true });
        setCVSuggestionApplied(true);
      } catch {
        // ignore — form stays editable
      } finally {
        setIsLoadingCVSuggestions(false);
      }
    })();
  }, [applyCVSuggestion, form.target_roles.length, isEditing]);

  const chunk1Done = form.target_roles.length > 0;
  const showChunk2 = chunk1Done || isEditing;
  const showChunk3 = showChunk2 || isEditing;
  const showSaveAction = (showChunk3 && isValidTimeZone(form.user_timezone)) || isEditing;

  // If the saved timezone isn't in our curated list, auto-select the closest
  // curated equivalent so what the dropdown shows matches what we will save.
  useEffect(() => {
    if (!JOB_FEED_TIMEZONE_LOOKUP.has(form.user_timezone)) {
      const fallback = normalizeTimeZoneValue(form.user_timezone);
      onFormChange((prev) => ({ ...prev, user_timezone: fallback }));
    }
  }, [form.user_timezone, onFormChange]);

  // If the saved timezone isn't in our curated list, auto-select the closest
  // curated equivalent so what the dropdown shows matches what we will save.
  useEffect(() => {
    if (!JOB_FEED_TIMEZONE_LOOKUP.has(form.user_timezone)) {
      const fallback = normalizeTimeZoneValue(form.user_timezone);
      onFormChange((prev) => ({ ...prev, user_timezone: fallback }));
    }
  }, [form.user_timezone, onFormChange]);

  return (
    <Card className="overflow-hidden rounded-[32px] border-cream-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(248,244,234,0.94))] p-0 shadow-[0_28px_80px_-42px_rgba(30,58,95,0.35)]">
      <div className="border-b border-cream-200 px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-charcoal">
              {isEditing ? 'Edit your feed settings' : 'Set up your daily feed'}
            </h2>
            <p className="mt-1 text-sm text-warm-gray">
              {isEditing ? 'Changes save when you press save below.' : 'Fill in the basics and your first feed will be ready by tomorrow.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && !cvSuggestionApplied && (
              <button
                type="button"
                onClick={() => void handleTakeFromCV()}
                disabled={isLoadingCVSuggestions}
                className="flex items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-100 disabled:opacity-50"
              >
                {isLoadingCVSuggestions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                Take from my CV
              </button>
            )}
            {cvSuggestionApplied && (
              <span className="text-xs text-green-600">CV data applied</span>
            )}
            <button type="button" onClick={onClose} className="rounded-full p-2 text-warm-gray hover:bg-cream-100 hover:text-charcoal">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-0 divide-y divide-cream-200">
        {/* Step 1: Roles + Countries */}
        <div className="px-6 py-6 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">Step 1 of 4</p>
          <p className="mt-1 text-sm font-semibold text-charcoal">What jobs are you looking for?</p>
          <div className="mt-4 space-y-4">
            <FieldGroup
              label="Roles"
              help={`Type your own or pick from the list. We'll run one search per (role × country) each day, up to ${inputCaps.maxRoles} ${inputCaps.maxRoles === 1 ? 'search' : 'searches'} on your plan.`}
            >
              <RoleEntryField
                values={form.target_roles}
                suggestions={JOB_FEED_SUGGESTED_ROLES}
                placeholder="Type a role and press Enter"
                onChange={(target_roles) => onFormChange((prev) => ({ ...prev, target_roles }))}
              />
              {form.target_roles.length > inputCaps.maxRoles && (
                <p className="mt-2 text-xs text-amber-700">
                  Your plan searches up to {inputCaps.maxRoles} {inputCaps.maxRoles === 1 ? 'role' : 'roles'} per day. The first {inputCaps.maxRoles} in this list will be used each run — extras are kept for future runs.
                </p>
              )}
            </FieldGroup>

            <FieldGroup
              label="Countries to search"
              help={`Pick one or more. The daily budget is ${inputCaps.maxRoles} ${inputCaps.maxRoles === 1 ? 'search' : 'searches'} total, split across all countries you choose.`}
            >
              <MultiSelectDropdown
                values={form.target_countries}
                options={[...JOB_FEED_COUNTRY_OPTIONS]}
                placeholder="Choose countries (e.g. United States, Germany, United Kingdom)"
                searchable
                maxSelections={inputCaps.maxCountries}
                onChange={(target_countries) => onFormChange((prev) => ({
                  ...prev,
                  target_countries,
                  target_market: legacyMarketFromCountries(target_countries),
                }))}
              />
              {form.target_countries.length > 1 && form.target_roles.length > 0 && (
                <p className="mt-2 text-xs text-warm-gray">
                  With {form.target_countries.length} countries and a budget of {inputCaps.maxRoles}, each country gets {Math.max(1, Math.floor(inputCaps.maxRoles / form.target_countries.length))} {Math.max(1, Math.floor(inputCaps.maxRoles / form.target_countries.length)) === 1 ? 'role' : 'roles'} searched per day.
                </p>
              )}
            </FieldGroup>

            <FieldGroup
              label="Cities"
              help={`City names only (e.g. Berlin). We rotate through up to ${inputCaps.maxCitiesPerCountry} cities per country so each search targets a different city. Leave empty to search the whole country.`}
            >
              <RoleEntryField
                values={form.preferred_locations}
                suggestions={JOB_FEED_SUGGESTED_LOCATIONS}
                placeholder="Type a city and press Enter (e.g. Berlin)"
                addLabel="Add city"
                suggestionsLabel="Examples"
                emptyLabel="No cities added yet — we'll search the whole country."
                onChange={(preferred_locations) => onFormChange((prev) => ({ ...prev, preferred_locations }))}
              />
              {form.preferred_locations.length > inputCaps.maxCitiesPerCountry * Math.max(1, form.target_countries.length) && (
                <p className="mt-2 text-xs text-amber-700">
                  Only the first {inputCaps.maxCitiesPerCountry} cities per country are rotated through each day. Extras are kept in your profile but not searched in a single run.
                </p>
              )}
            </FieldGroup>
          </div>
        </div>

        {/* Step 2: Work mode */}
        {showChunk2 && (
          <div className="px-6 py-6 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">Step 2 of 4</p>
            <p className="mt-1 text-sm font-semibold text-charcoal">How do you want to work?</p>
            <div className="mt-4 space-y-4">
              <FieldGroup
                label="Work modes"
                help="This is the only place remote preference is set. Pick any that work for you — Karko will match jobs to any mode you choose."
              >
                <MultiSelectDropdown
                  values={form.remote_preferences}
                  options={JOB_FEED_REMOTE_PREFERENCE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  placeholder="Pick one or more work modes"
                  onChange={(nextValues) => onFormChange((prev) => {
                    const remote_preferences = nextValues as JobFeedSettingsInput['remote_preferences'];
                    return {
                      ...prev,
                      remote_preferences,
                      // Keep the legacy scalar in sync with the primary choice.
                      remote_preference: (remote_preferences[0] ?? prev.remote_preference) as JobFeedSettingsInput['remote_preference'],
                    };
                  })}
                />
              </FieldGroup>
            </div>
          </div>
        )}

        {/* Step 3: Delivery timing */}
        {showChunk3 && (
          <div className="px-6 py-6 sm:px-8">
            <p className="text-sm font-semibold text-charcoal">When should we deliver your jobs?</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FieldGroup label="Delivery time" help="Karko prepares your feed at this hour in your local time.">
                <SelectField
                  label=""
                  value={String(form.delivery_hour_local)}
                  options={JOB_FEED_DELIVERY_HOUR_OPTIONS}
                  onChange={(value) => onFormChange((prev) => ({ ...prev, delivery_hour_local: Number(value) }))}
                />
              </FieldGroup>

              <FieldGroup label="Your timezone" help="Needed so we schedule and rank jobs for your local day.">
                <GroupedSelectField
                  label=""
                  value={normalizeTimeZoneValue(form.user_timezone)}
                  groups={JOB_FEED_TIMEZONE_GROUPS}
                  onChange={(user_timezone) => onFormChange((prev) => ({ ...prev, user_timezone }))}
                />
                {browserTimeZone
                  && browserTimeZone !== form.user_timezone
                  && JOB_FEED_TIMEZONE_LOOKUP.has(browserTimeZone) && (
                  <button
                    type="button"
                    onClick={() => onFormChange((prev) => ({ ...prev, user_timezone: browserTimeZone }))}
                    className="mt-2 text-xs font-medium text-navy-600 hover:text-navy-700"
                  >
                    Use my browser timezone ({getJobFeedTimeZoneLabel(browserTimeZone)})
                  </button>
                )}
              </FieldGroup>
            </div>
          </div>
        )}

        {/* Step 4 — Fine-tune (expanded by default for non-technical users).
             Kept collapsible via the header button in case a power user prefers
             a compact view. */}
        {showChunk3 && (
          <div className="px-6 py-6 sm:px-8">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-navy-200 bg-navy-50/60 px-4 py-3 transition-colors hover:bg-navy-50"
            >
              <div className="flex items-center gap-3">
                {isAdvancedOpen ? <ChevronUp className="h-4 w-4 text-navy-600" /> : <ChevronDown className="h-4 w-4 text-navy-600" />}
                <div className="text-left">
                  <p className="text-sm font-semibold text-charcoal">Step 4 — Fine-tune your feed</p>
                  <p className="text-xs text-warm-gray">Seniority, skills, salary floor and a few more details to improve matches.</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-navy-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Recommended
              </span>
            </button>

            {isAdvancedOpen && (
              <div className="mt-4 grid gap-5 xl:grid-cols-2">
                <div className="space-y-4">
                  <FieldGroup
                    label="Seniority"
                    help="Pick every level you’re open to — e.g. junior and mid."
                  >
                    <MultiSelectDropdown
                      values={form.seniority_targets}
                      options={JOB_FEED_SENIORITY_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                      placeholder="Keep flexible"
                      onChange={(nextValues) => onFormChange((prev) => {
                        const seniority_targets = nextValues as JobFeedSettingsInput['seniority_targets'];
                        return {
                          ...prev,
                          seniority_targets,
                          seniority_target: (seniority_targets[0] ?? null) as JobFeedSettingsInput['seniority_target'],
                        };
                      })}
                    />
                  </FieldGroup>

                  <SelectField
                    label="Search style"
                    value={form.aggressiveness}
                    onChange={(aggressiveness) => onFormChange((prev) => ({
                      ...prev,
                      aggressiveness: aggressiveness as JobFeedSettingsInput['aggressiveness'],
                    }))}
                    options={JOB_FEED_AGGRESSIVENESS_OPTIONS}
                  />

                  <FieldGroup label="Employment types" help="Pick any that apply. Leave broad unless you have a strong preference.">
                    <MultiSelectDropdown
                      values={form.employment_types}
                      options={JOB_FEED_EMPLOYMENT_TYPE_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                      placeholder="Pick one or more job types"
                      onChange={(employment_types) => onFormChange((prev) => ({
                        ...prev,
                        employment_types: employment_types as JobFeedSettingsInput['employment_types'],
                      }))}
                    />
                  </FieldGroup>

                  <FieldGroup label="Languages" help="Only matters if language fit changes whether a role is worth seeing.">
                    <ChipField
                      values={form.languages}
                      suggestions={JOB_FEED_SUGGESTED_LANGUAGES}
                      placeholder="Add a language"
                      onChange={(languages) => onFormChange((prev) => ({ ...prev, languages }))}
                    />
                  </FieldGroup>
                </div>

                <div className="space-y-4">
                  <InputField
                    label="Salary floor"
                    type="number"
                    value={form.salary_floor === null ? '' : String(form.salary_floor)}
                    onChange={(salary_floor) => onFormChange((prev) => ({
                      ...prev,
                      salary_floor: salary_floor ? Number(salary_floor) : null,
                    }))}
                    placeholder="120000"
                  />

                  <FieldGroup label="Your skills" help="Used to match you with jobs that need what you bring. Imported from your CV or add manually.">
                    <ChipField
                      values={form.user_skills}
                      suggestions={[]}
                      placeholder="Add a skill (e.g. Python, React, SQL)"
                      onChange={(user_skills) => onFormChange((prev) => ({ ...prev, user_skills }))}
                    />
                    {form.user_skills.length === 0 && !cvSuggestionApplied && (
                      <button
                        type="button"
                        onClick={() => void handleTakeFromCV()}
                        disabled={isLoadingCVSuggestions}
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-700 disabled:opacity-50"
                      >
                        {isLoadingCVSuggestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                        Import skills from CV
                      </button>
                    )}
                  </FieldGroup>

                  <SelectField
                    label="Work authorization"
                    value={form.work_authorization_status ?? ''}
                    onChange={(work_authorization_status) => onFormChange((prev) => ({
                      ...prev,
                      work_authorization_status: (work_authorization_status || null) as JobFeedSettingsInput['work_authorization_status'],
                    }))}
                    options={[{ value: '', label: 'Keep flexible' }, ...JOB_FEED_WORK_AUTH_OPTIONS]}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Save action */}
        {showSaveAction && (
          <div className="px-6 py-6 sm:px-8">
            <div className="flex flex-col items-center gap-4 text-center">
              {!isEditing && !hasRecordedConsent && (
                <label className="flex items-start justify-center gap-3 text-left">
                  <input
                    type="checkbox"
                    checked={form.consent_accepted}
                    onChange={(event) => onFormChange((prev) => ({ ...prev, consent_accepted: event.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-cream-300 text-navy-600 focus:ring-navy-500"
                  />
                  <span className="text-sm leading-relaxed text-charcoal">
                    Karko will search for jobs for you once a day.
                  </span>
                </label>
              )}
              {isEditing && (
                <p className="text-sm text-warm-gray">
                  Next delivery: {deliveryLabel}
                </p>
              )}

              <div className="flex flex-col items-center gap-2 sm:flex-row">
                <Button
                  variant="gold"
                  onClick={() => {
                    const saveForm = isEditing ? form : { ...form, enabled: true };
                    void onSave(saveForm);
                  }}
                  disabled={!canSave || saveState === 'saving'}
                >
                  {saveState === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Save changes' : 'Start my daily feed'}
                </Button>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      onFormChange((prev) => ({ ...prev, enabled: false }));
                      void onSave({ ...form, enabled: false });
                    }}
                    disabled={!canSave || saveState === 'saving'}
                    className="text-sm font-medium text-warm-gray hover:text-charcoal disabled:opacity-50"
                  >
                    Save and keep paused
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function LoadingState() {
  return (
    <Card className="rounded-[24px] border-cream-200 bg-white/92 p-6 shadow-sm">
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
  const delivery = formatDeliveryHourLabel(form.delivery_hour_local);
  return `Roles: ${roles} | Countries: ${countries} | Delivery: ${delivery} ${form.user_timezone}`;
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
    <Card className="rounded-[24px] border-dashed border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
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

function canSaveJobFeedSettings(form: JobFeedSettingsInput, hasRecordedConsent = false): boolean {
  const consentReady = form.consent_accepted || hasRecordedConsent;

  return form.target_roles.length > 0
    && form.employment_types.length > 0
    && isValidTimeZone(form.user_timezone)
    && (!form.enabled || consentReady);
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




function toStoreApplicationSession(session: JobFeedApplyResponse['session']): StoreApplicationSession {
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
    companyResearch,
    screeningUsageCount: 0,
    cvEdits: Array.isArray(session.cv_edits) ? session.cv_edits as unknown as StoreApplicationSession['cvEdits'] : [],
    chatMessages: [],
  };
}

function buildJobFeedApplyPath(params: {
  sessionId: string;
  autostart: boolean;
}): string {
  const searchParams = new URLSearchParams({
    workspace: 'application-kit',
    tab: 'cv',
    session: params.sessionId,
  });

  if (params.autostart) {
    searchParams.set('autostart', 'job-feed-apply');
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
