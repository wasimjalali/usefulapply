/**
 * First-setup search plan: CV roles × chosen countries, capped at the
 * tier's main query budget. No LLM. City is a display/location hint only.
 */

import {
  JOB_FEED_COUNTRY_OPTIONS,
  countryForCity,
  getJobFeedTierLimits,
} from '@/lib/job-feed/constants';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import {
  SEARCH_STRATEGY_SCHEMA_VERSION,
  type SearchStrategy,
  type SearchStrategyQuery,
} from '@/lib/job-feed/search-strategy';

export interface ConfirmedSearchQuery {
  query: string;
  targetCountry: string;
  /** Display-only. Ingestion rotates the real hint after the plan. */
  cityHint?: string | null;
}

const ALLOWED_COUNTRIES = new Set<string>(JOB_FEED_COUNTRY_OPTIONS.map((option) => option.value));
const MAX_QUERY_LENGTH = 80;

export function planCapForTier(subscriptionTier: string | null | undefined): number {
  return getJobFeedTierLimits(subscriptionTier ?? 'plus').maxMainQueries;
}

/** Career-profile titles in stored order. Over-cap callers take the first N. */
export function rolesFromCareerProfile(profile: CareerProfile | null | undefined): string[] {
  if (!profile) return [];
  const seen = new Set<string>();
  const roles: string[] = [];
  for (const title of profile.inferredTitles) {
    const role = title.canonical.trim();
    const key = role.toLowerCase();
    if (!role || seen.has(key)) continue;
    seen.add(key);
    roles.push(role);
  }
  return roles;
}

export function rolesFromConfirmedQueries(queries: readonly ConfirmedSearchQuery[]): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  for (const row of queries) {
    const role = row.query.trim();
    const key = role.toLowerCase();
    if (!role || seen.has(key)) continue;
    seen.add(key);
    roles.push(role);
  }
  return roles;
}

/** Confirmed/client roles win. Existing saved roles next. Profile mirror last. */
export function resolveSavedTargetRoles(
  clientRoles: readonly string[],
  existingRoles: readonly string[] | null | undefined,
  mirroredRoles: readonly string[],
): string[] {
  const client = dedupeKeepOrder(clientRoles);
  if (client.length > 0) return client;
  const existing = dedupeKeepOrder(existingRoles ?? []);
  if (existing.length > 0) return existing;
  return dedupeKeepOrder(mirroredRoles);
}

/**
 * Role-major cartesian product (role × country), then the first `cap` rows.
 * Cities never add rows. A city is attached as a hint on the matching country.
 */
export function buildConfirmSearchPlan(params: {
  roles: readonly string[];
  countries: readonly string[];
  cities?: readonly string[];
  cap: number;
}): ConfirmedSearchQuery[] {
  const cap = Math.max(0, Math.floor(params.cap));
  if (cap <= 0) return [];
  const roles = dedupeKeepOrder(params.roles);
  const countries = dedupeKeepOrder(params.countries.map((code) => code.toLowerCase()))
    .filter((code) => ALLOWED_COUNTRIES.has(code));
  if (roles.length === 0 || countries.length === 0) return [];

  const citiesByCountry = indexCitiesByCountry(params.cities ?? [], countries);
  const countryRowIndex = new Map<string, number>();
  const rows: ConfirmedSearchQuery[] = [];

  for (const role of roles) {
    for (const country of countries) {
      if (rows.length >= cap) return rows;
      const n = countryRowIndex.get(country) ?? 0;
      countryRowIndex.set(country, n + 1);
      const hints = citiesByCountry.get(country) ?? [];
      rows.push({
        query: role,
        targetCountry: country,
        cityHint: hints.length > 0 ? hints[n % hints.length] : null,
      });
    }
  }

  return rows;
}

export function queriesFromSearchStrategy(strategy: SearchStrategy | null | undefined): ConfirmedSearchQuery[] {
  if (!strategy?.queries?.length) return [];
  return strategy.queries.map((entry) => ({
    query: entry.query,
    targetCountry: entry.targetCountry.toLowerCase(),
    cityHint: null,
  }));
}

/**
 * Settings save never calls generateSearchStrategy. First setup and later
 * edit persist the confirmed list. Daily runs reuse it.
 */
export function shouldGenerateStrategyOnSettingsSave(): boolean {
  return false;
}

export function resolveSearchStrategyMode(params: { userConfirmed: boolean }): 'reuse_confirmed' | 'generate' {
  return params.userConfirmed ? 'reuse_confirmed' : 'generate';
}

export function isUserConfirmedStrategy(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as { userConfirmed?: unknown }).userConfirmed === true;
}

export function isCitySkipLine(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, '');
  return /^(skip|none|no|no cities?|country only)$/.test(normalized);
}

export function validateConfirmedQueries(
  raw: unknown,
  cap: number,
): { ok: true; queries: ConfirmedSearchQuery[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: false, error: 'Confirm at least one search.' };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Confirm at least one search.' };
  }
  if (raw.length > cap) {
    return { ok: false, error: `That's more than ${cap} searches. Drop a row and try again.` };
  }

  const queries: ConfirmedSearchQuery[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: 'Each search needs a role and a country.' };
    }
    const record = entry as Record<string, unknown>;
    const query = typeof record.query === 'string' ? record.query.trim() : '';
    if (!query) {
      return { ok: false, error: 'Every search needs a role keyword.' };
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return { ok: false, error: 'That role keyword is too long.' };
    }
    const country = typeof record.targetCountry === 'string'
      ? record.targetCountry.trim().toLowerCase()
      : '';
    if (!ALLOWED_COUNTRIES.has(country)) {
      return { ok: false, error: 'Pick a country I search in.' };
    }
    queries.push({ query, targetCountry: country });
  }

  if (queries.length === 0) {
    return { ok: false, error: 'Confirm at least one search.' };
  }

  return { ok: true, queries: queries.slice(0, cap) };
}

export function buildUserConfirmedStrategy(params: {
  queries: readonly ConfirmedSearchQuery[];
  sourceProfileGeneratedAt?: string | null;
  negativeTerms?: string[];
}): SearchStrategy {
  const queries: SearchStrategyQuery[] = params.queries.map((row) => ({
    type: 'short_tail',
    query: row.query.trim(),
    targetCountry: row.targetCountry.toLowerCase(),
    rationale: 'Confirmed during setup.',
    expectedRecall: 'high',
    fallbackTo: null,
  }));

  return {
    version: SEARCH_STRATEGY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceProfileGeneratedAt: params.sourceProfileGeneratedAt ?? new Date().toISOString(),
    userConfirmed: true,
    queries,
    negativeTerms: params.negativeTerms ?? [],
  };
}

function dedupeKeepOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function indexCitiesByCountry(cities: readonly string[], countries: readonly string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const allowed = new Set(countries);
  const single = countries.length === 1 ? countries[0] : null;

  for (const raw of cities) {
    const city = raw.trim();
    if (!city) continue;
    const inferred = countryForCity(city);
    const match = inferred && allowed.has(inferred) ? inferred : single;
    if (!match || !allowed.has(match)) continue;
    const existing = result.get(match);
    if (existing) {
      if (!existing.includes(city)) existing.push(city);
    } else {
      result.set(match, [city]);
    }
  }
  return result;
}
