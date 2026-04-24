import { NextRequest, NextResponse } from 'next/server';
import { dispatchScheduledJobFeedSweep } from '@/lib/job-feed/orchestration';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.JOB_FEED_INTERNAL_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const headerToken = request.headers.get('x-job-feed-secret');

  return bearerToken === secret || headerToken === secret;
}

export async function POST(request: NextRequest) {
  if (!process.env.JOB_FEED_INTERNAL_SECRET) {
    console.error('[job-feed/scheduler] JOB_FEED_INTERNAL_SECRET is not configured.');
    return NextResponse.json({ error: 'Internal configuration error.' }, { status: 500 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await dispatchScheduledJobFeedSweep();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[job-feed/scheduler] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to run scheduler sweep.' }, { status: 500 });
  }
}
