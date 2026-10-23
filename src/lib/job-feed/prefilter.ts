import {
  JOB_FEED_ALLOWED_FIT_LABELS,
  JOB_FEED_PREFILTER_HARD_CAP,
} from '@/lib/job-feed/constants';
import type {
  JobFeedFitLabel,
  JobFeedJobPreview,
  JobFeedPrefilterRejectReason,
  JobFeedPrefilterResult,
  JobFeedRankingPrepResult,
} from '@/lib/job-feed/types';
import type { JobFeedCanonicalJob, JobFeedSettings } from '@/db/types';
import { collapseNearDuplicateJobs } from '@/lib/job-feed/helpers';

const EMPTY_REJECTIONS: Record<JobFeedPrefilterRejectReason, number> = {
  location_mismatch: 0,
  remote_mismatch: 0,
  employment_type_mismatch: 0,
  salary_mismatch: 0,
  work_authorization_mismatch: 0,
  seniority_mismatch: 0,
};

export function prefilterJobFeedJobs(params: {
  settings: JobFeedSettings;
  jobs: JobFeedCanonicalJob[];
  hardCap?: number;
}): JobFeedPrefilterResult {
  const { settings, jobs, hardCap = JOB_FEED_PREFILTER_HARD_CAP } = params;
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
      score: getShortlistScoreBreakdown(job, settings).totalScore,
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
  const shortlist = survivors.slice(0, hardCap);

  return {
    survivors,
    survivorsPreview: survivors.slice(0, 10).map(toJobPreview),
    shortlist,
    shortlistPreview: shortlist.slice(0, 10).map(toJobPreview),
    rejectedCount: jobs.length - survivors.length,
    rejectionsByReason,
  };
}

export function prepareJobFeedRankingCandidates(params: {
  settings: JobFeedSettings;
  jobs: JobFeedCanonicalJob[];
}): JobFeedRankingPrepResult {
  const { settings } = params;
  // Aggregators repost the same role under "Avetta" and "Avetta, LLC" or in
  // several cities. Collapse those before ranking so the feed shows one card.
  const { kept: jobs } = collapseNearDuplicateJobs(params.jobs);

  return {
    fitLabels: JOB_FEED_ALLOWED_FIT_LABELS,
    candidates: jobs.map((job, index) => {
      const scoreBreakdown = getShortlistScoreBreakdown(job, settings);

      return {
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
        deterministicRank: index + 1,
        deterministicScore: scoreBreakdown.totalScore,
        deterministicFitLabel: getDeterministicFitLabel(job, scoreBreakdown),
        scoreBreakdown: {
          targetRoleScore: scoreBreakdown.targetRoleScore,
          adjacentRoleScore: scoreBreakdown.adjacentRoleScore,
          freshnessScore: scoreBreakdown.freshnessScore,
          salaryScore: scoreBreakdown.salaryScore,
          remoteAlignmentScore: scoreBreakdown.remoteAlignmentScore,
          preferredLocationMatched: scoreBreakdown.preferredLocationMatched,
          hasApplyUrl: scoreBreakdown.hasApplyUrl,
          hasEmploymentType: scoreBreakdown.hasEmploymentType,
          skillOverlapScore: scoreBreakdown.skillOverlapScore,
        },
      };
    }),
  };
}

function getRejectReasons(
  job: JobFeedCanonicalJob,
  settings: JobFeedSettings
): JobFeedPrefilterRejectReason[] {
  // Only reject here on HARD user constraints the LLM shouldn't override:
  // explicit employment-type mismatch, explicit below-floor salary, and
  // explicit no-sponsorship language. Everything soft (remote preference,
  // seniority, location fit, role alignment) is now the LLM's job —
  // heuristic rejection costs quality more than LLM tokens save us.
  const reasons: JobFeedPrefilterRejectReason[] = [];

  if (hasEmploymentTypeMismatch(job, settings)) {
    reasons.push('employment_type_mismatch');
  }

  if (hasSalaryMismatch(job, settings)) {
    reasons.push('salary_mismatch');
  }

  if (hasWorkAuthorizationMismatch(job, settings)) {
    reasons.push('work_authorization_mismatch');
  }

  return reasons;
}

function hasEmploymentTypeMismatch(job: JobFeedCanonicalJob, settings: JobFeedSettings): boolean {
  if (!job.employment_type) return false;
  return !settings.employment_types.includes(job.employment_type);
}

function getEffectiveRemotePreferences(settings: JobFeedSettings): Array<JobFeedSettings['remote_preference']> {
  if (settings.remote_preferences && settings.remote_preferences.length > 0) {
    return settings.remote_preferences;
  }
  return [settings.remote_preference];
}

function hasSalaryMismatch(job: JobFeedCanonicalJob, settings: JobFeedSettings): boolean {
  // salary_floor is the user's non-negotiable MINIMUM salary. Only HARD-reject
  // when the job advertises a genuine RANGE whose top is still below that
  // minimum, i.e. no realistic negotiation bridges the gap.
  //
  // A single-value posting (salary_min === salary_max, e.g. "$60k") is
  // ambiguous: it may be a floor ("from $60k"), a ceiling ("up to $60k"), or a
  // typo. parseSalaryText cannot tell which, so we defer those to the LLM,
  // which reads the "from"/"up to"/"starting at" language in the description.
  // Absent salary (both null) = do not reject (candidate can negotiate).
  if (!settings.salary_floor) return false;
  if (job.salary_min === null || job.salary_max === null) return false;
  if (job.salary_min === job.salary_max) return false; // single value → LLM decides
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

function getShortlistScoreBreakdown(job: JobFeedCanonicalJob, settings: JobFeedSettings) {
  const targetRoleScore = getRoleAlignmentScore(job.title, settings.target_roles, 28);
  const adjacentRoleScore = 0;
  const freshnessScore = getFreshnessScore(job.freshness_days);
  const salaryScore = getSalaryScore(job, settings);
  const remoteAlignmentScore = getRemoteAlignmentScore(job, settings);
  const preferredLocationMatched = matchesPreferredLocation(job, settings.preferred_locations);
  const hasApplyUrl = Boolean(job.apply_url);
  const hasEmploymentType = Boolean(job.employment_type);
  const skillOverlapScore = getSkillOverlapScore(job, settings);

  return {
    targetRoleScore,
    adjacentRoleScore,
    freshnessScore,
    salaryScore,
    remoteAlignmentScore,
    preferredLocationMatched,
    hasApplyUrl,
    hasEmploymentType,
    skillOverlapScore,
    totalScore:
      targetRoleScore
      + adjacentRoleScore
      + freshnessScore
      + salaryScore
      + remoteAlignmentScore
      + skillOverlapScore
      + (preferredLocationMatched ? 4 : 0)
      + (hasApplyUrl ? 2 : 0)
      + (hasEmploymentType ? 1 : 0),
  };
}

function getDeterministicFitLabel(
  job: JobFeedCanonicalJob,
  scoreBreakdown: ReturnType<typeof getShortlistScoreBreakdown>
): JobFeedFitLabel {
  const hasHighRoleConfidence = scoreBreakdown.targetRoleScore >= 24 || (scoreBreakdown.targetRoleScore + scoreBreakdown.adjacentRoleScore) >= 30;
  const hasFreshEnoughSignal = job.freshness_days === null || job.freshness_days <= 14;
  const hasLocationOrRemoteConfidence = scoreBreakdown.remoteAlignmentScore >= 4 || scoreBreakdown.preferredLocationMatched;

  if (
    (scoreBreakdown.totalScore >= 46 && hasHighRoleConfidence && hasFreshEnoughSignal)
    || (scoreBreakdown.totalScore >= 54 && hasLocationOrRemoteConfidence)
  ) {
    return 'strong';
  }

  return 'good';
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
  const preferences = getEffectiveRemotePreferences(settings);
  return Math.max(
    0,
    ...preferences.map((preference) => scoreRemoteAlignmentForPreference(preference, job, settings)),
  );
}

function scoreRemoteAlignmentForPreference(
  preference: JobFeedSettings['remote_preference'],
  job: JobFeedCanonicalJob,
  settings: JobFeedSettings,
): number {
  switch (preference) {
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

function getSkillOverlapScore(job: JobFeedCanonicalJob, settings: JobFeedSettings): number {
  const userSkills = settings.user_skills;
  if (!userSkills || userSkills.length === 0) return 0;

  const jobText = normalizeText(`${job.title} ${job.description ?? ''}`);
  if (!jobText) return 0;

  let matchCount = 0;
  for (const skill of userSkills) {
    const normalizedSkill = normalizeText(skill);
    if (!normalizedSkill) continue;
    if (jobText.includes(normalizedSkill)) {
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;
  if (matchCount >= 6) return 12;
  if (matchCount >= 4) return 10;
  if (matchCount >= 2) return 7;
  return 4;
}

function matchesPreferredLocation(job: JobFeedCanonicalJob, preferredLocations: string[]): boolean {
  if (preferredLocations.length === 0) return false;

  return preferredLocations.some((location) => matchesLocation(job, location));
}

function matchesLocation(job: JobFeedCanonicalJob, preferredLocation: string): boolean {
  const normalizedPreference = normalizeText(preferredLocation);
  if (!normalizedPreference) return false;

  // Skip legacy "Remote (X)" chips saved on older profiles. Work mode is a soft
  // constraint the ranker reads off the description, so this string must not do
  // double duty as one.
  if (normalizedPreference.includes('remote')) {
    return false;
  }

  const normalizedJobLocation = normalizeText(job.location_text);
  if (!normalizedJobLocation) return false;

  return normalizedJobLocation.includes(normalizedPreference)
    || normalizedPreference.includes(normalizedJobLocation);
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
  // Keep Unicode letters/digits so non-Latin city names (São Paulo, Kraków,
  // 東京, 서울) still match against the user's preferred_locations input.
  // Collapse all other runs (punctuation, whitespace, separators) into a
  // single space so we can do substring/token matching.
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}
