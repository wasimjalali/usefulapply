'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  DollarSign,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  PauseCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  JOB_FEED_AGGRESSIVENESS_OPTIONS,
  JOB_FEED_EMPLOYMENT_TYPE_OPTIONS,
  JOB_FEED_MARKET_OPTIONS,
  JOB_FEED_REMOTE_PREFERENCE_OPTIONS,
  JOB_FEED_SENIORITY_OPTIONS,
  JOB_FEED_SUGGESTED_LANGUAGES,
  JOB_FEED_SUGGESTED_LOCATIONS,
  JOB_FEED_SUGGESTED_ROLES,
  JOB_FEED_VISIBLE_DEFAULT_COUNT,
  JOB_FEED_VISIBLE_MAX_COUNT,
  JOB_FEED_WORK_AUTH_OPTIONS,
  formatDeliveryHourLabel,
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
} from '@/lib/job-feed/types';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore, type ApplicationSession as StoreApplicationSession } from '@/store/useSessionStore';

type SaveState = 'idle' | 'saving';
type PendingJobAction = {
  jobId: string;
  action: 'apply' | 'save' | 'dismiss';
} | null;

type JobFeedPreviewMode =
  | 'off'
  | 'signed_out'
  | 'upgrade_required'
  | JobFeedOverviewState;

type JobFeedWizardStepId =
  | 'roles'
  | 'locations'
  | 'schedule'
  | 'refinements'
  | 'review';

type JobFeedWizardStep = {
  id: JobFeedWizardStepId;
  eyebrow: string;
  title: string;
  description: string;
  optional?: boolean;
};

const JOB_FEED_WIZARD_STEPS: JobFeedWizardStep[] = [
  {
    id: 'roles',
    eyebrow: 'Step 1',
    title: 'Roles and market',
    description: 'Pick the core roles and launch market Karko should prioritize.',
  },
  {
    id: 'locations',
    eyebrow: 'Step 2',
    title: 'Locations and work style',
    description: 'Tell Karko where you want to work and how flexible the setup should be.',
  },
  {
    id: 'schedule',
    eyebrow: 'Step 3',
    title: 'Delivery timing',
    description: 'Choose when the daily feed should arrive in your local timezone.',
  },
  {
    id: 'refinements',
    eyebrow: 'Step 4',
    title: 'Optional refinements',
    description: 'Tighten the feed only where it meaningfully changes what is worth seeing.',
    optional: true,
  },
  {
    id: 'review',
    eyebrow: 'Step 5',
    title: 'Review and activate',
    description: 'Double-check the setup, then decide whether to turn the daily feed on immediately.',
  },
];

const JOB_FEED_REMOTE_PREFERENCE_DESCRIPTIONS: Record<JobFeedSettingsInput['remote_preference'], string> = {
  remote_first: 'Remote roles first, with hybrid or on-site roles only if they still fit.',
  remote_only: 'Only fully remote jobs should make the cut.',
  hybrid: 'Hybrid roles are welcome alongside remote matches.',
  onsite: 'On-site roles are still acceptable if the job is strong enough.',
  flexible: 'Keep work mode broad and let the other filters do most of the work.',
};

const JOB_FEED_QUICK_DELIVERY_HOURS = [7, 8, 9, 12, 18, 20];
const JOB_FEED_COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/Berlin',
  'UTC',
];

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

  const applyPreviewFeedback = useCallback((jobId: string, action: 'opened' | 'saved' | 'dismissed' | 'applied') => {
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
    action: 'opened' | 'saved' | 'dismissed'
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
          ? 'Application session ready. Karko is opening the workflow now.'
          : 'Application session ready. Upload your CV to continue this job.'
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

  const handleSave = async () => {
    setSaveState('saving');

    try {
      if (isPreviewing) {
        const previewSettings = toPreviewJobFeedSettings(form);

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

        toast.success(
          form.enabled && form.consent_accepted
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
        body: JSON.stringify(form),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save Job Feed settings.');
      }

      posthog?.capture('job_feed_setup_completed', {
        foundation_mode: true,
        enabled: form.enabled,
        target_market: form.target_market,
        roles_count: form.target_roles.length,
      });

      toast.success(form.enabled ? 'Daily feed is on and scheduled.' : 'Job Feed settings saved.');
      setIsEditing(false);
      setIsSetupWizardOpen(false);
      await loadOverview({ quiet: true });
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
        throw new Error(payload.error || 'Failed to run the background workflow.');
      }

      posthog?.capture('job_feed_foundation_run_requested', {
        foundation_mode: true,
        forced: force,
      });

      const toastMessage = payload.workflow?.skipped
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
    setIsEditing(true);

    if (isSetupWizardOpen) {
      setupWizardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    setIsSetupWizardOpen(true);
  }, [isSetupWizardOpen]);

  const currentState = isSignedIn ? (overview?.state ?? 'setup_required') : 'sign_in_required';
  const setupOpen = isSignedIn && (isEditing || isSetupWizardOpen);
  const canAccess = Boolean(overview?.canAccess);
  const heroDeliveryValue = !isSignedIn
    ? 'Choose your time'
    : !canAccess
      ? 'Unlock to set'
      : currentState === 'setup_required' && form.target_roles.length === 0
        ? 'Choose your time'
        : formatDeliveryHourLabel(form.delivery_hour_local);
  const heroDeliveryNote = !isSignedIn
    ? 'Runs in your local timezone'
    : !canAccess
      ? 'Available with premium access'
      : form.user_timezone;
  const heroMarketNote = !isSignedIn
    ? 'First supported market'
    : !canAccess
      ? 'Choose after upgrade'
      : 'Current launch market';
  const heroStateNote = getHeroStateNote(currentState, isSignedIn);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(215,180,58,0.12),transparent_32%),linear-gradient(180deg,#fbfaf6_0%,#f5f0e4_100%)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6">
        <section className="overflow-hidden rounded-[28px] border border-cream-200 bg-[linear-gradient(135deg,rgba(16,44,87,0.98),rgba(27,65,120,0.96)_58%,rgba(207,171,76,0.86)_150%)] text-white shadow-[0_28px_90px_-40px_rgba(16,44,87,0.6)]">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.4fr_0.95fr] lg:px-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cream-100/90">
                <Sparkles className="h-3.5 w-3.5 text-gold-300" />
                Daily Job Feed
              </div>

              <div className="max-w-2xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.25rem]">
                  Karko researches your next job in the background.
                </h1>
                <p className="max-w-xl text-sm leading-6 text-cream-100/85 sm:text-base">
                  Set your preferences once, and Karko will queue a fresh shortlist in the background so you can review the strongest roles,
                  save the ones worth revisiting, dismiss weak matches, or jump straight into Apply with Karko AI.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <HeroPill icon={ShieldCheck} label="Premium-only daily discovery" />
                <HeroPill icon={Wand2} label="Curated matches from real job sources" />
                <HeroPill icon={CalendarClock} label="Strongest roles surfaced first" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <HeroStat
                icon={Clock3}
                label="Delivery window"
                value={heroDeliveryValue}
                sublabel={heroDeliveryNote}
              />
              <HeroStat
                icon={Globe}
                label="Target market"
                value={readableMarket(form.target_market)}
                sublabel={heroMarketNote}
              />
              <HeroStat
                icon={Zap}
                label="Current state"
                value={readableState(currentState)}
                sublabel={heroStateNote}
              />
            </div>
          </div>
        </section>

        <div className="space-y-5">
          {isLoading ? (
            <LoadingState />
          ) : !isSignedIn ? (
            <SignedOutJobFeedCard />
          ) : (
            <PrimaryStateCard
              overview={overview}
              onEditSettings={openSetupWizard}
              onRefresh={() => loadOverview({ quiet: true })}
              isRefreshing={isRefreshing}
            />
          )}

          {setupOpen && (
            <div ref={setupWizardRef}>
              <JobFeedOnboardingWizard
                form={form}
                overview={overview}
                saveState={saveState}
                isEditing={isEditing}
                onFormChange={setForm}
                onSave={handleSave}
                onClose={() => {
                  setForm(toJobFeedInput(overview?.settings ?? null, getBrowserTimeZone()));
                  setIsEditing(false);
                  setIsSetupWizardOpen(false);
                }}
              />
            </div>
          )}

          {isSignedIn && !overview?.canAccess && !isLoading && (
            <UpgradePromptCard />
          )}

          {!isLoading && isSignedIn && overview?.jobs && overview.jobs.length > 0 && (
            <FeedResultsCard
              overview={overview}
              jobs={overview.jobs}
              isShowingAllJobs={isShowingAllJobs}
              onToggleShowAll={() => setIsShowingAllJobs((prev) => !prev)}
              pendingJobAction={pendingJobAction}
              onOpenDetails={handleOpenDetails}
              onApplyWithKarko={handleApplyWithKarko}
              onSave={handleSaveJob}
              onDismiss={handleDismissJob}
              onExternalApply={handleExternalApply}
            />
          )}

          {!isLoading && isSignedIn && overview?.state === 'empty' && (
            <EmptyFeedCard onEditSettings={openSetupWizard} />
          )}

          {isSignedIn ? overview?.canAccess ? (
            <Card className="rounded-[24px] border-cream-200 bg-white/92 p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Your preferences</p>
                  <h2 className="mt-2 text-lg font-semibold text-charcoal">Feed summary</h2>
                </div>
                {!setupOpen && (
                  <Button variant="ghost" size="sm" onClick={openSetupWizard}>
                    <Settings2 className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>

              <div className="mt-5 space-y-4">
                <SummaryRow icon={Briefcase} label="Roles" value={form.target_roles.length > 0 ? form.target_roles.join(', ') : 'Not set yet'} />
                <SummaryRow icon={MapPin} label="Locations" value={form.preferred_locations.length > 0 ? form.preferred_locations.join(', ') : 'Flexible'} />
                <SummaryRow icon={Globe} label="Market" value={readableMarket(form.target_market)} />
                <SummaryRow icon={Clock3} label="Delivery" value={`${formatDeliveryHourLabel(form.delivery_hour_local)} in ${form.user_timezone}`} />
              </div>
            </Card>
          ) : (
            <UpgradePreviewSummaryCard />
          ) : (
            <SignedOutPreviewCard />
          )}

          <Card className="rounded-[24px] border-cream-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,244,234,0.9))] p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">How it works</p>
            <h2 className="mt-2 text-lg font-semibold text-charcoal">What happens after you turn on Job Feed</h2>
            <div className="mt-5 space-y-3">
              <ProductStep
                number="1"
                title="Karko checks your preferences"
                body="Roles, market, delivery window, and fit settings shape the daily search before jobs ever reach the feed."
              />
              <ProductStep
                number="2"
                title="Karko gathers and cleans jobs"
                body="Provider results are cleaned up and deduplicated before they ever reach your shortlist."
              />
              <ProductStep
                number="3"
                title="Only the strongest matches survive"
                body="Fit filters and ranking keep weak matches out so the feed feels curated instead of noisy."
              />
              <ProductStep
                number="4"
                title="You review, save, dismiss, or apply"
                body="Each surfaced job can flow directly into Apply with Karko AI while your feedback keeps the current feed cleaner over time."
              />
            </div>
          </Card>

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
                These tools are hidden unless debug mode is explicitly enabled. Use them to queue the background workflow or force a same-day rerun while verifying the feed.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => handleDebugRun()} disabled={isRunningDebugFlow}>
                  {isRunningDebugFlow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Queue background workflow
                </Button>
                <Button variant="ghost" onClick={() => handleDebugRun({ force: true })} disabled={isRunningDebugFlow}>
                  Force rerun today
                </Button>
                <Button variant="ghost" onClick={() => loadOverview({ quiet: true })} disabled={isRefreshing}>
                  Refresh status
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {selectedJob && (
        <JobFeedDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          isApplying={pendingJobAction?.jobId === selectedJob.id && pendingJobAction.action === 'apply'}
          onApplyWithKarko={() => handleApplyWithKarko(selectedJob)}
          onExternalApply={() => handleExternalApply(selectedJob)}
        />
      )}
    </div>
  );
}

function SignedOutJobFeedCard() {
  return (
    <Card className="rounded-[28px] border border-navy-200 bg-[linear-gradient(135deg,rgba(240,246,255,0.96),rgba(255,255,255,0.98)_55%,rgba(253,247,228,0.9)_120%)] p-6 shadow-sm">
      <div className="space-y-6">
        <div>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
              <ShieldCheck className="h-6 w-6 text-navy-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Get started</p>
              <h2 className="mt-2 text-2xl font-semibold text-charcoal">Start your personal daily shortlist</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray">
                Job Feed is designed as a premium assistant surface, not a manual search board. Create an account if you are new, or sign in if you already have one. Then choose a few fit signals once and let Karko prepare the strongest matches in the background.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <AccessFeatureCard
              icon={Sparkles}
              title="Low-friction setup"
              body="A short guided wizard gets the first run ready without asking for every detail up front."
            />
            <AccessFeatureCard
              icon={CalendarClock}
              title="Background delivery"
              body="Karko searches on your schedule so the shortlist is waiting when you open the app."
            />
            <AccessFeatureCard
              icon={Wand2}
              title="Direct apply handoff"
              body="Strong roles can move straight into Apply with Karko AI when you are ready."
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/auth/signup">
              <Button variant="gold">
                Create account
              </Button>
            </Link>
            <Link href="/auth/login">
              <Button variant="outline">
                Sign in
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost">
                View plans
              </Button>
            </Link>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/70 bg-white/85 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">What happens first</p>
          <div className="mt-4 space-y-4">
            <AccessFeatureRow
              step="1"
              title="Create your account"
              body="Open a Karko account or sign in so the feed can stay tied to your preferences and daily delivery time."
            />
            <AccessFeatureRow
              step="2"
              title="Set the essentials"
              body="Choose roles, locations, timing, and whether Karko should keep the feed broad or strict."
            />
            <AccessFeatureRow
              step="3"
              title="Turn on daily delivery"
              body="Consent lets Karko run the background research automatically instead of waiting for manual searches."
            />
            <AccessFeatureRow
              step="4"
              title="Review the shortlist"
              body="Open the strongest matches first, then save, dismiss, or apply with Karko AI."
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function SignedOutPreviewCard() {
  return (
    <Card className="rounded-[24px] border-cream-200 bg-white/92 p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Before the first run</p>
        <h2 className="mt-2 text-lg font-semibold text-charcoal">What you’ll personalize</h2>
      </div>

      <div className="mt-5 space-y-4">
        <SummaryRow icon={Briefcase} label="Roles" value="Choose the exact roles Karko should prioritize" />
        <SummaryRow icon={MapPin} label="Locations" value="Set markets, cities, or remote preferences" />
        <SummaryRow icon={Globe} label="Market" value="Start with the US and Canada launch scope" />
        <SummaryRow icon={Clock3} label="Schedule" value="Pick a local delivery time and give consent for automation" />
      </div>

      <div className="mt-5 rounded-[22px] border border-cream-200 bg-cream-50/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">Best for</p>
        <p className="mt-2 text-sm leading-6 text-warm-gray">
          People who want Karko to come back with a prepared shortlist instead of starting from a fresh manual search each day.
        </p>
      </div>
    </Card>
  );
}

function UpgradePromptCard() {
  return (
    <Card className="rounded-[28px] border-gold-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(253,247,228,0.95),rgba(244,248,255,0.9)_140%)] p-6 shadow-sm">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Premium Access</p>
          <h2 className="mt-2 text-xl font-semibold text-charcoal">Upgrade to unlock automatic daily discovery</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray">
            Job Feed stays premium because every run relies on background research, ranking, and shortlist curation before the jobs ever reach your dashboard.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/pricing" className="inline-flex">
              <Button variant="gold">
                View plans
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/70 bg-white/88 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">Included with premium</p>
          <div className="mt-4 space-y-4">
            <AccessFeatureRow
              step="A"
              title="Daily background research"
              body="Karko checks the market for you on a schedule instead of waiting for a manual search."
            />
            <AccessFeatureRow
              step="B"
              title="Curated feed ranking"
              body="The strongest roles are surfaced first so the shortlist feels useful instead of noisy."
            />
            <AccessFeatureRow
              step="C"
              title="In-app application flow"
              body="The feed connects directly to Apply with Karko AI when a role is worth pursuing."
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function UpgradePreviewSummaryCard() {
  return (
    <Card className="rounded-[24px] border-cream-200 bg-white/92 p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Premium preview</p>
        <h2 className="mt-2 text-lg font-semibold text-charcoal">What unlocks after upgrade</h2>
      </div>

      <div className="mt-5 space-y-4">
        <SummaryRow icon={Briefcase} label="Roles" value="Set the exact titles Karko should treat as top-priority matches" />
        <SummaryRow icon={MapPin} label="Locations" value="Choose markets, cities, or remote preferences that matter most" />
        <SummaryRow icon={Globe} label="Market" value="Start broad with the US and Canada launch scope, then narrow if you want" />
        <SummaryRow icon={Clock3} label="Delivery" value="Pick the daily delivery time that feels right for your local schedule" />
      </div>
    </Card>
  );
}

function AccessFeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/70 bg-white/85 p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-charcoal">{title}</p>
      <p className="mt-2 text-sm leading-6 text-warm-gray">{body}</p>
    </div>
  );
}

function AccessFeatureRow({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-600 text-xs font-semibold text-white">
        {step}
      </div>
      <div>
        <p className="text-sm font-semibold text-charcoal">{title}</p>
        <p className="mt-1 text-sm leading-6 text-warm-gray">{body}</p>
      </div>
    </div>
  );
}

function JobFeedOnboardingWizard({
  form,
  overview,
  saveState,
  isEditing,
  onFormChange,
  onSave,
  onClose,
}: {
  form: JobFeedSettingsInput;
  overview: JobFeedOverviewResponse | null;
  saveState: SaveState;
  isEditing: boolean;
  onFormChange: React.Dispatch<React.SetStateAction<JobFeedSettingsInput>>;
  onSave: () => void;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isStepMapOpen, setIsStepMapOpen] = useState(false);
  const browserTimeZone = getBrowserTimeZone();
  const activeStep = JOB_FEED_WIZARD_STEPS[stepIndex];
  const canContinue = canAdvanceJobFeedWizardStep(activeStep.id, form);
  const canSave = canSaveJobFeedSettings(form);
  const hasRecordedConsent = Boolean(overview?.settings?.consent_accepted_at);
  const deliveryLabel = `${formatDeliveryHourLabel(form.delivery_hour_local)} in ${form.user_timezone}`;
  const completedStepCount = JOB_FEED_WIZARD_STEPS.filter((step, index) => index < stepIndex || isJobFeedWizardStepComplete(step.id, form)).length;
  const progressPercent = Math.max(20, ((stepIndex + 1) / JOB_FEED_WIZARD_STEPS.length) * 100);
  const activationState = form.enabled
    ? form.consent_accepted
      ? 'Daily feed will turn on after save.'
      : 'Settings can save now, but consent is still needed before Karko can run automatically.'
    : 'The setup will save, and the feed will stay paused until you turn it on.';

  const goToStep = (nextIndex: number) => {
    setStepIndex(Math.max(0, Math.min(nextIndex, JOB_FEED_WIZARD_STEPS.length - 1)));
  };

  const advance = () => {
    if (stepIndex === JOB_FEED_WIZARD_STEPS.length - 1) {
      void onSave();
      return;
    }

    if (!canContinue) {
      return;
    }

    setIsStepMapOpen(false);
    goToStep(stepIndex + 1);
  };

  const skipOptionalStep = () => {
    if (!activeStep.optional) return;
    setIsStepMapOpen(false);
    goToStep(stepIndex + 1);
  };

  return (
    <Card className="rounded-[28px] border-cream-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,234,0.92))] p-0 shadow-[0_24px_70px_-40px_rgba(30,58,95,0.35)]">
      <div className="border-b border-cream-200 px-6 py-5 sm:px-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-500">Feed setup</p>
            <h2 className="mt-2 text-2xl font-semibold text-charcoal">Tell Karko what a premium daily match looks like</h2>
            <p className="mt-2 text-sm leading-6 text-warm-gray">
              Instead of one long form, move through the essentials step by step. Save as soon as the signal feels good enough and tighten the feed later.
            </p>
          </div>

          {isEditing && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>

        <div className="rounded-[22px] border border-cream-200 bg-white/80 p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">
                Step {stepIndex + 1} of {JOB_FEED_WIZARD_STEPS.length}
              </p>
              <p className="mt-1 text-sm font-semibold text-charcoal">{activeStep.title}</p>
              <p className="mt-1 text-sm leading-6 text-warm-gray">
                {completedStepCount} of {JOB_FEED_WIZARD_STEPS.length} steps are completed or already ready.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-navy-200 bg-navy-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-navy-700">
                {activeStep.eyebrow}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsStepMapOpen((prev) => !prev)}
                aria-expanded={isStepMapOpen}
              >
                {isStepMapOpen ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                {isStepMapOpen ? 'Hide steps' : 'Show all steps'}
              </Button>
            </div>
          </div>

          <div className="mt-4 h-2 rounded-full bg-cream-100">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,rgba(21,66,138,0.96),rgba(203,167,72,0.96))] transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {isStepMapOpen && (
            <div className="mt-4 space-y-3">
              {JOB_FEED_WIZARD_STEPS.map((step, index) => {
                const complete = index < stepIndex || isJobFeedWizardStepComplete(step.id, form);
                const active = index === stepIndex;

                return (
                  <button
                    key={step.id}
                    type="button"
                    aria-current={active ? 'step' : undefined}
                    onClick={() => {
                      if (index <= stepIndex || complete) {
                        setIsStepMapOpen(false);
                        goToStep(index);
                      }
                    }}
                    className={`w-full rounded-[22px] border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-navy-200 bg-navy-50 shadow-sm'
                        : complete
                          ? 'border-emerald-200 bg-emerald-50/70'
                          : 'border-cream-200 bg-white/75'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                        complete
                          ? 'bg-emerald-500 text-white'
                          : active
                            ? 'bg-navy-600 text-white'
                            : 'bg-cream-100 text-warm-gray'
                      }`}>
                        {complete ? '✓' : index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-gray">{step.eyebrow}</p>
                        <p className="mt-1 text-sm font-semibold text-charcoal">{step.title}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6 px-6 py-6 xl:px-7">
        <div className="rounded-[26px] border border-cream-200 bg-white/92 p-6 shadow-sm">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-navy-100 bg-[linear-gradient(135deg,rgba(241,245,255,0.9),rgba(255,255,255,0.96))] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">{activeStep.eyebrow}</p>
              <h3 className="mt-2 text-xl font-semibold text-charcoal">{activeStep.title}</h3>
              <p className="mt-2 text-sm leading-6 text-warm-gray">{activeStep.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <SetupFocusPill icon={Briefcase} label="Target roles" />
                <SetupFocusPill icon={MapPin} label="Locations" />
                <SetupFocusPill icon={Clock3} label="Delivery timing" />
                <SetupFocusPill icon={ShieldCheck} label="Consent when ready" />
              </div>
            </div>

            {activeStep.id === 'roles' && (
              <div className="space-y-5">
                <SetupSectionHeader
                  eyebrow="Core fit"
                  title="Start with the roles you want most"
                  body="One or two focused titles are enough to seed the feed. Keep the market broad unless you already know you want one country only."
                />

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
                  <FieldGroup label="Suggested roles" help="Choose the roles Karko should treat as the strongest signal.">
                    <ChoiceGrid
                      value={form.target_roles}
                      multiple
                      options={JOB_FEED_SUGGESTED_ROLES.map((role) => ({
                        value: role,
                        label: role,
                      }))}
                      onChange={(target_roles) => onFormChange((prev) => ({ ...prev, target_roles: target_roles as string[] }))}
                    />
                  </FieldGroup>

                  <FieldGroup label="Target market" help="Job Feed launches with the United States and Canada first.">
                    <ChoiceGrid
                      value={form.target_market}
                      options={JOB_FEED_MARKET_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                        description: option.value === 'us_canada'
                          ? 'Best default if you want the broadest launch scope.'
                          : option.value === 'us'
                            ? 'Keep the search focused on United States roles.'
                            : 'Keep the search focused on Canada roles.',
                      }))}
                      onChange={(target_market) => onFormChange((prev) => ({
                        ...prev,
                        target_market: target_market as JobFeedSettingsInput['target_market'],
                      }))}
                    />
                  </FieldGroup>
                </div>

                <FieldGroup label="Add custom roles" help="Write in anything more specific, like Sales Engineer, Product Designer, or Revenue Operations Manager.">
                  <ChipField
                    values={form.target_roles}
                    suggestions={JOB_FEED_SUGGESTED_ROLES}
                    placeholder="Type a role and press Enter"
                    onChange={(target_roles) => onFormChange((prev) => ({ ...prev, target_roles }))}
                  />
                </FieldGroup>

                {form.target_roles.length === 0 && (
                  <InlineNotice tone="warning" title="At least one role is required">
                    Karko needs a target role before the feed can be saved.
                  </InlineNotice>
                )}
              </div>
            )}

            {activeStep.id === 'locations' && (
              <div className="space-y-5">
                <SetupSectionHeader
                  eyebrow="Work style"
                  title="Shape the places and work mode you care about"
                  body="Keep this flexible unless location or remote rules meaningfully change whether a role is worth seeing."
                />

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                  <FieldGroup label="Preferred locations" help="Leave this light if you want Karko to stay flexible across the selected market.">
                    <ChipField
                      values={form.preferred_locations}
                      suggestions={JOB_FEED_SUGGESTED_LOCATIONS}
                      placeholder="Add a city, region, or remote hint"
                      onChange={(preferred_locations) => onFormChange((prev) => ({ ...prev, preferred_locations }))}
                    />
                  </FieldGroup>

                  <FieldGroup label="Remote preference" help="Choose the default bias for what should make the shortlist.">
                    <ChoiceGrid
                      value={form.remote_preference}
                      options={JOB_FEED_REMOTE_PREFERENCE_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                        description: JOB_FEED_REMOTE_PREFERENCE_DESCRIPTIONS[option.value],
                      }))}
                      onChange={(remote_preference) => onFormChange((prev) => ({
                        ...prev,
                        remote_preference: remote_preference as JobFeedSettingsInput['remote_preference'],
                      }))}
                    />
                  </FieldGroup>
                </div>

                <InlineNotice tone="neutral" title="Low-friction default">
                  If you are open across the market, leave locations flexible and let the remote preference carry most of the signal.
                </InlineNotice>
              </div>
            )}

            {activeStep.id === 'schedule' && (
              <div className="space-y-5">
                <SetupSectionHeader
                  eyebrow="Timing"
                  title="Choose when the shortlist should arrive"
                  body="The browser already gives Karko a good timezone starting point. Adjust it only if you work in a different local time."
                />

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                  <FieldGroup label="Quick delivery windows" help="Pick one of the common delivery times below, or use the full select under it.">
                    <ChoiceGrid
                      value={String(form.delivery_hour_local)}
                      options={JOB_FEED_QUICK_DELIVERY_HOURS.map((hour) => ({
                        value: String(hour),
                        label: formatDeliveryHourLabel(hour),
                      }))}
                      onChange={(value) => onFormChange((prev) => ({ ...prev, delivery_hour_local: Number(value) }))}
                      columns="three"
                    />

                    <div className="mt-4">
                      <SelectField
                        label="More delivery times"
                        value={String(form.delivery_hour_local)}
                        onChange={(value) => onFormChange((prev) => ({ ...prev, delivery_hour_local: Number(value) }))}
                        options={Array.from({ length: 16 }, (_, index) => {
                          const hour = index + 6;
                          return {
                            value: String(hour),
                            label: `${formatDeliveryHourLabel(hour)} local`,
                          };
                        })}
                      />
                    </div>
                  </FieldGroup>

                  <FieldGroup label="Timezone" help="Search or paste a timezone, or jump straight back to the browser-detected timezone.">
                    <TimeZoneField
                      value={form.user_timezone}
                      browserTimeZone={browserTimeZone}
                      onChange={(user_timezone) => onFormChange((prev) => ({ ...prev, user_timezone }))}
                    />
                  </FieldGroup>
                </div>

                <InlineNotice tone={isValidTimeZone(form.user_timezone) ? 'success' : 'warning'} title="Daily delivery preview">
                  {isValidTimeZone(form.user_timezone)
                    ? `Karko will aim for ${deliveryLabel}.`
                    : 'Choose a valid timezone before saving the feed.'}
                </InlineNotice>
              </div>
            )}

            {activeStep.id === 'refinements' && (
              <div className="space-y-5">
                <SetupSectionHeader
                  eyebrow="Optional"
                  title="Add only the filters that really matter"
                  body="These are great for sharpening the feed later, but most people should keep the first pass light and skip anything that feels uncertain."
                />

                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="space-y-4">
                    <SelectField
                      label="Seniority"
                      value={form.seniority_target ?? ''}
                      onChange={(seniority_target) => onFormChange((prev) => ({
                        ...prev,
                        seniority_target: (seniority_target || null) as JobFeedSettingsInput['seniority_target'],
                      }))}
                      options={[{ value: '', label: 'Keep flexible' }, ...JOB_FEED_SENIORITY_OPTIONS]}
                    />

                    <SelectField
                      label="Aggressiveness"
                      value={form.aggressiveness}
                      onChange={(aggressiveness) => onFormChange((prev) => ({
                        ...prev,
                        aggressiveness: aggressiveness as JobFeedSettingsInput['aggressiveness'],
                      }))}
                      options={JOB_FEED_AGGRESSIVENESS_OPTIONS}
                    />

                    <FieldGroup label="Employment types" help="Most people should leave this broad until they see the first few runs.">
                      <ChoiceGrid
                        value={form.employment_types}
                        multiple
                        options={JOB_FEED_EMPLOYMENT_TYPE_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                        onChange={(employment_types) => onFormChange((prev) => ({
                          ...prev,
                          employment_types: employment_types as JobFeedSettingsInput['employment_types'],
                        }))}
                      />
                    </FieldGroup>
                  </div>

                  <div className="space-y-4">
                    <InputField
                      label="Salary floor (optional)"
                      type="number"
                      value={form.salary_floor === null ? '' : String(form.salary_floor)}
                      onChange={(salary_floor) => onFormChange((prev) => ({
                        ...prev,
                        salary_floor: salary_floor ? Number(salary_floor) : null,
                      }))}
                      placeholder="120000"
                    />

                    <SelectField
                      label="Work authorization"
                      value={form.work_authorization_status ?? ''}
                      onChange={(work_authorization_status) => onFormChange((prev) => ({
                        ...prev,
                        work_authorization_status: (work_authorization_status || null) as JobFeedSettingsInput['work_authorization_status'],
                      }))}
                      options={[{ value: '', label: 'Keep flexible' }, ...JOB_FEED_WORK_AUTH_OPTIONS]}
                    />

                    <FieldGroup label="Languages" help="Optional. Useful if you want Karko to prefer roles that fit your working language.">
                      <ChipField
                        values={form.languages}
                        suggestions={JOB_FEED_SUGGESTED_LANGUAGES}
                        placeholder="Add a language"
                        onChange={(languages) => onFormChange((prev) => ({ ...prev, languages }))}
                      />
                    </FieldGroup>

                    <FieldGroup label="Adjacent roles" help="Helpful if similar titles in your market are often worth seeing.">
                      <ToggleRow
                        title="Include adjacent roles"
                        description="Let Karko widen into close neighbours when exact titles are quiet."
                        checked={form.adjacent_roles_enabled}
                        onChange={(adjacent_roles_enabled) => onFormChange((prev) => ({ ...prev, adjacent_roles_enabled }))}
                      />

                      {form.adjacent_roles_enabled && (
                        <div className="pt-3">
                          <ChipField
                            values={form.adjacent_roles}
                            suggestions={['Platform Engineer', 'Solutions Engineer', 'Product Analyst']}
                            placeholder="Add an adjacent role"
                            onChange={(adjacent_roles) => onFormChange((prev) => ({ ...prev, adjacent_roles }))}
                          />
                        </div>
                      )}
                    </FieldGroup>
                  </div>
                </div>
              </div>
            )}

            {activeStep.id === 'review' && (
              <div className="space-y-5">
                <SetupSectionHeader
                  eyebrow="Activation"
                  title="Review the setup before Karko starts searching"
                  body="You can still edit any of this later. The goal here is a strong first pass, not a perfect one."
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <WizardSummaryCard title="Roles" value={form.target_roles.length > 0 ? form.target_roles.join(', ') : 'Choose at least one role'} />
                  <WizardSummaryCard title="Locations" value={form.preferred_locations.length > 0 ? form.preferred_locations.join(', ') : 'Flexible across your target market'} />
                  <WizardSummaryCard title="Schedule" value={deliveryLabel} />
                  <WizardSummaryCard title="Filter style" value={`${readableMarket(form.target_market)} • ${JOB_FEED_REMOTE_PREFERENCE_OPTIONS.find((option) => option.value === form.remote_preference)?.label ?? 'Flexible'}`} />
                </div>

                <div className="rounded-[24px] border border-cream-200 bg-cream-50/70 p-5">
                  <ToggleRow
                    title="Enable daily feed"
                    description="Turn scheduling on now, or save the setup first and leave the feed paused."
                    checked={form.enabled}
                    onChange={(enabled) => onFormChange((prev) => ({ ...prev, enabled }))}
                  />

                  <div className="mt-5 border-t border-cream-200 pt-5">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={form.consent_accepted}
                        onChange={(event) => onFormChange((prev) => ({ ...prev, consent_accepted: event.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-cream-300 text-navy-600 focus:ring-navy-500"
                      />
                      <span className="text-sm leading-6 text-charcoal">
                        I’m happy for Karko to research jobs for me automatically once per day using these settings.
                        {hasRecordedConsent && (
                          <span className="mt-1 block text-xs text-navy-600">
                            Consent is already recorded. Leaving this checked keeps the feed eligible to run.
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                </div>

                <InlineNotice tone={form.enabled && form.consent_accepted ? 'success' : 'neutral'} title="What happens next">
                  {activationState}
                </InlineNotice>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[24px] border-cream-200 bg-white/94 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">At a glance</p>
            <div className="mt-4 space-y-4">
              <SummaryRow icon={Briefcase} label="Roles" value={form.target_roles.length > 0 ? form.target_roles.join(', ') : 'Choose at least one role'} />
              <SummaryRow icon={MapPin} label="Locations" value={form.preferred_locations.length > 0 ? form.preferred_locations.join(', ') : 'Flexible'} />
              <SummaryRow icon={Globe} label="Market" value={readableMarket(form.target_market)} />
              <SummaryRow icon={Clock3} label="Delivery" value={deliveryLabel} />
            </div>

            <div className="mt-5 border-t border-cream-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Readiness</p>
              <div className="mt-4 space-y-3">
              <WizardReadyRow title="Target role added" ready={form.target_roles.length > 0} />
              <WizardReadyRow title="Valid timezone selected" ready={isValidTimeZone(form.user_timezone)} />
              <WizardReadyRow title="Consent recorded" ready={form.consent_accepted || hasRecordedConsent} optional />
              <WizardReadyRow title="Feed enabled" ready={form.enabled} optional />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-cream-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="text-sm text-warm-gray">
          {activeStep.optional
            ? 'This step is optional. Skip it if you want to get to the first feed faster.'
            : activeStep.id === 'review'
              ? 'Save as soon as the setup feels good enough. You can refine the feed after you see the first results.'
              : 'Only a few strong signals are needed to get the first version running.'}
        </p>

        <div className="flex flex-wrap gap-2">
          {stepIndex > 0 && (
            <Button variant="ghost" onClick={() => goToStep(stepIndex - 1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}

          {activeStep.optional && stepIndex < JOB_FEED_WIZARD_STEPS.length - 1 && (
            <Button variant="outline" onClick={skipOptionalStep}>
              Skip for now
            </Button>
          )}

          <Button
            variant="gold"
            onClick={advance}
            disabled={(stepIndex === JOB_FEED_WIZARD_STEPS.length - 1 ? !canSave : !canContinue) || saveState === 'saving'}
          >
            {saveState === 'saving' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {stepIndex === JOB_FEED_WIZARD_STEPS.length - 1 ? 'Save Job Feed settings' : 'Continue'}
            {stepIndex < JOB_FEED_WIZARD_STEPS.length - 1 ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ChoiceGrid({
  value,
  options,
  onChange,
  multiple = false,
  columns = 'two',
}: {
  value: string | string[];
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  columns?: 'two' | 'three';
}) {
  const selectedValues = Array.isArray(value) ? value : [value];
  const gridClassName = columns === 'three' ? 'md:grid-cols-3' : 'md:grid-cols-2';

  return (
    <div className={`grid gap-3 ${gridClassName}`}>
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (multiple) {
                const nextValues = selected
                  ? selectedValues.filter((item) => item !== option.value)
                  : [...selectedValues, option.value];
                onChange(nextValues);
                return;
              }

              onChange(option.value);
            }}
            className={`rounded-[20px] border px-4 py-3 text-left transition-colors ${
              selected
                ? 'border-navy-300 bg-navy-50 shadow-sm'
                : 'border-cream-200 bg-white hover:border-navy-200 hover:bg-navy-50/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-charcoal">{option.label}</p>
                {option.description && (
                  <p className="mt-1 text-xs leading-5 text-warm-gray">{option.description}</p>
                )}
              </div>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                selected
                  ? 'border-navy-600 bg-navy-600 text-white'
                  : 'border-cream-300 bg-white text-transparent'
              }`}>
                ✓
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TimeZoneField({
  value,
  browserTimeZone,
  onChange,
}: {
  value: string;
  browserTimeZone: string;
  onChange: (value: string) => void;
}) {
  const timeZoneOptions = getSupportedTimeZones();

  return (
    <div className="rounded-[24px] border border-cream-200 bg-white p-4 shadow-sm">
      <input
        list="job-feed-timezone-options"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Europe/Berlin"
        className="w-full rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal outline-none transition-colors focus:border-navy-400"
      />
      <datalist id="job-feed-timezone-options">
        {timeZoneOptions.map((timeZone) => (
          <option key={timeZone} value={timeZone} />
        ))}
      </datalist>

      <div className="mt-3 flex flex-wrap gap-2">
        {JOB_FEED_COMMON_TIMEZONES.map((timeZone) => (
          <button
            key={timeZone}
            type="button"
            onClick={() => onChange(timeZone)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              value === timeZone
                ? 'border-navy-300 bg-navy-50 text-navy-700'
                : 'border-cream-300 bg-cream-50 text-charcoal hover:border-navy-200 hover:text-navy-600'
            }`}
          >
            {timeZone}
          </button>
        ))}
      </div>

      {browserTimeZone !== value && (
        <button
          type="button"
          onClick={() => onChange(browserTimeZone)}
          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-navy-600"
        >
          Use browser timezone
          <span className="normal-case tracking-normal text-warm-gray">{browserTimeZone}</span>
        </button>
      )}
    </div>
  );
}

function WizardSummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-cream-200 bg-white px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">{title}</p>
      <p className="mt-2 text-sm leading-6 text-charcoal">{value}</p>
    </div>
  );
}

function WizardReadyRow({
  title,
  ready,
  optional = false,
}: {
  title: string;
  ready: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-cream-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-charcoal">{title}</p>
        <p className="mt-1 text-xs text-warm-gray">{optional ? 'Helpful, but not required to finish setup.' : 'Needed for a strong first-pass setup.'}</p>
      </div>
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
        ready
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-cream-100 text-warm-gray'
      }`}>
        {ready ? 'Ready' : optional ? 'Optional' : 'Missing'}
      </span>
    </div>
  );
}

function InlineNotice({
  tone,
  title,
  children,
}: {
  tone: 'neutral' | 'success' | 'warning';
  title: string;
  children: React.ReactNode;
}) {
  const classes = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
    : tone === 'warning'
      ? 'border-gold-200 bg-gold-50/80 text-charcoal'
      : 'border-navy-100 bg-navy-50/70 text-charcoal';

  return (
    <div className={`rounded-[20px] border px-4 py-4 ${classes}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{children}</p>
    </div>
  );
}

function PrimaryStateCard({
  overview,
  onEditSettings,
  onRefresh,
  isRefreshing,
}: {
  overview: JobFeedOverviewResponse | null;
  onEditSettings: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const latestRun = overview?.latestRun ?? null;
  const state = overview?.state ?? 'setup_required';
  const jobsCount = overview?.jobs.length ?? 0;

  const contentByState: Record<JobFeedOverviewState, {
    icon: typeof Sparkles;
    title: string;
    body: string;
    tone: string;
    nextStep: string;
    guidance: string;
  }> = {
    upgrade_required: {
      icon: Sparkles,
      title: 'Upgrade to unlock Job Feed',
      body: 'Automatic daily discovery is part of the premium plan. Once access is enabled, this space becomes your in-context setup and daily shortlist.',
      tone: 'from-gold-50 to-white border-gold-200 text-charcoal',
      nextStep: 'Unlock premium access',
      guidance: 'Premium turns the feed into a background research surface instead of a manual search tab.',
    },
    setup_required: {
      icon: Settings2,
      title: 'Finish setup to activate the feed',
      body: 'Start with roles, locations, delivery time, and consent. You can fine-tune the filter after the first runs.',
      tone: 'from-navy-50 to-white border-navy-200 text-charcoal',
      nextStep: 'Add the essentials',
      guidance: 'The new guided setup keeps the first pass short so you can get to the first daily run quickly.',
    },
    paused: {
      icon: PauseCircle,
      title: 'The feed is configured but paused',
      body: 'Your preferences are saved. Re-enable the daily feed whenever you want background discovery to resume.',
      tone: 'from-cream-100 to-white border-cream-300 text-charcoal',
      nextStep: 'Turn scheduling back on',
      guidance: 'Nothing is lost here. Your saved preferences stay ready until you decide to resume the feed.',
    },
    awaiting_first_run: {
      icon: CalendarClock,
      title: 'Your first shortlist is scheduled',
      body: 'Karko has everything it needs. When your delivery window arrives, the first daily feed will appear here automatically.',
      tone: 'from-navy-50 to-white border-navy-200 text-charcoal',
      nextStep: 'Wait for the first delivery',
      guidance: 'No extra setup is needed now. The next useful moment is when the first shortlist lands here.',
    },
    generating: {
      icon: Loader2,
      title: 'Karko is preparing today’s feed',
      body: 'Today’s discovery pass is running now. Refresh in a moment and the latest matches should appear here automatically.',
      tone: 'from-navy-50 to-white border-navy-200 text-charcoal',
      nextStep: 'Refresh in a moment',
      guidance: 'This state should feel temporary. The shortlist will replace it as soon as the run finishes.',
    },
    ready: {
      icon: CheckCircle2,
      title: 'Today’s feed is ready',
      body: jobsCount > 0
        ? `Karko prepared ${jobsCount} ${jobsCount === 1 ? 'curated match' : 'curated matches'} for today. Strong roles appear first so you can move quickly.`
        : 'Karko prepared today’s shortlist. Open the strongest roles first and decide what is worth pursuing.',
      tone: 'from-emerald-50 to-white border-emerald-200 text-charcoal',
      nextStep: 'Review your top matches',
      guidance: 'Start with the first two cards. They are the fastest path to a meaningful review session.',
    },
    thin_feed: {
      icon: CheckCircle2,
      title: 'Today’s feed is ready, but a bit thin',
      body: jobsCount > 0
        ? `Karko still found ${jobsCount} ${jobsCount === 1 ? 'match' : 'matches'} worth surfacing today. If you want more volume, widen one or two filters.`
        : 'A smaller shortlist survived the current filters. Review it here or widen the settings if you want more volume.',
      tone: 'from-navy-50 to-white border-navy-200 text-charcoal',
      nextStep: 'Review or widen the filter',
      guidance: 'Thin days are normal. It usually only takes one broader role or location signal to recover volume.',
    },
    empty: {
      icon: AlertCircle,
      title: 'Nothing made today’s feed',
      body: 'Today’s search finished, but nothing felt strong enough to show. Widening one or two filters usually helps the next run.',
      tone: 'from-cream-100 to-white border-cream-300 text-charcoal',
      nextStep: 'Loosen a couple of filters',
      guidance: 'The run still succeeded. This is usually a signal that the filter is too strict for the day, not that the product failed.',
    },
    error: {
      icon: AlertCircle,
      title: 'The latest feed run hit a problem',
      body: latestRun?.error_message || 'Karko could not finish the latest run. Refresh first, then review your settings if the issue sticks around.',
      tone: 'from-red-50 to-white border-red-200 text-charcoal',
      nextStep: 'Refresh and try again',
      guidance: 'If the issue persists after a refresh, reopen the setup and save once to confirm the feed still has a valid configuration.',
    },
  };

  const stateContent = contentByState[state];
  const Icon = stateContent.icon;
  const matchesValue = jobsCount > 0
    ? `${jobsCount} ${jobsCount === 1 ? 'match' : 'matches'}`
    : state === 'awaiting_first_run'
      ? 'First run pending'
      : state === 'generating'
        ? 'On the way'
        : state === 'setup_required'
          ? 'Needs setup'
          : state === 'upgrade_required'
            ? 'Premium only'
            : state === 'paused'
              ? 'Paused'
              : state === 'empty'
                ? '0 today'
                : 'Not ready yet';
  const matchesDetail = jobsCount > 0
    ? 'Ready to review'
    : state === 'upgrade_required'
      ? 'Unlocked with premium access'
      : state === 'setup_required'
        ? 'Available after setup is saved'
        : state === 'awaiting_first_run'
          ? 'Will update after the first delivery'
          : state === 'generating'
            ? 'Updating with the current run'
            : state === 'paused'
              ? 'Will return after the feed resumes'
              : state === 'empty'
                ? 'No roles cleared the filter today'
                : state === 'error'
                  ? 'Unavailable until the next successful run'
                  : 'Will update with the next run';
  const latestRunValue = latestRun ? formatFeedDateLabel(latestRun.local_date) : 'Not yet';
  const latestRunNote = latestRun
    ? `${formatRunStatusLabel(latestRun.status)}${latestRun.trigger_source ? ` • ${formatTriggerSourceLabel(latestRun.trigger_source)}` : ''}`
    : 'Waiting for the first completed run';
  const primaryActionLabel = state === 'setup_required'
    ? 'Start setup'
    : state === 'empty'
      ? 'Adjust settings'
      : state === 'error'
        ? 'Review settings'
        : state === 'paused'
      ? 'Resume options'
      : 'Edit settings';

  return (
    <Card className={`rounded-[24px] border bg-[linear-gradient(180deg,var(--tw-gradient-stops))] p-6 shadow-sm ${stateContent.tone}`}>
      <div className="space-y-6">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
            <Icon className={`h-6 w-6 ${state === 'generating' ? 'animate-spin text-navy-600' : 'text-navy-600'}`} />
          </div>

          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">
              {state === 'ready' || state === 'thin_feed' ? 'Today’s feed' : state === 'upgrade_required' ? 'Premium status' : 'Status'}
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-charcoal">{stateContent.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray">{stateContent.body}</p>
            <div className="mt-5 space-y-3">
              <StatusMetricCard
                label="Matches"
                value={matchesValue}
                detail={matchesDetail}
              />
              <StatusMetricCard
                label="Latest run"
                value={latestRunValue}
                detail={latestRunNote}
              />
              <StatusMetricCard
                label="Next step"
                value={stateContent.nextStep}
                detail="The fastest way to move the feed forward from here"
              />
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/70 bg-white/80 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">From here</p>
          <p className="mt-3 text-lg font-semibold text-charcoal">{stateContent.nextStep}</p>
          <p className="mt-2 text-sm leading-6 text-warm-gray">{stateContent.guidance}</p>

          <div className="mt-4 rounded-[18px] border border-cream-200 bg-cream-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">Run context</p>
            <p className="mt-2 text-sm font-semibold text-charcoal">{latestRunValue}</p>
            <p className="mt-1 text-xs leading-5 text-warm-gray">{latestRunNote}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {state !== 'upgrade_required' && (
              <Button variant="outline" onClick={onRefresh} disabled={isRefreshing}>
                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            )}
            {state === 'upgrade_required' ? (
              <Link href="/pricing" className="inline-flex">
                <Button variant="gold">
                  View plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button variant="gold" onClick={onEditSettings}>
                <Settings2 className="mr-2 h-4 w-4" />
                {primaryActionLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FeedResultsCard({
  overview,
  jobs,
  isShowingAllJobs,
  pendingJobAction,
  onToggleShowAll,
  onOpenDetails,
  onApplyWithKarko,
  onSave,
  onDismiss,
  onExternalApply,
}: {
  overview: JobFeedOverviewResponse;
  jobs: JobFeedFeedItem[];
  isShowingAllJobs: boolean;
  pendingJobAction: PendingJobAction;
  onToggleShowAll: () => void;
  onOpenDetails: (job: JobFeedFeedItem) => void;
  onApplyWithKarko: (job: JobFeedFeedItem) => void;
  onSave: (job: JobFeedFeedItem) => void;
  onDismiss: (job: JobFeedFeedItem) => void;
  onExternalApply: (job: JobFeedFeedItem) => void;
}) {
  const visibleCount = isShowingAllJobs ? JOB_FEED_VISIBLE_MAX_COUNT : JOB_FEED_VISIBLE_DEFAULT_COUNT;
  const visibleJobs = jobs.slice(0, visibleCount);
  const hasMore = jobs.length > JOB_FEED_VISIBLE_DEFAULT_COUNT;
  const hasRankedJobs = jobs.some((job) => job.pipelineStage === 'ranked');
  const strongCount = jobs.filter((job) => job.fitLabel === 'strong').length;
  const goodCount = jobs.filter((job) => job.fitLabel === 'good').length;
  const freshCount = jobs.filter((job) => job.pipelineStage === 'shortlisted').length;
  const feedDate = overview.feedRun ? formatFeedDateLabel(overview.feedRun.local_date) : 'Today';

  return (
    <Card className="rounded-[24px] border-cream-200 bg-white/92 p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Today&apos;s Feed</p>
          <h2 className="mt-2 text-xl font-semibold text-charcoal">
            {overview.state === 'thin_feed'
              ? hasRankedJobs
                ? `A smaller ranked shortlist still made the cut for ${feedDate}`
                : `A smaller shortlist still made the cut for ${feedDate}`
              : hasRankedJobs
                ? `Karko ranked ${feedDate}'s shortlist for you`
                : `Karko prepared ${feedDate}'s shortlist for you`}
          </h2>
          <p className="mt-1 text-sm leading-6 text-warm-gray">
            {hasRankedJobs
              ? `Showing ${visibleJobs.length} of ${jobs.length} jobs from the latest run. Strong matches lead the feed so the first decisions are the easiest ones to make.`
              : `Showing ${visibleJobs.length} of ${jobs.length} jobs from the latest run. These roles already passed the core filters even when final ranking is still settling.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <RunStatPill label="Feed date" value={feedDate} />
            <RunStatPill label="In feed" value={String(jobs.length)} />
            {strongCount > 0 && <RunStatPill label="Strong" value={String(strongCount)} />}
            {goodCount > 0 && <RunStatPill label="Good" value={String(goodCount)} />}
            {freshCount > 0 && <RunStatPill label="Freshly surfaced" value={String(freshCount)} />}
          </div>
        </div>

        {hasMore && (
          <Button variant="outline" size="sm" onClick={onToggleShowAll}>
            {isShowingAllJobs ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
            {isShowingAllJobs ? 'Show top 5' : `Show all ${Math.min(jobs.length, JOB_FEED_VISIBLE_MAX_COUNT)}`}
          </Button>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {visibleJobs.map((job, index) => (
          <JobFeedCard
            key={job.id}
            job={job}
            highlightIndex={index}
            isApplying={pendingJobAction?.jobId === job.id && pendingJobAction.action === 'apply'}
            isSaving={pendingJobAction?.jobId === job.id && pendingJobAction.action === 'save'}
            isDismissing={pendingJobAction?.jobId === job.id && pendingJobAction.action === 'dismiss'}
            onOpenDetails={() => onOpenDetails(job)}
            onApplyWithKarko={() => onApplyWithKarko(job)}
            onSave={() => onSave(job)}
            onDismiss={() => onDismiss(job)}
            onExternalApply={() => onExternalApply(job)}
          />
        ))}
      </div>
    </Card>
  );
}

function EmptyFeedCard({
  onEditSettings,
}: {
  onEditSettings: () => void;
}) {
  return (
    <Card className="rounded-[24px] border-cream-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,244,234,0.92))] p-6 shadow-sm">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">No matches today</p>
          <h2 className="mt-2 text-xl font-semibold text-charcoal">Nothing felt strong enough to make today&apos;s feed</h2>
          <p className="mt-2 text-sm leading-6 text-warm-gray">
            The run succeeded, but the current role, location, salary, or authorization rules were probably too tight for today&apos;s market. Widening one or two settings usually helps tomorrow&apos;s feed open up.
          </p>
        </div>

        <div className="rounded-[22px] border border-cream-200 bg-white/85 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">Fastest recovery</p>
          <div className="mt-4 space-y-3 text-sm leading-6 text-warm-gray">
            <p><span className="font-semibold text-charcoal">Broaden a role.</span> Add one adjacent title if your current role naming is very specific.</p>
            <p><span className="font-semibold text-charcoal">Loosen location.</span> Remove one city constraint or let remote stay more flexible.</p>
            <p><span className="font-semibold text-charcoal">Check hard filters.</span> Salary and authorization limits have the biggest impact on thin days.</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="gold" onClick={onEditSettings}>
              Adjust settings
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function JobFeedCard({
  job,
  highlightIndex,
  isApplying,
  isSaving,
  isDismissing,
  onOpenDetails,
  onApplyWithKarko,
  onSave,
  onDismiss,
  onExternalApply,
}: {
  job: JobFeedFeedItem;
  highlightIndex: number;
  isApplying: boolean;
  isSaving: boolean;
  isDismissing: boolean;
  onOpenDetails: () => void;
  onApplyWithKarko: () => void;
  onSave: () => void;
  onDismiss: () => void;
  onExternalApply: () => void;
}) {
  const directApplyLink = job.applyUrl || job.sourceUrl;
  const isSaved = Boolean(job.feedback.savedAt);
  const isApplied = Boolean(job.feedback.appliedAt);

  return (
    <div className="rounded-[24px] border border-cream-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,234,0.82))] p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-navy-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-navy-700">
              #{highlightIndex + 1}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              {job.fitLabel ? fitLabelText(job.fitLabel) : 'Promising match'}
            </span>
            {job.pipelineStage === 'shortlisted' && (
              <span className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-cream-50 px-3 py-1 text-xs font-medium text-warm-gray">
                Freshly surfaced
              </span>
            )}
            {isSaved && !isApplied && (
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-700">
                Saved
              </span>
            )}
            {isApplied && (
              <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-700">
                Application started
              </span>
            )}
          </div>

          <h3 className="mt-3 text-xl font-semibold text-charcoal">{job.title}</h3>
          <p className="mt-1 text-base text-warm-gray">{job.company}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <MetaPill icon={MapPin} label={job.location || 'Location not specified'} />
            <MetaPill icon={Globe} label={workModeLabel(job.workMode)} />
            {job.salaryText && <MetaPill icon={DollarSign} label={job.salaryText} tone="emerald" />}
            {job.employmentType && <MetaPill icon={Briefcase} label={employmentTypeLabel(job.employmentType)} />}
            {job.postedAtText && <MetaPill icon={Calendar} label={job.postedAtText} />}
          </div>

          {job.via && (
            <p className="mt-3 text-xs text-warm-gray">via {job.via}</p>
          )}

          {job.description && (
            <p className="mt-3 text-sm leading-6 text-charcoal/85 line-clamp-3">
              {job.description.replace(/\s+/g, ' ').trim()}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 lg:w-[220px]">
          <Button variant="gold" onClick={onApplyWithKarko} disabled={isApplying}>
            {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isApplied ? 'Continue in Karko AI' : 'Apply with Karko AI'}
          </Button>
          <Button variant="outline" onClick={onOpenDetails}>
            Review job
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" onClick={onSave} disabled={isSaved || isApplying || isDismissing || isApplied}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isApplied ? 'Applied' : isSaved ? 'Saved' : 'Save'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss} disabled={isApplying || isDismissing || isApplied}>
              {isDismissing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isApplied ? 'Applied' : 'Dismiss'}
            </Button>
          </div>
          {directApplyLink && (
            <a
              href={directApplyLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onExternalApply}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-50"
            >
              Employer site
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function JobFeedDetailModal({
  job,
  isApplying,
  onClose,
  onApplyWithKarko,
  onExternalApply,
}: {
  job: JobFeedFeedItem;
  isApplying: boolean;
  onClose: () => void;
  onApplyWithKarko: () => void;
  onExternalApply: () => void;
}) {
  const directApplyLink = job.applyUrl || job.sourceUrl;
  const isSaved = Boolean(job.feedback.savedAt);
  const isApplied = Boolean(job.feedback.appliedAt);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 md:p-6" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-cream-200 bg-cream-50 px-6 py-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-cream-200 bg-white text-navy-600">
            <Building2 className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                {job.fitLabel ? fitLabelText(job.fitLabel) : 'Promising match'}
              </span>
              {job.pipelineStage === 'shortlisted' && (
                <span className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-white px-3 py-1 text-xs text-warm-gray">
                  Freshly surfaced
                </span>
              )}
              {isSaved && !isApplied && (
                <span className="inline-flex items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-700">
                  Saved
                </span>
              )}
              {isApplied && (
                <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-700">
                  Application started
                </span>
              )}
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-charcoal">{job.title}</h2>
            <p className="mt-1 text-lg text-warm-gray">{job.company}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-warm-gray transition-colors hover:bg-cream-100 hover:text-charcoal"
            aria-label="Close job details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="mb-6 flex flex-wrap gap-3">
            <MetaPill icon={MapPin} label={job.location || 'Location not specified'} />
            <MetaPill icon={Globe} label={workModeLabel(job.workMode)} />
            {job.salaryText && <MetaPill icon={DollarSign} label={job.salaryText} tone="emerald" />}
            {job.employmentType && <MetaPill icon={Briefcase} label={employmentTypeLabel(job.employmentType)} />}
            {job.postedAtText && <MetaPill icon={Calendar} label={job.postedAtText} />}
          </div>

          {job.via && (
            <p className="mb-6 text-sm text-warm-gray">via {job.via}</p>
          )}

          {job.description ? (
            <div className="mb-6">
              <h3 className="mb-3 text-base font-semibold text-charcoal">Role details</h3>
              <div className="text-sm leading-7 text-charcoal/90">
                <JobFeedDescription text={job.description} />
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4 text-sm text-warm-gray">
              The provider did not include a full description for this job.
            </div>
          )}

          {job.applyOptions.length > 0 && (
            <div>
              <h3 className="mb-3 text-base font-semibold text-charcoal">Apply via</h3>
              <div className="flex flex-wrap gap-2">
                {job.applyOptions.map((option) => (
                  <a
                    key={`${option.title}-${option.link}`}
                    href={option.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-navy-50 px-4 py-2 text-sm text-navy-700 transition-colors hover:bg-navy-100"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {option.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-cream-200 bg-cream-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-warm-gray">
            Review the role here first, then decide whether to continue inside Karko or on the employer site.
          </p>
          <div className="flex flex-wrap gap-2">
            {directApplyLink && (
              <a
                href={directApplyLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onExternalApply}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-100"
              >
                Open employer site
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Button variant="gold" onClick={onApplyWithKarko} disabled={isApplying}>
              {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isApplied ? 'Continue in Karko AI' : 'Apply with Karko AI'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobFeedDescription({ text }: { text: string }) {
  const lines = text.split(/\n/).map((line) => line.trimEnd());
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length === 0) return;

    elements.push(
      <ul key={`list-${elements.length}`} className="my-2 ml-1 space-y-1.5">
        {currentList.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 text-navy-500">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
    currentList = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushList();
      continue;
    }

    const bulletMatch = line.match(/^\s*[•\-*►●○■▪–·]\s*(.+)/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1].trim());
      continue;
    }

    const trimmed = line.trim();
    const isHeader = (
      (trimmed.endsWith(':') && trimmed.length < 80) ||
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80 && /[A-Z]/.test(trimmed))
    );

    if (isHeader) {
      flushList();
      elements.push(
        <h4 key={`heading-${elements.length}`} className="mb-1.5 mt-4 font-semibold text-charcoal">
          {trimmed}
        </h4>
      );
      continue;
    }

    flushList();
    elements.push(
      <p key={`paragraph-${elements.length}`} className="mb-2">
        {trimmed}
      </p>
    );
  }

  flushList();

  return <div className="space-y-0.5">{elements}</div>;
}

function MetaPill({
  icon: Icon,
  label,
  tone = 'default',
}: {
  icon: typeof MapPin;
  label: string;
  tone?: 'default' | 'emerald';
}) {
  const classes = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-cream-200 bg-cream-50 text-charcoal';

  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${classes}`}>
      <Icon className={`h-4 w-4 ${tone === 'emerald' ? 'text-emerald-600' : 'text-warm-gray'}`} />
      {label}
    </span>
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

function HeroPill({
  icon: Icon,
  label,
}: {
  icon: typeof Sparkles;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-xs font-medium text-cream-100/90">
      <Icon className="h-3.5 w-3.5 text-gold-300" />
      {label}
    </span>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/12 bg-white/10 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-cream-100/80">
        <Icon className="h-4 w-4 text-gold-300" />
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      </div>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-cream-100/75">{sublabel}</p>
    </div>
  );
}

function FieldGroup({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-sm font-semibold text-charcoal">{label}</p>
        <p className="mt-1 text-xs leading-5 text-warm-gray">{help}</p>
      </div>
      {children}
    </div>
  );
}

function SetupSectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-charcoal">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-warm-gray">{body}</p>
    </div>
  );
}

function SetupFocusPill({
  icon: Icon,
  label,
}: {
  icon: typeof Briefcase;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 shadow-sm">
      <Icon className="h-3.5 w-3.5 text-navy-500" />
      {label}
    </span>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-charcoal">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal shadow-sm outline-none transition-colors focus:border-navy-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-charcoal">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal shadow-sm outline-none transition-colors focus:border-navy-400"
      />
    </label>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="pr-2">
        <p className="text-sm font-semibold text-charcoal">{title}</p>
        <p className="mt-1 text-xs leading-5 text-warm-gray">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <div className="h-6 w-11 rounded-full bg-cream-300 transition-colors peer-checked:bg-navy-600 peer-focus:ring-2 peer-focus:ring-navy-300" />
        <div className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </label>
    </div>
  );
}

function ChipField({
  values,
  suggestions,
  placeholder,
  onChange,
}: {
  values: string[];
  suggestions: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const addValue = (rawValue: string) => {
    const normalized = rawValue.trim();
    if (!normalized) return;
    if (values.includes(normalized)) {
      setDraft('');
      return;
    }
    onChange([...values, normalized]);
    setDraft('');
  };

  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(values.filter((item) => item !== value))}
            className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-navy-50 px-3 py-1.5 text-sm text-navy-700"
          >
            {value}
            <span className="text-xs text-navy-500">Remove</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addValue(draft);
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal outline-none transition-colors focus:border-navy-400"
        />
        <Button variant="outline" type="button" onClick={() => addValue(draft)}>
          Add
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => {
            const selected = values.includes(suggestion);
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => addValue(suggestion)}
                disabled={selected}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? 'border-cream-200 bg-cream-100 text-warm-gray'
                    : 'border-cream-300 bg-cream-50 text-charcoal hover:border-navy-300 hover:text-navy-600'
                }`}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Briefcase;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-cream-200 bg-cream-50 text-navy-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">{label}</p>
        <p className="mt-1 text-sm leading-6 text-charcoal">{value}</p>
      </div>
    </div>
  );
}

function ProductStep({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-600 text-xs font-semibold text-white">
        {number}
      </div>
      <p className="text-sm leading-6 text-warm-gray">
        <span className="font-semibold text-charcoal">{title}.</span> {body}
      </p>
    </div>
  );
}

function StatusMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/60 bg-white/70 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">{label}</p>
      <p className="mt-2 text-base font-semibold text-charcoal">{value}</p>
      <p className="mt-1 text-xs leading-5 text-warm-gray">{detail}</p>
    </div>
  );
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

function RunStatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-white px-3 py-1.5 text-xs text-warm-gray shadow-sm">
      <span className="font-semibold text-charcoal">{label}:</span>
      {value}
    </span>
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

function isJobFeedWizardStepComplete(stepId: JobFeedWizardStepId, form: JobFeedSettingsInput): boolean {
  const defaultForm = createDefaultJobFeedInput(form.user_timezone);

  switch (stepId) {
    case 'roles':
      return form.target_roles.length > 0;
    case 'locations':
      return form.preferred_locations.length > 0 || form.remote_preference !== defaultForm.remote_preference;
    case 'schedule':
      return isValidTimeZone(form.user_timezone);
    case 'refinements':
      return Boolean(
        form.salary_floor !== defaultForm.salary_floor ||
        form.languages.join('|') !== defaultForm.languages.join('|') ||
        form.adjacent_roles.length > 0 ||
        form.work_authorization_status !== defaultForm.work_authorization_status ||
        form.seniority_target !== defaultForm.seniority_target ||
        form.aggressiveness !== defaultForm.aggressiveness ||
        form.employment_types.join('|') !== defaultForm.employment_types.join('|')
      );
    case 'review':
      return canSaveJobFeedSettings(form);
  }
}

function canAdvanceJobFeedWizardStep(stepId: JobFeedWizardStepId, form: JobFeedSettingsInput): boolean {
  switch (stepId) {
    case 'roles':
      return form.target_roles.length > 0;
    case 'schedule':
      return isValidTimeZone(form.user_timezone);
    case 'review':
      return canSaveJobFeedSettings(form);
    default:
      return true;
  }
}

function canSaveJobFeedSettings(form: JobFeedSettingsInput): boolean {
  return form.target_roles.length > 0 && form.employment_types.length > 0 && isValidTimeZone(form.user_timezone);
}

function getJobFeedPreviewMode(): JobFeedPreviewMode {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') {
    return 'off';
  }

  const searchParams = new URLSearchParams(window.location.search);
  const rawValue = searchParams.get('jobFeedPreview');
  if (!rawValue) {
    return 'off';
  }

  const normalized = rawValue.trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'signed_out' || normalized === 'signedout') {
    return 'signed_out';
  }
  if (normalized === 'free' || normalized === 'free_plan' || normalized === 'upgrade_required') {
    return 'upgrade_required';
  }
  if (normalized === 'setup_required') {
    return 'setup_required';
  }
  if (normalized === 'paused') {
    return 'paused';
  }
  if (normalized === 'awaiting_first_run') {
    return 'awaiting_first_run';
  }
  if (normalized === 'generating') {
    return 'generating';
  }
  if (normalized === 'ready') {
    return 'ready';
  }
  if (normalized === 'thin_feed') {
    return 'thin_feed';
  }
  if (normalized === 'empty') {
    return 'empty';
  }
  if (normalized === 'error') {
    return 'error';
  }

  return 'off';
}

function buildJobFeedPreviewSnapshot(
  mode: Exclude<JobFeedPreviewMode, 'off'>,
  timeZone: string,
): {
  overview: JobFeedOverviewResponse | null;
  form: JobFeedSettingsInput;
} {
  const baseForm = createDefaultJobFeedInput(timeZone);
  const configuredForm: JobFeedSettingsInput = {
    ...baseForm,
    consent_accepted: true,
    target_roles: ['Senior Product Manager', 'Growth Product Manager'],
    preferred_locations: ['New York, NY', 'Remote (US)'],
    user_timezone: timeZone,
    delivery_hour_local: 8,
    target_market: 'us_canada',
    remote_preference: 'remote_first',
    salary_floor: 145000,
    seniority_target: 'senior',
    work_authorization_status: 'authorized',
    aggressiveness: 'balanced',
    employment_types: ['full_time'],
    languages: ['English'],
    adjacent_roles_enabled: true,
    adjacent_roles: ['Platform Product Manager'],
  };

  if (mode === 'signed_out') {
    return {
      overview: null,
      form: baseForm,
    };
  }

  if (mode === 'upgrade_required') {
    return {
      overview: {
        canAccess: false,
        settings: null,
        latestRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        state: 'upgrade_required',
        foundationMode: true,
      },
      form: configuredForm,
    };
  }

  if (mode === 'setup_required') {
    const setupForm: JobFeedSettingsInput = {
      ...baseForm,
      consent_accepted: false,
      enabled: true,
    };

    return {
      overview: {
        canAccess: true,
        settings: toPreviewJobFeedSettings(setupForm),
        latestRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        state: 'setup_required',
        foundationMode: true,
      },
      form: setupForm,
    };
  }

  const formByMode: JobFeedSettingsInput = {
    ...configuredForm,
    enabled: mode === 'paused' ? false : configuredForm.enabled,
  };

  if (mode === 'awaiting_first_run') {
    return {
      overview: {
        canAccess: true,
        settings: toPreviewJobFeedSettings(formByMode),
        latestRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        state: 'awaiting_first_run',
        foundationMode: true,
      },
      form: formByMode,
    };
  }

  if (mode === 'paused') {
    return {
      overview: {
        canAccess: true,
        settings: toPreviewJobFeedSettings(formByMode),
        latestRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        state: 'paused',
        foundationMode: true,
      },
      form: formByMode,
    };
  }

  const jobs = buildJobFeedPreviewJobs();
  const readyJobs = jobs;
  const thinJobs = jobs.slice(0, 3);
  const latestRun = buildPreviewJobFeedRun({
    status: mode === 'error' ? 'failed' : mode === 'generating' ? 'running' : 'completed',
    timeZone: formByMode.user_timezone,
    deliveryHourLocal: formByMode.delivery_hour_local,
    resultSummary: mode === 'ready'
      ? 'Karko ranked and prepared the strongest roles for today.'
      : mode === 'thin_feed'
        ? 'A smaller shortlist survived the current filter.'
        : mode === 'empty'
          ? 'No roles were strong enough to show today.'
          : null,
    errorMessage: mode === 'error' ? 'Previewing a failed run state for desktop UI validation.' : null,
  });

  const jobsForMode = mode === 'ready'
    ? readyJobs
    : mode === 'thin_feed'
      ? thinJobs
      : [];

  return {
    overview: {
      canAccess: true,
      settings: toPreviewJobFeedSettings(formByMode),
      latestRun,
      feedRun: latestRun,
      latestRunDiagnostics: null,
      jobs: jobsForMode,
      state: mode,
      foundationMode: true,
    },
    form: formByMode,
  };
}

function toPreviewJobFeedSettings(form: JobFeedSettingsInput): NonNullable<JobFeedOverviewResponse['settings']> {
  const now = new Date().toISOString();

  return {
    user_id: 'preview-user',
    enabled: form.enabled,
    consent_accepted_at: form.consent_accepted ? now : null,
    user_timezone: form.user_timezone,
    delivery_hour_local: form.delivery_hour_local,
    target_market: form.target_market,
    target_roles: form.target_roles,
    adjacent_roles_enabled: form.adjacent_roles_enabled,
    adjacent_roles: form.adjacent_roles,
    preferred_locations: form.preferred_locations,
    remote_preference: form.remote_preference,
    salary_floor: form.salary_floor,
    languages: form.languages,
    seniority_target: form.seniority_target,
    employment_types: form.employment_types,
    work_authorization_status: form.work_authorization_status,
    aggressiveness: form.aggressiveness,
    created_at: now,
    updated_at: now,
  };
}

function buildPreviewJobFeedRun({
  status,
  timeZone,
  deliveryHourLocal,
  resultSummary,
  errorMessage,
}: {
  status: 'running' | 'completed' | 'failed';
  timeZone: string;
  deliveryHourLocal: number;
  resultSummary: string | null;
  errorMessage: string | null;
}): NonNullable<JobFeedOverviewResponse['latestRun']> {
  const now = new Date().toISOString();
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  return {
    id: `preview-run-${status}`,
    user_id: 'preview-user',
    local_date: localDate,
    local_timezone: timeZone,
    delivery_hour_local: deliveryHourLocal,
    trigger_source: 'scheduled',
    status,
    idempotency_key: `preview-${status}`,
    started_at: now,
    completed_at: status === 'running' ? null : now,
    error_message: errorMessage,
    result_summary: resultSummary,
    raw_jobs_fetched: 28,
    jobs_after_prefilter: 11,
    ranked_jobs_count: status === 'completed' ? 6 : 0,
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

function buildJobFeedPreviewJobs(): JobFeedFeedItem[] {
  return [
    {
      id: 'preview-job-1',
      title: 'Senior Product Manager, AI Workflows',
      company: 'Northstar Labs',
      location: 'Remote (US)',
      workMode: 'remote',
      employmentType: 'full_time',
      salaryText: '$165,000 - $190,000',
      description: 'Build the roadmap for workflow automation, partner with engineering on agent tooling, and shape how customers discover high-value automation use cases.\n\nResponsibilities:\n• Own roadmap prioritization across search, ranking, and personalization\n• Work closely with design and engineering to validate product bets\n• Translate market feedback into practical release plans',
      applyUrl: 'https://example.com/jobs/preview-job-1',
      sourceUrl: 'https://example.com/jobs/preview-job-1',
      via: 'LinkedIn',
      freshnessDays: 1,
      postedAtText: 'Posted 1 day ago',
      fitLabel: 'strong',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      applyOptions: [
        { title: 'Apply on company site', link: 'https://example.com/jobs/preview-job-1' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        appliedAt: null,
        applicationSessionId: null,
      },
    },
    {
      id: 'preview-job-2',
      title: 'Growth Product Manager',
      company: 'SignalPath',
      location: 'New York, NY',
      workMode: 'hybrid',
      employmentType: 'full_time',
      salaryText: '$150,000 - $175,000',
      description: 'Drive acquisition and activation experiments for a product-led platform, working across lifecycle, product analytics, and experimentation.',
      applyUrl: 'https://example.com/jobs/preview-job-2',
      sourceUrl: 'https://example.com/jobs/preview-job-2',
      via: 'Greenhouse',
      freshnessDays: 2,
      postedAtText: 'Posted 2 days ago',
      fitLabel: 'strong',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      applyOptions: [
        { title: 'Apply on Greenhouse', link: 'https://example.com/jobs/preview-job-2' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        appliedAt: null,
        applicationSessionId: null,
      },
    },
    {
      id: 'preview-job-3',
      title: 'Platform Product Manager',
      company: 'Orbit Systems',
      location: 'Toronto, ON',
      workMode: 'hybrid',
      employmentType: 'full_time',
      salaryText: '$140,000 - $160,000',
      description: 'Own internal platform investments that improve developer velocity, reliability, and experimentation across product teams.',
      applyUrl: 'https://example.com/jobs/preview-job-3',
      sourceUrl: 'https://example.com/jobs/preview-job-3',
      via: 'Company site',
      freshnessDays: 3,
      postedAtText: 'Posted 3 days ago',
      fitLabel: 'good',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      applyOptions: [
        { title: 'Apply on company site', link: 'https://example.com/jobs/preview-job-3' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        appliedAt: null,
        applicationSessionId: null,
      },
    },
    {
      id: 'preview-job-4',
      title: 'Principal Product Manager, Ecosystem',
      company: 'Meridian Cloud',
      location: 'Remote (Canada)',
      workMode: 'remote',
      employmentType: 'full_time',
      salaryText: '$175,000 - $205,000',
      description: 'Lead partner ecosystem product strategy and define the platform roadmap for integrations, developer tooling, and marketplace growth.',
      applyUrl: 'https://example.com/jobs/preview-job-4',
      sourceUrl: 'https://example.com/jobs/preview-job-4',
      via: 'Lever',
      freshnessDays: 4,
      postedAtText: 'Posted 4 days ago',
      fitLabel: 'good',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      applyOptions: [
        { title: 'Apply on Lever', link: 'https://example.com/jobs/preview-job-4' },
      ],
      feedback: {
        openedAt: null,
        savedAt: '2026-04-23T08:15:00.000Z',
        dismissedAt: null,
        appliedAt: null,
        applicationSessionId: null,
      },
    },
    {
      id: 'preview-job-5',
      title: 'Senior Product Manager, Search',
      company: 'Atlas Commerce',
      location: 'Remote (US)',
      workMode: 'remote',
      employmentType: 'full_time',
      salaryText: '$160,000 - $185,000',
      description: 'Improve product discovery and ranking quality for a high-volume commerce platform with a mix of marketplace and first-party inventory.',
      applyUrl: 'https://example.com/jobs/preview-job-5',
      sourceUrl: 'https://example.com/jobs/preview-job-5',
      via: 'Ashby',
      freshnessDays: 1,
      postedAtText: 'Posted yesterday',
      fitLabel: 'good',
      pipelineStage: 'shortlisted',
      rankingSource: 'deterministic',
      applyOptions: [
        { title: 'Apply on Ashby', link: 'https://example.com/jobs/preview-job-5' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        appliedAt: null,
        applicationSessionId: null,
      },
    },
    {
      id: 'preview-job-6',
      title: 'Director of Product, Automation',
      company: 'Copper Ridge',
      location: 'San Francisco, CA',
      workMode: 'onsite',
      employmentType: 'full_time',
      salaryText: '$185,000 - $220,000',
      description: 'Lead a team building internal and customer-facing automation workflows, with ownership across prioritization, delivery, and adoption.',
      applyUrl: 'https://example.com/jobs/preview-job-6',
      sourceUrl: 'https://example.com/jobs/preview-job-6',
      via: 'Indeed',
      freshnessDays: 5,
      postedAtText: 'Posted 5 days ago',
      fitLabel: 'good',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      applyOptions: [
        { title: 'Apply on employer site', link: 'https://example.com/jobs/preview-job-6' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        appliedAt: null,
        applicationSessionId: null,
      },
    },
  ];
}

function getSupportedTimeZones(): string[] {
  try {
    const intlWithSupportedValues = Intl as typeof Intl & {
      supportedValuesOf?: (input: string) => string[];
    };
    const values = intlWithSupportedValues.supportedValuesOf?.('timeZone');
    if (values && values.length > 0) {
      return values;
    }
  } catch {
    // Fall through to the curated fallback below.
  }

  return JOB_FEED_COMMON_TIMEZONES;
}

function readableMarket(value: string): string {
  const option = JOB_FEED_MARKET_OPTIONS.find((item) => item.value === value);
  return option?.label ?? value;
}

function readableState(value: string): string {
  switch (value) {
    case 'sign_in_required':
      return 'Sign in required';
    case 'setup_required':
      return 'Setup required';
    case 'awaiting_first_run':
      return 'Awaiting first run';
    case 'upgrade_required':
      return 'Upgrade required';
    case 'ready':
      return 'Ready';
    case 'thin_feed':
      return 'Thin feed';
    default:
      return value.replace(/_/g, ' ');
  }
}

function getHeroStateNote(value: string, isSignedIn: boolean): string {
  if (!isSignedIn) {
    return 'Sign in to load your feed';
  }

  switch (value) {
    case 'upgrade_required':
      return 'Upgrade to unlock setup and daily delivery';
    case 'setup_required':
      return 'Start setup to schedule the first shortlist';
    case 'awaiting_first_run':
      return 'Your first delivery is scheduled';
    case 'generating':
      return 'Today’s shortlist is being prepared';
    case 'ready':
      return 'Based on today’s latest run';
    case 'thin_feed':
      return 'A smaller shortlist is ready to review';
    case 'empty':
      return 'The latest run finished without any keepers';
    case 'paused':
      return 'Your saved settings are currently paused';
    case 'error':
      return 'The latest run needs attention';
    default:
      return 'Based on your latest feed run';
  }
}

function formatRunStatusLabel(value: string): string {
  switch (value) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Needs attention';
    case 'skipped':
      return 'Skipped';
    default:
      return value.replace(/_/g, ' ');
  }
}

function formatTriggerSourceLabel(value: string): string {
  switch (value) {
    case 'scheduled':
      return 'Scheduled';
    case 'manual_debug':
      return 'Manual run';
    case 'manual_debug_force':
      return 'Forced rerun';
    case 'cron':
      return 'Cron';
    case 'internal_scheduler':
      return 'Scheduler';
    default:
      return value.replace(/_/g, ' ');
  }
}

function formatFeedDateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function workModeLabel(value: JobFeedFeedItem['workMode']): string {
  switch (value) {
    case 'remote':
      return 'Remote';
    case 'hybrid':
      return 'Hybrid';
    case 'onsite':
      return 'On-site';
    default:
      return 'Work mode unknown';
  }
}

function employmentTypeLabel(value: NonNullable<JobFeedFeedItem['employmentType']>): string {
  switch (value) {
    case 'full_time':
      return 'Full-time';
    case 'part_time':
      return 'Part-time';
    case 'contract':
      return 'Contract';
    case 'internship':
      return 'Internship';
    case 'temporary':
      return 'Temporary';
    default:
      return 'Other';
  }
}

function fitLabelText(value: NonNullable<JobFeedFeedItem['fitLabel']>): string {
  return value === 'strong' ? 'Strong' : 'Good';
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
