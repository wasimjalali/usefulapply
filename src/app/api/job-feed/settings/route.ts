import { NextRequest, NextResponse } from 'next/server';
import { normalizeJobFeedSettingsInput } from '@/lib/job-feed/helpers';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-settings:${ip}`, RATE_LIMITS['job-feed-settings']);
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

    const { data, error } = await typedSupabase
      .from('job_feed_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[job-feed/settings] GET error:', error.message);
      return NextResponse.json({ error: 'Failed to load job feed settings.' }, { status: 500 });
    }

    return NextResponse.json({ settings: data ?? null });
  } catch (error) {
    console.error('[job-feed/settings] GET unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load job feed settings.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-settings:${ip}`, RATE_LIMITS['job-feed-settings']);
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
      return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
    }

    if (!['plus', 'max'].includes(profile.subscription_tier)) {
      return NextResponse.json(
        { error: 'Job Feed is available on paid plans only.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const normalized = normalizeJobFeedSettingsInput(body);

    if (!normalized.data) {
      return NextResponse.json({ error: normalized.error || 'Invalid settings payload.' }, { status: 400 });
    }

    const { data: existingSettings } = await typedSupabase
      .from('job_feed_settings')
      .select('consent_accepted_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const consentAcceptedAt = existingSettings?.consent_accepted_at
      ?? (normalized.data.consent_accepted ? new Date().toISOString() : null);

    if (normalized.data.enabled && !consentAcceptedAt) {
      return NextResponse.json(
        { error: 'Please accept feed automation consent before turning the daily feed on.' },
        { status: 400 }
      );
    }

    const { data, error } = await typedSupabase
      .from('job_feed_settings')
      .upsert({
        user_id: user.id,
        enabled: normalized.data.enabled,
        consent_accepted_at: consentAcceptedAt,
        user_timezone: normalized.data.user_timezone,
        delivery_hour_local: normalized.data.delivery_hour_local,
        // New multi-select columns — primary source of truth for the feed.
        target_countries: normalized.data.target_countries,
        target_cities: normalized.data.target_cities,
        remote_preferences: normalized.data.remote_preferences,
        seniority_targets: normalized.data.seniority_targets,
        // Legacy scalar columns — kept in sync so older code paths keep working.
        target_market: normalized.data.target_market,
        remote_preference: normalized.data.remote_preference,
        seniority_target: normalized.data.seniority_target,
        // Shared arrays
        target_roles: normalized.data.target_roles,
        adjacent_roles_enabled: false,
        adjacent_roles: [],
        preferred_locations: normalized.data.preferred_locations,
        salary_floor: normalized.data.salary_floor,
        languages: normalized.data.languages,
        employment_types: normalized.data.employment_types,
        work_authorization_status: normalized.data.work_authorization_status,
        aggressiveness: normalized.data.aggressiveness,
        user_skills: normalized.data.user_skills,
      }, {
        onConflict: 'user_id',
      })
      .select('*')
      .single();

    if (error) {
      console.error('[job-feed/settings] PUT error:', error.message);
      return NextResponse.json({ error: 'Failed to save job feed settings.' }, { status: 500 });
    }

    // Sync preferences for cover letter context (fire-and-forget)
    typedSupabase
      .from('user_job_preferences')
      .upsert({
        user_id: user.id,
        salary_floor: normalized.data.salary_floor,
        remote_preference: normalized.data.remote_preference,
        employment_types: normalized.data.employment_types,
        target_roles: normalized.data.target_roles,
        user_skills: normalized.data.user_skills,
        target_market: normalized.data.target_market,
        seniority_target: normalized.data.seniority_target,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .then(({ error: prefError }: { error: { message: string } | null }) => {
        if (prefError) console.error('[job-feed/settings] preferences sync error:', prefError.message);
      });

    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error('[job-feed/settings] PUT unexpected error:', error);
    return NextResponse.json({ error: 'Failed to save job feed settings.' }, { status: 500 });
  }
}
