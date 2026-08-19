/**
 * Plain-language feed requests, mapped onto the settings fields the feed
 * already has. Pure functions: no fetching, no store access, so the
 * conversation can price and confirm a change before it writes anything.
 *
 * What this does NOT do is re-run the search. One run per local day is the
 * hard rule, so a request lands as (1) a saved preference the next run uses
 * and (2) a filter on the list already on screen. The conversation says both.
 */

import type { JobFeedSettingsInput } from '@/lib/job-feed/types';

export type FeedIntentKind =
  | 'remote_only'
  | 'salary_floor'
  | 'exclude_term'
  | 'add_city'
  | 'unknown';

export interface FeedIntent {
  kind: FeedIntentKind;
  /** Settings patch to save. Empty for 'unknown'. */
  patch: Partial<JobFeedSettingsInput>;
  /** Terms to hide from the list on screen right now. */
  excludeFromList: string[];
  /** True when the list on screen should drop non-remote roles. */
  remoteOnly: boolean;
  /** Salary floor to apply to the list on screen. */
  minSalary: number | null;
  /** One line the assistant says back, without the counts (added by caller). */
  confirmation: string;
}

const UNKNOWN: FeedIntent = {
  kind: 'unknown',
  patch: {},
  excludeFromList: [],
  remoteOnly: false,
  minSalary: null,
  confirmation: '',
};

/** Words that mean "get rid of these", used to find the term after them. */
const DROP_VERBS = /\b(?:no|drop|avoid|exclude|hide|skip|without|not)\b\s+(.{2,40}?)(?:\s+(?:roles?|jobs?|please|thanks)\b|[.,!?]|$)/i;

const CITY_ADD = /\b(?:add|include|also search|search)\s+(?:in\s+)?([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2})\b/;

/**
 * Read a salary figure out of a request. Accepts "150k", "$150,000",
 * "150 000", "180K+". Returns null when the number is not a plausible
 * yearly salary, so "no agencies" never lands as a salary change.
 */
export function readSalaryFloor(text: string): number | null {
  const match = text.match(/(?:\$\s*)?(\d[\d,. ]*)\s*(k\b|000\b)?/i);
  if (!match) return null;
  const raw = Number(match[1].replace(/[,\s]/g, ''));
  if (!Number.isFinite(raw)) return null;
  const value = /^k$/i.test(match[2] ?? '') ? raw * 1000 : raw;
  if (value < 10_000 || value > 2_000_000) return null;
  return Math.round(value);
}

export function detectFeedIntent(text: string): FeedIntent {
  const input = text.trim();
  if (!input) return UNKNOWN;
  const lower = input.toLowerCase();

  if (/\b(only remote|remote only|remote just|just remote|fully remote|remote roles only)\b/.test(lower)) {
    return {
      kind: 'remote_only',
      patch: { remote_preference: 'remote_only', remote_preferences: ['remote_only'] },
      excludeFromList: [],
      remoteOnly: true,
      minSalary: null,
      confirmation: 'Remote only from now on.',
    };
  }

  if (/\b(salary|pay|comp|compensation|floor|minimum|at least|more than)\b/.test(lower)) {
    const floor = readSalaryFloor(input);
    if (floor !== null) {
      return {
        kind: 'salary_floor',
        patch: { salary_floor: floor },
        excludeFromList: [],
        remoteOnly: false,
        minSalary: floor,
        confirmation: `Salary floor is now ${formatSalary(floor)}.`,
      };
    }
  }

  const dropMatch = input.match(DROP_VERBS);
  if (dropMatch) {
    const term = cleanTerm(dropMatch[1]);
    if (term) {
      return {
        kind: 'exclude_term',
        patch: {},
        excludeFromList: [term],
        remoteOnly: false,
        minSalary: null,
        confirmation: `I'll leave "${term}" out.`,
      };
    }
  }

  const cityMatch = input.match(CITY_ADD);
  if (cityMatch) {
    const city = cleanTerm(cityMatch[1]);
    if (city) {
      return {
        kind: 'add_city',
        patch: {},
        excludeFromList: [],
        remoteOnly: false,
        minSalary: null,
        confirmation: `${city} is in the search now.`,
      };
    }
  }

  return UNKNOWN;
}

/**
 * Fold an intent into the settings payload the PUT expects. Array fields are
 * merged, not replaced, so "no agencies" then "drop Group PM" keeps both.
 */
export function applyFeedIntent(
  current: JobFeedSettingsInput,
  intent: FeedIntent,
  cityFromIntent?: string,
): JobFeedSettingsInput {
  const next: JobFeedSettingsInput = { ...current, ...intent.patch };

  if (intent.excludeFromList.length > 0) {
    const merged = new Set([...(current.excluded_terms ?? [])]);
    for (const term of intent.excludeFromList) merged.add(term);
    next.excluded_terms = Array.from(merged);
  }

  if (intent.kind === 'add_city' && cityFromIntent) {
    const merged = new Set([...(current.target_cities ?? []), cityFromIntent]);
    next.target_cities = Array.from(merged);
  }

  return next;
}

export function formatSalary(value: number): string {
  if (value >= 1000 && value % 1000 === 0) return `$${value / 1000}K`;
  return `$${value.toLocaleString('en-US')}`;
}

function cleanTerm(value: string): string {
  return value
    .replace(/["'`]/g, '')
    .replace(/\b(roles?|jobs?|positions?|listings?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
