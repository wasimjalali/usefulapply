import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runTrackerReminders } from '@/cron/tracker-reminders';

export const runtime = 'nodejs';

/**
 * POST /api/cron/tracker-reminders
 *
 * Daily reminder sweep: interviews happening tomorrow and follow-ups that have
 * come due. Also invoked by the Workers Cron Trigger `0 8 * * *` via
 * `src/cron/index.ts`.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Returns: { processed, sent, skipped, errors }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(authHeader);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await runTrackerReminders());
  } catch (error) {
    console.error('[cron/tracker-reminders] unexpected:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
