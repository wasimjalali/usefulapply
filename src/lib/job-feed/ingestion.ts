import { createAdminClient } from '@/lib/supabase/admin';
import {
  JOB_FEED_MARKET_COUNTRIES,
  JOB_FEED_MAX_DAILY_QUERIES,
  JOB_FEED_MAX_RAW_JOBS_PER_RUN,
  JOB_FEED_PROVIDER,
} from '@/lib/job-feed/constants';
import {
  buildSerpApiSearchParams,
  fetchSerpApiJobs,
  isSerpApiNoResultsError,
  normalizeSerpApiJob,
  serializeSearchParams,
  SerpApiHttpError,
  type NormalizedSerpApiJob,
} from '@/lib/job-feed/serpapi';
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

export function buildJobFeedSearchPlan(settings: JobFeedSettings): JobFeedSearchPlanItem[] {
  const countries = JOB_FEED_MARKET_COUNTRIES[settings.target_market] || JOB_FEED_MARKET_COUNTRIES.us_canada;
  const maxRoles = Math.max(1, Math.floor(JOB_FEED_MAX_DAILY_QUERIES / countries.length));

  const targetRoles = dedupeRoles(settings.target_roles).map((role) => ({
    role,
    isAdjacentRole: false,
  }));

  const adjacentRoles = settings.adjacent_roles_enabled && settings.aggressiveness !== 'strict'
    ? dedupeRoles(settings.adjacent_roles)
        .filter((role) => !targetRoles.some((candidate) => candidate.role === role))
        .map((role) => ({
          role,
          isAdjacentRole: true,
        }))
    : [];

  const selectedRoles = [...targetRoles, ...adjacentRoles].slice(0, maxRoles);
  const language = pickQueryLanguage(settings);

  return selectedRoles
    .flatMap((candidate) => countries.map((country) => ({
      query: candidate.role,
      targetRole: candidate.role,
      isAdjacentRole: candidate.isAdjacentRole,
      market: settings.target_market,
      country,
      language,
      location: null,
    })))
    .slice(0, JOB_FEED_MAX_DAILY_QUERIES);
}

export async function ingestJobFeedRunJobs(params: {
  runId: string;
  userId: string;
  settings: JobFeedSettings;
}): Promise<JobFeedIngestionResult> {
  const { runId, userId, settings } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  const admin = createAdminClient() as any;

  const searchPlan = buildJobFeedSearchPlan(settings);
  const rawFetchIds: string[] = [];
  const observedJobs: ObservedNormalizedJob[] = [];
  const failedFetches: JobFeedIngestionFailure[] = [];
  let rawJobsFetched = 0;

  for (const planItem of searchPlan) {
    const requestParams = serializeSearchParams(buildSerpApiSearchParams({
      query: planItem.query,
      country: planItem.country,
      language: planItem.language,
      location: planItem.location ?? undefined,
    }));

    try {
      const { data } = await fetchSerpApiJobs({
        query: planItem.query,
        country: planItem.country,
        language: planItem.language,
        location: planItem.location ?? undefined,
      });

      const jobsResults = data.jobs_results ?? [];
      const remainingCapacity = Math.max(0, JOB_FEED_MAX_RAW_JOBS_PER_RUN - rawJobsFetched);
      const jobsToStore = jobsResults.slice(0, remainingCapacity);
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
        request_filters: [],
        page_number: 1,
        query_context: {
          target_role: planItem.targetRole,
          is_adjacent_role: planItem.isAdjacentRole,
          aggressiveness: settings.aggressiveness,
        },
        request_params: requestParams,
        response_payload: toJsonValue(data),
        response_error: providerError,
        fetched_jobs_count: jobsToStore.length,
        next_page_token: data.serpapi_pagination?.next_page_token ?? null,
      });

      rawFetchIds.push(rawFetch.id);

      if (providerError) {
        if (!noResults) {
          failedFetches.push({
            query: planItem.query,
            country: planItem.country,
            error: providerError,
          });
        }
        continue;
      }

      const observedAt = rawFetch.fetched_at;
      for (const job of jobsToStore) {
        observedJobs.push({
          draft: normalizeSerpApiJob(job),
          rawFetchId: rawFetch.id,
          observedAt,
        });
      }

      rawJobsFetched += jobsToStore.length;
      if (rawJobsFetched >= JOB_FEED_MAX_RAW_JOBS_PER_RUN) {
        break;
      }
    } catch (error) {
      const errorMessage = getFetchErrorMessage(error);
      const errorPayload = toErrorPayload(error);

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
        request_filters: [],
        page_number: 1,
        query_context: {
          target_role: planItem.targetRole,
          is_adjacent_role: planItem.isAdjacentRole,
          aggressiveness: settings.aggressiveness,
        },
        request_params: requestParams,
        response_payload: errorPayload,
        response_error: errorMessage,
        fetched_jobs_count: 0,
        next_page_token: null,
      });

      rawFetchIds.push(rawFetch.id);
      failedFetches.push({
        query: planItem.query,
        country: planItem.country,
        error: errorMessage,
      });
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

async function insertRawFetch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the new tables here.
  admin: any,
  insert: InsertTables<'job_feed_raw_fetches'>
) {
  const { data, error } = await admin
    .from('job_feed_raw_fetches')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to persist raw job feed fetch: ${error.message}`);
  }

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

  const { data: existingRows, error: existingRowsError } = await admin
    .from('job_feed_canonical_jobs')
    .select('*')
    .in('canonical_key', canonicalKeys);

  if (existingRowsError) {
    throw new Error(`Failed to load canonical jobs for dedupe: ${existingRowsError.message}`);
  }

  const existingByKey = new Map<string, JobFeedCanonicalJob>(
    ((existingRows ?? []) as JobFeedCanonicalJob[]).map((row) => [row.canonical_key, row])
  );

  const persistedJobs: JobFeedCanonicalJob[] = [];

  for (const [canonicalKey, aggregated] of aggregatedJobs.entries()) {
    const existing = existingByKey.get(canonicalKey);

    if (existing) {
      const updates = buildCanonicalJobUpdate(existing, aggregated);
      const { data, error } = await admin
        .from('job_feed_canonical_jobs')
        .update(updates)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to update canonical job: ${error.message}`);
      }

      persistedJobs.push(data as JobFeedCanonicalJob);
      continue;
    }

    const insert = buildCanonicalJobInsert(aggregated);
    const { data, error } = await admin
      .from('job_feed_canonical_jobs')
      .insert(insert)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to insert canonical job: ${error.message}`);
    }

    persistedJobs.push(data as JobFeedCanonicalJob);
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

function pickQueryLanguage(settings: JobFeedSettings): string {
  const normalizedLanguages = settings.languages.map((language) => language.toLowerCase());
  return normalizedLanguages.includes('french') && normalizedLanguages.length === 1
    ? 'fr'
    : 'en';
}

function dedupeRoles(values: string[]): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roles.push(normalized);
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
