import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getAuth } from '@/auth/server';
import { isMcpEnabled } from '@/lib/mcp/config';
import { createDiscoveryHandler, type DiscoveryStore } from '@/lib/mcp/well-known-cache';

/** The Workers Cache API where it exists (deployed and in wrangler), nothing under plain Node. */
function workersCache(): DiscoveryStore | undefined {
  return (globalThis as { caches?: { default?: DiscoveryStore } }).caches?.default;
}

let missingVersionReported = false;
/** Loud, once per isolate: without a version id the shared discovery store is off. */
function reportMissingVersion(error: unknown): void {
  if (missingVersionReported) return;
  missingVersionReported = true;
  console.error(
    '[mcp] discovery cache: no deploy version (CF_VERSION_METADATA), shared store disabled, memo only',
    error instanceof Error ? error.message : error,
  );
}

/**
 * Better Auth's OAuth provider answers its discovery documents from the auth
 * handler's request hook, but the handler only sees /api/auth/* on its own.
 * The well-known routes live at the site root (RFC 8414 / RFC 9728 put them
 * there, with the issuer or resource path appended), so these Next routes hand
 * the handler a clean GET for the same path.
 *
 * The documents are static, so they are cached (see well-known-cache.ts): a miss still asks Better Auth.
 * `store` is a getter so `caches` is looked up per request and plain Node (tests) just has no store.
 */
export const serveWellKnown = createDiscoveryHandler({
  isEnabled: isMcpEnabled,
  fill: async (request) => (await getAuth()).handler(request),
  get store() {
    return workersCache();
  },
  // CF_VERSION_METADATA (wrangler.jsonc): a new id per deploy, so a deploy never serves the last one's documents.
  // Without it the shared store is skipped (memo only), so a stale document can't outlive a deploy.
  deployVersion: async () => {
    try {
      const { env } = await getCloudflareContext({ async: true });
      const id = (env as { CF_VERSION_METADATA?: { id?: string } }).CF_VERSION_METADATA?.id;
      if (id) return id;
      reportMissingVersion(new Error('CF_VERSION_METADATA binding has no id'));
    } catch (error) {
      reportMissingVersion(error);
    }
    return undefined;
  },
  waitUntil: async (promise) => {
    try {
      const { ctx } = await getCloudflareContext({ async: true });
      ctx.waitUntil(promise);
      return true;
    } catch {
      return false;
    }
  },
});
