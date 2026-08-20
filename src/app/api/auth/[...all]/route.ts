import { NextResponse } from 'next/server';
import { getAuth } from '@/auth/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await getAuth();
  return auth.handler(request);
}

export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
  const limit =
    pathname.endsWith('/sign-up/email')
      ? { key: 'signup', config: RATE_LIMITS.signup }
      : pathname.endsWith('/request-password-reset')
        ? { key: 'forgot-password', config: RATE_LIMITS['forgot-password'] }
        : pathname.endsWith('/sign-in/email')
          ? { key: 'signin', config: RATE_LIMITS.signin }
          : pathname.endsWith('/delete-user')
            ? { key: 'delete-account', config: RATE_LIMITS['delete-account'] }
            : null;

  if (limit) {
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkRateLimit(`${limit.key}:${clientIP}`, limit.config);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }
  }

  const auth = await getAuth();
  return auth.handler(request);
}
