import { createAdminClient } from '@/lib/supabase/admin';
import {
  JOB_FEED_COUNTRY_OPTIONS,
  JOB_FEED_MARKET_COUNTRIES,
  JOB_FEED_MAX_DAILY_QUERIES,
  JOB_FEED_MAX_RAW_JOBS_PER_RUN,
  JOB_FEED_PROVIDER,
} from '@/lib/job-feed/constants';
import { splitCompositeRole } from '@/lib/job-feed/cv-suggestions';
import type { SearchStrategy } from '@/lib/job-feed/search-strategy';
import {
  buildSerpApiSearchParams,
  fetchSerpApiJobs,
  isSerpApiNoResultsError,
  normalizeSerpApiJob,
  serializeSearchParams,
  SerpApiHttpError,
  toSerpApiGl,
  type NormalizedSerpApiJob,
} from '@/lib/job-feed/serpapi';
import {
  discoverFilterTokensFromResponse,
  FILTER_CHIP_DISABLED_MARKETS,
  loadDatePostedPastWeekTokens,
  recordSerpApiFilterTokens,
} from '@/lib/job-feed/filter-tokens';
import type {
  JobFeedIngestionFailure,
  JobFeedIngestionResult,
  JobFeedJobPreview,
  JobFeedSearchPlanItem,
} from '@/lib/job-feed/types';
import type {
  InsertTables,
  JobFeedCanonicalJob,
  JobFeedSettings,
  Json,
  UpdateTables,
} from '@/lib/supabase/types';

interface ObservedNormalizedJob {
  draft: NormalizedSerpApiJob;
  rawFetchId: string;
  observedAt: string;
}

interface AggregatedNormalizedJob {
  draft: NormalizedSerpApiJob;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastRawFetchId: string;
}

export function buildJobFeedSearchPlan(settings: JobFeedSettings, maxQueries: number = JOB_FEED_MAX_DAILY_QUERIES): JobFeedSearchPlanItem[] {
  if (maxQueries <= 0) {
    return [];
  }

  // Prefer the new target_countries multi-select; fall back to the legacy
  // market enum if a row hasn't been migrated yet.
  const selectedCountries = (settings.target_countries && settings.target_countries.length > 0)
    ? settings.target_countries
    : Array.from(JOB_FEED_MARKET_COUNTRIES[settings.target_market] || JOB_FEED_MARKET_COUNTRIES.us_canada);
  const countries = (selectedCountries.length > 0 ? selectedCountries : ['us']).slice(0, maxQueries);

  const maxRoles = Math.max(1, Math.floor(maxQueries / countries.length));

  const selectedRoles = dedupeRoles(settings.target_roles).slice(0, maxRoles);
  const language = pickQueryLanguage(settings);
  const locationsByCountry = indexLocationsByCountry(
    [...(settings.preferred_locations ?? []), ...(settings.target_cities ?? [])],
    countries,
  );

  const plan: JobFeedSearchPlanItem[] = [];
  for (let roleIndex = 0; roleIndex < selectedRoles.length; roleIndex += 1) {
    const role = selectedRoles[roleIndex];
    for (const country of countries) {
      const cities = locationsByCountry.get(country) ?? [];
      // Rotate through the user's cities so each query targets a different
      // city. With more roles than cities we cycle; with more cities than
      // roles the later ones are dropped naturally when we hit maxQueries.
      const location = cities.length > 0
        ? cities[roleIndex % cities.length]
        : null;

      plan.push({
        query: role,
        targetRole: role,
        market: settings.target_market,
        country: country as JobFeedSearchPlanItem['country'],
        language,
        location,
        queryType: null,
        expectedRecall: null,
        fallbackToIndex: null,
        isFallbackRetry: false,
        filterTokens: [],
      });
    }
  }

  return plan.slice(0, maxQueries);
}

function indexLocationsByCountry(locations: string[], selectedCountries: string[]): Map<string, string[]> {
  // Location strings are free-form (e.g. "Berlin, Germany", "New York, NY",
  // "Tokyo", "São Paulo"). We infer country from the string itself; if that
  // fails AND the user has only one country selected, we assume all location
  // strings belong to that country. Returns every matching location per
  // country so the search plan can rotate across cities instead of pinning
  // every query to the first one.
  const result = new Map<string, string[]>();
  const allowed = new Set(selectedCountries.map((c) => c.toLowerCase()));
  const singleCountry = selectedCountries.length === 1 ? selectedCountries[0].toLowerCase() : null;

  for (const rawLocation of locations) {
    const location = rawLocation.trim();
    if (!location) continue;
    const inferred = inferCountryForLocation(location);
    const match = inferred ?? singleCountry;
    if (!match || !allowed.has(match)) continue;

    const existing = result.get(match);
    if (existing) {
      if (!existing.includes(location)) existing.push(location);
    } else {
      result.set(match, [location]);
    }
  }
  return result;
}

function inferCountryForLocation(location: string): string | null {
  // First try the legacy "(Remote (XX))" or US-state heuristics.
  const legacy = inferCountryForCity(location);
  if (legacy) return legacy;

  // Then look for an explicit country name or code in the trailing segment
  // after the last comma (e.g. "Berlin, Germany" → "germany" → "de").
  const normalized = location.toLowerCase();
  const segments = normalized.split(',').map((s) => s.trim()).filter(Boolean);
  const tail = segments[segments.length - 1];
  if (!tail) return null;

  // Match against curated country options (labels + codes).
  for (const option of JOB_FEED_COUNTRY_OPTIONS) {
    if (tail === option.value) return option.value;
    if (tail === option.label.toLowerCase()) return option.value;
  }

  // Common aliases.
  const aliases: Record<string, string> = {
    'usa': 'us',
    'u.s.': 'us',
    'u.s.a.': 'us',
    'united states': 'us',
    'uk': 'gb',
    'great britain': 'gb',
    'england': 'gb',
    'scotland': 'gb',
    'wales': 'gb',
    'deutschland': 'de',
    'holland': 'nl',
    'uae': 'ae',
  };
  return aliases[tail] ?? null;
}

function inferCountryForCity(city: string): string | null {
  const normalized = city.toLowerCase();
  if (normalized.includes('(us)') || /, (ny|ca|tx|wa|il|ma|co|ga|az|fl|pa|nc|oh)\b/i.test(city)) return 'us';
  if (normalized.includes('(canada)') || /, (on|bc|qc|ab)\b/i.test(city)) return 'ca';
  if (normalized.includes('(uk)') || ['london', 'manchester', 'edinburgh', 'bristol', 'cambridge'].some((c) => normalized.includes(c))) return 'gb';
  if (normalized.includes('(ireland)') || ['dublin', 'cork', 'galway'].some((c) => normalized.includes(c))) return 'ie';
  if (normalized.includes('(germany)') || ['berlin', 'munich', 'hamburg', 'frankfurt', 'cologne'].some((c) => normalized.includes(c))) return 'de';
  if (normalized.includes('(netherlands)') || ['amsterdam', 'rotterdam', 'utrecht', 'the hague'].some((c) => normalized.includes(c))) return 'nl';
  if (normalized.includes('(france)') || ['paris', 'lyon', 'toulouse'].some((c) => normalized.includes(c))) return 'fr';
  if (normalized.includes('(spain)') || ['madrid', 'barcelona', 'valencia'].some((c) => normalized.includes(c))) return 'es';
  if (normalized.includes('(italy)') || ['milan', 'rome', 'turin'].some((c) => normalized.includes(c))) return 'it';
  if (normalized.includes('(switzerland)') || ['zurich', 'geneva', 'basel'].some((c) => normalized.includes(c))) return 'ch';
  if (normalized.includes('(austria)') || ['vienna', 'graz'].some((c) => normalized.includes(c))) return 'at';
  if (normalized.includes('(belgium)') || ['brussels', 'antwerp'].some((c) => normalized.includes(c))) return 'be';
  if (normalized.includes('(denmark)') || ['copenhagen', 'aarhus'].some((c) => normalized.includes(c))) return 'dk';
  if (normalized.includes('(sweden)') || ['stockholm', 'gothenburg', 'malmö', 'malmo'].some((c) => normalized.includes(c))) return 'se';
  if (normalized.includes('(norway)') || ['oslo', 'bergen'].some((c) => normalized.includes(c))) return 'no';
  if (normalized.includes('(finland)') || ['helsinki', 'espoo'].some((c) => normalized.includes(c))) return 'fi';
  if (normalized.includes('(poland)') || ['warsaw', 'kraków', 'krakow', 'wrocław', 'wroclaw'].some((c) => normalized.includes(c))) return 'pl';
  if (normalized.includes('(australia)') || ['sydney', 'melbourne', 'brisbane', 'perth'].some((c) => normalized.includes(c))) return 'au';
  if (normalized.includes('(new zealand)') || ['auckland', 'wellington'].some((c) => normalized.includes(c))) return 'nz';
  if (normalized.includes('(india)') || ['bengaluru', 'bangalore', 'mumbai', 'delhi', 'hyderabad', 'pune'].some((c) => normalized.includes(c))) return 'in';
  if (normalized.includes('singapore')) return 'sg';
  if (['dubai', 'abu dhabi'].some((c) => normalized.includes(c))) return 'ae';
  return null;
}

/**
 * Build a search plan from an AI-generated SearchStrategy. Selects up to
 * `maxQueries` entries in the strategy's natural priority order, while
 * guaranteeing every selected query's `fallbackTo` is also in the plan when
 * possible (so a zero-result long-tail can be retried without an extra
 * SerpAPI call beyond the daily budget). A retry that does need its own call
 * comes out of the leftover budget the main plan did not spend, never on top
 * of it.
 */
export function buildJobFeedSearchPlanFromStrategy(
  strategy: SearchStrategy,
  settings: JobFeedSettings,
  maxQueries: number = JOB_FEED_MAX_DAILY_QUERIES,
): JobFeedSearchPlanItem[] {
  if (maxQueries <= 0 || strategy.queries.length === 0) return [];

  const language = pickQueryLanguage(settings);
  const locationsByCountry = indexLocationsByCountry(
    [...(settings.preferred_locations ?? []), ...(settings.target_cities ?? [])],
    [...new Set(strategy.queries.map((q) => q.targetCountry.toLowerCase()))],
  );

  // Take the first maxQueries entries in strategy order. The strategy was
  // generated with priority ordering as a hard rule, so a clean prefix
  // gives us the model's "best within budget" pick.
  const selected = strategy.queries.slice(0, maxQueries);

  const plan: JobFeedSearchPlanItem[] = selected.map((entry, index) => {
    const country = entry.targetCountry.toLowerCase();
    const cities = locationsByCountry.get(country) ?? [];
    return {
      query: entry.query,
      targetRole: entry.query,
      market: settings.target_market,
      country: country as JobFeedSearchPlanItem['country'],
      language,
      location: cities.length > 0 ? cities[index % cities.length] : null,
      queryType: entry.type,
      expectedRecall: entry.expectedRecall,
      // Resolved later — fallback indices in the strategy point into the
      // FULL strategy array; we may have dropped some entries when slicing
      // by maxQueries. Resolve to an in-plan index where possible.
      fallbackToIndex: null,
      isFallbackRetry: false,
      // Populated by ingestJobFeedRunJobs after a single bulk lookup of
      // cached `uds` tokens. Empty here keeps this builder pure.
      filterTokens: [],
    };
  });

  // Resolve fallback indices: for each in-plan item, if its strategy entry
  // had a fallbackTo pointing to a query that is ALSO in the selected
  // prefix, link them. If the target wasn't selected, leave null — the
  // caller can still trigger an out-of-plan fallback retry (see the
  // FALLBACK pass in `ingestJobFeedRunJobs`).
  const strategyQueryToPlanIdx = new Map<string, number>();
  selected.forEach((entry, planIdx) => {
    strategyQueryToPlanIdx.set(strategyKey(entry), planIdx);
  });

  for (let i = 0; i < plan.length; i += 1) {
    const strategyEntry = selected[i];
    if (strategyEntry.fallbackTo === null) continue;
    const fallbackEntry = strategy.queries[strategyEntry.fallbackTo];
    if (!fallbackEntry) continue;
    const inPlanIdx = strategyQueryToPlanIdx.get(strategyKey(fallbackEntry));
    if (inPlanIdx !== undefined && inPlanIdx !== i) {
      plan[i].fallbackToIndex = inPlanIdx;
    }
  }

  return plan;
}

function strategyKey(entry: { query: string; targetCountry: string }): string {
  return `${entry.targetCountry.toLowerCase()}::${entry.query.trim().toLowerCase()}`;
}

/**
 * Mutate plan items in-place, attaching the cached "Past week" date_posted
 * `uds` token where one exists for the country. Skips low-volume markets
 * (FILTER_CHIP_DISABLED_MARKETS), and skips fallback retries (they are
 * intentionally unfiltered safety nets).
 */
async function applyDatePostedFiltersToPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  admin: any,
  plan: JobFeedSearchPlanItem[],
): Promise<void> {
  if (plan.length === 0) return;

  const eligibleCountries = [
    ...new Set(
      plan
        .filter((p) => !p.isFallbackRetry && !FILTER_CHIP_DISABLED_MARKETS.has(toSerpApiGl(p.country)))
        .map((p) => toSerpApiGl(p.country)),
    ),
  ];
  if (eligibleCountries.length === 0) return;

  const tokenMap = await loadDatePostedPastWeekTokens(admin, eligibleCountries);
  if (tokenMap.size === 0) return;

  for (const item of plan) {
    if (item.isFallbackRetry) continue;
    const country = toSerpApiGl(item.country);
    if (FILTER_CHIP_DISABLED_MARKETS.has(country)) continue;
    const token = tokenMap.get(country);
    if (token) {
      item.filterTokens = [token];
    }
  }
}

// Per-pass ceilings for the two out-of-plan passes. Both draw from the SAME
// remaining-call budget (daily budget minus the main plan), so a run can never
// spend more SerpAPI calls than its tier's `maxDailyQueries`. Each call is real
// money; see JOB_FEED_TIER_LIMITS in constants.ts.
const JOB_FEED_FALLBACK_BUDGET = 1;

// Maximum opportunistic page-2 fetches per run. Triggered when a main-pass
// query returned a thin result set AND SerpAPI handed back a next_page_token.
const JOB_FEED_PAGINATION_BUDGET = 2;
// Threshold below which a main-pass result counts as "thin" and qualifies for
// an opportunistic page-2 retry. SerpAPI typically returns ~10 jobs per page,
// so 5 catches markets where the first page came back genuinely starved.
const JOB_FEED_THIN_RESULT_THRESHOLD = 5;

export async function ingestJobFeedRunJobs(params: {
  runId: string;
  userId: string;
  settings: JobFeedSettings;
  maxQueries?: number;
  maxRawJobs?: number;
  /**
   * AI-generated search strategy. When provided, queries come from the
   * strategy and zero-result long-tail entries are retried via their
   * fallbackTo pointers. When null, falls back to the legacy deterministic
   * `target_roles × target_countries` planner.
   */
  strategy?: SearchStrategy | null;
}): Promise<JobFeedIngestionResult> {
  const { runId, userId, settings, maxQueries, maxRawJobs = JOB_FEED_MAX_RAW_JOBS_PER_RUN, strategy = null } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  const admin = createAdminClient() as any;

  const searchPlan = strategy
    ? buildJobFeedSearchPlanFromStrategy(strategy, settings, maxQueries)
    : buildJobFeedSearchPlan(settings, maxQueries);

  // Apply the cached "Past week" date_posted filter to every plan item in
  // a market where filtering is safe. First-run users for any country see
  // an unfiltered call (no token cached yet); the response populates the
  // cache for subsequent runs. Fallback retries explicitly skip filtering
  // (set in their planItem construction).
  await applyDatePostedFiltersToPlan(admin, searchPlan);

  // The plan length before the fallback pass appends its retries. Both later
  // passes iterate the main plan only, and both draw from one shared pool of
  // leftover calls so the tier's daily SerpAPI budget is a hard ceiling.
  const mainPlanLength = searchPlan.length;
  const dailyCallBudget = maxQueries ?? JOB_FEED_MAX_DAILY_QUERIES;
  let extraCallsRemaining = Math.max(0, dailyCallBudget - mainPlanLength);

  const rawFetchIds: string[] = [];
  const observedJobs: ObservedNormalizedJob[] = [];
  const failedFetches: JobFeedIngestionFailure[] = [];
  // Per-plan-index counter of jobs returned by the main pass. Used to
  // decide which long-tail items qualify for a fallback retry.
  const mainPassJobCounts: number[] = new Array(searchPlan.length).fill(0);
  let rawJobsFetched = 0;

  // ---- Main pass ----
  // Run all main-plan SerpAPI calls in parallel. Plan size is bounded by
  // tier limits (Plus: 2; Max: 4), so the natural concurrency is well below
  // any provider rate limit. Each plan item still gets its own raw_fetch
  // row inserted; observations are merged in plan order so deterministic
  // dedupe + preview ordering is preserved.
  //
  // Each parallel call gets a proportional share of `maxRawJobs` for its
  // own slice, matching the sequential version's per-call cap. Over-fetch
  // is therefore impossible at the response-trim level; canonical-job
  // dedupe still handles cross-query duplicates.
  const perCallCap = searchPlan.length > 0
    ? Math.max(1, Math.ceil(maxRawJobs / searchPlan.length))
    : maxRawJobs;
  const mainPassResults = await Promise.allSettled(
    searchPlan.map((planItem) => runOneSerpApiFetch({
      admin,
      runId,
      userId,
      planItem,
      remainingRawCapacity: perCallCap,
    })),
  );

  // Per-plan-index next_page_token handed back by SerpAPI on the main pass.
  // Used by the pagination pass to fire page-2 calls for thin main-pass
  // results without consuming another query slot from the strategy.
  const mainPassNextPageTokens: Array<string | null> = new Array(searchPlan.length).fill(null);

  for (let i = 0; i < mainPassResults.length; i += 1) {
    const settled = mainPassResults[i];
    if (settled.status !== 'fulfilled') {
      // runOneSerpApiFetch traps SerpAPI errors itself, so a rejected
      // promise here is a genuine internal failure (e.g. raw_fetch insert
      // bombed). Surface it as a failed fetch and keep going.
      const message = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      const planItem = searchPlan[i];
      console.error('[ingestion] runOneSerpApiFetch threw:', message);
      failedFetches.push({ query: planItem.query, country: planItem.country, error: message });
      continue;
    }

    const fetchResult = settled.value;
    rawFetchIds.push(fetchResult.rawFetchId);
    if (fetchResult.failedFetch) failedFetches.push(fetchResult.failedFetch);
    for (const observed of fetchResult.observedJobs) observedJobs.push(observed);
    rawJobsFetched += fetchResult.observedJobs.length;
    mainPassJobCounts[i] = fetchResult.observedJobs.length;
    mainPassNextPageTokens[i] = fetchResult.nextPageToken;
  }

  // ---- Pagination pass ----
  // Opportunistic page-2 retry: when a main-pass query returned a thin
  // result set AND SerpAPI handed back a next_page_token, fire one extra
  // call to capture the second page. Bounded by the shared leftover-call pool,
  // the per-pass ceiling and the rawJobs cap, so it can only ever use calls the
  // main plan did not spend.
  if (rawJobsFetched < maxRawJobs) {
    let paginationBudget = Math.min(JOB_FEED_PAGINATION_BUDGET, extraCallsRemaining);

    for (let i = 0; i < mainPlanLength && paginationBudget > 0; i += 1) {
      const planItem = searchPlan[i];
      const nextToken = mainPassNextPageTokens[i];
      const mainCount = mainPassJobCounts[i];

      if (!nextToken) continue;
      if (mainCount === 0) continue; // zero-result lanes go through the fallback pass instead
      if (mainCount >= JOB_FEED_THIN_RESULT_THRESHOLD) continue;

      const pageTwoResult = await runOneSerpApiFetch({
        admin,
        runId,
        userId,
        planItem,
        remainingRawCapacity: Math.max(0, maxRawJobs - rawJobsFetched),
        nextPageToken: nextToken,
        isPaginationFetch: true,
      });

      rawFetchIds.push(pageTwoResult.rawFetchId);
      if (pageTwoResult.failedFetch) failedFetches.push(pageTwoResult.failedFetch);
      for (const observed of pageTwoResult.observedJobs) observedJobs.push(observed);
      rawJobsFetched += pageTwoResult.observedJobs.length;
      paginationBudget -= 1;
      extraCallsRemaining -= 1;

      if (rawJobsFetched >= maxRawJobs) break;
    }
  }

  // ---- Fallback pass ----
  // Only when a SearchStrategy is in play. We only retry long-tail / localized
  // entries whose main-pass call returned zero observations AND whose
  // fallbackTo points into the strategy. Retries come out of the same shared
  // leftover-call pool the pagination pass drew from, never out of new budget.
  if (strategy && rawJobsFetched < maxRawJobs) {
    let fallbacksRemaining = Math.min(JOB_FEED_FALLBACK_BUDGET, extraCallsRemaining);
    const alreadyExecutedKeys = new Set(searchPlan.map((p) => `${p.country}::${p.query.toLowerCase()}`));

    for (let i = 0; i < mainPlanLength && fallbacksRemaining > 0; i += 1) {
      const planItem = searchPlan[i];
      if (planItem.queryType === 'short_tail') continue;
      if (mainPassJobCounts[i] !== 0) continue;

      const sourceStrategyEntry = strategy.queries.find(
        (q) => strategyKey(q) === `${planItem.country}::${planItem.query.toLowerCase()}`,
      );
      const fallbackTo = sourceStrategyEntry?.fallbackTo ?? null;
      if (fallbackTo === null) continue;
      const fallbackEntry = strategy.queries[fallbackTo];
      if (!fallbackEntry) continue;

      const fallbackKey = strategyKey(fallbackEntry);
      if (alreadyExecutedKeys.has(fallbackKey)) continue;

      const fallbackPlanItem: JobFeedSearchPlanItem = {
        query: fallbackEntry.query,
        targetRole: fallbackEntry.query,
        market: settings.target_market,
        country: fallbackEntry.targetCountry.toLowerCase() as JobFeedSearchPlanItem['country'],
        language: planItem.language,
        location: planItem.location,
        queryType: fallbackEntry.type,
        expectedRecall: fallbackEntry.expectedRecall,
        fallbackToIndex: null,
        isFallbackRetry: true,
        // Fallbacks intentionally run unfiltered — they are the safety net
        // when a filtered long-tail returned zero. Filtering them too
        // would defeat the fallback's purpose.
        filterTokens: [],
      };

      const fetchResult = await runOneSerpApiFetch({
        admin,
        runId,
        userId,
        planItem: fallbackPlanItem,
        remainingRawCapacity: Math.max(0, maxRawJobs - rawJobsFetched),
      });
      rawFetchIds.push(fetchResult.rawFetchId);
      if (fetchResult.failedFetch) failedFetches.push(fetchResult.failedFetch);
      for (const observed of fetchResult.observedJobs) observedJobs.push(observed);
      rawJobsFetched += fetchResult.observedJobs.length;
      alreadyExecutedKeys.add(fallbackKey);
      fallbacksRemaining -= 1;
      extraCallsRemaining -= 1;
      searchPlan.push(fallbackPlanItem); // make the fallback visible in diagnostics

      if (rawJobsFetched >= maxRawJobs) break;
    }
  }

  const aggregatedJobs = aggregateObservedJobs(observedJobs);
  const canonicalJobs = await upsertCanonicalJobs(admin, aggregatedJobs);
  const sortedCanonicalJobs = [...canonicalJobs].sort(compareJobsForPreview);

  return {
    searchPlan,
    rawFetchIds,
    rawJobsFetched,
    canonicalJobs: sortedCanonicalJobs,
    canonicalJobsCreated: sortedCanonicalJobs.filter((job) => job.created_at === job.updated_at).length,
    canonicalJobsUpdated: sortedCanonicalJobs.filter((job) => job.created_at !== job.updated_at).length,
    duplicateCount: Math.max(0, observedJobs.length - aggregatedJobs.size),
    failedFetches,
    previewJobs: sortedCanonicalJobs.slice(0, 5).map(toJobPreview),
  };
}

interface OneFetchResult {
  rawFetchId: string;
  observedJobs: ObservedNormalizedJob[];
  failedFetch: JobFeedIngestionFailure | null;
  /** Next-page token returned by SerpAPI; null when no further page exists. */
  nextPageToken: string | null;
}

/**
 * Run one SerpAPI search for the given plan item, persist the raw_fetch row,
 * and return normalized observations alongside the raw_fetch id. Encapsulates
 * the success / no-results / error branches so the main + fallback passes
 * can share identical persistence semantics.
 */
async function runOneSerpApiFetch(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  admin: any;
  runId: string;
  userId: string;
  planItem: JobFeedSearchPlanItem;
  remainingRawCapacity: number;
  /** When set, fetch page 2+ of an existing query rather than the first page. */
  nextPageToken?: string;
  /** When true, the raw_fetch row stores page_number = 2. */
  isPaginationFetch?: boolean;
}): Promise<OneFetchResult> {
  const { admin, runId, userId, planItem, remainingRawCapacity, nextPageToken, isPaginationFetch = false } = params;

  const filtersForCall = planItem.filterTokens.length > 0 ? planItem.filterTokens : undefined;

  const requestParams = serializeSearchParams(buildSerpApiSearchParams({
    query: planItem.query,
    country: planItem.country,
    language: planItem.language ?? undefined,
    location: planItem.location ?? undefined,
    filters: filtersForCall,
    nextPageToken,
  }));

  try {
    const { data } = await fetchSerpApiJobs({
      query: planItem.query,
      country: planItem.country,
      language: planItem.language ?? undefined,
      location: planItem.location ?? undefined,
      filters: filtersForCall,
      nextPageToken,
    });

    // Discover and persist any newly-seen filter tokens from the response.
    // Fire-and-forget: a write failure must not bubble up and break the run.
    if (Array.isArray(data.filters) && data.filters.length > 0) {
      const discovered = discoverFilterTokensFromResponse({
        countryCode: toSerpApiGl(planItem.country),
        filters: data.filters,
      });
      if (discovered.length > 0) {
        void recordSerpApiFilterTokens(admin, discovered).catch((error) => {
          console.error('[ingestion] filter-token discovery failed:', error instanceof Error ? error.message : String(error));
        });
      }
    }

    const jobsResults = data.jobs_results ?? [];
    const jobsToStore = jobsResults.slice(0, Math.max(0, remainingRawCapacity));
    const providerError = data.error ?? null;
    const noResults = isSerpApiNoResultsError(providerError ?? undefined);
    const status = providerError
      ? (noResults ? 'no_results' : 'failed')
      : 'completed';

    const rawFetch = await insertRawFetch(admin, {
      run_id: runId,
      user_id: userId,
      provider: JOB_FEED_PROVIDER,
      status,
      query_text: planItem.query,
      market: planItem.market,
      country_code: planItem.country,
      language_code: planItem.language,
      request_location: planItem.location,
      request_filters: planItem.filterTokens,
      page_number: isPaginationFetch ? 2 : 1,
      query_context: {
        target_role: planItem.targetRole,
        query_type: planItem.queryType,
        expected_recall: planItem.expectedRecall,
        is_fallback_retry: planItem.isFallbackRetry,
        is_pagination_fetch: isPaginationFetch,
      },
      request_params: requestParams,
      response_payload: toJsonValue(data),
      response_error: providerError,
      fetched_jobs_count: jobsToStore.length,
      next_page_token: data.serpapi_pagination?.next_page_token ?? null,
    });

    const responseNextPageToken = data.serpapi_pagination?.next_page_token ?? null;

    if (providerError && !noResults) {
      console.error(
        `[ingestion] SerpAPI provider error for q="${planItem.query}" gl=${planItem.country}: ${providerError}`,
      );
      return {
        rawFetchId: rawFetch.id,
        observedJobs: [],
        failedFetch: { query: planItem.query, country: planItem.country, error: providerError },
        nextPageToken: null,
      };
    }

    if (providerError) {
      // No-results path — not a failure, just an empty bucket.
      return { rawFetchId: rawFetch.id, observedJobs: [], failedFetch: null, nextPageToken: null };
    }

    const observedAt = rawFetch.fetched_at;
    const observedJobs: ObservedNormalizedJob[] = jobsToStore.map((job) => ({
      draft: normalizeSerpApiJob(job),
      rawFetchId: rawFetch.id,
      observedAt,
    }));

    return { rawFetchId: rawFetch.id, observedJobs, failedFetch: null, nextPageToken: responseNextPageToken };
  } catch (error) {
    const errorMessage = getFetchErrorMessage(error);
    const errorPayload = toErrorPayload(error);

    if (error instanceof SerpApiHttpError) {
      // Strip api_key=… so it never lands in logs even if SerpAPI ever
      // echoes the request URL inside an error body.
      const safeBody = error.bodyText.replace(/api_key=[^&"\s]+/gi, 'api_key=REDACTED').slice(0, 500);
      console.error(
        `[ingestion] SerpAPI ${error.status} for q="${planItem.query}" gl=${planItem.country}: ${safeBody}`,
      );
    } else {
      console.error(
        `[ingestion] SerpAPI fetch threw for q="${planItem.query}" gl=${planItem.country}: ${errorMessage}`,
      );
    }

    const rawFetch = await insertRawFetch(admin, {
      run_id: runId,
      user_id: userId,
      provider: JOB_FEED_PROVIDER,
      status: 'failed',
      query_text: planItem.query,
      market: planItem.market,
      country_code: planItem.country,
      language_code: planItem.language,
      request_location: planItem.location,
      request_filters: planItem.filterTokens,
      page_number: 1,
      query_context: {
        target_role: planItem.targetRole,
        query_type: planItem.queryType,
        expected_recall: planItem.expectedRecall,
        is_fallback_retry: planItem.isFallbackRetry,
      },
      request_params: requestParams,
      response_payload: errorPayload,
      response_error: errorMessage,
      fetched_jobs_count: 0,
      next_page_token: null,
    });

    return {
      rawFetchId: rawFetch.id,
      observedJobs: [],
      failedFetch: { query: planItem.query, country: planItem.country, error: errorMessage },
      nextPageToken: null,
    };
  }
}

async function insertRawFetch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  admin: any,
  insert: InsertTables<'job_feed_raw_fetches'>
) {
  const { insertRawFetch } = await import('@/db/repos/jobFeed');
  const data = await insertRawFetch(insert.user_id, insert);
  return data as {
    id: string;
    fetched_at: string;
  };
}

async function upsertCanonicalJobs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  admin: any,
  aggregatedJobs: Map<string, AggregatedNormalizedJob>
): Promise<JobFeedCanonicalJob[]> {
  const canonicalKeys = Array.from(aggregatedJobs.keys());
  if (canonicalKeys.length === 0) {
    return [];
  }

  const { getCanonicalJobsByKeys, updateCanonicalJob, insertCanonicalJob } = await import('@/db/repos/admin');
  const existingRows = await getCanonicalJobsByKeys(canonicalKeys);

  const existingByKey = new Map<string, JobFeedCanonicalJob>(
    ((existingRows ?? []) as JobFeedCanonicalJob[]).map((row) => [row.canonical_key, row])
  );

  const persistedJobs: JobFeedCanonicalJob[] = [];

  for (const [canonicalKey, aggregated] of aggregatedJobs.entries()) {
    const existing = existingByKey.get(canonicalKey);

    if (existing) {
      const updates = buildCanonicalJobUpdate(existing, aggregated);
      const data = await updateCanonicalJob(existing.id, updates);
      persistedJobs.push(data);
      continue;
    }

    const insert = buildCanonicalJobInsert(aggregated);
    const data = await insertCanonicalJob(insert);
    persistedJobs.push(data);
  }

  return persistedJobs;
}

function aggregateObservedJobs(observedJobs: ObservedNormalizedJob[]): Map<string, AggregatedNormalizedJob> {
  const aggregated = new Map<string, AggregatedNormalizedJob>();

  for (const observed of observedJobs) {
    const existing = aggregated.get(observed.draft.canonical_key);
    if (!existing) {
      aggregated.set(observed.draft.canonical_key, {
        draft: observed.draft,
        occurrences: 1,
        firstSeenAt: observed.observedAt,
        lastSeenAt: observed.observedAt,
        lastRawFetchId: observed.rawFetchId,
      });
      continue;
    }

    existing.occurrences += 1;
    existing.lastSeenAt = maxIsoString(existing.lastSeenAt, observed.observedAt);
    existing.lastRawFetchId = observed.rawFetchId;
    existing.draft = choosePreferredDraft(existing.draft, observed.draft);
  }

  return aggregated;
}

function buildCanonicalJobInsert(
  aggregated: AggregatedNormalizedJob
): InsertTables<'job_feed_canonical_jobs'> {
  return {
    canonical_key: aggregated.draft.canonical_key,
    source_provider: aggregated.draft.source_provider,
    source_job_id: aggregated.draft.source_job_id,
    title: aggregated.draft.title,
    title_normalized: aggregated.draft.title_normalized,
    company: aggregated.draft.company,
    company_normalized: aggregated.draft.company_normalized,
    location_text: aggregated.draft.location_text,
    location_normalized: aggregated.draft.location_normalized,
    work_mode: aggregated.draft.work_mode,
    employment_type: aggregated.draft.employment_type,
    salary_text: aggregated.draft.salary_text,
    salary_min: aggregated.draft.salary_min,
    salary_max: aggregated.draft.salary_max,
    salary_currency: aggregated.draft.salary_currency,
    description: aggregated.draft.description,
    apply_url: aggregated.draft.apply_url,
    source_url: aggregated.draft.source_url,
    posted_at_text: aggregated.draft.posted_at_text,
    freshness_days: aggregated.draft.freshness_days,
    source_identifiers: aggregated.draft.source_identifiers,
    first_seen_at: aggregated.firstSeenAt,
    last_seen_at: aggregated.lastSeenAt,
    last_raw_fetch_id: aggregated.lastRawFetchId,
    times_seen: aggregated.occurrences,
  };
}

function buildCanonicalJobUpdate(
  existing: JobFeedCanonicalJob,
  aggregated: AggregatedNormalizedJob
): UpdateTables<'job_feed_canonical_jobs'> {
  const draft = aggregated.draft;

  return {
    source_provider: draft.source_provider || existing.source_provider,
    source_job_id: draft.source_job_id ?? existing.source_job_id,
    title: pickRequiredText(existing.title, draft.title),
    title_normalized: draft.title_normalized || existing.title_normalized,
    company: pickRequiredText(existing.company, draft.company),
    company_normalized: draft.company_normalized || existing.company_normalized,
    location_text: pickLongerText(existing.location_text, draft.location_text),
    location_normalized: draft.location_normalized ?? existing.location_normalized,
    work_mode: pickWorkMode(existing.work_mode, draft.work_mode),
    employment_type: draft.employment_type ?? existing.employment_type,
    salary_text: pickLongerText(existing.salary_text, draft.salary_text),
    salary_min: pickNumber(existing.salary_min, draft.salary_min),
    salary_max: pickNumber(existing.salary_max, draft.salary_max),
    salary_currency: draft.salary_currency ?? existing.salary_currency,
    description: pickLongerText(existing.description, draft.description),
    apply_url: draft.apply_url ?? existing.apply_url,
    source_url: draft.source_url ?? existing.source_url,
    posted_at_text: pickFreshnessText(
      existing.posted_at_text,
      existing.freshness_days,
      draft.posted_at_text,
      draft.freshness_days
    ),
    freshness_days: pickFreshness(existing.freshness_days, draft.freshness_days),
    source_identifiers: mergeSourceIdentifiers(existing.source_identifiers, draft.source_identifiers),
    last_seen_at: aggregated.lastSeenAt,
    last_raw_fetch_id: aggregated.lastRawFetchId,
    times_seen: existing.times_seen + aggregated.occurrences,
  };
}

function choosePreferredDraft(current: NormalizedSerpApiJob, candidate: NormalizedSerpApiJob): NormalizedSerpApiJob {
  return getDraftCompletenessScore(candidate) > getDraftCompletenessScore(current)
    ? candidate
    : current;
}

function getDraftCompletenessScore(draft: NormalizedSerpApiJob): number {
  return [
    draft.apply_url ? 5 : 0,
    draft.description ? Math.min(4, Math.floor(draft.description.length / 160)) : 0,
    draft.salary_min || draft.salary_max ? 2 : 0,
    draft.work_mode !== 'unknown' ? 1 : 0,
    draft.freshness_days !== null ? 1 : 0,
  ].reduce((total, score) => total + score, 0);
}

function compareJobsForPreview(left: JobFeedCanonicalJob, right: JobFeedCanonicalJob): number {
  const freshnessDelta = compareNullableNumbers(left.freshness_days, right.freshness_days);
  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  return right.last_seen_at.localeCompare(left.last_seen_at);
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
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

function pickLongerText(current: string | null, candidate: string | null): string | null {
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate.length > current.length ? candidate : current;
}

function pickRequiredText(current: string, candidate: string | null): string {
  return pickLongerText(current, candidate) ?? current;
}

function pickNumber(current: number | null, candidate: number | null): number | null {
  return candidate ?? current;
}

function pickWorkMode(
  current: JobFeedCanonicalJob['work_mode'],
  candidate: JobFeedCanonicalJob['work_mode']
): JobFeedCanonicalJob['work_mode'] {
  if (current === candidate) return current;
  if (current === 'unknown') return candidate;
  if (candidate === 'unknown') return current;
  if (candidate === 'remote') return candidate;
  return current;
}

function pickFreshness(current: number | null, candidate: number | null): number | null {
  if (current === null) return candidate;
  if (candidate === null) return current;
  return Math.min(current, candidate);
}

function pickFreshnessText(
  currentText: string | null,
  currentFreshness: number | null,
  candidateText: string | null,
  candidateFreshness: number | null
): string | null {
  if (currentFreshness === null) return candidateText ?? currentText;
  if (candidateFreshness === null) return currentText;
  return candidateFreshness <= currentFreshness
    ? (candidateText ?? currentText)
    : currentText;
}

function mergeSourceIdentifiers(existing: Json, candidate: Json): Json {
  const existingRecord = isJsonRecord(existing) ? existing : {};
  const candidateRecord = isJsonRecord(candidate) ? candidate : {};

  const merged: Record<string, Json> = { ...existingRecord };
  for (const [key, value] of Object.entries(candidateRecord)) {
    if (value === null) continue;

    if (Array.isArray(value) && value.length === 0 && Array.isArray(merged[key])) {
      continue;
    }

    if (typeof value === 'string' && value.length === 0 && typeof merged[key] === 'string') {
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function isJsonRecord(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickQueryLanguage(_settings: JobFeedSettings): string | null {
  // Return null so buildSerpApiSearchParams falls through to
  // COUNTRY_LANGUAGES[countryCode], picking the correct language for
  // each target country (e.g. 'de' for Germany, 'fr' for France).
  return null;
}

function dedupeRoles(values: string[]): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];

  for (const value of values) {
    // Defence in depth: if a legacy DB row has a composite role string like
    // "AI Engineer | Product Builder", split it here so SerpAPI gets one
    // searchable title at a time. Rows saved via the settings API already
    // go through sanitizeTargetRoles, but old rows might not have.
    const parts = splitCompositeRole(value);
    const candidates = parts.length > 0 ? parts : [value.trim()];

    for (const part of candidates) {
      const normalized = part.trim();
      if (!normalized) continue;

      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      roles.push(normalized);
    }
  }

  return roles;
}

function getFetchErrorMessage(error: unknown): string {
  if (error instanceof SerpApiHttpError) {
    if (error.status === 401 || error.status === 403) {
      return 'SerpApi authentication failed.';
    }

    if (error.status === 429) {
      return 'SerpApi rate limited the request.';
    }

    return `SerpApi request failed with status ${error.status}.`;
  }

  return error instanceof Error ? error.message : 'Unknown SerpApi fetch failure.';
}

function toErrorPayload(error: unknown): Json {
  if (error instanceof SerpApiHttpError) {
    return {
      status: error.status,
      body: tryParseJson(error.bodyText) ?? error.bodyText,
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
  };
}

function toJsonValue(value: unknown): Json {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === 'object') {
    const record: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value)) {
      record[key] = toJsonValue(item);
    }
    return record;
  }

  return String(value);
}

function tryParseJson(value: string): Json | null {
  try {
    return JSON.parse(value) as Json;
  } catch {
    return null;
  }
}

function maxIsoString(left: string, right: string): string {
  return left >= right ? left : right;
}
