import { NextRequest, NextResponse } from 'next/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { captureJobFeedActionRejected } from '@/lib/job-feed/analytics';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  let subscriptionTier: string | null = null;

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand all Job Feed columns here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      captureJobFeedActionRejected({
        route: 'apply/generation',
        action: 'generation_status_read',
        reason: 'unauthenticated',
        status: 401,
      });
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    userId = user.id;

    const { allowed } = checkRateLimit(`job-feed-apply-gen:${user.id}`, RATE_LIMITS['job-feed-apply-gen']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const { data: profile, error: profileError } = await typedSupabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    subscriptionTier = profile?.subscription_tier ?? null;

    if (profileError || !profile || !canAccessJobFeed(profile.subscription_tier)) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply/generation',
        action: 'generation_status_read',
        reason: profileError ? 'profile_load_failed' : 'plan_not_allowed',
        status: 403,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const generationId = searchParams.get('generationId')?.trim() ?? '';
    const sessionId = searchParams.get('sessionId')?.trim() ?? '';

    if (!generationId && !sessionId) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply/generation',
        action: 'generation_status_read',
        reason: 'missing_generation_or_session_id',
        status: 400,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'A generation ID or session ID is required.' }, { status: 400 });
    }

    // Client-side sessions use `session-${Date.now()}` until they sync with
    // Supabase. The DB columns are uuid — querying with a non-uuid value would
    // throw and produce a 500. Treat pre-sync ids as "no matching row" so the
    // client gets a clean 404 instead of a scary error in the console.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (generationId && !UUID_RE.test(generationId)) {
      return NextResponse.json({ error: 'Application generation not found.' }, { status: 404 });
    }
    if (sessionId && !UUID_RE.test(sessionId)) {
      return NextResponse.json({ error: 'Application generation not found.' }, { status: 404 });
    }

    let query = typedSupabase
      .from('job_feed_application_generations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1);

    query = generationId
      ? query.eq('id', generationId)
      : query.eq('application_session_id', sessionId);

    const { data: generation, error } = await query.maybeSingle();
    if (error) {
      console.error('[job-feed/apply/generation] load error:', error.message);
      return NextResponse.json({ error: 'Failed to load application generation.' }, { status: 500 });
    }

    if (!generation) {
      return NextResponse.json({ error: 'Application generation not found.' }, { status: 404 });
    }

    return NextResponse.json({ generation });
  } catch (error) {
    console.error('[job-feed/apply/generation] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load application generation.' }, { status: 500 });
  }
}
