import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserCredits } from '@/db/repos/credits';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`credits-balance:${ip}`, RATE_LIMITS['credits-balance']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet cover all tables here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { credits: data, error } = await getUserCredits(user.id);

    if (error) {
      console.error('[credits/balance] load error:', error.message);
      return NextResponse.json({ error: 'Failed to load credit balance.' }, { status: 500 });
    }

    if (!data) {
      // No row yet. The initialize_user_credits() DB trigger should have
      // inserted one on profile creation; if it hasn't, return zero rather
      // than writing from the API path (writes belong in the trigger or
      // dedicated signup flow, not here).
      return NextResponse.json({
        monthly: 0,
        rollover: 0,
        addon: 0,
        total: 0,
        planTier: 'free',
        nextResetDate: null,
      });
    }

    const monthly = Number(data.monthly_credits ?? 0);
    const rollover = Number(data.rollover_credits ?? 0);
    const addon = Number(data.addon_credits ?? 0);

    return NextResponse.json({
      monthly,
      rollover,
      addon,
      total: monthly + rollover + addon,
      planTier: data.plan_tier ?? 'free',
      nextResetDate: data.next_reset_date ?? null,
    });
  } catch (error) {
    console.error('[credits/balance] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load credit balance.' }, { status: 500 });
  }
}
