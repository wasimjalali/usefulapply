import * as adminRepo from '@/db/repos/admin';
import {
  JOB_FEED_INBOX_RETENTION_DAYS,
  JOB_FEED_RAW_PAYLOAD_RETENTION_DAYS,
  JOB_FEED_RUN_METADATA_RETENTION_DAYS,
} from '@/lib/job-feed/constants';

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
  // enough time to decide; untouched roles fall out of the inbox. Saved
  // bookmarks are exempt: every write still authorises through that row.
  // Unsaving re-exposes them to the next sweep. Runs and feedback rows
  // are kept, so a past terminal action still blocks re-surfacing.
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
  return adminRepo.deleteExpiredRankedItems(params.inboxCutoff);
}

async function redactOldRawFetchPayloads(params: {
  now: Date;
  rawPayloadCutoff: string;
  rawPayloadRetentionDays: number;
}): Promise<number> {
  return adminRepo.redactOldRawFetchPayloads(params.rawPayloadCutoff);
}

async function compactOldRunMetadata(params: {
  now: Date;
  runMetadataCutoff: string;
}): Promise<number> {
  return adminRepo.compactOldRunMetadata(params.runMetadataCutoff);
}

