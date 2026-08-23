import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/auth/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getSiteUrl } from '@/lib/auth/site-url';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkRateLimit(`signup:${clientIP}`, RATE_LIMITS['signup']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
      resendOnly?: boolean;
      plan?: string;
    };
    const { email, password, fullName, resendOnly } = body;
    const plan = body.plan === 'plus' || body.plan === 'max' ? body.plan : undefined;

    if (!email || (!resendOnly && !password)) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    if (password && password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    if (email.length > 254) {
      return NextResponse.json({ error: 'Email address is too long.' }, { status: 400 });
    }
    if (fullName && fullName.length > 200) {
      return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
    }

    const siteUrl = getSiteUrl(new URL(request.url).origin);
    const auth = await getAuth();
    const next = plan ? `/pricing?checkout=${plan}` : undefined;
    const callbackURL = next
      ? `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`
      : `${siteUrl}/auth/callback`;

    if (resendOnly) {
      try {
        await auth.api.sendVerificationEmail({
          body: { email, callbackURL },
        });
      } catch (error) {
        console.error('[/api/auth/signup] sendVerificationEmail error:', error);
        // Unknown address stays 200 so this endpoint cannot be used to test
        // whether an account exists. A real send failure is the only 500.
        if (isUnknownVerificationTarget(error)) {
          return NextResponse.json({ success: true });
        }
        return NextResponse.json(
          { error: "We couldn't send that email. Try again in a moment." },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true });
    }

    try {
      await auth.api.signUpEmail({
        body: {
          email,
          password: password!,
          name: (fullName ?? '').trim() || email.split('@')[0],
          callbackURL,
        },
      });
    } catch (error) {
      console.error('[/api/auth/signup] signUpEmail error:', error);
      return NextResponse.json(
        { error: 'Failed to create account. Please try again.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/auth/signup] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

function isUnknownVerificationTarget(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { body?: { code?: string } };
  return record.body?.code === 'USER_NOT_FOUND';
}
