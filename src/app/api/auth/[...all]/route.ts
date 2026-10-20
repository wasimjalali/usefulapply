import { NextResponse } from 'next/server';
import { getAuth } from '@/auth/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

type Limit = { key: string; config: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS] };

/** MCP OAuth endpoints (authorize, token, revoke, register, ...). Registration is unauthenticated, so it gets its own tight bucket. */
function oauthLimit(pathname: string): Limit | null {
  if (pathname.includes('/oauth2/register')) return { key: 'mcp-register', config: RATE_LIMITS['mcp-register'] };
  if (pathname.includes('/oauth2/')) return { key: 'mcp-oauth', config: RATE_LIMITS['mcp-oauth'] };
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

export async function GET(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
  const blocked = await rateLimited(request, oauthLimit(pathname));
  if (blocked) return blocked;

  const auth = await getAuth();
  return auth.handler(request);
}

export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
  const limit: Limit | null =
    pathname.endsWith('/sign-up/email')
      ? { key: 'signup', config: RATE_LIMITS.signup }
      : pathname.endsWith('/request-password-reset')
        ? { key: 'forgot-password', config: RATE_LIMITS['forgot-password'] }
        : pathname.endsWith('/sign-in/email')
          ? { key: 'signin', config: RATE_LIMITS.signin }
          : pathname.endsWith('/delete-user')
            ? { key: 'delete-account', config: RATE_LIMITS['delete-account'] }
            : oauthLimit(pathname);

  const blocked = await rateLimited(request, limit);
  if (blocked) return blocked;

  const auth = await getAuth();
  return auth.handler(request);
}
