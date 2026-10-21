import { NextRequest, NextResponse } from 'next/server';
import { captureJobFeedActionRejected } from '@/lib/job-feed/analytics';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { FeedError } from '@/lib/services/feed/errors';
import { recordFeedFeedback } from '@/lib/services/feed/feedback';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let userId: string | null = null;

  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      captureJobFeedActionRejected({
        route: 'feedback',
        action: 'unknown',
        reason: 'rate_limited_ip',
        status: 429,
      });
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      captureJobFeedActionRejected({
        route: 'feedback',
        action: 'unknown',
        reason: 'unauthenticated',
        status: 401,
      });
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    userId = user.id;

    const { allowed } = await checkRateLimit(`job-feed-feedback:${user.id}`, RATE_LIMITS['job-feed-feedback']);
    if (!allowed) {
      captureJobFeedActionRejected({
        userId,
        route: 'feedback',
        action: 'unknown',
        reason: 'rate_limited',
        status: 429,
      });
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const feedback = await recordFeedFeedback({ userId: user.id, body, analyticsRoute: 'feedback' });

    return NextResponse.json({ feedback });
  } catch (error) {
    if (error instanceof FeedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[job-feed/feedback] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to record job feed feedback.' }, { status: 500 });
  }
}
