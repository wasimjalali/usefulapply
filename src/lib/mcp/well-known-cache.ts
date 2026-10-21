/**
 * Cache for the OAuth discovery documents. The documents are static, but
 * producing them through Better Auth costs a full auth init and D1 round trips
 * (1 to 3 s on a cold Worker), and Claude.ai's connector check gives up after
 * 5 s. A miss still asks Better Auth, so the cached JSON can't drift from it.
 *
 * Two layers: a small per-isolate memo, then a shared store (the Workers Cache
 * API). Only 200 JSON answers are kept. The caller checks MCP_ENABLED before
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
  /** Better Auth's handler. Always called with a clean GET (no caller headers) for a miss. */
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
  const inFlight = new Map<string, Promise<Entry | undefined>>();
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
  const version = async () => (deps.deployVersion ? await deps.deployVersion() : 'unversioned');

  function passthrough(upstream: Response, method: string): Response {
    return method === 'HEAD' ? new Response(null, { status: upstream.status, headers: upstream.headers }) : upstream;
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

    const pending = inFlight.get(key);
    if (pending) {
      const shared = await pending;
      if (shared) return respond(shared, request.method);
      // The shared answer wasn't cacheable (or failed): ask Better Auth for ourselves.
      return passthrough(await deps.fill(new Request(key, { method: 'GET' })), request.method);
    }

    let raw: Response | undefined;
    const flight = (async (): Promise<Entry | undefined> => {
      const deployVersion = deps.store ? await version() : undefined;
      if (deps.store && deployVersion !== undefined) {
        try {
          const stored = await deps.store.match(storeKey(key, deployVersion));
          if (stored) {
            const at = Number(stored.headers.get(FILLED_AT_HEADER));
            const entry: Entry = {
              contentType: stored.headers.get('content-type') ?? 'application/json',
              cacheControl: stored.headers.get(CLIENT_CC_HEADER),
              body: await stored.text(),
              at,
            };
            if (Number.isFinite(at) && fresh(entry)) {
              remember(key, entry);
              return entry;
            }
          }
        } catch (error) {
          console.error('[mcp] discovery cache read failed', error instanceof Error ? error.message : error);
        }
      }

      // Miss. HEAD is filled with a GET so the document can be kept; the body is dropped when answering.
      const upstream = await deps.fill(new Request(key, { method: 'GET' }));
      const contentType = upstream.headers.get('content-type');
      if (upstream.status !== 200 || !contentType?.includes('application/json')) {
        raw = upstream;
        return undefined;
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
      return entry;
    })();
    inFlight.set(key, flight);
    try {
      const entry = await flight;
      return entry ? respond(entry, request.method) : passthrough(raw!, request.method);
    } finally {
      inFlight.delete(key);
    }
  };
}
