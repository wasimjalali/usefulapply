import { type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { getSafeNextPath } from '@/lib/auth/safe-next';

/**
 * GET /auth/confirm
 *
 * Compatibility hop for verification emails. Better Auth verifies at
 * /api/auth/verify-email?token=... and then sends the browser to callbackURL.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = getSafeNextPath(searchParams.get('next'), '/dashboard');
  const errorPath = '/auth/auth-code-error';
  const token = searchParams.get('token') ?? searchParams.get('token_hash');

  if (token) {
    const callbackURL = `/auth/callback?next=${encodeURIComponent(next)}&from_confirm=1`;
    redirect(
      `/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callbackURL)}`
    );
  }

  redirect(
    `${errorPath}?error=missing_token&error_description=${encodeURIComponent(
      'Missing verification token. Please use the link from your email.'
    )}`
  );
}
