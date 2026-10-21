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
  status: number;
  headers: [string, string][];
  body: string;
  /** Epoch ms when Better Auth produced it. */
  at: number;
}

/** How long a document lives, in the memo and in the shared store. */
export const DISCOVERY_TTL_MS = 60 * 60 * 1000;
/** What clients and CDNs in front of us are told. */
export const DISCOVERY_CLIENT_CACHE_CONTROL = 'public, max-age=300';

/**
 * Part of every stored key. The deployed version id (see well-known.ts) goes in
 * here, so a deploy never serves the previous deploy's documents; bump this to
 * drop every stored document of the same deploy.
 */
const STORE_VERSION = 'v1';
const FILLED_AT_HEADER = 'x-ua-discovery-at';
const MEMO_MAX_ENTRIES = 16;

function storeKey(url: string, deployVersion: string): Request {
  return new Request(`https://discovery-cache.invalid/${STORE_VERSION}/${encodeURIComponent(deployVersion)}/${encodeURIComponent(url)}`);
}

export function createDiscoveryHandler(deps: {
  isEnabled: () => boolean;
  /** Better Auth's handler. Always called with a GET for a miss. */
  fill: (request: Request) => Promise<Response>;
  store?: DiscoveryStore;
  /** The deployed Worker version, so stored documents never outlive the deploy that made them. */
  deployVersion?: () => string | Promise<string>;
  now?: () => number;
}): (request: Request) => Promise<Response> {
  const memo = new Map<string, Entry>();
  const now = deps.now ?? Date.now;

  function respond(entry: Entry, method: string): Response {
    const headers = new Headers(entry.headers);
    headers.set('Cache-Control', DISCOVERY_CLIENT_CACHE_CONTROL);
    return new Response(method === 'HEAD' ? null : entry.body, { status: entry.status, headers });
  }

  function remember(url: string, entry: Entry): void {
    memo.delete(url);
    memo.set(url, entry);
    if (memo.size > MEMO_MAX_ENTRIES) {
      const oldest = memo.keys().next().value;
      if (oldest !== undefined) memo.delete(oldest);
    }
  }

  const fresh = (entry: Entry) => now() - entry.at < DISCOVERY_TTL_MS;
  const version = async () => (deps.deployVersion ? await deps.deployVersion() : 'unversioned');

  return async function serve(request: Request): Promise<Response> {
    if (!deps.isEnabled()) return new Response('Not Found', { status: 404 });
    // Only GET and HEAD are cached. Anything else goes to Better Auth as before.
    if (request.method !== 'GET' && request.method !== 'HEAD') return deps.fill(request);

    const url = request.url;
    const inMemo = memo.get(url);
    if (inMemo && fresh(inMemo)) return respond(inMemo, request.method);

    if (deps.store) {
      try {
        const stored = await deps.store.match(storeKey(url, await version()));
        if (stored) {
          const at = Number(stored.headers.get(FILLED_AT_HEADER));
          const headers: [string, string][] = [];
          stored.headers.forEach((value, name) => {
            if (name !== FILLED_AT_HEADER) headers.push([name, value]);
          });
          const entry: Entry = { status: stored.status, headers, body: await stored.text(), at };
          if (Number.isFinite(at) && fresh(entry)) {
            remember(url, entry);
            return respond(entry, request.method);
          }
        }
      } catch (error) {
        console.error('[mcp] discovery cache read failed', error instanceof Error ? error.message : error);
      }
    }

    // Miss. HEAD is filled with a GET so the document can be kept; the body is dropped when answering.
    const upstream = await deps.fill(new Request(url, { method: 'GET', headers: request.headers }));
    const isJson = upstream.headers.get('content-type')?.includes('application/json') ?? false;
    if (upstream.status !== 200 || !isJson) {
      return request.method === 'HEAD'
        ? new Response(null, { status: upstream.status, headers: upstream.headers })
        : upstream;
    }

    const headers: [string, string][] = [];
    upstream.headers.forEach((value, name) => headers.push([name, value]));
    const entry: Entry = { status: upstream.status, headers, body: await upstream.text(), at: now() };
    remember(url, entry);

    if (deps.store) {
      try {
        const toStore = new Headers(entry.headers);
        toStore.set('Cache-Control', `public, max-age=${DISCOVERY_TTL_MS / 1000}`);
        toStore.set(FILLED_AT_HEADER, String(entry.at));
        await deps.store.put(storeKey(url, await version()), new Response(entry.body, { status: entry.status, headers: toStore }));
      } catch (error) {
        console.error('[mcp] discovery cache write failed', error instanceof Error ? error.message : error);
      }
    }
    return respond(entry, request.method);
  };
}
