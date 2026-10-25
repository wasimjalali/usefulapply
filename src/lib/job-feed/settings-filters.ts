/**
 * The feed settings a job must meet to reach the feed, enforced by the server after ranking and again
 * when the inbox is read (so a settings change applies at once).
 *
 * The facts come from the ranker, which reads the ad itself (`workMode` and `seniorityLevels` in its
 * answer), or from the stored work mode when the ranker is down. A fact the ad does not state is unknown,
 * and an unknown never removes a job: a missing fact is not a mismatch.
 */

import type { JobFeedSettings } from '@/db/types';
import { normalizeCompanyForDedupe } from '@/lib/job-feed/helpers';

export type ReadWorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export const SENIORITY_LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager'] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

/**
 * The work modes each preference accepts. Onsite is accepted only by "onsite" and "flexible": a user who
 * left both out does not want onsite roles, wherever they are.
 */
const MODES_BY_PREFERENCE: Record<string, ReadonlyArray<Exclude<ReadWorkMode, 'unknown'>>> = {
  remote_only: ['remote'],
  remote_first: ['remote', 'hybrid'],
  hybrid: ['hybrid', 'remote'],
  onsite: ['onsite', 'hybrid'],
  flexible: ['remote', 'hybrid', 'onsite'],
};

export function allowedWorkModes(settings: Pick<JobFeedSettings, 'remote_preferences' | 'remote_preference'>): Set<string> {
  const preferences = settings.remote_preferences?.length ? settings.remote_preferences : [settings.remote_preference];
  return new Set(preferences.flatMap((preference) => MODES_BY_PREFERENCE[preference] ?? ['remote', 'hybrid', 'onsite']));
}

export function workModeAllowed(mode: string | null | undefined, settings: Pick<JobFeedSettings, 'remote_preferences' | 'remote_preference'>): boolean {
  if (!mode || mode === 'unknown') return true;
  return allowedWorkModes(settings).has(mode);
}

function seniorityTargets(settings: Pick<JobFeedSettings, 'seniority_targets' | 'seniority_target'>): string[] {
  if (settings.seniority_targets?.length) return settings.seniority_targets;
  return settings.seniority_target ? [settings.seniority_target] : [];
}

/** True when the ad is open to one of the chosen levels, or does not say, or no level is chosen. */
export function seniorityAllowed(levels: readonly string[] | null | undefined, settings: Pick<JobFeedSettings, 'seniority_targets' | 'seniority_target'>): boolean {
  const targets = seniorityTargets(settings);
  if (targets.length === 0 || !levels || levels.length === 0) return true;
  return levels.some((level) => targets.includes(level));
}

export function asReadWorkMode(value: unknown): ReadWorkMode {
  return value === 'remote' || value === 'hybrid' || value === 'onsite' ? value : 'unknown';
}

export function asSeniorityLevels(value: unknown): SeniorityLevel[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((level): level is SeniorityLevel => (SENIORITY_LEVELS as readonly string[]).includes(level)))];
}

// ---------------------------------------------------------------------------
// Jobs already in the tracker
// ---------------------------------------------------------------------------

/**
 * A job title as one key: lowercase, gender tags such as "(m/w/d)" or "(f/m/x)" and "- Vollzeit"-style
 * suffixes in parentheses removed, punctuation folded to spaces.
 */
export function normalizeTrackerTitle(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\((?:\s*[mwfdxi]\s*\/){1,3}\s*[mwfdxi]\s*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The title before a " - ", " — ", " | " or " / " tagline: "Applied AI Engineer — Build Legal AI Systems". */
function titleHead(value: string | null | undefined): string {
  const head = (value ?? '').split(/\s[-–—|]\s/)[0];
  return normalizeTrackerTitle(head);
}

export interface TrackerApplication {
  id: string;
  company: string | null;
  job_title: string | null;
}

/**
 * Keys of the applications a user already has, for matching feed jobs by company and title. A job matches
 * when the company is the same (legal suffixes ignored) and either the whole title or its part before a
 * tagline is the same.
 */
export function buildTrackerIndex(applications: readonly TrackerApplication[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const application of applications) {
    const company = normalizeCompanyForDedupe(application.company);
    if (!company) continue;
    for (const title of new Set([normalizeTrackerTitle(application.job_title), titleHead(application.job_title)])) {
      if (!title) continue;
      const key = `${company}|${title}`;
      const ids = index.get(key) ?? new Set<string>();
      ids.add(application.id);
      index.set(key, ids);
    }
  }
  return index;
}

/**
 * Whether the job is already in the tracker through an application other than `ownApplicationId` (the one
 * the feed itself created for this job, which must not hide its own card).
 */
export function inTracker(
  job: { company: string; title: string },
  index: Map<string, Set<string>>,
  ownApplicationId: string | null = null,
): boolean {
  const company = normalizeCompanyForDedupe(job.company);
  if (!company) return false;
  for (const title of new Set([normalizeTrackerTitle(job.title), titleHead(job.title)])) {
    const ids = title ? index.get(`${company}|${title}`) : undefined;
    if (ids && [...ids].some((id) => id !== ownApplicationId)) return true;
  }
  return false;
}
