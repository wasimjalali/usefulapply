/**
 * Cache for the OAuth discovery documents. The documents are static, but
 * producing them through Better Auth costs a full auth init and D1 round trips
 * (1 to 3 s on a cold Worker), and Claude.ai's connector check gives up after
 * 5 s. A miss still asks Better Auth, so the cached JSON can't drift from it.
 *
 * Two layers: a small per-isolate memo, then a shared store (the Workers Cache
 * API). Only 200 JSON answers are kept. There's no cross-request single-flight:
 * a promise shared between requests never settles if its owner disconnects, so
 * every request that misses both layers fills for itself. The caller checks MCP_ENABLED before
 * anything here runs, so a cached document is never served while MCP is off.
 */

export interface DiscoveryStore {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
}

interface Entry {
  contentType: string;
  /** Better Auth's own Cache-Control, replayed to clients as is. */
  cacheControl: string | null;
  body: string;
  /** Epoch ms when Better Auth produced it. */
  at: number;
}

/** How long a document lives, in the memo and in the shared store. */
export const DISCOVERY_TTL_MS = 60 * 60 * 1000;

/**
 * Part of every stored key. The deployed version id (see well-known.ts) goes in
 * here, so a deploy never serves the previous deploy's documents; bump this to
 * drop every stored document of the same deploy.
 */
const STORE_VERSION = 'v1';
const FILLED_AT_HEADER = 'x-ua-discovery-at';
/** Carries Better Auth's Cache-Control through the store, whose own Cache-Control sets the store TTL. */
const CLIENT_CC_HEADER = 'x-ua-discovery-cc';
const MEMO_MAX_ENTRIES = 16;

function storeKey(url: string, deployVersion: string): Request {
  return new Request(`https://discovery-cache.invalid/${STORE_VERSION}/${encodeURIComponent(deployVersion)}/${encodeURIComponent(url)}`);
}

export function createDiscoveryHandler(deps: {
  isEnabled: () => boolean;
  /**
   * Better Auth's handler. Always called with a clean GET for a miss: the only caller header copied in is
   * cf-connecting-ip, so Better Auth's rate limiter can tell clients apart.
   */
  fill: (request: Request) => Promise<Response>;
  store?: DiscoveryStore;
  /**
   * The deployed Worker version, so stored documents never outlive the deploy that made them.
   * Returning undefined means it's unknown: the shared store is then not used at all (memo only).
   */
  deployVersion?: () => string | undefined | Promise<string | undefined>;
  /** Runs a promise past the response (ctx.waitUntil). Resolves false when it can't, and the caller awaits instead. */
  waitUntil?: (promise: Promise<unknown>) => Promise<boolean>;
  now?: () => number;
}): (request: Request) => Promise<Response> {
  const memo = new Map<string, Entry>();
  const now = deps.now ?? Date.now;

  function respond(entry: Entry, method: string): Response {
    const headers = new Headers({ 'Content-Type': entry.contentType });
    if (entry.cacheControl) headers.set('Cache-Control', entry.cacheControl);
    return new Response(method === 'HEAD' ? null : entry.body, { status: 200, headers });
  }

  /** Newest last; the oldest goes when the memo is full. A hit calls this too, so it's a true LRU. */
  function remember(key: string, entry: Entry): void {
    memo.delete(key);
    memo.set(key, entry);
    if (memo.size > MEMO_MAX_ENTRIES) {
      const oldest = memo.keys().next().value;
      if (oldest !== undefined) memo.delete(oldest);
    }
  }

  const fresh = (entry: Entry) => now() - entry.at < DISCOVERY_TTL_MS;

  /** A clean GET for Better Auth. Only cf-connecting-ip is copied from the caller (for its rate limiter). */
  function fillRequest(key: string, caller: Request): Request {
    const headers = new Headers();
    const ip = caller.headers.get('cf-connecting-ip');
    if (ip) headers.set('cf-connecting-ip', ip);
    return new Request(key, { method: 'GET', headers });
  }

  async function passthrough(upstream: Response, method: string): Promise<Response> {
    if (method !== 'HEAD') return upstream;
    try {
      await upstream.body?.cancel();
    } catch {
      // Dropping the body is all that matters here.
    }
    return new Response(null, { status: upstream.status, headers: upstream.headers });
  }

  async function writeStore(deployVersion: string, key: string, entry: Entry): Promise<void> {
    try {
      const headers = new Headers({
        'Content-Type': entry.contentType,
        'Cache-Control': `public, max-age=${DISCOVERY_TTL_MS / 1000}`,
        [FILLED_AT_HEADER]: String(entry.at),
      });
      if (entry.cacheControl) headers.set(CLIENT_CC_HEADER, entry.cacheControl);
      await deps.store!.put(storeKey(key, deployVersion), new Response(entry.body, { status: 200, headers }));
    } catch (error) {
      console.error('[mcp] discovery cache write failed', error instanceof Error ? error.message : error);
    }
  }

  return async function serve(request: Request): Promise<Response> {
    if (!deps.isEnabled()) return new Response('Not Found', { status: 404 });
    // Only GET and HEAD are cached. Anything else goes to Better Auth as before.
    if (request.method !== 'GET' && request.method !== 'HEAD') return deps.fill(request);

    // The documents ignore the query string, so it isn't part of the key (no cache-busting by query).
    const parsed = new URL(request.url);
    const key = parsed.origin + parsed.pathname;

    const inMemo = memo.get(key);
    if (inMemo && fresh(inMemo)) {
      remember(key, inMemo);
      return respond(inMemo, request.method);
    }

    // No known deploy version means no shared store (memo only).
    const deployVersion = deps.store ? await deps.deployVersion?.() : undefined;
    if (deps.store && deployVersion !== undefined) {
      try {
        const stored = await deps.store.match(storeKey(key, deployVersion));
        const filledAt = stored?.headers.get(FILLED_AT_HEADER);
        if (stored && filledAt) {
          const entry: Entry = {
            contentType: stored.headers.get('content-type') ?? 'application/json',
            cacheControl: stored.headers.get(CLIENT_CC_HEADER),
            body: await stored.text(),
            at: Number(filledAt),
          };
          if (Number.isFinite(entry.at) && fresh(entry)) {
            remember(key, entry);
            return respond(entry, request.method);
          }
        }
      } catch (error) {
        console.error('[mcp] discovery cache read failed', error instanceof Error ? error.message : error);
      }
    }

    // Miss. HEAD is filled with a GET so the document can be kept; the body is dropped when answering.
    const upstream = await deps.fill(fillRequest(key, request));
    const contentType = upstream.headers.get('content-type');
    if (upstream.status !== 200 || !contentType?.includes('application/json')) {
      return passthrough(upstream, request.method);
    }

    // Only these two headers are kept and replayed: never set-cookie, vary, cf-*, age, date or CORS.
    const entry: Entry = {
      contentType,
      cacheControl: upstream.headers.get('cache-control'),
      body: await upstream.text(),
      at: now(),
    };
    remember(key, entry);

    if (deps.store && deployVersion !== undefined) {
      const write = writeStore(deployVersion, key, entry);
      const scheduled = deps.waitUntil ? await deps.waitUntil(write) : false;
      if (!scheduled) await write;
    }
    return respond(entry, request.method);
  };
}
