import { type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getSafeNextPath } from '@/lib/auth/safe-next';
import { getSiteUrl } from '@/lib/auth/site-url';
import { RECOVERY_COOKIE, RECOVERY_COOKIE_MAX_AGE_SEC } from '@/lib/auth/recovery-cookie';
import { cookies } from 'next/headers';

/**
 * GET /auth/confirm
 *
 * Server-side email link verification using token_hash (no PKCE code_verifier).
 * Works cross-device: signup confirmation and password recovery open from any browser.
 *
 * Uses next/navigation `redirect()` so cookies written by createClient()/verifyOtp
 * are merged onto the response (Next.js Route Handler behavior).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = getSiteUrl(request.nextUrl.origin);
  const next = getSafeNextPath(searchParams.get('next'), '/dashboard');
  const errorPath = '/auth/auth-code-error';

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');

  const supabase = await createClient();
  const cookieStore = await cookies();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error) {
      console.error('[/auth/confirm] verifyOtp error:', error.message);
      redirect(
        `${errorPath}?error=otp_expired&error_description=${encodeURIComponent(
          'This link is invalid or has expired. Please request a new one.'
        )}`
      );
    }

    if (type === 'recovery') {
      // Mark this browser as authorized to complete a password reset.
      // Prevents a random logged-in session from using /auth/reset-password.
      cookieStore.set(RECOVERY_COOKIE, '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: RECOVERY_COOKIE_MAX_AGE_SEC,
      });
      redirect(next.startsWith('/auth/reset-password') ? next : '/auth/reset-password');
    }

    // Signup / magiclink: hop through callback so post-confirm (welcome email) still runs.
    redirect(
      `/auth/callback?next=${encodeURIComponent(next)}&type=${encodeURIComponent(type)}&from_confirm=1`
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[/auth/confirm] exchangeCodeForSession error:', error.message);
      redirect(
        `${errorPath}?error=exchange_failed&error_description=${encodeURIComponent(
          'Could not complete sign-in. Please try again.'
        )}`
      );
    }
    if (next.startsWith('/auth/reset-password')) {
      cookieStore.set(RECOVERY_COOKIE, '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: RECOVERY_COOKIE_MAX_AGE_SEC,
      });
    }
    redirect(next);
  }

  void siteUrl;

  redirect(
    `${errorPath}?error=missing_token&error_description=${encodeURIComponent(
      'Missing verification token. Please use the link from your email.'
    )}`
  );
}
