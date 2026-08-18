import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/auth/server';
import { RECOVERY_COOKIE } from '@/lib/auth/recovery-cookie';

export const runtime = 'nodejs';

/**
 * GET /api/auth/recovery-status
 * Returns whether this browser has a valid password-recovery marker cookie
 * and an authenticated session.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const hasMarker = cookieStore.get(RECOVERY_COOKIE)?.value === '1';
  if (!hasMarker) {
    return NextResponse.json({ authorized: false });
  }

  const user = await getCurrentUser(request);
  return NextResponse.json({ authorized: Boolean(user) });
}

/**
 * DELETE /api/auth/recovery-status
 * Clears the recovery marker after a successful password change.
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return NextResponse.json({ success: true });
}
