import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import { isMcpTestMode } from '@/lib/mcp/config';

/**
 * Transport for Client ID Metadata Documents (and a CIMD client's `jwks_uri`).
 *
 * NOT production-safe yet, which is why CIMD is off unless MCP_CIMD_ENABLED.
 * Better Auth asks a transport to resolve the hostname once, reject special-use
 * addresses, connect to that approved address while keeping the TLS identity of
 * the hostname, and refuse redirects. `@better-auth/cimd/node` does it with
 * node:dns and node:https. Workers has no resolve-and-pin: `fetch` resolves and
 * connects internally, so the address cannot be checked and then reused. What
 * is left here is the part an app can do: HTTPS GET/HEAD only, redirects
 * refused, a time limit and a size limit. `global_fetch_strictly_public`
 * (wrangler.jsonc) is a platform setting whose effect on hostnames that resolve
 * to private addresses is not documented, so it is not relied on.
 */
export const CIMD_FETCH_TIMEOUT_MS = 4_000;
export const CIMD_MAX_BODY_BYTES = 5 * 1024;

/** Fixture served only in test mode on localhost, so the CIMD flow can run without a public host. */
export const CIMD_TEST_CLIENT_ID = 'https://cimd-fixture.example.com/client.json';
const CIMD_TEST_DOCUMENT = {
  client_id: CIMD_TEST_CLIENT_ID,
  client_name: 'CIMD Fixture Client',
  redirect_uris: ['http://localhost:8799/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
};

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new TypeError('metadata document is too large');
  }
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TypeError('metadata document is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (input, init) => {
  // Not `new Request(input, init)`: Better Auth passes `redirect: "error"`, which Workers' Request rejects.
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (url.protocol !== 'https:') throw new TypeError('metadata URL must be HTTPS');
  if (method !== 'GET' && method !== 'HEAD') {
    throw new TypeError('metadata fetch supports only GET and HEAD');
  }

  if (isMcpTestMode() && url.href === CIMD_TEST_CLIENT_ID) {
    return new Response(JSON.stringify(CIMD_TEST_DOCUMENT), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60' },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIMD_FETCH_TIMEOUT_MS);
  const upstream = init?.signal;
  if (upstream) {
    if (upstream.aborted) controller.abort();
    else upstream.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      // Never followed. The caller treats a non-200 as an invalid document.
      return new Response(null, { status: response.status });
    }
    if (method === 'HEAD') return new Response(null, { status: response.status, headers: response.headers });

    const body = await readCapped(response, CIMD_MAX_BODY_BYTES);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(body, { status: response.status, headers });
  } finally {
    clearTimeout(timer);
  }
};
