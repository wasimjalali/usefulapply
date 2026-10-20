import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { FeedError } from '@/lib/services/feed/errors';
import { loadSavedJobs } from '@/lib/services/feed/inbox';

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

    const jobs = await loadSavedJobs(user.id);

    return NextResponse.json({ jobs });
  } catch (error) {
    if (error instanceof FeedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[job-feed/saved] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load saved jobs.' }, { status: 500 });
  }
}
