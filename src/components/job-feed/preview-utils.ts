import type {
  JobFeedFeedItem,
  JobFeedOverviewResponse,
  JobFeedOverviewState,
  JobFeedSettingsInput,
} from '@/lib/job-feed/types';
import { createDefaultJobFeedInput } from '@/lib/job-feed/helpers';

export type JobFeedPreviewMode =
  | 'off'
  | 'signed_out'
  | 'upgrade_required'
  | JobFeedOverviewState;

export function getJobFeedPreviewMode(): JobFeedPreviewMode {
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

export function buildJobFeedPreviewSnapshot(
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
    target_countries: ['us', 'ca'],
    target_cities: ['New York, NY', 'Toronto, ON'],
    remote_preference: 'remote_first',
    remote_preferences: ['remote_first', 'hybrid'],
    salary_floor: 145000,
    seniority_target: 'senior',
    seniority_targets: ['senior', 'lead'],
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
        feedCap: 10,
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
        feedCap: 10,
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
        feedCap: 10,
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
        feedCap: 10,
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
      feedCap: 10,
    },
    form: formByMode,
  };
}

export function toPreviewJobFeedSettings(form: JobFeedSettingsInput): NonNullable<JobFeedOverviewResponse['settings']> {
  const now = new Date().toISOString();

  return {
    user_id: 'preview-user',
    enabled: form.enabled,
    consent_accepted_at: form.consent_accepted ? now : null,
    user_timezone: form.user_timezone,
    delivery_hour_local: form.delivery_hour_local,
    target_market: form.target_market,
    target_countries: form.target_countries,
    target_cities: form.target_cities,
    target_roles: form.target_roles,
    adjacent_roles_enabled: form.adjacent_roles_enabled,
    adjacent_roles: form.adjacent_roles,
    preferred_locations: form.preferred_locations,
    remote_preference: form.remote_preference,
    remote_preferences: form.remote_preferences,
    salary_floor: form.salary_floor,
    languages: form.languages,
    seniority_target: form.seniority_target,
    seniority_targets: form.seniority_targets,
    employment_types: form.employment_types,
    work_authorization_status: form.work_authorization_status,
    aggressiveness: form.aggressiveness,
    user_skills: form.user_skills,
    created_at: now,
    updated_at: now,
  };
}

export function buildPreviewJobFeedRun({
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

export function buildJobFeedPreviewJobs(): JobFeedFeedItem[] {
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

