/**
 * Task 6.2: copy every object in the four Supabase Storage buckets to R2
 * with the same key `<bucket>/<path>`.
 *
 * Run:
 *   npx tsx scripts/migrate/copy-storage.ts --dry-run --bucket usefulapply-files
 *   npx tsx scripts/migrate/copy-storage.ts --local --bucket usefulapply-files
 *   npx tsx scripts/migrate/copy-storage.ts --remote --bucket usefulapply-files
 *
 * Env (loaded from the local env file, never logged):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   --remote also needs R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID
 *
 * Do not run --remote from this task. Wasim decides when.
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

loadEnv({ path: '.env.local' });

const BUCKETS = ['cv-files', 'generated-pdfs', 'avatars', 'profile-photos'] as const;
const PAGE = 1000;
const REQUIRED_BUCKET = 'usefulapply-files';

const args = process.argv.slice(2);
let targetArg: '--remote' | '--local' | null = null;
let dryRun = false;
let bucketName: string | null = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--local' || arg === '--remote') {
    if (targetArg && targetArg !== arg) throw new Error('Pass only one of --local or --remote');
    targetArg = arg;
    continue;
  }
  if (arg === '--dry-run') {
    dryRun = true;
    continue;
  }
  if (arg === '--bucket') {
    const name = args[i + 1];
    if (!name || name.startsWith('--')) throw new Error('--bucket requires a bucket name');
    bucketName = name;
    i += 1;
    continue;
  }
  throw new Error(`Unrecognised flag: ${arg}`);
}

if (!bucketName) throw new Error('--bucket is required (use --bucket usefulapply-files)');
if (bucketName !== REQUIRED_BUCKET) {
  throw new Error(`--bucket must be ${REQUIRED_BUCKET}`);
}
if (!dryRun && !targetArg) {
  throw new Error('Pass --local or --remote (or --dry-run for counts only)');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

type ListedObject = {
  bucket: (typeof BUCKETS)[number];
  path: string;
  key: string;
  size: number;
  contentType: string | null;
};

type BucketReport = {
  objects: number;
  bytes: number;
  copied: number;
  skipped: number;
  errors: number;
};

async function listBucket(bucket: (typeof BUCKETS)[number]): Promise<ListedObject[]> {
  const out: ListedObject[] = [];

  async function walk(prefix: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix || undefined, {
        limit: PAGE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`[${bucket}] list ${prefix || '/'}: ${error.message}`);
      if (!data || data.length === 0) break;

      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        const isFolder = item.id === null;
        if (isFolder) {
          await walk(path);
          continue;
        }
        // Supabase's 0-byte folder sentinel is not user data.
        if (item.name === '.emptyFolderPlaceholder') continue;
        if (typeof item.metadata?.size !== 'number') {
          throw new Error(`[${bucket}] ${path} has no size in list metadata`);
        }
        const mimetype = typeof item.metadata?.mimetype === 'string' ? item.metadata.mimetype : null;
        out.push({ bucket, path, key: `${bucket}/${path}`, size: item.metadata.size, contentType: mimetype });
      }

      // Folder collapsing can return a short page with more rows behind it, so
      // only an empty page ends the walk.
      offset += data.length;
    }
  }

  await walk('');
  return out;
}

/** SigV4 needs RFC 3986 encoding; encodeURIComponent leaves !'()* alone. */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const FETCH_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 4;

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      const delay = 500 * 2 ** (attempt - 1);
      console.error(`${label}: attempt ${attempt} failed, retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function isoDateParts(now = new Date()): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function s3Request(opts: {
  method: 'GET' | 'HEAD' | 'PUT';
  key?: string;
  query?: Record<string, string>;
  body?: Buffer;
  contentType?: string;
}): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required for --remote');
  }

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = opts.key
    ? `/${REQUIRED_BUCKET}/${opts.key.split('/').map(rfc3986).join('/')}`
    : `/${REQUIRED_BUCKET}`;
  const queryEntries = Object.entries(opts.query ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = queryEntries
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .join('&');
  const body = opts.body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(body);
  const { amzDate, dateStamp } = isoDateParts();
  const region = 'auto';
  const service = 's3';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
  // Host is sent by fetch from the URL; it only needs to be part of the signature.
  const headers: Record<string, string> = {
    Authorization: authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    // R2 gzips text objects on the fly and fetch then drops content-length,
    // which HEAD relies on for the size check.
    'Accept-Encoding': 'identity',
  };
  if (opts.contentType) headers['Content-Type'] = opts.contentType;

  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body ? new Uint8Array(opts.body) : undefined,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const resBody = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, body: resBody };
}

/** R2's error XML (e.g. SignatureDoesNotMatch) holds no secret and is the only useful diagnostic. */
function s3Error(what: string, res: { status: number; body: Buffer }): Error {
  const detail = res.body.toString('utf8').replace(/\s+/g, ' ').slice(0, 500);
  return new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : ''}`);
}

async function remoteHeadSize(key: string): Promise<number | null> {
  return withRetry(`HEAD ${key}`, async () => {
    const res = await s3Request({ method: 'HEAD', key });
    if (res.status === 404) return null;
    if (res.status >= 400) throw s3Error(`R2 HEAD ${key}`, res);
    const length = res.headers.get('content-length');
    if (length === null) throw new Error(`R2 HEAD ${key} returned no content-length`);
    return Number(length);
  });
}

async function remotePut(key: string, body: Buffer, contentType: string): Promise<void> {
  await withRetry(`PUT ${key}`, async () => {
    const res = await s3Request({ method: 'PUT', key, body, contentType });
    if (res.status >= 400) throw s3Error(`R2 PUT ${key}`, res);
  });
}

/** ListObjectsV2 over the whole R2 bucket, grouped by top-level prefix, for the final count/bytes check. */
async function remoteListTotals(): Promise<Record<string, { objects: number; bytes: number }>> {
  const totals: Record<string, { objects: number; bytes: number }> = {};
  let token: string | undefined;
  for (;;) {
    const query: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' };
    if (token) query['continuation-token'] = token;
    const res = await withRetry('ListObjectsV2', () => s3Request({ method: 'GET', query }));
    if (res.status >= 400) throw s3Error('R2 ListObjectsV2', res);
    const xml = res.body.toString('utf8');
    for (const match of xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g)) {
      const key = decodeXml(match[1]);
      const size = Number(match[2]);
      const bucket = key.split('/')[0];
      totals[bucket] ??= { objects: 0, bytes: 0 };
      totals[bucket].objects += 1;
      totals[bucket].bytes += size;
    }
    const next = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    if (!next) break;
    token = decodeXml(next[1]);
  }
  return totals;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function wranglerPut(key: string, body: Buffer, contentType: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'ua-r2-'));
  const file = join(dir, 'object.bin');
  try {
    writeFileSync(file, body);
    execFileSync(
      'npx',
      [
        'wrangler',
        'r2',
        'object',
        'put',
        `${REQUIRED_BUCKET}/${key}`,
        '--file',
        file,
        '--local',
        '--content-type',
        contentType,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** wrangler does not need the Supabase or R2 secrets. */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.R2_SECRET_ACCESS_KEY;
  delete env.R2_ACCESS_KEY_ID;
  return env;
}

function contentTypeForPath(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt':
      return 'text/plain';
    case 'md':
      return 'text/markdown';
    case 'tex':
      return 'application/x-tex';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function downloadSupabase(bucket: (typeof BUCKETS)[number], path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`[${bucket}] download ${path}: ${error?.message || 'empty'}`);
  return Buffer.from(await data.arrayBuffer());
}

async function main() {
  const perBucket: Record<string, BucketReport> = {};
  const listed: ListedObject[] = [];

  for (const bucket of BUCKETS) {
    const objects = await listBucket(bucket);
    listed.push(...objects);
    perBucket[bucket] = {
      objects: objects.length,
      bytes: objects.reduce((sum, object) => sum + object.size, 0),
      copied: 0,
      skipped: 0,
      errors: 0,
    };
    console.log(`${bucket}: ${objects.length} objects, ${perBucket[bucket].bytes} bytes`);
  }

  const report = {
    ranAt: new Date().toISOString(),
    dryRun,
    target: targetArg,
    bucket: bucketName,
    buckets: perBucket,
    totals: {
      objects: listed.length,
      bytes: listed.reduce((sum, object) => sum + object.size, 0),
    },
  };

  if (dryRun || !targetArg) {
    const outDir = join('scripts', 'migrate', 'out');
    mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(outDir, `_copy-storage-dry-run-${stamp}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(`wrote ${file}`);
    return;
  }

  for (const object of listed) {
    try {
      let existing: number | null = null;
      if (targetArg === '--remote') {
        existing = await remoteHeadSize(object.key);
      }
      if (existing !== null && existing === object.size) {
        perBucket[object.bucket].skipped += 1;
        continue;
      }
      const body = await withRetry(`download ${object.key}`, () => downloadSupabase(object.bucket, object.path));
      if (body.length !== object.size) {
        throw new Error(`downloaded ${body.length} bytes, listing says ${object.size}`);
      }
      const type = object.contentType ?? contentTypeForPath(object.path);
      if (targetArg === '--local') {
        wranglerPut(object.key, body, type);
      } else {
        await remotePut(object.key, body, type);
        const stored = await remoteHeadSize(object.key);
        if (stored !== object.size) {
          throw new Error(`R2 has ${stored ?? 'no object'} after PUT, expected ${object.size} bytes`);
        }
      }
      perBucket[object.bucket].copied += 1;
    } catch (error) {
      perBucket[object.bucket].errors += 1;
      const message = error instanceof Error ? error.message : 'copy failed';
      console.error(`copy failed ${object.key}: ${message}`);
    }
  }

  let remote: Record<string, { objects: number; bytes: number }> | null = null;
  let mismatches: string[] = [];
  if (targetArg === '--remote') {
    remote = await remoteListTotals();
    mismatches = BUCKETS.filter((bucket) => {
      const got = remote?.[bucket] ?? { objects: 0, bytes: 0 };
      return got.objects !== perBucket[bucket].objects || got.bytes !== perBucket[bucket].bytes;
    });
  }

  let errors = 0;
  for (const bucket of BUCKETS) {
    const r = perBucket[bucket];
    errors += r.errors;
    const got = remote?.[bucket];
    const verify = got ? ` | R2 ${got.objects} objects, ${got.bytes} bytes${mismatches.includes(bucket) ? ' MISMATCH' : ' ok'}` : '';
    console.log(`${bucket}: copied ${r.copied}, skipped ${r.skipped}, errors ${r.errors}${verify}`);
  }

  const outDir = join('scripts', 'migrate', 'out');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(outDir, `_copy-storage-${targetArg.replace('--', '')}-${stamp}.json`);
  writeFileSync(file, JSON.stringify({
    ...report,
    buckets: perBucket,
    remote,
    mismatches,
  }, null, 2));
  console.log(`wrote ${file}`);

  if (errors > 0 || mismatches.length > 0) {
    console.error(`FAILED: ${errors} copy errors, ${mismatches.length} bucket mismatches`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
