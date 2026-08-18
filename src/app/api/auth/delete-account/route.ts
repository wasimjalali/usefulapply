import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getAuth, getCurrentUser } from '@/auth/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getDb } from '@/db/client';
import { user as authUser } from '@/db/schema';
import { deletePrefix } from '@/storage/r2';
import { ALLOWED_FILE_BUCKETS } from '@/storage/paths';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(`delete-account:${user.id}`, RATE_LIMITS['delete-account']);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const userId = user.id;
    const auth = await getAuth();

    // Order: files, app data, then the auth user row. Anything that fails
    // before the user row is gone leaves the account signed in, so the user
    // can simply retry; nothing is orphaned without a way back to it.
    for (const bucket of ALLOWED_FILE_BUCKETS) {
      await deletePrefix(`${bucket}/${userId}/`);
    }

    const { deleteAllUserData } = await import('@/db/repos/admin');
    await deleteAllUserData(userId);

    // user row last (sessions/accounts cascade).
    const db = await getDb();
    await db.delete(authUser).where(eq(authUser.id, userId));

    // Clear this request's session + cookieCache so the 5-minute cache
    // cannot keep a deleted account authenticated.
    try {
      await auth.api.signOut({ headers: request.headers });
    } catch (error) {
      console.error('[delete-account] signOut failed after user row was deleted:', error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[delete-account] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
