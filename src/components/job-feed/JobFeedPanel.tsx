'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import {
  AlertCircle,
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
import { createDefaultJobFeedInput, getJobFeedOverviewState, toJobFeedInput } from '@/lib/job-feed/helpers';
import type {
  JobFeedApplyResponse,
  JobFeedFeedbackResponse,
  JobFeedFeedItem,
  JobFeedOverviewResponse,
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

export function JobFeedPanel() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const currentCV = useCVStore((state) => state.currentCV);
  const { toast } = useToast();
  const posthog = usePostHog();
  const [overview, setOverview] = useState<JobFeedOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isRunningDebugFlow, setIsRunningDebugFlow] = useState(false);
  const [isShowingAllJobs, setIsShowingAllJobs] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobFeedFeedItem | null>(null);
  const [pendingJobAction, setPendingJobAction] = useState<PendingJobAction>(null);
  const [form, setForm] = useState<JobFeedSettingsInput>(() => createDefaultJobFeedInput(getBrowserTimeZone()));
  const lastTrackedState = useRef<string | null>(null);

  const showDebugActions = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG === 'true';

  const loadOverview = useCallback(async (options?: { quiet?: boolean }) => {
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
  }, [toast]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    loadOverview();
  }, [loadOverview, user]);

  useEffect(() => {
    if (!posthog) return;

    posthog.capture('job_feed_opened', {
      foundation_mode: true,
      subscription_tier: profile?.subscription_tier ?? 'unknown',
    });
  }, [posthog, profile?.subscription_tier]);

  useEffect(() => {
    if (!posthog || !overview?.state) return;
    if (lastTrackedState.current === overview.state) return;

    lastTrackedState.current = overview.state;
    posthog.capture('job_feed_state_viewed', {
      state: overview.state,
      foundation_mode: true,
    });
  }, [overview?.state, posthog]);

  useEffect(() => {
    setIsShowingAllJobs(false);
  }, [overview?.feedRun?.id]);

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
  }, [overview?.feedRun?.id, posthog, recordJobFeedback]);

  const handleSaveJob = useCallback(async (job: JobFeedFeedItem) => {
    setPendingJobAction({ jobId: job.id, action: 'save' });

    try {
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
  }, [overview?.feedRun?.id, posthog, recordJobFeedback, toast]);

  const handleDismissJob = useCallback(async (job: JobFeedFeedItem) => {
    setPendingJobAction({ jobId: job.id, action: 'dismiss' });

    try {
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
  }, [overview?.feedRun?.id, posthog, recordJobFeedback, removeJobFromOverview, selectedJob?.id, toast]);

  const handleApplyWithKarko = useCallback(async (job: JobFeedFeedItem) => {
    setPendingJobAction({ jobId: job.id, action: 'apply' });

    try {
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
  }, [currentCV, overview?.feedRun?.id, posthog, router, syncApplicationSession, toast, updateJobFeedbackState]);

  const handleExternalApply = useCallback((job: JobFeedFeedItem) => {
    posthog?.capture('job_feed_external_apply_clicked', {
      foundation_mode: true,
      job_id: job.id,
      job_title: job.title,
      company: job.company,
      feed_run_id: overview?.feedRun?.id ?? null,
    });
  }, [overview?.feedRun?.id, posthog]);

  const handleSave = async () => {
    setSaveState('saving');

    try {
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
      await loadOverview({ quiet: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save Job Feed settings.');
    } finally {
      setSaveState('idle');
    }
  };

  const handleDebugRun = async () => {
    setIsRunningDebugFlow(true);

    try {
      const response = await fetch('/api/job-feed/dev/run', {
        method: 'POST',
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to run the feed backend workflow.');
      }

      posthog?.capture('job_feed_foundation_run_requested', {
        foundation_mode: true,
      });

      toast.success(
        payload.execution === 'inline'
          ? 'Feed backend run completed for this account.'
          : 'Feed backend run queued for this account.'
      );
      await loadOverview({ quiet: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run the feed backend workflow.');
    } finally {
      setIsRunningDebugFlow(false);
    }
  };

  const currentState = overview?.state ?? 'setup_required';
  const setupOpen = currentState === 'setup_required' || isEditing;

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
                  Phase 0 is live here: the old manual-search-first board is hidden so Job Feed can become a prepared, daily, feed-first surface.
                  Phases 1 through 6 in this branch now add real settings, scheduling, durable ingestion, Strong/Good ranking, ranked feed items, and apply-feedback handoff underneath it.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <HeroPill icon={ShieldCheck} label="Premium-only daily discovery" />
                <HeroPill icon={Wand2} label="Canonical job ingestion saved in Supabase" />
                <HeroPill icon={CalendarClock} label="Strong/Good ranking now wired" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <HeroStat
                icon={Clock3}
                label="Delivery window"
                value={formatDeliveryHourLabel(form.delivery_hour_local)}
                sublabel={form.user_timezone}
              />
              <HeroStat
                icon={Globe}
                label="Target market"
                value={readableMarket(form.target_market)}
                sublabel="US + Canada launch shape"
              />
              <HeroStat
                icon={Zap}
                label="Current state"
                value={readableState(currentState)}
                sublabel="Foundation mode enabled"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <div className="space-y-5">
            {isLoading ? (
              <LoadingState />
            ) : (
              <PrimaryStateCard
                overview={overview}
                onEditSettings={() => setIsEditing(true)}
                onRefresh={() => loadOverview({ quiet: true })}
                isRefreshing={isRefreshing}
              />
            )}

            {!isLoading && overview?.jobs && overview.jobs.length > 0 && (
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

            {!isLoading && overview?.state === 'empty' && (
              <EmptyFeedCard onEditSettings={() => setIsEditing(true)} />
            )}

            {setupOpen && (
              <Card className="rounded-[24px] border-cream-200 bg-white/92 p-0 shadow-sm">
                <div className="border-b border-cream-200 px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-500">Phase 1 Setup</p>
                      <h2 className="mt-2 text-xl font-semibold text-charcoal">Tell Karko what a good daily match looks like</h2>
                      <p className="mt-1 text-sm text-warm-gray">
                        Keep it practical for v1: a few strong role, market, location, and fit signals are enough to start.
                      </p>
                    </div>
                    {currentState !== 'setup_required' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setForm(toJobFeedInput(overview?.settings ?? null, getBrowserTimeZone()));
                          setIsEditing(false);
                        }}
                      >
                        Close
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-6 px-6 py-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldGroup label="Target roles" help="Structured suggestions first, then your own write-in roles.">
                      <ChipField
                        values={form.target_roles}
                        suggestions={JOB_FEED_SUGGESTED_ROLES}
                        placeholder="Type a role and press Enter"
                        onChange={(target_roles) => setForm((prev) => ({ ...prev, target_roles }))}
                      />
                    </FieldGroup>

                    <FieldGroup label="Preferred locations" help="Add cities, regions, or remote market hints if they matter.">
                      <ChipField
                        values={form.preferred_locations}
                        suggestions={JOB_FEED_SUGGESTED_LOCATIONS}
                        placeholder="Add a location"
                        onChange={(preferred_locations) => setForm((prev) => ({ ...prev, preferred_locations }))}
                      />
                    </FieldGroup>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <SelectField
                      label="Target market"
                      value={form.target_market}
                      onChange={(target_market) => setForm((prev) => ({ ...prev, target_market: target_market as JobFeedSettingsInput['target_market'] }))}
                      options={JOB_FEED_MARKET_OPTIONS}
                    />
                    <SelectField
                      label="Remote preference"
                      value={form.remote_preference}
                      onChange={(remote_preference) => setForm((prev) => ({ ...prev, remote_preference: remote_preference as JobFeedSettingsInput['remote_preference'] }))}
                      options={JOB_FEED_REMOTE_PREFERENCE_OPTIONS}
                    />
                    <SelectField
                      label="Seniority"
                      value={form.seniority_target ?? ''}
                      onChange={(seniority_target) => setForm((prev) => ({ ...prev, seniority_target: (seniority_target || null) as JobFeedSettingsInput['seniority_target'] }))}
                      options={[{ value: '', label: 'Select seniority' }, ...JOB_FEED_SENIORITY_OPTIONS]}
                    />
                    <SelectField
                      label="Aggressiveness"
                      value={form.aggressiveness}
                      onChange={(aggressiveness) => setForm((prev) => ({ ...prev, aggressiveness: aggressiveness as JobFeedSettingsInput['aggressiveness'] }))}
                      options={JOB_FEED_AGGRESSIVENESS_OPTIONS}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <SelectField
                      label="Delivery hour"
                      value={String(form.delivery_hour_local)}
                      onChange={(value) => setForm((prev) => ({ ...prev, delivery_hour_local: Number(value) }))}
                      options={Array.from({ length: 16 }, (_, index) => {
                        const hour = index + 6;
                        return {
                          value: String(hour),
                          label: `${formatDeliveryHourLabel(hour)} local`,
                        };
                      })}
                    />

                    <InputField
                      label="Timezone"
                      value={form.user_timezone}
                      onChange={(user_timezone) => setForm((prev) => ({ ...prev, user_timezone }))}
                      placeholder="Europe/Berlin"
                    />

                    <InputField
                      label="Salary floor (optional)"
                      type="number"
                      value={form.salary_floor === null ? '' : String(form.salary_floor)}
                      onChange={(salary_floor) => setForm((prev) => ({
                        ...prev,
                        salary_floor: salary_floor ? Number(salary_floor) : null,
                      }))}
                      placeholder="120000"
                    />

                    <SelectField
                      label="Work authorization"
                      value={form.work_authorization_status ?? ''}
                      onChange={(work_authorization_status) => setForm((prev) => ({
                        ...prev,
                        work_authorization_status: (work_authorization_status || null) as JobFeedSettingsInput['work_authorization_status'],
                      }))}
                      options={[{ value: '', label: 'Select status' }, ...JOB_FEED_WORK_AUTH_OPTIONS]}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <FieldGroup label="Employment types" help="Keep the first version practical.">
                      <div className="flex flex-wrap gap-2">
                        {JOB_FEED_EMPLOYMENT_TYPE_OPTIONS.map((option) => {
                          const selected = form.employment_types.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                const nextValues = selected
                                  ? form.employment_types.filter((value) => value !== option.value)
                                  : [...form.employment_types, option.value];
                                setForm((prev) => ({ ...prev, employment_types: nextValues as JobFeedSettingsInput['employment_types'] }));
                              }}
                              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                                selected
                                  ? 'border-navy-600 bg-navy-600 text-white'
                                  : 'border-cream-300 bg-cream-50 text-warm-gray hover:border-navy-300 hover:text-navy-600'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </FieldGroup>

                    <FieldGroup label="Languages" help="Used for market-fit and future ranking context.">
                      <ChipField
                        values={form.languages}
                        suggestions={JOB_FEED_SUGGESTED_LANGUAGES}
                        placeholder="Add a language"
                        onChange={(languages) => setForm((prev) => ({ ...prev, languages }))}
                      />
                    </FieldGroup>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <FieldGroup label="Adjacent roles" help="Let Karko widen into close neighbours when the market is thin.">
                      <ToggleRow
                        title="Include adjacent roles"
                        description="Helpful for strict markets or when exact titles vary."
                        checked={form.adjacent_roles_enabled}
                        onChange={(adjacent_roles_enabled) => setForm((prev) => ({ ...prev, adjacent_roles_enabled }))}
                      />

                      {form.adjacent_roles_enabled && (
                        <div className="pt-3">
                          <ChipField
                            values={form.adjacent_roles}
                            suggestions={['Platform Engineer', 'Solutions Engineer', 'Product Analyst']}
                            placeholder="Add an adjacent role"
                            onChange={(adjacent_roles) => setForm((prev) => ({ ...prev, adjacent_roles }))}
                          />
                        </div>
                      )}
                    </FieldGroup>

                    <FieldGroup label="Automation consent" help="Required before the feed can run automatically.">
                      <div className="rounded-2xl border border-cream-200 bg-cream-50/70 p-4">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={form.consent_accepted}
                            onChange={(event) => setForm((prev) => ({ ...prev, consent_accepted: event.target.checked }))}
                            className="mt-1 h-4 w-4 rounded border-cream-300 text-navy-600 focus:ring-navy-500"
                          />
                          <span className="text-sm leading-6 text-charcoal">
                            I’m happy for Karko to research jobs for me automatically once per day using these settings.
                            {overview?.settings?.consent_accepted_at && (
                              <span className="mt-1 block text-xs text-navy-600">
                                Consent already recorded. Leaving this checked keeps the feed eligible to run.
                              </span>
                            )}
                          </span>
                        </label>

                        <div className="mt-4 border-t border-cream-200 pt-4">
                          <ToggleRow
                            title="Enable daily feed"
                            description="Turn scheduling on now, or save the settings first and enable it later."
                            checked={form.enabled}
                            onChange={(enabled) => setForm((prev) => ({ ...prev, enabled }))}
                          />
                        </div>
                      </div>
                    </FieldGroup>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-cream-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-warm-gray">
                      This milestone now covers settings, scheduling, ingestion, deterministic shortlist prep, Strong/Good ranking, materialized ranked items, and a practical apply-feedback loop.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => loadOverview({ quiet: true })} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Refresh
                      </Button>
                      <Button variant="gold" onClick={handleSave} disabled={saveState === 'saving'}>
                        {saveState === 'saving' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Job Feed settings
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card className="rounded-[24px] border-cream-200 bg-white/92 p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Current Shape</p>
                  <h2 className="mt-2 text-lg font-semibold text-charcoal">Feed summary</h2>
                </div>
                {!setupOpen && (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
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

            <Card className="rounded-[24px] border-cream-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,244,234,0.9))] p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Milestone To-Do</p>
              <h2 className="mt-2 text-lg font-semibold text-charcoal">What this branch is building right now</h2>
              <div className="mt-5 space-y-3">
                <MilestoneStep title="Phase 0" body="Hide the legacy manual-search-first board from the visible product and make Job Feed feel prepared, not manual." />
                <MilestoneStep title="Phase 1" body="Persist feed settings with honest consent, timezone, delivery time, role, market, and fit controls." />
                <MilestoneStep title="Phase 2" body="Track durable per-user daily runs and route scheduler/debug triggers through one orchestration boundary so the later Inngest swap stays narrow." />
                <MilestoneStep title="Phase 3" body="Persist raw SerpApi fetches and normalize deduped canonical jobs so later feed logic has a durable source of truth." />
                <MilestoneStep title="Phase 4" body="Reject obvious mismatches in code, cap a deterministic shortlist, and finish Strong/Good ranking with an LLM-first pass plus fallback." />
                <MilestoneStep title="Phase 5" body="Expose ranked feed items through the feed APIs and render honest ready, thin-feed, and detail states inside Job Feed." />
                <MilestoneStep title="Phase 6" body="Capture simple saved/opened/dismissed/applied signals and hand the user into a real Karko application session from the feed." />
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
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-600">Developer Check</p>
                <h2 className="mt-2 text-lg font-semibold text-charcoal">Run the current feed backend pass for this account</h2>
                <p className="mt-2 text-sm leading-6 text-warm-gray">
                  This is a debug-only helper to exercise the orchestration entrypoint, ingestion, canonical dedupe, ranking, and the real feed read path end to end.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleDebugRun} disabled={isRunningDebugFlow}>
                    {isRunningDebugFlow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Run backend workflow
                  </Button>
                  <Button variant="ghost" onClick={() => loadOverview({ quiet: true })} disabled={isRefreshing}>
                    Refresh status
                  </Button>
                </div>
              </Card>
            )}

            {!overview?.canAccess && !isLoading && (
              <Card className="rounded-[24px] border-gold-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(253,247,228,0.95))] p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Premium Access</p>
                <h2 className="mt-2 text-lg font-semibold text-charcoal">Upgrade to unlock automatic daily discovery</h2>
                <p className="mt-2 text-sm leading-6 text-warm-gray">
                  The feed foundation is premium-only, because it relies on background research, personalization, and later ranking costs.
                </p>
                <Link href="/pricing" className="mt-4 inline-flex">
                  <Button variant="gold">
                    View plans
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </Card>
            )}
          </div>
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

  const contentByState: Record<string, {
    icon: typeof Sparkles;
    title: string;
    body: string;
    tone: string;
  }> = {
    upgrade_required: {
      icon: Sparkles,
      title: 'Job Feed is waiting on a premium plan',
      body: 'The daily feed is built for premium users only. Once access is enabled, the rest of this setup can stay in-context right here.',
      tone: 'from-gold-50 to-white border-gold-200 text-charcoal',
    },
    setup_required: {
      icon: Settings2,
      title: 'Finish setup to activate the feed',
      body: 'Karko needs your target roles, delivery time, and consent before it can start a background run.',
      tone: 'from-navy-50 to-white border-navy-200 text-charcoal',
    },
    paused: {
      icon: PauseCircle,
      title: 'The feed is configured but paused',
      body: 'Your preferences are saved. Re-enable the daily feed whenever you want background discovery to resume.',
      tone: 'from-cream-100 to-white border-cream-300 text-charcoal',
    },
    awaiting_first_run: {
      icon: CalendarClock,
      title: 'Settings are saved. The first automated run is next.',
      body: 'Scheduling is ready. Once the scheduler hits your delivery window, the next run will fetch, normalize, and prefilter jobs here.',
      tone: 'from-navy-50 to-white border-navy-200 text-charcoal',
    },
    generating: {
      icon: Loader2,
      title: 'A feed run is in progress',
      body: 'The backend workflow is currently fetching and shaping today’s shortlist. Once it finishes, the latest jobs will appear here automatically.',
      tone: 'from-navy-50 to-white border-navy-200 text-charcoal',
    },
    ready: {
      icon: CheckCircle2,
      title: 'Today’s feed is ready',
      body: latestRun?.result_summary || 'Karko found a solid shortlist for today. Open details, scan the strongest jobs first, and decide what to pursue.',
      tone: 'from-emerald-50 to-white border-emerald-200 text-charcoal',
    },
    thin_feed: {
      icon: CheckCircle2,
      title: 'Today’s feed is ready, but a bit thin',
      body: latestRun?.result_summary || 'A smaller shortlist survived the current filters. You can review it here or widen the settings if you want more volume.',
      tone: 'from-navy-50 to-white border-navy-200 text-charcoal',
    },
    empty: {
      icon: AlertCircle,
      title: 'No jobs made today’s shortlist',
      body: latestRun?.result_summary || 'The feed ran successfully, but nothing survived the current filters closely enough to show here.',
      tone: 'from-cream-100 to-white border-cream-300 text-charcoal',
    },
    error: {
      icon: AlertCircle,
      title: 'The latest backend run failed',
      body: latestRun?.error_message || 'The feed backend needs attention before the next daily run.',
      tone: 'from-red-50 to-white border-red-200 text-charcoal',
    },
  };

  const stateContent = contentByState[overview?.state ?? 'setup_required'];
  const Icon = stateContent.icon;

  return (
    <Card className={`rounded-[24px] border bg-[linear-gradient(180deg,var(--tw-gradient-stops))] p-6 shadow-sm ${stateContent.tone}`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
            <Icon className={`h-6 w-6 ${overview?.state === 'generating' ? 'animate-spin text-navy-600' : 'text-navy-600'}`} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Primary state</p>
            <h2 className="mt-2 text-2xl font-semibold text-charcoal">{stateContent.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray">{stateContent.body}</p>
            {latestRun && (
              <div className="mt-4 flex flex-wrap gap-2">
                <RunStatPill label="Run status" value={latestRun.status} />
                <RunStatPill label="Feed date" value={latestRun.local_date} />
                <RunStatPill label="Triggered by" value={latestRun.trigger_source} />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="outline" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button variant="gold" onClick={onEditSettings}>
            <Settings2 className="mr-2 h-4 w-4" />
            {overview?.state === 'setup_required' ? 'Open setup' : 'Edit settings'}
          </Button>
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

  return (
    <Card className="rounded-[24px] border-cream-200 bg-white/92 p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">Today&apos;s Feed</p>
          <h2 className="mt-2 text-xl font-semibold text-charcoal">
            {overview.state === 'thin_feed'
              ? hasRankedJobs
                ? 'A smaller ranked shortlist still made the cut'
                : 'A smaller shortlist still made the cut'
              : hasRankedJobs
                ? 'Karko ranked today&apos;s shortlist for you'
                : 'Karko prepared a shortlist for you'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-warm-gray">
            {hasRankedJobs
              ? `Showing ${visibleJobs.length} of ${jobs.length} ranked jobs from the latest completed run. Strong jobs lead the feed, followed by Good matches.`
              : `Showing ${visibleJobs.length} of ${jobs.length} shortlisted jobs from the latest completed run while ranking is still catching up.`}
          </p>
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
    <Card className="rounded-[24px] border-cream-200 bg-white/92 p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-500">No Shortlist Yet</p>
      <h2 className="mt-2 text-xl font-semibold text-charcoal">Nothing survived today&apos;s filters closely enough to show</h2>
      <p className="mt-2 text-sm leading-6 text-warm-gray">
        The run succeeded, but the current role, location, salary, or authorization rules were probably too tight for today&apos;s market. Widening one or two settings usually helps.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="gold" onClick={onEditSettings}>
          Adjust settings
        </Button>
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
              {job.fitLabel ? fitLabelText(job.fitLabel) : 'Shortlisted'}
            </span>
            {job.pipelineStage === 'shortlisted' && (
              <span className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-cream-50 px-3 py-1 text-xs font-medium text-warm-gray">
                Ranking pending
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
            See details
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
              External apply
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
                {job.fitLabel ? fitLabelText(job.fitLabel) : 'Shortlisted'}
              </span>
              {job.pipelineStage === 'shortlisted' && (
                <span className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-white px-3 py-1 text-xs text-warm-gray">
                  Ranking pending
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
              <h3 className="mb-3 text-base font-semibold text-charcoal">Job Description</h3>
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
            Use the detail view to verify the role first, then decide whether to continue in Karko or on the external application page.
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
                Direct external apply
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
        <span className="text-sm font-medium">Loading Job Feed backend…</span>
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

function MilestoneStep({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-600 text-xs font-semibold text-white">
        {title.replace('Phase ', '')}
      </div>
      <p className="text-sm leading-6 text-warm-gray">
        <span className="font-semibold text-charcoal">{title}.</span> {body}
      </p>
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
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Phase 7 Snapshot</p>
      <h2 className="mt-2 text-lg font-semibold text-charcoal">Latest run operational summary</h2>
      <p className="mt-2 text-sm leading-6 text-warm-gray">
        Lightweight run visibility for {latestRunDate}. This keeps ranking cost, fetch health, and materialization status readable without opening raw JSON metadata.
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

function readableMarket(value: string): string {
  const option = JOB_FEED_MARKET_OPTIONS.find((item) => item.value === value);
  return option?.label ?? value;
}

function readableState(value: string): string {
  switch (value) {
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
