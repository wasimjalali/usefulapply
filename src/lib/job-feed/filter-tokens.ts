/**
 * SerpAPI / Google Jobs filter-chip `uds` token cache.
 *
 * The `uds` parameter on Google Jobs encodes the active filter chip selection
 * ("Date posted: Past week", "Type: Full-time", etc.). The tokens are
 * locale-specific and undocumented, but they appear in every SerpAPI
 * response under `data.filters[].options[].uds`. We cache discovered tokens
 * by `(country, filter_name, option_label)` so subsequent runs can replay
 * them without re-discovering.
 *
 * Scope: read/write by the job-feed pipeline only. NEVER imported from
 * `src/lib/agents/**` (anti-hallucination boundary).
 */

import type { SerpApiFilter } from '@/lib/job-feed/serpapi';

/**
 * Markets where applying the date_posted filter consistently empties the
 * result set. Discovered empirically; refine as we get telemetry. Filter
 * chips are skipped for these markets and the unfiltered query runs alone.
 */
export const FILTER_CHIP_DISABLED_MARKETS = new Set<string>([
  'nz', 'ie', 'fi', 'no', 'sg', 'ae', 'hk', 'kr', 'tw',
]);

/**
 * Filter labels we actively apply. SerpAPI returns option_label in the
 * locale of the `hl` parameter, so the same option ("Past week") looks
 * different in DE / FR / ES. Each entry is matched case-insensitively
 * against `option.name` after trimming.
 */
export const DATE_POSTED_PAST_WEEK_LABELS = new Set<string>([
  'past week', 'past 7 days', '7 days', 'last week', 'last 7 days',
  'letzte woche', 'letzten 7 tage',          // de
  'derniere semaine', 'dernière semaine', '7 derniers jours', // fr
  'ultima semana', 'última semana', '7 ultimos dias', '7 últimos días', // es
  'ultima settimana', '7 giorni',            // it
  'afgelopen week', 'laatste 7 dagen',       // nl
  'ultima semana', 'últimos 7 dias',         // pt
]);

/**
 * Filter group names that mean "Date posted" across SerpAPI locales.
 * SerpAPI sometimes uses hyphens, sometimes spaces; lowercased + trimmed
 * before lookup.
 */
export const DATE_POSTED_FILTER_GROUP_NAMES = new Set<string>([
  'date posted', 'datum der veröffentlichung', 'datum der veroffentlichung',
  'date de publication', 'fecha de publicación', 'fecha de publicacion',
  'data di pubblicazione', 'datum geplaatst', 'data de publicação', 'data de publicacao',
  'opublikowano',
]);

export interface SerpApiFilterToken {
  countryCode: string;
  filterName: string;
  optionLabel: string;
  udsToken: string;
}

/**
 * Discover filter-chip tokens from a SerpAPI response payload. Returns the
 * tokens we want to persist (date_posted variants today; the table has
 * room to grow into other filter chips later).
 */
export function discoverFilterTokensFromResponse(params: {
  countryCode: string;
  filters: SerpApiFilter[] | undefined;
}): SerpApiFilterToken[] {
  const { countryCode, filters } = params;
  if (!filters || filters.length === 0) return [];

  const country = countryCode.toLowerCase().trim();
  if (!country) return [];

  const discovered: SerpApiFilterToken[] = [];
  for (const group of filters) {
    const groupName = (group.name ?? '').trim().toLowerCase();
    if (!DATE_POSTED_FILTER_GROUP_NAMES.has(groupName)) continue;
    if (!Array.isArray(group.options)) continue;

    for (const option of group.options) {
      const label = (option.name ?? option.q ?? '').trim().toLowerCase();
      if (!label || !option.uds) continue;
      // Persist all options inside the date_posted group, not just "past week".
      // Future plan changes may want "past 3 days" or "past 24 hours" as well.
      discovered.push({
        countryCode: country,
        filterName: groupName,
        optionLabel: label,
        udsToken: option.uds,
      });
    }
  }

  return discovered;
}

/**
 * Persist freshly-discovered tokens. Upserts on the composite primary key
 * so each call is idempotent. Uses the service role admin client passed
 * in by the caller (we don't import the admin module here to keep this
 * helper unit-test-friendly).
 */
export async function recordSerpApiFilterTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  admin: any,
  tokens: SerpApiFilterToken[],
): Promise<void> {
  if (tokens.length === 0) return;
  const rows = tokens.map((t) => ({
    country_code: t.countryCode,
    filter_name: t.filterName,
    option_label: t.optionLabel,
    uds_token: t.udsToken,
    last_seen_at: new Date().toISOString(),
  }));
  const { upsertSerpApiFilterTokens } = await import('@/db/repos/admin');
  try {
    await upsertSerpApiFilterTokens(rows);
  } catch (error) {
    console.error('[filter-tokens] upsert error:', error instanceof Error ? error.message : error);
  }
}

/**
 * Load the "Past week" date_posted token for a set of countries. Returns
 * a map keyed by countryCode (lowercase). Countries with no cached token
 * are absent from the map; the caller's planner skips the filter for them.
 */
export async function loadDatePostedPastWeekTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  admin: any,
  countryCodes: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (countryCodes.length === 0) return result;

  const normalized = [...new Set(countryCodes.map((c) => c.toLowerCase().trim()).filter(Boolean))];
  if (normalized.length === 0) return result;

  const { loadSerpApiFilterTokens } = await import('@/db/repos/admin');
  let data: Array<{ country_code: string; option_label: string; uds_token: string }> = [];
  try {
    data = await loadSerpApiFilterTokens(normalized, [...DATE_POSTED_FILTER_GROUP_NAMES]);
  } catch (error) {
    console.error('[filter-tokens] load error:', error instanceof Error ? error.message : error);
    return result;
  }

  for (const row of data ?? []) {
    const countryRow = (row.country_code as string).toLowerCase();
    const labelRow = (row.option_label as string).toLowerCase();
    if (!DATE_POSTED_PAST_WEEK_LABELS.has(labelRow)) continue;
    // Don't overwrite a token already chosen for this country — the first
    // hit wins. SerpAPI's locale rotation occasionally emits multiple
    // semantically-equivalent labels (e.g. "past 7 days" and "past week");
    // either is fine to use.
    if (!result.has(countryRow)) {
      result.set(countryRow, row.uds_token as string);
    }
  }

  return result;
}
