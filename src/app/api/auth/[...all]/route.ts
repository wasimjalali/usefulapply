import { NextResponse } from 'next/server';
import { getAuth } from '@/auth/server';
import { MAX_REGISTRATION_BODY_BYTES } from '@/lib/mcp/guards';
import { isMcpEnabled } from '@/lib/mcp/config';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

type Limit = { key: string; config: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS] };

/**
 * The OAuth provider endpoints a client or the consent page may call. The
 * provider ships more (create, update and delete client, consent admin,
 * end-session): none are used here, and open registration plus a user session
 * would otherwise let anyone with an account manage clients. Everything else
 * under /oauth2/ is a 404.
 */
const OAUTH_ENDPOINTS: ReadonlySet<string> = new Set([
  'authorize',
  'token',
  'register',
  'revoke',
  'introspect',
  'userinfo',
  'consent',
  'continue',
  'public-client',
  'public-client-prelogin',
]);

function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

/** Path below /api/auth, no trailing slash. */
function subPath(request: Request): string {
  return new URL(request.url).pathname.replace(/\/+$/, '').replace(/^\/api\/auth/, '');
}

/**
 * True when the request is for the authorization server or the signing keys:
 * 404 while MCP is off, and the jwt plugin's session-token endpoint (/token)
 * is never served (nothing uses it and the /mcp check only accepts OAuth
 * access tokens).
 */
function oauthSurfaceBlocked(sub: string): boolean {
  if (sub === '/token') return true;
  const isOAuth = sub.startsWith('/oauth2/') || sub === '/jwks' || sub.startsWith('/.well-known/');
  if (!isOAuth) return false;
  if (!isMcpEnabled()) return true;
  if (sub.startsWith('/oauth2/')) return !OAUTH_ENDPOINTS.has(sub.slice('/oauth2/'.length));
  return false;
}

/** MCP OAuth endpoints. Registration is unauthenticated, so it gets its own tight bucket. */
function oauthLimit(sub: string): Limit | null {
  if (sub === '/oauth2/register') return { key: 'mcp-register', config: RATE_LIMITS['mcp-register'] };
  if (sub.startsWith('/oauth2/')) return { key: 'mcp-oauth', config: RATE_LIMITS['mcp-oauth'] };
  return null;
}

async function rateLimited(request: Request, limit: Limit | null): Promise<NextResponse | null> {
  if (!limit) return null;
  const rateLimitResult = await checkRateLimit(`${limit.key}:${getClientIP(request)}`, limit.config);
  if (rateLimitResult.allowed) return null;
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimitResult.retryAfterMs ?? 60_000) / 1000)) },
    },
  );
}

/**
 * Read a registration body with a hard byte cap, before Better Auth parses it,
 * and hand it on as a fresh request. The Content-Length header is checked first
 * but is not trusted: the stream itself is counted.
 */
async function cappedRequest(request: Request): Promise<Request | NextResponse> {
  const tooLarge = () =>
    NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'registration request is too large' },
      { status: 413 },
    );
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_REGISTRATION_BODY_BYTES) return tooLarge();
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REGISTRATION_BODY_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new Request(request.url, { method: request.method, headers, body });
}

export async function GET(request: Request) {
  const sub = subPath(request);
  if (oauthSurfaceBlocked(sub)) return notFound();
  const blocked = await rateLimited(request, oauthLimit(sub));
  if (blocked) return blocked;

  const auth = await getAuth();
  return auth.handler(request);
}

export async function POST(request: Request) {
  const sub = subPath(request);
  if (oauthSurfaceBlocked(sub)) return notFound();
  const byPath: [string, Limit][] = [
    ['/sign-up/email', { key: 'signup', config: RATE_LIMITS.signup }],
    ['/request-password-reset', { key: 'forgot-password', config: RATE_LIMITS['forgot-password'] }],
    // Sends mail to any address, so it shares the forgot-password limits (its own counter per IP).
    ['/send-verification-email', { key: 'send-verification', config: RATE_LIMITS['forgot-password'] }],
    ['/sign-in/email', { key: 'signin', config: RATE_LIMITS.signin }],
    ['/delete-user', { key: 'delete-account', config: RATE_LIMITS['delete-account'] }],
  ];
  const limit: Limit | null = byPath.find(([suffix]) => sub.endsWith(suffix))?.[1] ?? oauthLimit(sub);

  const blocked = await rateLimited(request, limit);
  if (blocked) return blocked;

  let forwarded = request;
  if (sub === '/oauth2/register') {
    const capped = await cappedRequest(request);
    if (capped instanceof NextResponse) return capped;
    forwarded = capped;
  }

  const auth = await getAuth();
  return auth.handler(forwarded);
}
