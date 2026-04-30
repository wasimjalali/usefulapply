import { createAdminClient } from '@/lib/supabase/admin';
import {
  JOB_FEED_INBOX_RETENTION_DAYS,
  JOB_FEED_RAW_PAYLOAD_RETENTION_DAYS,
  JOB_FEED_RUN_METADATA_RETENTION_DAYS,
} from '@/lib/job-feed/constants';
import type { JobFeedRun, Json } from '@/lib/supabase/types';

const JOB_FEED_CLEANUP_COMPACTION_VERSION = 1;
const UPDATE_BATCH_SIZE = 200;

export interface JobFeedCleanupResult {
  rawPayloadRetentionDays: number;
  runMetadataRetentionDays: number;
  inboxRetentionDays: number;
  rawPayloadCutoff: string;
  runMetadataCutoff: string;
  inboxCutoff: string;
  rawFetchPayloadsRedacted: number;
  runMetadataCompacted: number;
  rankedItemsDeleted: number;
}

export async function cleanupHistoricalJobFeedData(params?: {
  now?: Date;
  rawPayloadRetentionDays?: number;
  runMetadataRetentionDays?: number;
  inboxRetentionDays?: number;
}): Promise<JobFeedCleanupResult> {
  const now = params?.now ?? new Date();
  const rawPayloadRetentionDays = params?.rawPayloadRetentionDays ?? JOB_FEED_RAW_PAYLOAD_RETENTION_DAYS;
  const runMetadataRetentionDays = params?.runMetadataRetentionDays ?? JOB_FEED_RUN_METADATA_RETENTION_DAYS;
  const inboxRetentionDays = params?.inboxRetentionDays ?? JOB_FEED_INBOX_RETENTION_DAYS;
  const rawPayloadCutoff = new Date(now.getTime() - rawPayloadRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const runMetadataCutoff = new Date(now.getTime() - runMetadataRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const inboxCutoff = new Date(now.getTime() - inboxRetentionDays * 24 * 60 * 60 * 1000).toISOString();

  const rawFetchPayloadsRedacted = await redactOldRawFetchPayloads({
    now,
    rawPayloadCutoff,
    rawPayloadRetentionDays,
  });

  const runMetadataCompacted = await compactOldRunMetadata({
    now,
    runMetadataCutoff,
  });

  // Delete ranked_items whose parent run completed more than
  // `inboxRetentionDays` ago. After 7 days we consider the user has had
  // enough time to decide; untouched roles fall out of the inbox. Runs
  // and feedback rows are kept — runs for diagnostics/history, feedback
  // so any past terminal action (applied/dismissed/not_relevant) still
  // prevents re-surfacing the same canonical_job_id in future runs.
  const rankedItemsDeleted = await deleteExpiredRankedInboxItems({ inboxCutoff });

  return {
    rawPayloadRetentionDays,
    runMetadataRetentionDays,
    inboxRetentionDays,
    rawPayloadCutoff,
    runMetadataCutoff,
    inboxCutoff,
    rawFetchPayloadsRedacted,
    runMetadataCompacted,
    rankedItemsDeleted,
  };
}

async function deleteExpiredRankedInboxItems(params: { inboxCutoff: string }): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the joined ranked feed rows.
  const admin = createAdminClient() as any;

  // Find expired run IDs first, then batch-delete their ranked_items.
  // Using a two-step approach keeps the delete predicate indexable and
  // avoids relying on cross-table filters in the Supabase client.
  const { data: expiredRuns, error: expiredRunsError } = await admin
    .from('job_feed_runs')
    .select('id')
    .eq('status', 'completed')
    .lt('completed_at', params.inboxCutoff);

  if (expiredRunsError) {
    throw new Error(`Failed to load expired job feed runs for inbox cleanup: ${expiredRunsError.message}`);
  }

  const expiredRunIds = ((expiredRuns ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (expiredRunIds.length === 0) {
    return 0;
  }

  let deleted = 0;
  for (const batch of chunk(expiredRunIds, UPDATE_BATCH_SIZE)) {
    const { error, count } = await admin
      .from('job_feed_ranked_items')
      .delete({ count: 'exact' })
      .in('run_id', batch);

    if (error) {
      throw new Error(`Failed to delete expired job feed ranked items: ${error.message}`);
    }

    deleted += typeof count === 'number' ? count : 0;
  }

  return deleted;
}

async function redactOldRawFetchPayloads(params: {
  now: Date;
  rawPayloadCutoff: string;
  rawPayloadRetentionDays: number;
}): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_raw_fetches')
    .select('id, response_payload')
    .lt('created_at', params.rawPayloadCutoff);

  if (error) {
    throw new Error(`Failed to load raw job feed fetches for cleanup: ${error.message}`);
  }

  const idsToRedact = ((data ?? []) as Array<{ id: string; response_payload: Json }>)
    .filter((row) => !isRedactedRawPayload(row.response_payload))
    .map((row) => row.id);

  if (idsToRedact.length === 0) {
    return 0;
  }

  const redactedPayload = {
    redacted: true,
    reason: 'retention_cleanup',
    redacted_at: params.now.toISOString(),
    retention_days: params.rawPayloadRetentionDays,
  } satisfies Record<string, Json>;

  let updatedCount = 0;
  for (const batch of chunk(idsToRedact, UPDATE_BATCH_SIZE)) {
    const { error: updateError } = await admin
      .from('job_feed_raw_fetches')
      .update({ response_payload: redactedPayload })
      .in('id', batch);

    if (updateError) {
      throw new Error(`Failed to redact raw job feed payloads: ${updateError.message}`);
    }

    updatedCount += batch.length;
  }

  return updatedCount;
}

async function compactOldRunMetadata(params: {
  now: Date;
  runMetadataCutoff: string;
}): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('job_feed_runs')
    .select('id, metadata, status')
    .lt('created_at', params.runMetadataCutoff)
    .in('status', ['completed', 'failed', 'skipped']);

  if (error) {
    throw new Error(`Failed to load job feed runs for metadata cleanup: ${error.message}`);
  }

  const runsToCompact = ((data ?? []) as Array<Pick<JobFeedRun, 'id' | 'metadata' | 'status'>>)
    .filter((run) => !isCompactedRunMetadata(run.metadata));

  if (runsToCompact.length === 0) {
    return 0;
  }

  let updatedCount = 0;
  for (const run of runsToCompact) {
    const compactedMetadata = compactRunMetadata(run.metadata, params.now.toISOString());
    const { error: updateError } = await admin
      .from('job_feed_runs')
      .update({ metadata: compactedMetadata })
      .eq('id', run.id);

    if (updateError) {
      throw new Error(`Failed to compact job feed run metadata: ${updateError.message}`);
    }

    updatedCount += 1;
  }

  return updatedCount;
}

function isRedactedRawPayload(value: Json): boolean {
  return isJsonRecord(value)
    && value.redacted === true
    && value.reason === 'retention_cleanup';
}

function isCompactedRunMetadata(value: Json): boolean {
  return isJsonRecord(value)
    && typeof value.cleanup_compacted_at === 'string';
}

function compactRunMetadata(metadata: Json, compactedAt: string): Json {
  const record = isJsonRecord(metadata) ? metadata : {};
  const compact: Record<string, Json> = {
    cleanup_compacted_at: compactedAt,
    cleanup_compaction_version: JOB_FEED_CLEANUP_COMPACTION_VERSION,
    search_plan_count: getArrayCount(record.search_plan),
    raw_fetch_count: getArrayCount(record.raw_fetch_ids),
    failed_fetch_count: getArrayCount(record.failed_fetches),
    ingestion_preview_count: getArrayCount(record.ingestion_preview_jobs),
    survivors_preview_count: getArrayCount(record.prefilter_survivors_preview),
    shortlist_preview_count: getArrayCount(record.shortlist_preview_jobs),
    ranked_preview_count: getArrayCount(record.ranked_preview_jobs),
  };

  copyIfPresent(compact, record, 'stage');
  copyIfPresent(compact, record, 'foundation_mode');
  copyIfPresent(compact, record, 'target_market');
  copyIfPresent(compact, record, 'last_trigger_source');
  copyIfPresent(compact, record, 'workflow_status');
  copyIfPresent(compact, record, 'canonical_jobs_count');
  copyIfPresent(compact, record, 'canonical_jobs_created');
  copyIfPresent(compact, record, 'canonical_jobs_updated');
  copyIfPresent(compact, record, 'duplicate_count');
  copyIfPresent(compact, record, 'prefilter_survivors_count');
  copyIfPresent(compact, record, 'prefilter_rejected_count');
  copyIfPresent(compact, record, 'prefilter_rejections_by_reason');
  copyIfPresent(compact, record, 'ranking_candidate_count');
  copyIfPresent(compact, record, 'ranking_status');
  copyIfPresent(compact, record, 'ranking_error');
  copyIfPresent(compact, record, 'ranking_model');
  copyIfPresent(compact, record, 'ranked_items_materialized');

  return compact;
}

function copyIfPresent(
  target: Record<string, Json>,
  source: Record<string, Json | undefined>,
  key: string
) {
  const value = source[key];
  if (value !== undefined) {
    target[key] = value;
  }
}

function getArrayCount(value: Json | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function isJsonRecord(value: Json): value is Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
