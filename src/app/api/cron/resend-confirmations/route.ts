import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runResendConfirmations } from '@/cron/resend-confirmations';

export const runtime = 'nodejs';

/**
 * POST /api/cron/resend-confirmations
 *
 * Hourly confirmation nudge. Also invoked by the Workers Cron Trigger
 * `0 * * * *` via `src/cron/index.ts`.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (set in env + Supabase Vault).
 *
 * Returns: { processed, sent, throttled, skipped, errors }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Constant-time compare to close any timing side-channel on the bearer token.
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(authHeader);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runResendConfirmations();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/resend-confirmations] unexpected:', error);
    const message = error instanceof Error ? error.message : '';
    if (message === 'Server misconfigured') {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
