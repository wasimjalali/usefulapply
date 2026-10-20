import { getCloudflareContext } from '@opennextjs/cloudflare';

type FilesBucket = {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<{ key: string; size: number; customMetadata?: Record<string, string> } | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string; size: number; uploaded?: Date; customMetadata?: Record<string, string> }>;
    truncated: boolean;
    cursor?: string;
  }>;
};

export type R2ObjectBodyLike = {
  body: ReadableStream;
  size: number;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  writeHttpMetadata(headers: Headers): void;
};

declare global {
  interface CloudflareEnv {
    FILES?: FilesBucket;
  }
}

const DELETE_BATCH = 1000;

/** Total bytes one user may hold across all buckets. */
export const USER_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024;

export async function getFilesBucket(): Promise<FilesBucket> {
  let env: { FILES?: FilesBucket };
  try {
    ({ env } = await getCloudflareContext({ async: true }) as { env: { FILES?: FilesBucket } });
  } catch {
    throw new Error(
      '[storage] R2 binding is unavailable. Run `npm run dev` (OpenNext wrangler bindings) or `npx opennextjs-cloudflare preview`.',
    );
  }
  if (!env.FILES) {
    throw new Error('[storage] env.FILES is missing. Bind usefulapply-files as FILES in wrangler.jsonc.');
  }
  return env.FILES;
}

export async function putObject(
  key: string,
  body: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
  options?: { contentType?: string },
): Promise<void> {
  const bucket = await getFilesBucket();
  await bucket.put(key, body, options?.contentType ? { httpMetadata: { contentType: options.contentType } } : undefined);
}

/** put with custom metadata, for objects whose ownership or file name must travel with them. */
export async function putObjectWithMetadata(
  key: string,
  body: ArrayBuffer | ArrayBufferView,
  options: { contentType: string; customMetadata: Record<string, string> },
): Promise<void> {
  const bucket = await getFilesBucket();
  await bucket.put(key, body, { httpMetadata: { contentType: options.contentType }, customMetadata: options.customMetadata });
}

export async function headObject(key: string): Promise<{ key: string; size: number; customMetadata?: Record<string, string> } | null> {
  const bucket = await getFilesBucket();
  return bucket.head(key);
}

export async function getObject(key: string): Promise<R2ObjectBodyLike | null> {
  const bucket = await getFilesBucket();
  return bucket.get(key);
}

export async function deleteObject(key: string): Promise<void> {
  const bucket = await getFilesBucket();
  await bucket.delete(key);
}

export async function listPrefix(prefix: string): Promise<Array<{ key: string; size: number }>> {
  const bucket = await getFilesBucket();
  const objects: Array<{ key: string; size: number }> = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await bucket.list({ prefix, cursor, limit: DELETE_BATCH });
    for (const object of page.objects) objects.push({ key: object.key, size: object.size });
    if (!page.truncated) break;
    cursor = page.cursor;
    if (!cursor) break;
  }
  return objects;
}

export async function deletePrefix(prefix: string, keepKey?: string): Promise<void> {
  const bucket = await getFilesBucket();
  let cursor: string | undefined;
  for (;;) {
    const page = await bucket.list({ prefix, cursor, limit: DELETE_BATCH });
    const keys = page.objects.map((object) => object.key).filter((key) => key !== keepKey);
    if (keys.length > 0) {
      await bucket.delete(keys);
    }
    if (!page.truncated) break;
    cursor = page.cursor;
    if (!cursor) break;
  }
}

/** Bytes currently stored under every `<bucket>/<userId>/` prefix. */
export async function userStorageBytes(userId: string, buckets: readonly string[]): Promise<number> {
  let total = 0;
  for (const bucket of buckets) {
    const objects = await listPrefix(`${bucket}/${userId}/`);
    for (const object of objects) total += object.size;
  }
  return total;
}
