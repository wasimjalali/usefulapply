import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { FeedError } from '@/lib/services/feed/errors';
import { loadInboxPage } from '@/lib/services/feed/inbox';

export const runtime = 'nodejs';

const MAX_PAGE_LIMIT = 50;

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

    const { allowed } = await checkRateLimit(`job-feed-inbox:${user.id}`, RATE_LIMITS['job-feed-inbox']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const url = new URL(request.url);
    const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
    const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '10', 10) || 10;
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, limitRaw));

    return NextResponse.json(await loadInboxPage(user.id, offset, limit));
  } catch (error) {
    if (error instanceof FeedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[job-feed/inbox] error:', error);
    return NextResponse.json({ error: 'Failed to load job feed inbox.' }, { status: 500 });
  }
}
