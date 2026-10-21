import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { FeedError } from '@/lib/services/feed/errors';
import { startFeedRun } from '@/lib/services/feed/run';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-run:${user.id}`, RATE_LIMITS['job-feed-run']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    let consentAccepted = false;
    try {
      const body = await request.json() as { consent_accepted?: unknown };
      consentAccepted = body?.consent_accepted === true;
    } catch {
      // Empty or non-JSON body is a missing assertion, not a parse bug.
    }

    return NextResponse.json(await startFeedRun({
      userId: user.id,
      clientRequestId: request.headers.get('x-request-id'),
      consentAccepted,
    }));
  } catch (error) {
    if (error instanceof FeedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[job-feed/run] error:', error);
    return NextResponse.json({
      error: 'Failed to run Job Feed.',
    }, { status: 500 });
  }
}
