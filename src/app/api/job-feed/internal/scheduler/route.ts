import { NextRequest, NextResponse } from 'next/server';
import { dispatchScheduledJobFeedSweep } from '@/lib/job-feed/orchestration';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secrets = [
    process.env.JOB_FEED_INTERNAL_SECRET,
    process.env.CRON_SECRET,
  ].filter((value): value is string => Boolean(value));
  if (secrets.length === 0) return false;

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const headerToken = request.headers.get('x-job-feed-secret');

  return secrets.includes(bearerToken ?? '') || secrets.includes(headerToken ?? '');
}

async function runScheduler(request: NextRequest) {
  if (!process.env.JOB_FEED_INTERNAL_SECRET && !process.env.CRON_SECRET) {
    console.error('[job-feed/scheduler] JOB_FEED_INTERNAL_SECRET or CRON_SECRET is not configured.');
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

export async function GET(request: NextRequest) {
  return runScheduler(request);
}

export async function POST(request: NextRequest) {
  return runScheduler(request);
}
