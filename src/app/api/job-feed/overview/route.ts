import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessJobFeed, getJobFeedOverviewState } from '@/lib/job-feed/helpers';
import { listLatestJobFeedItemsAdmin } from '@/lib/job-feed/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
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
      return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
    }

    const canAccess = canAccessJobFeed(profile.subscription_tier);

    if (!canAccess) {
      return NextResponse.json({
        canAccess: false,
        settings: null,
        latestRun: null,
        jobs: [],
        state: 'upgrade_required',
        foundationMode: true,
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
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    const jobs = latestRun
      ? await listLatestJobFeedItemsAdmin({
          userId: user.id,
          latestRun: latestRun ?? null,
        })
      : [];

    return NextResponse.json({
      canAccess,
      settings: settings ?? null,
      latestRun: latestRun ?? null,
      jobs,
      state: getJobFeedOverviewState({
        canAccess,
        settings: settings ?? null,
        latestRun: latestRun ?? null,
        jobsCount: jobs.length,
      }),
      foundationMode: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load job feed overview.' },
      { status: 500 }
    );
  }
}
