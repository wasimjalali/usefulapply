import { NextRequest, NextResponse } from 'next/server';
import { countriesImpliedByNewCities, normalizeJobFeedSettingsInput } from '@/lib/job-feed/helpers';
import { JOB_FEED_MIRRORED_ROLE_LIMIT, legacyMarketFromCountries } from '@/lib/job-feed/constants';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import { getOrSynthesizeCareerProfileAdmin, persistUserConfirmedStrategyAdmin } from '@/lib/job-feed/server';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';
import { getProfile } from '@/db/repos/profiles';
import { getSettings, upsertSettings, upsertJobPreferences } from '@/db/repos/jobFeed';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import type { JobFeedSettings } from '@/lib/supabase/types';
import {
  buildUserConfirmedStrategy,
  planCapForTier,
  resolveSavedTargetRoles,
  rolesFromConfirmedQueries,
  validateConfirmedQueries,
} from '@/lib/job-feed/search-plan';

export const runtime = 'nodejs';

export async function PUT(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-settings:${user.id}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
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

    // A city named for the first time brings its country with it. Scoped to
    // new cities so unchecking a country still sticks.
    const targetCountries = countriesImpliedByNewCities(
      normalized.data.target_cities,
      existingSettings?.target_cities ?? [],
      normalized.data.target_countries,
    );
    // The legacy scalar has to follow the list it is derived from, or adding
    // Toronto would leave the market reading "us".
    const targetMarket = legacyMarketFromCountries(targetCountries);

    const consentAcceptedAt = existingSettings?.consent_accepted_at
      ?? (normalized.data.consent_accepted ? new Date().toISOString() : null);

    if (normalized.data.enabled && !consentAcceptedAt) {
      return NextResponse.json(
        { error: 'Please accept feed automation consent before turning the daily feed on.' },
        { status: 400 }
      );
    }

    // Roles come from the confirmed search list when the client sends one.
    // Otherwise keep what is already saved. Profile mirror is the last
    // fallback so a first save still has something to search.
    const profileMirror = await loadCareerProfileMirror(user.id, {
      requestExecutionId: crypto.randomUUID(),
      clientRequestId: request.headers.get('x-request-id'),
      userId: user.id,
      route: '/api/job-feed/settings',
      feature: 'job_feed',
      operation: 'career_profile_synthesis',
    });

    const cap = planCapForTier(profile.subscription_tier);
    const confirmed = 'confirmed_queries' in (body as object)
      ? validateConfirmedQueries((body as { confirmed_queries?: unknown }).confirmed_queries, cap)
      : null;
    if (confirmed && !confirmed.ok) {
      return NextResponse.json({ error: confirmed.error }, { status: 400 });
    }

    const targetRoles = confirmed?.ok
      ? rolesFromConfirmedQueries(confirmed.queries)
      : resolveSavedTargetRoles(
          normalized.data.target_roles,
          existingSettings?.target_roles,
          profileMirror?.targetRoles ?? [],
        );

    if (targetRoles.length === 0) {
      return NextResponse.json(
        { error: profileMirror ? 'Confirm at least one search.' : 'AI profile not ready. Please retry in a few seconds.' },
        { status: profileMirror ? 400 : 422 },
      );
    }

    const userSkills = profileMirror?.userSkills ?? existingSettings?.user_skills ?? [];
    const languages = profileMirror?.languages ?? (existingSettings?.languages?.length ? existingSettings.languages : ['English']);

    const seniorityTargets = profileMirror?.seniorityTargets
      ?? (existingSettings?.seniority_targets?.length ? existingSettings.seniority_targets : normalized.data.seniority_targets);
    const seniorityTarget = seniorityTargets[0] ?? normalized.data.seniority_target ?? existingSettings?.seniority_target ?? null;

    // Employment types stays user-controlled in DB but the new wizard
    // doesn't expose it. Default to ['full_time'] when the client did not
    // send a value.
    const employmentTypes = normalized.data.employment_types.length > 0
      ? normalized.data.employment_types
      : (['full_time'] as JobFeedSettingsInput['employment_types']);

    const nextSettings = {
      user_id: user.id,
      enabled: normalized.data.enabled,
      consent_accepted_at: consentAcceptedAt,
      user_timezone: normalized.data.user_timezone,
      // New multi-select columns, primary source of truth for the feed.
      target_countries: targetCountries,
      target_cities: normalized.data.target_cities,
      remote_preferences: normalized.data.remote_preferences,
      seniority_targets: seniorityTargets,
      // Legacy scalar columns, kept in sync so older code paths keep working.
      target_market: targetMarket,
      remote_preference: normalized.data.remote_preference,
      seniority_target: seniorityTarget,
      // Shared arrays. AI-mirrored where a profile exists.
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
    };

    // Persist the confirmed list before enabling the feed. If this fails we
    // must not turn the feed on, or a later run would silently generate a
    // new strategy over the user's picks.
    if (confirmed?.ok) {
      try {
        await persistUserConfirmedStrategyAdmin({
          userId: user.id,
          settings: {
            ...(existingSettings ?? {}),
            ...nextSettings,
          } as JobFeedSettings,
          strategy: buildUserConfirmedStrategy({
            queries: confirmed.queries,
            sourceProfileGeneratedAt: profileMirror ? undefined : existingSettings?.updated_at ?? new Date().toISOString(),
            negativeTerms: [],
          }),
        });
      } catch (error) {
        console.error('[job-feed/settings] confirmed strategy persist error:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Your searches did not save. Try again.' }, { status: 500 });
      }
    }

    let data;
    try {
      data = await upsertSettings(user.id, nextSettings);
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
        target_market: targetMarket,
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
async function loadCareerProfileMirror(
  userId: string,
  generationContext: LlmGenerationContext,
): Promise<CareerProfileMirror | null> {
  const profile: CareerProfile | null = await getOrSynthesizeCareerProfileAdmin(userId, generationContext);
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
