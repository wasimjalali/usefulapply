import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessJobFeed, getJobFeedOverviewState } from '@/lib/job-feed/helpers';
import { getJobFeedTierLimits } from '@/lib/job-feed/constants';
import {
  getJobFeedRunDiagnostics,
  getLatestManualCompletedJobFeedRunAdmin,
  listJobFeedInboxPageAdmin,
  listLatestJobFeedItemsAdmin,
} from '@/lib/job-feed/server';
import { JOB_FEED_INBOX_PAGE_SIZE } from '@/lib/job-feed/constants';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import type { JobFeedRun } from '@/lib/supabase/types';

export const runtime = 'nodejs';

const STALE_OVERVIEW_RUN_MS = 15 * 60 * 1000;

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
        latestManualRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        jobsTotalCount: 0,
        jobsHasMore: false,
        jobsTodayCount: 0,
        jobsBacklogCount: 0,
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

    // Load the run metadata once; inbox pagination is a separate call so
    // we can keep the overview payload small even at scale.
    const [feedRunSummary, firstPage, latestManualRun] = await Promise.all([
      latestRun
        ? listLatestJobFeedItemsAdmin({
            userId: user.id,
            latestRun: latestRun ?? null,
          }).then((result) => ({ run: result.run }))
        : Promise.resolve({ run: null }),
      listJobFeedInboxPageAdmin({
        userId: user.id,
        offset: 0,
        limit: JOB_FEED_INBOX_PAGE_SIZE,
      }),
      getLatestManualCompletedJobFeedRunAdmin(user.id),
    ]);

    const jobs = firstPage?.items ?? [];
    const totalCount = firstPage?.totalCount ?? 0;
    const hasMore = firstPage?.hasMore ?? false;
    // Both counts reflect what the user can still act on right now.
    // Acting on a job (dismiss / rate not relevant / successful apply)
    // removes it from the visible inbox and the corresponding count
    // drops after the next overview refetch.
    const jobsTodayCount = firstPage?.todayVisibleCount ?? 0;
    const backlogVisibleCount = firstPage?.backlogVisibleCount ?? 0;
    const runForState = latestRun && isStaleOverviewRun(latestRun) && feedRunSummary.run
      ? feedRunSummary.run
      : latestRun;

    return NextResponse.json({
      canAccess,
      settings: settings ?? null,
      latestRun: latestRun ?? null,
      latestManualRun: latestManualRun ?? null,
      feedRun: feedRunSummary.run,
      latestRunDiagnostics: getJobFeedRunDiagnostics(latestRun ?? null),
      jobs,
      jobsTotalCount: totalCount,
      jobsHasMore: hasMore,
      jobsTodayCount,
      jobsBacklogCount: backlogVisibleCount,
      state: getJobFeedOverviewState({
        canAccess,
        settings: settings ?? null,
        latestRun: runForState ?? null,
        jobsCount: totalCount,
      }),
      foundationMode: true,
      feedCap: tierLimits.visibleCount,
    });
  } catch (error) {
    console.error('[job-feed/overview] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load job feed overview.' }, { status: 500 });
  }
}

function isStaleOverviewRun(run: JobFeedRun): boolean {
  if (run.status !== 'running' && run.status !== 'queued') {
    return false;
  }

  const referenceTime = run.started_at ?? run.created_at;
  const timestamp = referenceTime ? Date.parse(referenceTime) : Number.NaN;
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp > STALE_OVERVIEW_RUN_MS;
}
