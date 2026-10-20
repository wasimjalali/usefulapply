import { deletePrefix, getFilesBucket, getObject, headObject, putObjectWithMetadata } from '@/storage/r2';

/**
 * Exports live in the files bucket under `exports/<userId>/<hash>.<ext>`.
 * `exports` is deliberately not one of the buckets /api/files serves, so the
 * only way to read one is a signed link. Objects carry their owner and their
 * download file name as metadata.
 */

export const EXPORT_PREFIX = 'exports/';
export const EXPORT_RETENTION_DAYS = 30;

export function exportObjectKey(pathKey: string): string {
  return `${EXPORT_PREFIX}${pathKey}`;
}

export function exportUserPrefix(userId: string): string {
  return `${EXPORT_PREFIX}${userId}/`;
}

export interface StoredExportMeta {
  userId: string;
  fileName: string;
  /** The name with the applicant's own letters, for `filename*`. Stored percent-encoded so metadata stays ASCII. */
  displayName?: string;
}

export async function headExport(pathKey: string) {
  return headObject(exportObjectKey(pathKey));
}

export async function storeExport(
  pathKey: string,
  bytes: Uint8Array,
  contentType: string,
  meta: StoredExportMeta,
): Promise<void> {
  await putObjectWithMetadata(exportObjectKey(pathKey), bytes, {
    contentType,
    customMetadata: { userId: meta.userId, fileName: meta.fileName, ...(meta.displayName ? { displayName: encodeURIComponent(meta.displayName) } : {}) },
  });
}

export async function readExport(pathKey: string) {
  return getObject(exportObjectKey(pathKey));
}

/** Account deletion: every export the user ever made goes with the account. */
export async function deleteUserExports(userId: string): Promise<void> {
  await deletePrefix(exportUserPrefix(userId));
}

/**
 * The daily sweep. Deletes every export older than the retention window.
 * Returns how many were removed so the cron can log it.
 */
export async function deleteExpiredExports(now: Date = new Date()): Promise<{ scanned: number; deleted: number }> {
  const bucket = await getFilesBucket();
  const cutoff = now.getTime() - EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let scanned = 0;
  let deleted = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await bucket.list({ prefix: EXPORT_PREFIX, cursor, limit: 1000 });
    const stale = page.objects.filter((object) => object.uploaded && object.uploaded.getTime() < cutoff).map((object) => object.key);
    scanned += page.objects.length;
    if (stale.length > 0) {
      await bucket.delete(stale);
      deleted += stale.length;
    }
    if (!page.truncated || !page.cursor) break;
    cursor = page.cursor;
  }
  return { scanned, deleted };
}
