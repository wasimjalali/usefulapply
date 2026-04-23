import {
  JOB_FEED_ALLOWED_FIT_LABELS,
  JOB_FEED_PREFILTER_HARD_CAP,
} from '@/lib/job-feed/constants';
import type {
  JobFeedJobPreview,
  JobFeedPrefilterRejectReason,
  JobFeedPrefilterResult,
  JobFeedRankingPrepResult,
} from '@/lib/job-feed/types';
import type { JobFeedCanonicalJob, JobFeedSettings } from '@/lib/supabase/types';

const EMPTY_REJECTIONS: Record<JobFeedPrefilterRejectReason, number> = {
  location_mismatch: 0,
  remote_mismatch: 0,
  employment_type_mismatch: 0,
  salary_mismatch: 0,
  work_authorization_mismatch: 0,
  seniority_mismatch: 0,
};

const SENIORITY_RANK: Record<NonNullable<JobFeedSettings['seniority_target']>, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  manager: 4,
  staff: 5,
};

export function prefilterJobFeedJobs(params: {
  settings: JobFeedSettings;
  jobs: JobFeedCanonicalJob[];
}): JobFeedPrefilterResult {
  const { settings, jobs } = params;
  const rejectionsByReason = { ...EMPTY_REJECTIONS };
  const survivorsWithScores: Array<{ job: JobFeedCanonicalJob; score: number }> = [];

  for (const job of jobs) {
    const rejectReasons = getRejectReasons(job, settings);
    if (rejectReasons.length > 0) {
      for (const reason of new Set(rejectReasons)) {
        rejectionsByReason[reason] += 1;
      }
      continue;
    }

    survivorsWithScores.push({
      job,
      score: computeShortlistScore(job, settings),
    });
  }

  survivorsWithScores.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const freshnessDelta = compareNullableNumbers(left.job.freshness_days, right.job.freshness_days);
    if (freshnessDelta !== 0) {
      return freshnessDelta;
    }

    return right.job.last_seen_at.localeCompare(left.job.last_seen_at);
  });

  const survivors = survivorsWithScores.map((item) => item.job);
  const shortlist = survivors.slice(0, JOB_FEED_PREFILTER_HARD_CAP);

  return {
    survivors,
    survivorsPreview: survivors.slice(0, 10).map(toJobPreview),
    shortlist,
    shortlistPreview: shortlist.slice(0, 10).map(toJobPreview),
    rejectedCount: jobs.length - survivors.length,
    rejectionsByReason,
  };
}

export function prepareJobFeedRankingCandidates(jobs: JobFeedCanonicalJob[]): JobFeedRankingPrepResult {
  return {
    fitLabels: JOB_FEED_ALLOWED_FIT_LABELS,
    candidates: jobs.map((job) => ({
      jobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location_text,
      workMode: job.work_mode,
      employmentType: job.employment_type,
      salaryText: job.salary_text,
      description: job.description,
      applyUrl: job.apply_url,
      freshnessDays: job.freshness_days,
    })),
  };
}

function getRejectReasons(
  job: JobFeedCanonicalJob,
  settings: JobFeedSettings
): JobFeedPrefilterRejectReason[] {
  const reasons: JobFeedPrefilterRejectReason[] = [];

  if (hasEmploymentTypeMismatch(job, settings)) {
    reasons.push('employment_type_mismatch');
  }

  if (hasRemoteMismatch(job, settings)) {
    reasons.push('remote_mismatch');
  }

  if (hasLocationMismatch(job, settings)) {
    reasons.push('location_mismatch');
  }

  if (hasSalaryMismatch(job, settings)) {
    reasons.push('salary_mismatch');
  }

  if (hasWorkAuthorizationMismatch(job, settings)) {
    reasons.push('work_authorization_mismatch');
  }

  if (hasSeniorityMismatch(job, settings)) {
    reasons.push('seniority_mismatch');
  }

  return reasons;
}

function hasEmploymentTypeMismatch(job: JobFeedCanonicalJob, settings: JobFeedSettings): boolean {
  if (!job.employment_type) return false;
  return !settings.employment_types.includes(job.employment_type);
}

function hasRemoteMismatch(job: JobFeedCanonicalJob, settings: JobFeedSettings): boolean {
  if (settings.remote_preference === 'remote_only') {
    return job.work_mode !== 'remote';
  }

  if (settings.remote_preference === 'remote_first') {
    return job.work_mode === 'onsite' && !matchesPreferredLocation(job, settings.preferred_locations);
  }

  if (settings.remote_preference === 'onsite') {
    return job.work_mode === 'remote';
  }

  return false;
}

function hasLocationMismatch(job: JobFeedCanonicalJob, settings: JobFeedSettings): boolean {
  if (settings.preferred_locations.length === 0) return false;

  if (job.work_mode === 'remote' && settings.remote_preference !== 'onsite') {
    return false;
  }

  return !matchesPreferredLocation(job, settings.preferred_locations);
}

function hasSalaryMismatch(job: JobFeedCanonicalJob, settings: JobFeedSettings): boolean {
  if (!settings.salary_floor) return false;
  if (job.salary_max === null) return false;
  return job.salary_max < settings.salary_floor;
}

function hasWorkAuthorizationMismatch(job: JobFeedCanonicalJob, settings: JobFeedSettings): boolean {
  if (settings.work_authorization_status !== 'needs_sponsorship') {
    return false;
  }

  const searchableText = `${job.title} ${job.description ?? ''}`.toLowerCase();
  return [
    'no sponsorship',
    'without sponsorship',
    'unable to sponsor',
    'cannot sponsor',
    'must be authorized to work',
    'authorized to work in the us',
    'authorized to work in canada',
  ].some((pattern) => searchableText.includes(pattern));
}

function hasSeniorityMismatch(job: JobFeedCanonicalJob, settings: JobFeedSettings): boolean {
  if (!settings.seniority_target) return false;

  const inferredSeniority = inferSeniority(job.title);
  if (!inferredSeniority) return false;

  const targetRank = SENIORITY_RANK[settings.seniority_target];
  const jobRank = SENIORITY_RANK[inferredSeniority];

  return Math.abs(jobRank - targetRank) > 1;
}

function computeShortlistScore(job: JobFeedCanonicalJob, settings: JobFeedSettings): number {
  let score = 0;

  score += getRoleAlignmentScore(job.title, settings.target_roles, 28);
  if (settings.adjacent_roles_enabled) {
    score += getRoleAlignmentScore(job.title, settings.adjacent_roles, 14);
  }

  score += getFreshnessScore(job.freshness_days);
  score += getSalaryScore(job, settings);
  score += getRemoteAlignmentScore(job, settings);
  score += matchesPreferredLocation(job, settings.preferred_locations) ? 4 : 0;
  score += job.apply_url ? 2 : 0;
  score += job.employment_type ? 1 : 0;

  return score;
}

function getRoleAlignmentScore(title: string, roles: string[], baseScore: number): number {
  const normalizedTitle = normalizeText(title);
  let bestScore = 0;

  for (const role of roles) {
    const normalizedRole = normalizeText(role);
    if (!normalizedRole) continue;

    if (normalizedTitle === normalizedRole) {
      bestScore = Math.max(bestScore, baseScore);
      continue;
    }

    if (normalizedTitle.includes(normalizedRole) || normalizedRole.includes(normalizedTitle)) {
      bestScore = Math.max(bestScore, baseScore - 4);
      continue;
    }

    const roleTokens = normalizedRole.split(' ').filter(Boolean);
    const matchedTokens = roleTokens.filter((token) => normalizedTitle.includes(token)).length;

    if (matchedTokens === roleTokens.length && roleTokens.length > 0) {
      bestScore = Math.max(bestScore, baseScore - 6);
      continue;
    }

    if (matchedTokens > 0) {
      bestScore = Math.max(bestScore, baseScore - 12);
    }
  }

  return bestScore;
}

function getFreshnessScore(freshnessDays: number | null): number {
  if (freshnessDays === null) return 0;
  if (freshnessDays <= 1) return 15;
  if (freshnessDays <= 3) return 12;
  if (freshnessDays <= 7) return 9;
  if (freshnessDays <= 14) return 5;
  if (freshnessDays <= 30) return 2;
  return 0;
}

function getSalaryScore(job: JobFeedCanonicalJob, settings: JobFeedSettings): number {
  if (job.salary_min === null && job.salary_max === null) {
    return 0;
  }

  if (!settings.salary_floor) {
    return 3;
  }

  if (job.salary_max !== null && job.salary_max >= settings.salary_floor) {
    return 5;
  }

  if (job.salary_min !== null && job.salary_min >= settings.salary_floor) {
    return 4;
  }

  return 0;
}

function getRemoteAlignmentScore(job: JobFeedCanonicalJob, settings: JobFeedSettings): number {
  switch (settings.remote_preference) {
    case 'remote_only':
      return job.work_mode === 'remote' ? 8 : 0;
    case 'remote_first':
      if (job.work_mode === 'remote') return 6;
      if (job.work_mode === 'hybrid') return 4;
      return matchesPreferredLocation(job, settings.preferred_locations) ? 1 : 0;
    case 'hybrid':
      if (job.work_mode === 'hybrid') return 6;
      if (job.work_mode === 'remote') return 3;
      if (job.work_mode === 'onsite' && matchesPreferredLocation(job, settings.preferred_locations)) return 3;
      return 0;
    case 'onsite':
      if (job.work_mode === 'onsite') return 6;
      if (job.work_mode === 'hybrid') return 3;
      return 0;
    default:
      return job.work_mode !== 'unknown' ? 2 : 0;
  }
}

function matchesPreferredLocation(job: JobFeedCanonicalJob, preferredLocations: string[]): boolean {
  if (preferredLocations.length === 0) return false;

  return preferredLocations.some((location) => matchesLocation(job, location));
}

function matchesLocation(job: JobFeedCanonicalJob, preferredLocation: string): boolean {
  const normalizedPreference = normalizeText(preferredLocation);
  if (!normalizedPreference) return false;

  if (normalizedPreference.includes('remote')) {
    return job.work_mode === 'remote';
  }

  const normalizedJobLocation = normalizeText(job.location_text);
  if (!normalizedJobLocation) return false;

  return normalizedJobLocation.includes(normalizedPreference)
    || normalizedPreference.includes(normalizedJobLocation);
}

function inferSeniority(title: string): NonNullable<JobFeedSettings['seniority_target']> | null {
  const normalizedTitle = normalizeText(title);

  if (/(intern|internship|co op|coop)/.test(normalizedTitle)) return 'intern';
  if (/(junior|jr|entry level|associate)\b/.test(normalizedTitle)) return 'junior';
  if (/(staff|principal)\b/.test(normalizedTitle)) return 'staff';
  if (/(manager|management)\b/.test(normalizedTitle)) return 'manager';
  if (/(lead|head|director)\b/.test(normalizedTitle)) return 'lead';
  if (/(senior|sr)\b/.test(normalizedTitle)) return 'senior';
  if (/(mid|mid level|midlevel)\b/.test(normalizedTitle)) return 'mid';

  return null;
}

function toJobPreview(job: JobFeedCanonicalJob): JobFeedJobPreview {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location_text,
    workMode: job.work_mode,
    employmentType: job.employment_type,
    freshnessDays: job.freshness_days,
    applyUrl: job.apply_url,
  };
}

function normalizeText(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}
