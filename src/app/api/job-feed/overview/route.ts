import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessJobFeed, getJobFeedOverviewState } from '@/lib/job-feed/helpers';
import { getJobFeedTierLimits } from '@/lib/job-feed/constants';
import { getJobFeedRunDiagnostics, listLatestJobFeedItemsAdmin } from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-overview:${ip}`, RATE_LIMITS['job-feed-overview']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added tables here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await typedSupabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('[job-feed/overview] profile load error:', profileError?.message);
      return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
    }

    const canAccess = canAccessJobFeed(profile.subscription_tier);

    const tierLimits = getJobFeedTierLimits(profile.subscription_tier);

    if (!canAccess) {
      return NextResponse.json({
        canAccess: false,
        settings: null,
        latestRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        state: 'upgrade_required',
        foundationMode: true,
        feedCap: tierLimits.visibleCount,
      });
    }

    const [{ data: settings, error: settingsError }, { data: latestRun, error: runError }] = await Promise.all([
      typedSupabase
        .from('job_feed_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      typedSupabase
        .from('job_feed_runs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (settingsError) {
      console.error('[job-feed/overview] settings load error:', settingsError.message);
      return NextResponse.json({ error: 'Failed to load job feed overview.' }, { status: 500 });
    }

    if (runError) {
      console.error('[job-feed/overview] run load error:', runError.message);
      return NextResponse.json({ error: 'Failed to load job feed overview.' }, { status: 500 });
    }

    const feedItems = latestRun
      ? await listLatestJobFeedItemsAdmin({
          userId: user.id,
          latestRun: latestRun ?? null,
        })
      : {
          run: null,
          items: [],
        };

    const jobs = feedItems.items;

    return NextResponse.json({
      canAccess,
      settings: settings ?? null,
      latestRun: latestRun ?? null,
      feedRun: feedItems.run,
      latestRunDiagnostics: getJobFeedRunDiagnostics(latestRun ?? null),
      jobs,
      state: getJobFeedOverviewState({
        canAccess,
        settings: settings ?? null,
        latestRun: latestRun ?? null,
        jobsCount: jobs.length,
      }),
      foundationMode: true,
      feedCap: tierLimits.visibleCount,
    });
  } catch (error) {
    console.error('[job-feed/overview] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load job feed overview.' }, { status: 500 });
  }
}
