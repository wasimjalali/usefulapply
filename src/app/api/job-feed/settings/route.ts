import { NextRequest, NextResponse } from 'next/server';
import { normalizeJobFeedSettingsInput } from '@/lib/job-feed/helpers';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import { isCurrentCareerProfile, type CareerProfile } from '@/lib/job-feed/career-profile';
import { requireJobFeedAccess } from '@/lib/job-feed/auth';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';

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

    const access = await requireJobFeedAccess(typedSupabase, user);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
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

    // Auto-mirror AI-derived fields from the latest career profile so the
    // user never has to fill in roles, seniority, languages, or skills by
    // hand. The minimal preferences card only captures things the AI cannot
    // know (countries, cities, work mode, salary floor, work authorization).
    // The strategy generator still reads these mirrored fields downstream.
    // profileMirror is the authoritative source for targetRoles — we never
    // fall back to client-supplied roles so drift is impossible.
    const profileMirror = await loadCareerProfileMirror(typedSupabase, user.id);

    if (!profileMirror?.targetRoles?.length) {
      return NextResponse.json(
        { error: 'AI profile not ready. Please retry in a few seconds.' },
        { status: 422 }
      );
    }

    const targetRoles = profileMirror.targetRoles;
    const userSkills = profileMirror.userSkills ?? [];
    const languages = profileMirror.languages ?? ['English'];

    const seniorityTargets = profileMirror.seniorityTargets ?? normalized.data.seniority_targets;
    const seniorityTarget = seniorityTargets[0] ?? normalized.data.seniority_target ?? null;

    // Employment types stays user-controlled in DB but the new wizard
    // doesn't expose it. Default to ['full_time'] when the client did not
    // send a value.
    const employmentTypes = normalized.data.employment_types.length > 0
      ? normalized.data.employment_types
      : (['full_time'] as JobFeedSettingsInput['employment_types']);

    const { data, error } = await typedSupabase
      .from('job_feed_settings')
      .upsert({
        user_id: user.id,
        enabled: normalized.data.enabled,
        consent_accepted_at: consentAcceptedAt,
        user_timezone: normalized.data.user_timezone,
        // New multi-select columns — primary source of truth for the feed.
        target_countries: normalized.data.target_countries,
        target_cities: normalized.data.target_cities,
        remote_preferences: normalized.data.remote_preferences,
        seniority_targets: seniorityTargets,
        // Legacy scalar columns — kept in sync so older code paths keep working.
        target_market: normalized.data.target_market,
        remote_preference: normalized.data.remote_preference,
        seniority_target: seniorityTarget,
        // Shared arrays — AI-mirrored where a profile exists.
        target_roles: targetRoles,
        preferred_locations: normalized.data.preferred_locations,
        salary_floor: normalized.data.salary_floor,
        languages: languages,
        employment_types: employmentTypes,
        work_authorization_status: normalized.data.work_authorization_status,
        user_skills: userSkills,
      }, {
        onConflict: 'user_id',
      })
      .select('*')
      .single();

    if (error) {
      console.error('[job-feed/settings] PUT error:', error.message);
      return NextResponse.json({ error: 'Failed to save job feed settings.' }, { status: 500 });
    }

    // Sync preferences for cover letter context (fire-and-forget).
    // Use the AI-mirrored variables (targetRoles, userSkills, seniorityTarget)
    // so the cover letter agent sees the enriched values, not the raw client
    // input which may be empty arrays on first save before the mirror runs.
    typedSupabase
      .from('user_job_preferences')
      .upsert({
        user_id: user.id,
        salary_floor: normalized.data.salary_floor,
        remote_preference: normalized.data.remote_preference,
        employment_types: employmentTypes,
        target_roles: targetRoles,
        user_skills: userSkills,
        target_market: normalized.data.target_market,
        seniority_target: seniorityTarget,
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

interface CareerProfileMirror {
  targetRoles: string[];
  userSkills: string[];
  languages: string[];
  seniorityTargets: JobFeedSettingsInput['seniority_targets'];
}

/**
 * Read the user's latest career profile and project the slice of fields
 * job_feed_settings should mirror. Returns null when no profile exists yet
 * (free users / first-time paid users whose profile is still synthesizing).
 * The caller falls back to whatever the client sent in those cases.
 */
async function loadCareerProfileMirror(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the user_career_profiles table here.
  supabase: any,
  userId: string,
): Promise<CareerProfileMirror | null> {
  const { data, error } = await supabase
    .from('user_career_profiles')
    .select('profile')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[job-feed/settings] career profile fetch error:', error.message);
    return null;
  }
  if (!data?.profile || !isCurrentCareerProfile(data.profile)) return null;

  const profile = data.profile as CareerProfile;

  const targetRoles = profile.inferredTitles
    .map((title) => title.canonical)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 6);

  const skillSet = new Set<string>();
  for (const cluster of [...profile.primarySkillClusters, ...profile.secondarySkillClusters]) {
    for (const skill of cluster.skills) {
      const trimmed = skill.trim();
      if (trimmed) skillSet.add(trimmed);
      if (skillSet.size >= 50) break;
    }
    if (skillSet.size >= 50) break;
  }

  const seniorityTargets = [profile.seniority.level] as JobFeedSettingsInput['seniority_targets'];

  return {
    targetRoles,
    userSkills: Array.from(skillSet),
    languages: profile.workingLanguages.length > 0 ? profile.workingLanguages : ['English'],
    seniorityTargets,
  };
}
