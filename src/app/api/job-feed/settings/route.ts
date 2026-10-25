import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { FeedError } from '@/lib/services/feed/errors';
import { saveFeedSettings } from '@/lib/services/feed/settings';

export const runtime = 'nodejs';

export async function PUT(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-settings:${user.id}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const result = await saveFeedSettings({
      userId: user.id,
      readBody: () => request.json(),
      clientRequestId: request.headers.get('x-request-id'),
      llmRoute: '/api/job-feed/settings',
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FeedError) {
      // A stale save says so by code, so the form reloads instead of showing a generic conflict.
      const stale = error.code === 'stale_settings' ? { code: error.code } : {};
      return NextResponse.json({ error: error.message, ...stale }, { status: error.status });
    }
    console.error('[job-feed/settings] PUT unexpected error:', error);
    return NextResponse.json({ error: 'Failed to save job feed settings.' }, { status: 500 });
  }
}
