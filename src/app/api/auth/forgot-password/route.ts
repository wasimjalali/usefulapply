import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/auth/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getSiteUrl } from '@/lib/auth/site-url';

export const runtime = 'nodejs';

/**
 * POST /api/auth/forgot-password
 *
 * Always returns { success: true } for valid-shaped requests to avoid
 * account enumeration (even when the email is unknown).
 */
export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkRateLimit(
      `forgot-password:${clientIP}`,
      RATE_LIMITS['forgot-password']
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many reset attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }
    if (email.length > 254 || !email.includes('@')) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const siteUrl = getSiteUrl(new URL(request.url).origin);
    const auth = await getAuth();
    try {
      await auth.api.requestPasswordReset({
        body: {
          email,
          redirectTo: `${siteUrl}/auth/reset-password`,
        },
      });
    } catch (error) {
      // Better Auth 1.7 returns 200 for unknown emails (no throw). Any
      // throw here is infrastructure or a disabled reset hook.
      console.error('[/api/auth/forgot-password] requestPasswordReset error:', error);
      return NextResponse.json(
        { error: 'An unexpected error occurred. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/auth/forgot-password] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
