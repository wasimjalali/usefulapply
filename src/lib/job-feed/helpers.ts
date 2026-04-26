import {
  JOB_FEED_AGGRESSIVENESS_OPTIONS,
  JOB_FEED_COUNTRY_OPTIONS,
  JOB_FEED_DEFAULT_SETTINGS,
  JOB_FEED_EMPLOYMENT_TYPE_OPTIONS,
  JOB_FEED_MARKET_OPTIONS,
  JOB_FEED_REMOTE_PREFERENCE_OPTIONS,
  JOB_FEED_SENIORITY_OPTIONS,
  JOB_FEED_VISIBLE_DEFAULT_COUNT,
  JOB_FEED_WORK_AUTH_OPTIONS,
  PREMIUM_JOB_FEED_TIERS,
  legacyMarketFromCountries,
} from '@/lib/job-feed/constants';
import { splitCompositeRole } from '@/lib/job-feed/cv-suggestions';
import type { JobFeedOverviewState, JobFeedSettingsInput } from '@/lib/job-feed/types';
import type { JobFeedRun, JobFeedSettings } from '@/lib/supabase/types';

const MAX_LIST_ITEMS = 8;
const MAX_SKILLS_ITEMS = 50;
const MAX_ITEM_LENGTH = 80;

const MARKET_VALUES = new Set<string>(JOB_FEED_MARKET_OPTIONS.map((option) => option.value));
const COUNTRY_VALUES = new Set<string>(JOB_FEED_COUNTRY_OPTIONS.map((option) => option.value));
const REMOTE_VALUES = new Set<string>(JOB_FEED_REMOTE_PREFERENCE_OPTIONS.map((option) => option.value));
const SENIORITY_VALUES = new Set<string>(JOB_FEED_SENIORITY_OPTIONS.map((option) => option.value));
const EMPLOYMENT_TYPE_VALUES = new Set<string>(JOB_FEED_EMPLOYMENT_TYPE_OPTIONS.map((option) => option.value));
const WORK_AUTH_VALUES = new Set<string>(JOB_FEED_WORK_AUTH_OPTIONS.map((option) => option.value));
const AGGRESSIVENESS_VALUES = new Set<string>(JOB_FEED_AGGRESSIVENESS_OPTIONS.map((option) => option.value));
const PREMIUM_TIER_VALUES = new Set<string>(PREMIUM_JOB_FEED_TIERS);

export function canAccessJobFeed(subscriptionTier?: string | null): boolean {
  return Boolean(subscriptionTier && PREMIUM_TIER_VALUES.has(subscriptionTier));
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getTimeZoneParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get('year')),
    month: Number(lookup.get('month')),
    day: Number(lookup.get('day')),
    hour: Number(lookup.get('hour')),
  };
}

export function getLocalDateKey(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function isJobFeedConfigured(settings: JobFeedSettings | null): settings is JobFeedSettings {
  if (!settings) return false;

  return Boolean(
    settings.consent_accepted_at &&
    settings.user_timezone &&
    settings.target_market &&
    settings.target_roles.length > 0 &&
    settings.remote_preferences.length > 0 &&
    settings.employment_types.length > 0
  );
}

export function getJobFeedOverviewState(params: {
  canAccess: boolean;
  settings: JobFeedSettings | null;
  latestRun: JobFeedRun | null;
  jobsCount?: number;
}): JobFeedOverviewState {
  const { canAccess, settings, latestRun, jobsCount = 0 } = params;

  if (!canAccess) return 'upgrade_required';
  if (!isJobFeedConfigured(settings)) return 'setup_required';
  if (!settings.enabled) return 'paused';

  if (!latestRun) return 'awaiting_first_run';
  if (latestRun.status === 'queued' || latestRun.status === 'running') return 'generating';
  if (latestRun.status === 'failed') return 'error';
  if (jobsCount === 0) return 'empty';
  if (jobsCount < JOB_FEED_VISIBLE_DEFAULT_COUNT) return 'thin_feed';
  return 'ready';

}

export function createDefaultJobFeedInput(timeZone?: string): JobFeedSettingsInput {
  return {
    enabled: JOB_FEED_DEFAULT_SETTINGS.enabled,
    user_timezone: timeZone && isValidTimeZone(timeZone) ? timeZone : JOB_FEED_DEFAULT_SETTINGS.user_timezone,
    delivery_hour_local: JOB_FEED_DEFAULT_SETTINGS.delivery_hour_local,
    target_market: JOB_FEED_DEFAULT_SETTINGS.target_market,
    target_countries: [...JOB_FEED_DEFAULT_SETTINGS.target_countries],
    target_cities: [...JOB_FEED_DEFAULT_SETTINGS.target_cities],
    target_roles: [...JOB_FEED_DEFAULT_SETTINGS.target_roles],
    adjacent_roles_enabled: JOB_FEED_DEFAULT_SETTINGS.adjacent_roles_enabled,
    adjacent_roles: [...JOB_FEED_DEFAULT_SETTINGS.adjacent_roles],
    preferred_locations: [...JOB_FEED_DEFAULT_SETTINGS.preferred_locations],
    remote_preference: JOB_FEED_DEFAULT_SETTINGS.remote_preference,
    remote_preferences: [...JOB_FEED_DEFAULT_SETTINGS.remote_preferences] as JobFeedSettingsInput['remote_preferences'],
    salary_floor: JOB_FEED_DEFAULT_SETTINGS.salary_floor,
    languages: [...JOB_FEED_DEFAULT_SETTINGS.languages],
    seniority_target: JOB_FEED_DEFAULT_SETTINGS.seniority_target,
    seniority_targets: [...JOB_FEED_DEFAULT_SETTINGS.seniority_targets] as JobFeedSettingsInput['seniority_targets'],
    employment_types: [...JOB_FEED_DEFAULT_SETTINGS.employment_types] as JobFeedSettingsInput['employment_types'],
    work_authorization_status: JOB_FEED_DEFAULT_SETTINGS.work_authorization_status,
    aggressiveness: JOB_FEED_DEFAULT_SETTINGS.aggressiveness,
    user_skills: [],
    consent_accepted: false,
  };
}

export function toJobFeedInput(settings: JobFeedSettings | null, fallbackTimeZone?: string): JobFeedSettingsInput {
  if (!settings) {
    return createDefaultJobFeedInput(fallbackTimeZone);
  }

  // New array columns may be missing / empty on older rows — fall back to the
  // legacy singular columns so the UI has a sensible initial selection.
  const seniorityTargets = (settings.seniority_targets?.length ?? 0) > 0
    ? settings.seniority_targets
    : (settings.seniority_target ? [settings.seniority_target] : []);

  const remotePreferences = (settings.remote_preferences?.length ?? 0) > 0
    ? settings.remote_preferences
    : [settings.remote_preference];

  const targetCountries = (settings.target_countries?.length ?? 0) > 0
    ? settings.target_countries
    : marketToCountries(settings.target_market);

  return {
    enabled: settings.enabled,
    consent_accepted: Boolean(settings.consent_accepted_at),
    user_timezone: settings.user_timezone,
    delivery_hour_local: settings.delivery_hour_local,
    target_market: settings.target_market,
    target_countries: targetCountries,
    target_cities: settings.target_cities ?? [],
    target_roles: settings.target_roles,
    adjacent_roles_enabled: settings.adjacent_roles_enabled,
    adjacent_roles: settings.adjacent_roles,
    preferred_locations: settings.preferred_locations,
    remote_preference: settings.remote_preference,
    remote_preferences: remotePreferences as JobFeedSettingsInput['remote_preferences'],
    salary_floor: settings.salary_floor,
    languages: settings.languages.length > 0 ? settings.languages : ['English'],
    seniority_target: settings.seniority_target ?? JOB_FEED_DEFAULT_SETTINGS.seniority_target,
    seniority_targets: seniorityTargets as JobFeedSettingsInput['seniority_targets'],
    employment_types: settings.employment_types.length > 0
      ? settings.employment_types
      : [...JOB_FEED_DEFAULT_SETTINGS.employment_types] as JobFeedSettingsInput['employment_types'],
    work_authorization_status: settings.work_authorization_status ?? JOB_FEED_DEFAULT_SETTINGS.work_authorization_status,
    aggressiveness: settings.aggressiveness,
    user_skills: settings.user_skills ?? [],
  };
}

function marketToCountries(market: JobFeedSettings['target_market']): string[] {
  if (market === 'us') return ['us'];
  if (market === 'canada') return ['ca'];
  if (market === 'us_canada') return ['us', 'ca'];
  return ['us'];
}

export function normalizeJobFeedSettingsInput(input: unknown): { data?: JobFeedSettingsInput; error?: string } {
  if (!input || typeof input !== 'object') {
    return { error: 'Invalid job feed settings payload.' };
  }

  const payload = input as Record<string, unknown>;
  const userTimezone = asTrimmedString(payload.user_timezone, MAX_ITEM_LENGTH);
  if (!userTimezone || !isValidTimeZone(userTimezone)) {
    return { error: 'Please choose a valid timezone.' };
  }

  // target_countries is the new multi-select. target_market is kept as a
  // derived enum for backwards compatibility with older readers.
  const rawTargetCountries = sanitizeStringArray(payload.target_countries, 12)
    .map((value) => value.toLowerCase())
    .filter((value) => COUNTRY_VALUES.has(value));

  const targetCountries = rawTargetCountries.length > 0
    ? rawTargetCountries
    : (() => {
      // Fall back to deriving from legacy target_market if the client didn't send
      // the new field (e.g., stale client or tests).
      const legacyMarket = asTrimmedString(payload.target_market, MAX_ITEM_LENGTH);
      if (legacyMarket === 'us') return ['us'];
      if (legacyMarket === 'canada') return ['ca'];
      return ['us', 'ca'];
    })();

  if (targetCountries.length === 0) {
    return { error: 'Choose at least one country for your feed.' };
  }

  const targetMarket = legacyMarketFromCountries(targetCountries);
  if (!MARKET_VALUES.has(targetMarket)) {
    return { error: 'Please choose a supported target market.' };
  }

  const targetCities = sanitizeStringArray(payload.target_cities, 20);

  // remote_preferences multi-select — keep singular remote_preference as the
  // "primary" for legacy columns.
  const rawRemotePrefs = sanitizeStringArray(payload.remote_preferences)
    .filter((value) => REMOTE_VALUES.has(value)) as JobFeedSettingsInput['remote_preferences'];

  const singularRemote = asTrimmedString(payload.remote_preference, MAX_ITEM_LENGTH);
  const remotePreferences = rawRemotePrefs.length > 0
    ? rawRemotePrefs
    : (singularRemote && REMOTE_VALUES.has(singularRemote)
        ? [singularRemote] as JobFeedSettingsInput['remote_preferences']
        : []);

  if (remotePreferences.length === 0) {
    return { error: 'Choose at least one work mode preference.' };
  }

  const remotePreference = remotePreferences[0] as JobFeedSettingsInput['remote_preference'];

  // seniority_targets multi-select; seniority_target is the primary for legacy.
  const rawSeniorityTargets = sanitizeStringArray(payload.seniority_targets)
    .filter((value) => SENIORITY_VALUES.has(value)) as JobFeedSettingsInput['seniority_targets'];

  const singularSeniority = asOptionalTrimmedString(payload.seniority_target, MAX_ITEM_LENGTH);
  const seniorityTargets = rawSeniorityTargets.length > 0
    ? rawSeniorityTargets
    : (singularSeniority && SENIORITY_VALUES.has(singularSeniority)
        ? [singularSeniority] as JobFeedSettingsInput['seniority_targets']
        : []);

  const seniorityTarget = seniorityTargets[0] ?? null;

  const workAuthorizationStatus = asOptionalTrimmedString(payload.work_authorization_status, MAX_ITEM_LENGTH);
  if (workAuthorizationStatus && !WORK_AUTH_VALUES.has(workAuthorizationStatus)) {
    return { error: 'Please choose a valid work authorization status.' };
  }

  const aggressiveness = asTrimmedString(payload.aggressiveness, MAX_ITEM_LENGTH);
  if (!AGGRESSIVENESS_VALUES.has(aggressiveness)) {
    return { error: 'Please choose a valid aggressiveness level.' };
  }

  // Target roles get extra treatment: if a user pastes a composite string
  // like "AI Engineer | Product Builder", split it into separate queries so
  // SerpAPI doesn't try to match the entire literal as a job title.
  const targetRoles = sanitizeTargetRoles(payload.target_roles);
  if (targetRoles.length === 0) {
    return { error: 'Add at least one target role so Karko knows what to look for.' };
  }

  const employmentTypes = sanitizeStringArray(payload.employment_types).filter((value) => EMPLOYMENT_TYPE_VALUES.has(value)) as JobFeedSettingsInput['employment_types'];
  if (employmentTypes.length === 0) {
    return { error: 'Choose at least one employment type.' };
  }

  const languages = sanitizeStringArray(payload.languages);

  const deliveryHourLocal = asInteger(payload.delivery_hour_local);
  if (deliveryHourLocal === null || deliveryHourLocal < 0 || deliveryHourLocal > 23) {
    return { error: 'Delivery time must be an hour between 0 and 23.' };
  }

  const salaryFloor = asNullableInteger(payload.salary_floor);
  if (salaryFloor !== null && salaryFloor < 0) {
    return { error: 'Salary floor cannot be negative.' };
  }

  const userSkills = sanitizeStringArray(payload.user_skills, MAX_SKILLS_ITEMS);

  const data: JobFeedSettingsInput = {
    enabled: Boolean(payload.enabled),
    consent_accepted: Boolean(payload.consent_accepted),
    user_timezone: userTimezone,
    delivery_hour_local: deliveryHourLocal,
    target_market: targetMarket,
    target_countries: targetCountries,
    target_cities: targetCities,
    target_roles: targetRoles,
    adjacent_roles_enabled: Boolean(payload.adjacent_roles_enabled),
    adjacent_roles: sanitizeStringArray(payload.adjacent_roles),
    preferred_locations: sanitizeStringArray(payload.preferred_locations),
    remote_preference: remotePreference,
    remote_preferences: remotePreferences,
    salary_floor: salaryFloor,
    languages: languages.length > 0 ? languages : ['English'],
    seniority_target: seniorityTarget as JobFeedSettingsInput['seniority_target'],
    seniority_targets: seniorityTargets,
    employment_types: employmentTypes,
    work_authorization_status: (workAuthorizationStatus ?? null) as JobFeedSettingsInput['work_authorization_status'],
    aggressiveness: aggressiveness as JobFeedSettingsInput['aggressiveness'],
    user_skills: userSkills,
  };

  return { data };
}

function sanitizeStringArray(value: unknown, maxItems: number = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(value)) return [];

  const uniqueValues = new Set<string>();

  for (const item of value) {
    const normalized = asTrimmedString(item, MAX_ITEM_LENGTH);
    if (!normalized) continue;
    uniqueValues.add(normalized);
    if (uniqueValues.size >= maxItems) break;
  }

  return Array.from(uniqueValues);
}

// Target roles are free-form text that users (or the CV extractor) may supply
// as composite strings like "AI Engineer | Product Builder | Founder".
// Split every entry on common separators before deduping so each element ends
// up as a single searchable role.
function sanitizeTargetRoles(value: unknown, maxItems: number = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(value)) return [];

  const uniqueValues = new Set<string>();
  for (const item of value) {
    const normalized = asTrimmedString(item, MAX_ITEM_LENGTH * 4);
    if (!normalized) continue;
    const parts = splitCompositeRole(normalized);
    // If nothing splittable was found, keep the original (up to the normal max).
    const candidates = parts.length > 0 ? parts : [normalized.slice(0, MAX_ITEM_LENGTH)];
    for (const part of candidates) {
      const trimmed = part.slice(0, MAX_ITEM_LENGTH);
      if (!trimmed) continue;
      uniqueValues.add(trimmed);
      if (uniqueValues.size >= maxItems) break;
    }
    if (uniqueValues.size >= maxItems) break;
  }

  return Array.from(uniqueValues);
}

function asTrimmedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function asOptionalTrimmedString(value: unknown, maxLength: number): string | null {
  const normalized = asTrimmedString(value, maxLength);
  return normalized.length > 0 ? normalized : null;
}

function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function asNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return asInteger(value);
}
