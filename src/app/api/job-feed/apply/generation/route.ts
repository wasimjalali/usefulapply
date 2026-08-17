import { NextRequest, NextResponse } from 'next/server';
import { canViewJobFeed } from '@/lib/job-feed/helpers';
import { captureJobFeedActionRejected } from '@/lib/job-feed/analytics';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/db/repos/profiles';
import { getGeneration, getLatestGenerationForSession } from '@/db/repos/jobFeed';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  let subscriptionTier: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    const { allowed } = await checkRateLimit(`job-feed-apply-gen:${user.id}`, RATE_LIMITS['job-feed-apply-gen']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const profile = await getProfile(user.id);
    subscriptionTier = profile?.subscription_tier ?? null;

    // Intentionally canViewJobFeed (free + premium): free users reach the
    // credit-gated generation handoff from feed cards. This route only reads the
    // user's own generation context (scoped to userId). Paywall is downstream.
    if (!profile || !canViewJobFeed(profile.subscription_tier)) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply/generation',
        action: 'generation_status_read',
        reason: !profile ? 'profile_load_failed' : 'plan_not_allowed',
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

    // Client-side sessions use `session-${Date.now()}` until they sync with the
    // database. Persisted ids are uuids, so a non-uuid value can never match a
    // row. Treat pre-sync ids as "no matching row" so the client gets a clean
    // 404 instead of a scary error in the console.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (generationId && !UUID_RE.test(generationId)) {
      return NextResponse.json({ error: 'Application generation not found.' }, { status: 404 });
    }
    if (sessionId && !UUID_RE.test(sessionId)) {
      return NextResponse.json({ error: 'Application generation not found.' }, { status: 404 });
    }

    let generation;
    try {
      generation = generationId
        ? await getGeneration(user.id, generationId)
        : await getLatestGenerationForSession(user.id, sessionId);
    } catch (loadError) {
      console.error('[job-feed/apply/generation] load error:', loadError instanceof Error ? loadError.message : loadError);
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
