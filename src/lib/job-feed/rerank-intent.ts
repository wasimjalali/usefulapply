/**
 * Plain-language feed requests, mapped onto the settings fields the feed
 * already has. Pure functions: no fetching, no store access, so the
 * conversation can price and confirm a change before it writes anything.
 *
 * What this does NOT do is re-run the search. One run per local day is the
 * hard rule, so a request lands as (1) a saved preference the next run uses
 * and (2) a filter on the list already on screen. The conversation says both.
 */

import {
  JOB_FEED_COUNTRY_OPTIONS,
  legacyMarketFromCountries,
  matchCountriesInText,
} from '@/lib/job-feed/constants';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';

export type FeedIntentKind =
  | 'remote_only'
  | 'salary_floor'
  | 'exclude_term'
  | 'add_city'
  | 'add_country'
  | 'remove_country'
  | 'set_countries'
  | 'unsupported_country'
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
  /** Country codes for add/remove/set country intents. */
  countries: string[];
  /** Country name the user typed but the feed doesn't cover, for an honest reply. */
  unsupportedCountry: string | null;
}

const UNKNOWN: FeedIntent = {
  kind: 'unknown',
  patch: {},
  excludeFromList: [],
  remoteOnly: false,
  minSalary: null,
  confirmation: '',
  countries: [],
  unsupportedCountry: null,
};

/** Words that mean "get rid of these", used to find the term after them. */
const DROP_VERBS = /\b(?:no|drop|avoid|exclude|hide|skip|without|not|remove|delete)\b\s+(.{2,40}?)(?:\s+(?:roles?|jobs?|please|thanks)\b|[.,!?]|$)/i;

const CITY_ADD = /\b(?:add|include|also search|search)\s+(?:in\s+)?([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2})\b/;

/** Case-insensitive add/include, checked before CITY_ADD so country names work regardless of casing. */
const ADD_RE = /\b(?:add|include|also\s+search(?:\s+in)?|search(?:\s+in)?)\s+(?:in\s+)?(.+)/i;

/** "only US", "just US" — replace the country list. "only remote" is caught earlier. */
const ONLY_RE = /\b(?:only|just)\s+(?:search\s+)?(?:in\s+)?(.+)/i;

/** Common country names the feed does not cover yet, so "add Japan" gets an honest reply. */
const UNSUPPORTED_COUNTRY_NAMES: ReadonlySet<string> = new Set([
  'japan', 'china', 'brazil', 'mexico', 'russia', 'south korea', 'korea',
  'argentina', 'czech republic', 'czechia', 'portugal', 'greece', 'turkey',
  'israel', 'saudi arabia', 'qatar', 'thailand', 'vietnam', 'malaysia',
  'indonesia', 'philippines', 'hong kong', 'taiwan', 'egypt', 'morocco',
  'nigeria', 'kenya', 'colombia', 'chile', 'romania', 'bulgaria', 'hungary',
  'slovakia', 'croatia', 'serbia', 'lithuania', 'latvia', 'estonia',
  'iceland', 'luxembourg', 'malta', 'cyprus', 'slovenia',
]);

/**
 * Read a salary figure out of a request. Accepts "150k", "$150,000",
 * "150 000", "180K+". Returns null when the number is not a plausible
 * yearly salary, so "no agencies" never lands as a salary change.
 */
export function readSalaryFloor(text: string): number | null {
  const matches = text.matchAll(/(?:\$\s*)?(\d[\d,. ]*)\s*(k\b|000\b)?/gi);
  for (const match of matches) {
    const raw = Number(match[1].replace(/[,\s]/g, ''));
    if (!Number.isFinite(raw)) continue;
    const value = /^k$/i.test(match[2] ?? '') ? raw * 1000 : raw;
    if (value >= 10_000 && value <= 2_000_000) return Math.round(value);
  }
  return null;
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
      countries: [],
      unsupportedCountry: null,
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
        countries: [],
        unsupportedCountry: null,
      };
    }
  }

  // Drop verbs: "remove Canada" is a country removal, "no agencies" is a term
  // exclusion. The difference is whether the captured word is a country.
  const dropMatch = input.match(DROP_VERBS);
  if (dropMatch) {
    const term = cleanTerm(dropMatch[1]);
    if (term) {
      const countries = matchCountriesInText(term);
      if (countries.length > 0) {
        return {
          kind: 'remove_country',
          patch: {},
          excludeFromList: [],
          remoteOnly: false,
          minSalary: null,
          countries,
          unsupportedCountry: null,
          confirmation: `${countryNameList(countries)} ${countries.length === 1 ? 'is' : 'are'} out. The next run won't search ${countries.length === 1 ? 'it' : 'them'}.`,
        };
      }
      const unsupported = matchUnsupportedCountry(term);
      if (unsupported) {
        return {
          ...UNKNOWN,
          kind: 'unsupported_country',
          unsupportedCountry: unsupported,
          confirmation: `The feed doesn't cover ${unsupported} yet.`,
        };
      }
      return {
        kind: 'exclude_term',
        patch: {},
        excludeFromList: [term],
        remoteOnly: false,
        minSalary: null,
        confirmation: `I'll leave "${term}" out.`,
        countries: [],
        unsupportedCountry: null,
      };
    }
  }

  // Add: "add Germany" is a country add (case-insensitive). "add Berlin" is a
  // city add (the CITY_ADD regex below requires an uppercase first letter).
  const addMatch = input.match(ADD_RE);
  if (addMatch) {
    const term = cleanTerm(addMatch[1]);
    if (term) {
      const countries = matchCountriesInText(term);
      if (countries.length > 0) {
        return {
          kind: 'add_country',
          patch: {},
          excludeFromList: [],
          remoteOnly: false,
          minSalary: null,
          countries,
          unsupportedCountry: null,
          confirmation: `${countryNameList(countries)} ${countries.length === 1 ? 'is' : 'are'} in the search now.`,
        };
      }
      const unsupported = matchUnsupportedCountry(term);
      if (unsupported) {
        return {
          ...UNKNOWN,
          kind: 'unsupported_country',
          unsupportedCountry: unsupported,
          confirmation: `The feed doesn't cover ${unsupported} yet.`,
        };
      }
      // Fall through to CITY_ADD for city names.
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
        countries: [],
        unsupportedCountry: null,
      };
    }
  }

  // "only US" / "just US" — replace the country list.
  const onlyMatch = input.match(ONLY_RE);
  if (onlyMatch) {
    const term = cleanTerm(onlyMatch[1]);
    if (term) {
      const countries = matchCountriesInText(term);
      if (countries.length > 0) {
        return {
          kind: 'set_countries',
          patch: {},
          excludeFromList: [],
          remoteOnly: false,
          minSalary: null,
          countries,
          unsupportedCountry: null,
          confirmation: `Only ${countryNameList(countries)} from now on.`,
        };
      }
      const unsupported = matchUnsupportedCountry(term);
      if (unsupported) {
        return {
          ...UNKNOWN,
          kind: 'unsupported_country',
          unsupportedCountry: unsupported,
          confirmation: `The feed doesn't cover ${unsupported} yet.`,
        };
      }
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

  if (intent.kind === 'add_country' && intent.countries.length > 0) {
    const merged = new Set([...(current.target_countries ?? []), ...intent.countries]);
    next.target_countries = Array.from(merged);
    next.target_market = legacyMarketFromCountries(next.target_countries);
  }

  if (intent.kind === 'remove_country' && intent.countries.length > 0) {
    const removeSet = new Set(intent.countries);
    const remaining = (current.target_countries ?? []).filter((c) => !removeSet.has(c));
    // The caller refuses before saving when this would empty the list. If we
    // still get here with nothing left, keep the original to avoid writing an
    // invalid row.
    if (remaining.length > 0) {
      next.target_countries = remaining;
      next.target_market = legacyMarketFromCountries(remaining);
    }
  }

  if (intent.kind === 'set_countries' && intent.countries.length > 0) {
    next.target_countries = [...intent.countries];
    next.target_market = legacyMarketFromCountries(next.target_countries);
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

function countryName(code: string): string {
  return JOB_FEED_COUNTRY_OPTIONS.find((option) => option.value === code)?.label ?? code.toUpperCase();
}

function countryNameList(codes: string[]): string {
  return codes.map(countryName).join(' and ');
}

function matchUnsupportedCountry(text: string): string | null {
  const lower = ` ${text.toLowerCase().replace(/[,/]/g, ' ')} `;
  for (const name of UNSUPPORTED_COUNTRY_NAMES) {
    if (lower.includes(` ${name} `)) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}
