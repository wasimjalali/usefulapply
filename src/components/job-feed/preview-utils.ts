import type {
  JobFeedFeedItem,
  JobFeedOverviewResponse,
  JobFeedOverviewState,
  JobFeedSettingsInput,
} from '@/lib/job-feed/types';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type { SearchStrategy } from '@/lib/job-feed/search-strategy';
import { createDefaultJobFeedInput } from '@/lib/job-feed/helpers';

export type JobFeedPreviewMode =
  | 'off'
  | 'signed_out'
  | 'upgrade_required'
  // A free plan with a built feed: the tier can view the feed but not steer it.
  | 'free_feed'
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
  if (normalized === 'upgrade_required') {
    return 'upgrade_required';
  }
  if (normalized === 'free' || normalized === 'free_plan' || normalized === 'free_feed') {
    return 'free_feed';
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
    target_market: 'us_canada',
    target_countries: ['us', 'ca'],
    target_cities: ['New York, NY', 'Toronto, ON'],
    remote_preference: 'remote_first',
    remote_preferences: ['remote_first', 'hybrid'],
    salary_floor: 145000,
    seniority_target: 'senior',
    seniority_targets: ['senior', 'lead'],
    work_authorization_status: 'authorized',
    employment_types: ['full_time'],
    languages: ['English'],
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
        latestManualRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        jobsTotalCount: 0,
        jobsHasMore: false,
        jobsTodayCount: 0,
        jobsBacklogCount: 0,
        state: 'upgrade_required',
        foundationMode: true,
        feedCap: 10,
        target_roles_outdated: false,
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
        latestManualRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        jobsTotalCount: 0,
        jobsHasMore: false,
        jobsTodayCount: 0,
        jobsBacklogCount: 0,
        state: 'setup_required',
        foundationMode: true,
        feedCap: 10,
        target_roles_outdated: false,
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
        latestManualRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        jobsTotalCount: 0,
        jobsHasMore: false,
        jobsTodayCount: 0,
        jobsBacklogCount: 0,
        state: 'awaiting_first_run',
        foundationMode: true,
        feedCap: 10,
        target_roles_outdated: false,
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
        latestManualRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        jobsTotalCount: 0,
        jobsHasMore: false,
        jobsTodayCount: 0,
        jobsBacklogCount: 0,
        state: 'paused',
        foundationMode: true,
        feedCap: 10,
        target_roles_outdated: false,
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
    resultSummary: mode === 'ready'
      ? 'Useful Apply ranked and prepared the strongest roles for today.'
      : mode === 'thin_feed'
        ? 'A smaller shortlist survived the current filter.'
        : mode === 'empty'
          ? 'No roles were strong enough to show today.'
          : null,
    errorMessage: mode === 'error' ? 'Previewing a failed run state for desktop UI validation.' : null,
  });

  const jobsForMode = mode === 'ready'
    ? readyJobs
    : mode === 'free_feed'
      // Free tier sees the top 5 of the day, same cards, no steering.
      ? readyJobs.slice(0, 5)
      : mode === 'thin_feed'
        ? thinJobs
        : [];

  return {
    overview: {
      canAccess: mode !== 'free_feed',
      settings: toPreviewJobFeedSettings(formByMode),
      latestRun,
      latestManualRun: latestRun.status === 'completed' ? latestRun : null,
      feedRun: latestRun,
      latestRunDiagnostics: null,
      jobs: jobsForMode,
      jobsTotalCount: jobsForMode.length,
      jobsHasMore: false,
      jobsTodayCount: jobsForMode.length,
      jobsBacklogCount: 0,
      state: mode === 'free_feed' ? 'ready' : mode,
      foundationMode: true,
      feedCap: mode === 'free_feed' ? 5 : 10,
      target_roles_outdated: false,
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
    target_market: form.target_market,
    target_countries: form.target_countries,
    target_cities: form.target_cities,
    target_roles: form.target_roles,
    preferred_locations: form.preferred_locations,
    remote_preference: form.remote_preference,
    remote_preferences: form.remote_preferences,
    salary_floor: form.salary_floor,
    languages: form.languages,
    seniority_target: form.seniority_target,
    seniority_targets: form.seniority_targets,
    employment_types: form.employment_types,
    work_authorization_status: form.work_authorization_status,
    user_skills: form.user_skills,
    excluded_terms: form.excluded_terms,
    created_at: now,
    updated_at: now,
  };
}

export function buildPreviewJobFeedRun({
  status,
  timeZone,
  resultSummary,
  errorMessage,
}: {
  status: 'running' | 'completed' | 'failed';
  timeZone: string;
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
    // Outside MANUAL_JOB_FEED_TRIGGER_SOURCES on purpose, so a preview run
    // never locks the button for a real account.
    trigger_source: 'preview',
    status,
    idempotency_key: `preview-${status}`,
    started_at: now,
    completed_at: status === 'running' ? null : now,
    error_message: errorMessage,
    result_summary: resultSummary,
    raw_jobs_fetched: 28,
    jobs_after_prefilter: 11,
    ranked_jobs_count: status === 'completed' ? 6 : 0,
    settings_snapshot: null,
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
      highlights: [],
      applyUrl: 'https://example.com/jobs/preview-job-1',
      sourceUrl: 'https://example.com/jobs/preview-job-1',
      via: 'LinkedIn',
      freshnessDays: 1,
      postedAtText: 'Posted 1 day ago',
      fitLabel: 'strong',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      matchReason:
        'Workflow automation ownership plus agent tooling maps onto your B2B SaaS roadmap work. Salary sits above your floor and it is remote. Gap: no marketplace pricing experience.',
      applyOptions: [
        { title: 'Apply on company site', link: 'https://example.com/jobs/preview-job-1' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        applyStartedAt: null,
        appliedAt: null,
        applicationSessionId: null,
        generationStatus: 'none',
        generationError: null,
        matchRating: null,
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
      highlights: [
        {
          title: 'Qualifications',
          items: [
            '4+ years in growth or product management at a B2B SaaS company',
            'Hands-on experience running activation and lifecycle experiments',
            'Comfort with product analytics tools and SQL',
          ],
        },
        {
          title: 'Responsibilities',
          items: [
            'Design and ship acquisition and activation experiments end to end',
            'Partner with lifecycle marketing on onboarding and retention',
            'Turn analytics into a prioritized experiment backlog',
          ],
        },
      ],
      applyUrl: 'https://example.com/jobs/preview-job-2',
      sourceUrl: 'https://example.com/jobs/preview-job-2',
      via: 'Greenhouse',
      freshnessDays: 2,
      postedAtText: 'Posted 2 days ago',
      fitLabel: 'strong',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      matchReason:
        'Activation and lifecycle experiments match your growth work, and the SQL and analytics ask is covered by your Mixpanel and A/B testing record. Gap: hybrid in New York, not remote.',
      applyOptions: [
        { title: 'Apply on Greenhouse', link: 'https://example.com/jobs/preview-job-2' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        applyStartedAt: null,
        appliedAt: null,
        applicationSessionId: null,
        generationStatus: 'none',
        generationError: null,
        matchRating: null,
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
      highlights: [],
      applyUrl: 'https://example.com/jobs/preview-job-3',
      sourceUrl: 'https://example.com/jobs/preview-job-3',
      via: 'Company site',
      freshnessDays: 3,
      postedAtText: 'Posted 3 days ago',
      fitLabel: 'good',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      matchReason:
        'Internal platform and developer velocity line up with your integrations work. One step sideways rather than up, and the range sits just above your floor.',
      applyOptions: [
        { title: 'Apply on company site', link: 'https://example.com/jobs/preview-job-3' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        applyStartedAt: null,
        appliedAt: null,
        applicationSessionId: null,
        generationStatus: 'none',
        generationError: null,
        matchRating: null,
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
      highlights: [],
      applyUrl: 'https://example.com/jobs/preview-job-4',
      sourceUrl: 'https://example.com/jobs/preview-job-4',
      via: 'Lever',
      freshnessDays: 4,
      postedAtText: 'Posted 4 days ago',
      fitLabel: 'good',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      matchReason:
        'Partner ecosystem, integrations and developer tooling are the closest match in today\'s list to your connector work. Gap: principal scope is a level above your last title.',
      applyOptions: [
        { title: 'Apply on Lever', link: 'https://example.com/jobs/preview-job-4' },
      ],
      feedback: {
        openedAt: null,
        savedAt: '2026-04-23T08:15:00.000Z',
        dismissedAt: null,
        applyStartedAt: null,
        appliedAt: null,
        applicationSessionId: null,
        generationStatus: 'none',
        generationError: null,
        matchRating: null,
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
      highlights: [],
      applyUrl: 'https://example.com/jobs/preview-job-5',
      sourceUrl: 'https://example.com/jobs/preview-job-5',
      via: 'Ashby',
      freshnessDays: 1,
      postedAtText: 'Posted yesterday',
      fitLabel: 'good',
      pipelineStage: 'shortlisted',
      rankingSource: 'deterministic',
      matchReason: null,
      applyOptions: [
        { title: 'Apply on Ashby', link: 'https://example.com/jobs/preview-job-5' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        applyStartedAt: null,
        appliedAt: null,
        applicationSessionId: null,
        generationStatus: 'none',
        generationError: null,
        matchRating: null,
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
      highlights: [],
      applyUrl: 'https://example.com/jobs/preview-job-6',
      sourceUrl: 'https://example.com/jobs/preview-job-6',
      via: 'Indeed',
      freshnessDays: 5,
      postedAtText: 'Posted 5 days ago',
      fitLabel: 'good',
      pipelineStage: 'ranked',
      rankingSource: 'llm',
      matchReason:
        'Automation ownership and team leadership fit the trajectory, but this is on-site in San Francisco and a people-management step.',
      applyOptions: [
        { title: 'Apply on employer site', link: 'https://example.com/jobs/preview-job-6' },
      ],
      feedback: {
        openedAt: null,
        savedAt: null,
        dismissedAt: null,
        applyStartedAt: null,
        appliedAt: null,
        applicationSessionId: null,
        generationStatus: 'none',
        generationError: null,
        matchRating: null,
      },
    },
  ];
}

/**
 * Plan the preview should render as. Auth does not run in local dev, so
 * without this every preview would fall back to the free tier and the paid
 * surfaces (Edit feed, the query list) could never be checked.
 */
export function getJobFeedPreviewTier(mode: JobFeedPreviewMode): 'free' | 'plus' | null {
  if (mode === 'off') return null;
  if (mode === 'free_feed' || mode === 'upgrade_required' || mode === 'signed_out') return 'free';
  return 'plus';
}

export function buildJobFeedPreviewStrategy(): SearchStrategy {
  return {
    version: 1,
    generatedAt: '2026-08-19T06:00:00.000Z',
    sourceProfileGeneratedAt: '2026-08-19T05:58:00.000Z',
    negativeTerms: ['agency', 'staffing'],
    queries: [
      {
        type: 'short_tail',
        query: 'Senior Product Manager B2B SaaS',
        targetCountry: 'us',
        rationale: 'Your most recent title plus the market you have shipped in.',
        expectedRecall: 'high',
        fallbackTo: null,
      },
      {
        type: 'long_tail',
        query: 'Product Manager API integrations',
        targetCountry: 'us',
        rationale: 'Zendesk and Salesforce connector work is your strongest differentiator.',
        expectedRecall: 'medium',
        fallbackTo: 0,
      },
      {
        type: 'long_tail',
        query: 'Group Product Manager B2B SaaS',
        targetCountry: 'us',
        rationale: 'One step up. Your pod-lead experience supports it.',
        expectedRecall: 'low',
        fallbackTo: 0,
      },
      {
        type: 'localized',
        query: 'Product Manager plateforme B2B',
        targetCountry: 'ca',
        rationale: 'Same role, French-language listings in Canada.',
        expectedRecall: 'low',
        fallbackTo: 0,
      },
    ],
  };
}

export function buildJobFeedPreviewCareerProfile(): CareerProfile {
  return {
    version: 2,
    generatedAt: '2026-08-19T05:58:00.000Z',
    function: 'product',
    inferredTitles: [
      { canonical: 'Senior Product Manager', confidence: 'high', rationale: 'Current title.' },
      { canonical: 'Product Manager, API and Integrations', confidence: 'high', rationale: 'Connector ownership.' },
      { canonical: 'Product Manager, B2B SaaS', confidence: 'medium', rationale: 'Whole career in B2B.' },
      { canonical: 'Group Product Manager', confidence: 'low', rationale: 'Pod lead for two squads.' },
    ],
    seniority: { level: 'senior', confidence: 'high', rationale: 'Seven years, owns a platform area.' },
    targetDirection: {
      aspirationalTitles: ['Group Product Manager'],
      pivot: null,
      confidence: 'medium',
      rationale: 'Scope has grown each year.',
    },
    yearsTotal: 7,
    yearsInFunction: 7,
    primarySkillClusters: [
      { name: 'B2B SaaS product management', skills: ['roadmap', 'backlog', 'OKRs', 'stakeholder alignment'], evidenceStrength: 'strong' },
      { name: 'data-driven decisions', skills: ['Mixpanel', 'SQL', 'A/B testing'], evidenceStrength: 'strong' },
      { name: 'API and integration ownership', skills: ['REST APIs', 'Zendesk', 'B2B integrations'], evidenceStrength: 'strong' },
    ],
    secondarySkillClusters: [],
    industryDomains: ['Enterprise SaaS', 'Data analytics'],
    toolsEnvironment: ['Mixpanel', 'SQL', 'Figma', 'Jira'],
    workingLanguages: ['English'],
    narrative: 'Senior Product Manager with 7 years in B2B SaaS, API-integrated products and analytics-driven roadmaps. Owns a 12,000+ MAU analytics dashboard and a cross-functional pod; 22% churn reduction, 38% adoption lift. Trajectory points to Group PM.',
    negativeSignals: ['agency-side delivery roles'],
  };
}
