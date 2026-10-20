import { getCloudflareContext } from '@opennextjs/cloudflare';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getProfile } from '@/db/repos/profiles';
import type { FontFileLoader } from '@/lib/cv-templates/fonts';
import { CONTENT_TYPES, extensionFor } from './filenames';
import type { BrowserRunBinding } from './pdf';
import { renderExport, type RenderedExport } from './render';
import { ExportInputError, exportCacheHash, resolveExport } from './resolve';
import { SigningUnavailableError, exportPathKey, signExportLink } from './signing';
import { headExport, storeExport } from './storage';
import { loadKitFromSession } from './kit-loader';
import type { ExportRequest, ExportedFile, KitLoader } from './types';

export { ExportInputError } from './resolve';
export { ExportRenderError } from './pdf';
export { ExportTooLargeError } from './render';
export { SigningUnavailableError } from './signing';
export * from './filenames';
export type { ExportRequest, ExportedFile, KitLoader, ExportOptions } from './types';

declare global {
  interface CloudflareEnv {
    BROWSER?: BrowserRunBinding;
    ASSETS?: { fetch(request: Request | string): Promise<Response> };
  }
}

/** The caller renders too often. Cache hits never raise this. */
export class ExportRateLimitedError extends Error {
  constructor() {
    super('Too many exports.');
    this.name = 'ExportRateLimitedError';
  }
}

/** Renders that miss the cache cost browser time, so they have their own, tighter limits. */
export const RENDER_LIMIT_PER_MINUTE = 6;
export const RENDER_LIMIT_PER_DAY = 100;

async function defaultRenderLimits(userId: string, env: CloudflareEnv | null): Promise<void> {
  const minute = await checkRateLimit(`exports-render:${userId}`, RATE_LIMITS['exports-render']);
  if (!minute.allowed) throw new ExportRateLimitedError();
  // The daily count lives in KV with a one-day expiry. It is a guard against a runaway client, not a ledger,
  // so a read-then-write race that lets a few extra renders through is fine.
  const kv = env?.CONTEXT_CACHE;
  if (!kv) return;
  const key = `export-render:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await kv.get(key)) ?? 0);
  if (used >= RENDER_LIMIT_PER_DAY) throw new ExportRateLimitedError();
  await kv.put(key, String(used + 1), { expirationTtl: 90_000 });
}

/**
 * A render can take more than one browser call (the footer overlay, the fit pass). The first is counted by
 * `defaultRenderLimits`; these are counted against the same daily budget afterwards.
 */
async function defaultCountExtraRenders(userId: string, extra: number, env: CloudflareEnv | null): Promise<void> {
  const kv = env?.CONTEXT_CACHE;
  if (!kv || extra <= 0) return;
  const key = `export-render:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await kv.get(key)) ?? 0);
  await kv.put(key, String(used + extra), { expirationTtl: 90_000 });
}

export interface ExportDeps {
  /** Called before a render that missed the cache. Defaults to the per-minute and per-day limits. */
  beforeRender?: (userId: string) => Promise<void>;
  /** Called after a render with the browser renders beyond the first, so they count against the daily budget. */
  afterRender?: (userId: string, extraRenders: number) => Promise<void>;
  /** Called before a rendered file is stored, so an account deleted mid-render leaves nothing behind. */
  userExists?: (userId: string) => Promise<boolean>;
  loadKit?: KitLoader;
  browser?: BrowserRunBinding | null;
  loadFont?: FontFileLoader;
  secret?: string;
  now?: number;
}

async function defaultUserExists(userId: string): Promise<boolean> {
  return (await getProfile(userId)) !== null;
}

async function envBindings(): Promise<CloudflareEnv | null> {
  try {
    return (await getCloudflareContext({ async: true })).env;
  } catch {
    return null;
  }
}

/**
 * Fonts come from the same files the canvas loads. On the Worker they are read
 * from the assets binding; under plain `next dev` they are read from public/.
 */
function assetFontLoader(env: CloudflareEnv | null): FontFileLoader {
  const cache = new Map<string, Promise<Uint8Array>>();
  return (file) => {
    let pending = cache.get(file);
    if (!pending) {
      pending = (async () => {
        if (env?.ASSETS) {
          try {
            // A URL string, not a Request: the dev proxy of the binding only takes strings.
            const res = await env.ASSETS.fetch(`https://assets.invalid/fonts/${file}`);
            if (res.ok) return new Uint8Array(await res.arrayBuffer());
          } catch {
            // Fall through to the file system in development.
          }
        }
        if (process.env.NODE_ENV !== 'production') {
          const { readFile } = await import('node:fs/promises');
          const { join } = await import('node:path');
          return new Uint8Array(await readFile(join(process.cwd(), 'public', 'fonts', file)));
        }
        throw new Error(`Font ${file} could not be loaded.`);
      })();
      cache.set(file, pending);
    }
    return pending;
  };
}

/**
 * Renders one document of an application and hands back a signed link.
 *
 * Ownership: the kit is loaded with the caller's user id, so another user's
 * application is simply "not found", and the stored object's key carries the
 * owner. An identical earlier export is served from the cache without
 * rendering again, after the same ownership check.
 *
 * Callers: POST /api/exports (the web app), and the MCP `export_documents`
 * tool. It throws typed errors; neither caller sends their messages onward.
 */
export async function exportDocument(req: ExportRequest, deps: ExportDeps = {}): Promise<ExportedFile> {
  const started = Date.now();
  // Signing is checked first: without the secret a render would be wasted on a file nobody can fetch.
  const secret = deps.secret ?? process.env.EXPORT_SIGNING_SECRET;
  if (!secret) throw new SigningUnavailableError();
  const env = await envBindings();
  const loadKit = deps.loadKit ?? loadKitFromSession;

  const kit = await loadKit(req.userId, req.applicationId);
  if (!kit) throw new ExportInputError('NOT_FOUND', 'Application not found.');

  const resolved = resolveExport(kit, req.format, req);
  const hash = await exportCacheHash(resolved);
  const ext = extensionFor(req.format);
  const pathKey = exportPathKey(req.userId, hash, ext);

  let cached = true;
  let fileName: string | null = null;
  let size = 0;
  const stored = await headExport(pathKey);
  // The object must belong to this user, whatever its key says.
  if (stored && stored.customMetadata?.userId === req.userId && stored.customMetadata.fileName) {
    fileName = stored.customMetadata.fileName;
    size = stored.size;
  }

  if (!fileName) {
    cached = false;
    await (deps.beforeRender ?? ((userId: string) => defaultRenderLimits(userId, env)))(req.userId);
    // Browser calls are counted as they happen, so an export that fails halfway still counts against the daily budget.
    let browserCalls = 0;
    let rendered: RenderedExport;
    try {
      rendered = await renderExport(resolved, {
        browser: deps.browser === undefined ? env?.BROWSER ?? null : deps.browser,
        loadFont: deps.loadFont ?? assetFontLoader(env),
        onRender: () => {
          browserCalls++;
        },
      });
    } finally {
      await (deps.afterRender ?? ((userId: string, extra: number) => defaultCountExtraRenders(userId, extra, env)))(req.userId, browserCalls - 1).catch(() => undefined);
    }
    if (!(await (deps.userExists ?? defaultUserExists)(req.userId))) throw new ExportInputError('NOT_FOUND', 'Application not found.');
    await storeExport(pathKey, rendered.bytes, rendered.contentType, { userId: req.userId, fileName: rendered.fileName, displayName: rendered.displayName });
    fileName = rendered.fileName;
    size = rendered.bytes.length;
  }

  const link = await signExportLink({
    userId: req.userId,
    pathKey,
    secret,
    now: deps.now,
  });

  console.log(`[export] ${req.format} ${cached ? 'cache-hit' : 'rendered'} ${size}b in ${Date.now() - started}ms`);
  return {
    format: req.format,
    fileName,
    contentType: CONTENT_TYPES[ext],
    bytes: size,
    url: link.path,
    expiresAt: link.expiresAt,
    cached,
    templateId: resolved.templateId,
    paper: resolved.paper,
    layout: resolved.layout,
  };
}

