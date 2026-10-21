import { getAuth } from '@/auth/server';
import { isMcpEnabled } from '@/lib/mcp/config';
import { createDiscoveryHandler, type DiscoveryStore } from '@/lib/mcp/well-known-cache';

/** The Workers Cache API where it exists (deployed and in wrangler), nothing under plain Node. */
function workersCache(): DiscoveryStore | undefined {
  return (globalThis as { caches?: { default?: DiscoveryStore } }).caches?.default;
}

/**
 * Better Auth's OAuth provider answers its discovery documents from the auth
 * handler's request hook, but the handler only sees /api/auth/* on its own.
 * The well-known routes live at the site root (RFC 8414 / RFC 9728 put them
 * there, with the issuer or resource path appended), so these Next routes hand
 * the request to the handler unchanged.
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
});
