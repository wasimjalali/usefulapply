import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { FontFileLoader } from '@/lib/cv-templates/fonts';
import { CONTENT_TYPES, extensionFor } from './filenames';
import type { BrowserRunBinding } from './pdf';
import { renderExport, type RenderedExport } from './render';
import { ExportInputError, exportCacheHash, resolveExport } from './resolve';
import { exportPathKey, signExportLink } from './signing';
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

export interface ExportDeps {
  loadKit?: KitLoader;
  browser?: BrowserRunBinding | null;
  loadFont?: FontFileLoader;
  secret?: string;
  now?: number;
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
  const env = deps.browser === undefined || !deps.loadFont ? await envBindings() : null;
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
    const rendered: RenderedExport = await renderExport(resolved, {
      browser: deps.browser === undefined ? env?.BROWSER ?? null : deps.browser,
      loadFont: deps.loadFont ?? assetFontLoader(env),
    });
    await storeExport(pathKey, rendered.bytes, rendered.contentType, { userId: req.userId, fileName: rendered.fileName });
    fileName = rendered.fileName;
    size = rendered.bytes.length;
  }

  const link = await signExportLink({
    userId: req.userId,
    pathKey,
    secret: deps.secret ?? process.env.EXPORT_SIGNING_SECRET,
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

