import { NextRequest, NextResponse } from 'next/server';
import { normalizeJobFeedSettingsInput } from '@/lib/job-feed/helpers';
import { JOB_FEED_MIRRORED_ROLE_LIMIT } from '@/lib/job-feed/constants';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import { getOrSynthesizeCareerProfileAdmin } from '@/lib/job-feed/server';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';
import { getProfile } from '@/db/repos/profiles';
import { getSettings, upsertSettings, upsertJobPreferences } from '@/db/repos/jobFeed';

export const runtime = 'nodejs';

export async function PUT(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`job-feed-settings:${ip}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const profile = await getProfile(user.id);

    if (!profile) {
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

    const existingSettings = await getSettings(user.id);

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
    const profileMirror = await loadCareerProfileMirror(user.id);

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

    let data;
    try {
      data = await upsertSettings(user.id, {
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
        // User-controlled exclusions. Unlike the other AI-mirrored fields this
        // is pure user input (the AI can't know what they want to avoid).
        excluded_terms: normalized.data.excluded_terms,
      });
    } catch (error) {
      console.error('[job-feed/settings] PUT error:', error instanceof Error ? error.message : error);
      return NextResponse.json({ error: 'Failed to save job feed settings.' }, { status: 500 });
    }

    // Sync preferences for cover letter context. Awaited because Vercel kills
    // floating promises after the handler returns; fire-and-forget would silently
    // drop writes and downstream cover-letter generation would see stale data.
    // Use the AI-mirrored variables (targetRoles, userSkills, seniorityTarget)
    // so the cover letter agent sees the enriched values, not the raw client
    // input which may be empty arrays on first save before the mirror runs.
    try {
      await upsertJobPreferences(user.id, {
        salary_floor: normalized.data.salary_floor,
        remote_preference: normalized.data.remote_preference,
        employment_types: employmentTypes,
        target_roles: targetRoles,
        user_skills: userSkills,
        target_market: normalized.data.target_market,
        seniority_target: seniorityTarget,
      });
    } catch (prefError) {
      console.error('[job-feed/settings] preferences sync error:', prefError instanceof Error ? prefError.message : prefError);
      // Non-fatal for the settings flow itself, but surfaced for observability.
    }

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
 * Resolve the user's latest career profile and project the slice of fields
 * job_feed_settings should mirror. Synthesizes on demand when the profile is
 * missing or stale (e.g. existing users on the first deploy after a profile
 * schema bump) so settings save never gets stuck on a profile that no other
 * path in this flow would rebuild. Returns null only when there's genuinely no
 * CV to synthesize from; the caller then surfaces "profile not ready".
 */
async function loadCareerProfileMirror(userId: string): Promise<CareerProfileMirror | null> {
  const profile: CareerProfile | null = await getOrSynthesizeCareerProfileAdmin(userId);
  if (!profile) return null;

  // Dedupe case-insensitively, matching the drift check in the overview route.
  // Deduping by exact case here and by lowercase there made the two lengths
  // disagree for any profile with the same title in two casings.
  const seenTitles = new Set<string>();
  const targetRoles = profile.inferredTitles
    .map((title) => title.canonical)
    .filter((value) => {
      const key = value.trim().toLowerCase();
      if (!key || seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, JOB_FEED_MIRRORED_ROLE_LIMIT);

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
