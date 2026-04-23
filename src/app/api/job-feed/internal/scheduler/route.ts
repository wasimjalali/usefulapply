import { NextRequest, NextResponse } from 'next/server';
import { runScheduledJobFeedFoundationSweep } from '@/lib/job-feed/server';

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
    return NextResponse.json(
      { error: 'JOB_FEED_INTERNAL_SECRET is not configured.' },
      { status: 500 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await runScheduledJobFeedFoundationSweep();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run scheduler sweep.' },
      { status: 500 }
    );
  }
}
