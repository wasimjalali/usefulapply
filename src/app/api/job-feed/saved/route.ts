import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { canViewJobFeed } from '@/lib/job-feed/helpers';
import { listSavedJobFeedItemsAdmin } from '@/lib/job-feed/server';
import { getProfile } from '@/db/repos/profiles';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-saved:${user.id}`, RATE_LIMITS['job-feed-saved']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const profile = await getProfile(user.id);

    if (!profile) {
      console.error('[job-feed/saved] profile load error: profile not found');
      return NextResponse.json({ error: 'Failed to load saved jobs.' }, { status: 500 });
    }

    if (!canViewJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const jobs = await listSavedJobFeedItemsAdmin({ userId: user.id });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[job-feed/saved] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load saved jobs.' }, { status: 500 });
  }
}
