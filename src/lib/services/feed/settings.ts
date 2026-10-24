/**
 * Feed settings: read, save and withdraw consent.
 *
 * `saveFeedSettings` is the body of PUT /api/job-feed/settings and `withdrawFeedConsent` the body
 * of POST /api/job-feed/consent/withdraw, moved here unchanged so the MCP tools run the same code
 * with the same validation and messages. `updateFeedSettingsPartial` is the MCP-only entry: it
 * merges the fields an agent sent onto what is saved, then goes through the same save.
 */

import { getProfile } from '@/db/repos/profiles';
import { getSettings, upsertSettings, upsertJobPreferences, withdrawConsent } from '@/db/repos/jobFeed';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import {
  countriesImpliedByNewCities,
  canViewJobFeed,
  normalizeJobFeedSettingsInput,
  toJobFeedInput,
} from '@/lib/job-feed/helpers';
import { JOB_FEED_MIRRORED_ROLE_LIMIT, legacyMarketFromCountries } from '@/lib/job-feed/constants';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import { getOrSynthesizeCareerProfileAdmin, persistUserConfirmedStrategyAdmin } from '@/lib/job-feed/server';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';
import {
  buildConfirmSearchPlan,
  buildUserConfirmedStrategy,
  planCapForTier,
  resolveSavedTargetRoles,
  rolesFromConfirmedQueries,
  validateConfirmedQueries,
  type ConfirmedSearchQuery,
} from '@/lib/job-feed/search-plan';
import type { JobFeedSettings } from '@/db/types';
import { FeedError } from './errors';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface FeedSettingsView {
  /** Null when the account has never set the feed up. */
  settings: JobFeedSettings | null;
  /** Whether the plan allows changing the settings (Plus and Max). */
  canEdit: boolean;
  /** How many role-by-country searches the plan keeps. */
  searchLimit: number;
}

/** Reading the settings is part of viewing the feed, which free accounts do: the overview route hands them the same row. */
export async function loadFeedSettings(userId: string): Promise<FeedSettingsView> {
  const profile = await getProfile(userId);
  if (!profile) throw new FeedError(500, 'Failed to load profile.', 'profile_missing');
  if (!canViewJobFeed(profile.subscription_tier)) {
    throw new FeedError(403, 'Job Feed is not available for this account.', 'plan_not_allowed');
  }
  const settings = await getSettings(userId);
  return {
    settings,
    canEdit: ['plus', 'max'].includes(profile.subscription_tier),
    searchLimit: planCapForTier(profile.subscription_tier),
  };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * The body of PUT /api/job-feed/settings. `readBody` runs after the plan gate, as the route always
 * did, so a bad body from an account that cannot save settings still gets the plan answer.
 */
export async function saveFeedSettings(params: {
  userId: string;
  readBody: () => Promise<unknown>;
  clientRequestId: string | null;
  /** The `route` recorded on the LLM calls this save makes (profile synthesis). */
  llmRoute: string;
}): Promise<{ settings: JobFeedSettings }> {
  const { userId } = params;
  const profile = await getProfile(userId);

  if (!profile) {
    throw new FeedError(500, 'Failed to load profile.', 'profile_missing');
  }

  if (!['plus', 'max'].includes(profile.subscription_tier)) {
    throw new FeedError(403, 'Job Feed is available on paid plans only.', 'plan_not_allowed');
  }

  const body = await params.readBody();
  return persistFeedSettings({
    userId,
    subscriptionTier: profile.subscription_tier,
    body,
    clientRequestId: params.clientRequestId,
    llmRoute: params.llmRoute,
  });
}

async function persistFeedSettings(params: {
  userId: string;
  subscriptionTier: string;
  body: unknown;
  clientRequestId: string | null;
  llmRoute: string;
}): Promise<{ settings: JobFeedSettings }> {
  const { userId, subscriptionTier, body } = params;
  const normalized = normalizeJobFeedSettingsInput(body);

  if (!normalized.data) {
    throw new FeedError(400, normalized.error || 'Invalid settings payload.', 'invalid_input');
  }

  const existingSettings = await getSettings(userId);

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
    throw new FeedError(
      400,
      'Please accept the feed consent before turning the feed on.',
      'consent_required',
    );
  }

  // Roles come from the confirmed search list when the client sends one.
  // Otherwise keep what is already saved. Profile mirror is the last
  // fallback so a first save still has something to search.
  const profileMirror = await loadCareerProfileMirror(userId, {
    requestExecutionId: crypto.randomUUID(),
    clientRequestId: params.clientRequestId,
    userId,
    route: params.llmRoute,
    feature: 'job_feed',
    operation: 'career_profile_synthesis',
  });

  const cap = planCapForTier(subscriptionTier);
  const confirmed = 'confirmed_queries' in (body as object)
    ? validateConfirmedQueries((body as { confirmed_queries?: unknown }).confirmed_queries, cap)
    : null;
  if (confirmed && !confirmed.ok) {
    throw new FeedError(400, confirmed.error, 'invalid_input');
  }

  const targetRoles = confirmed?.ok
    ? rolesFromConfirmedQueries(confirmed.queries)
    : resolveSavedTargetRoles(
        normalized.data.target_roles,
        existingSettings?.target_roles,
        profileMirror?.targetRoles ?? [],
      );

  if (targetRoles.length === 0) {
    throw profileMirror
      ? new FeedError(400, 'Confirm at least one search.', 'invalid_input')
      : new FeedError(422, 'AI profile not ready. Please retry in a few seconds.', 'profile_not_ready');
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
    user_id: userId,
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
        userId,
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
      throw new FeedError(500, 'Your searches did not save. Try again.', 'save_failed');
    }
  }

  let data;
  try {
    data = await upsertSettings(userId, nextSettings);
  } catch (error) {
    console.error('[job-feed/settings] PUT error:', error instanceof Error ? error.message : error);
    throw new FeedError(500, 'Failed to save job feed settings.', 'save_failed');
  }

  // Sync preferences for cover letter context. Awaited because Vercel kills
  // floating promises after the handler returns; fire-and-forget would silently
  // drop writes and downstream cover-letter generation would see stale data.
  // Use the AI-mirrored variables (targetRoles, userSkills, seniorityTarget)
  // so the cover letter agent sees the enriched values, not the raw client
  // input which may be empty arrays on first save before the mirror runs.
  try {
    await upsertJobPreferences(userId, {
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

  return { settings: data };
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

// ---------------------------------------------------------------------------
// Partial update (MCP)
// ---------------------------------------------------------------------------

/** The settings an agent may change. A field left out is left as saved; `salaryFloor: null` clears it. */
export interface FeedSettingsPatch {
  roles?: string[];
  countries?: string[];
  workModes?: string[];
  employmentTypes?: string[];
  salaryFloor?: number | null;
  automationEnabled?: boolean;
  timezone?: string;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sorted = right.map((value) => value.trim().toLowerCase()).sort();
  return left.map((value) => value.trim().toLowerCase()).sort().every((value, index) => value === sorted[index]);
}

/**
 * Whether the roles in `patch` differ from the saved ones. A save keeps only the roles that fit the
 * plan's search cap, so the roles sent are cut down the same way before the comparison: sending 8
 * roles when the cap keeps 3 settles into "no change" once those 3 are saved.
 */
function rolesWouldChange(existing: JobFeedSettings | null, patch: FeedSettingsPatch, searchLimit: number): boolean {
  if (!patch.roles) return false;
  const current = toJobFeedInput(existing);
  const plan = buildConfirmSearchPlan({
    roles: patch.roles,
    countries: patch.countries ?? current.target_countries,
    cities: current.target_cities,
    cap: searchLimit,
  });
  const kept = plan.length > 0 ? rolesFromConfirmedQueries(plan) : patch.roles;
  return !sameSet(kept, existing?.target_roles ?? []);
}

/** Names of the patch fields that would change what is saved. Empty means the call changes nothing. */
export function changedFeedSettingFields(existing: JobFeedSettings | null, patch: FeedSettingsPatch, searchLimit: number): string[] {
  const current = toJobFeedInput(existing);
  const changed: string[] = [];
  if (rolesWouldChange(existing, patch, searchLimit)) changed.push('roles');
  if (patch.countries && !sameSet(patch.countries, current.target_countries)) changed.push('countries');
  if (patch.workModes && !sameSet(patch.workModes, current.remote_preferences)) changed.push('work modes');
  if (patch.employmentTypes && !sameSet(patch.employmentTypes, current.employment_types)) changed.push('employment types');
  if (patch.salaryFloor !== undefined && patch.salaryFloor !== current.salary_floor) changed.push('salary floor');
  if (patch.automationEnabled !== undefined && patch.automationEnabled !== Boolean(existing?.enabled)) changed.push('daily feed on or off');
  if (patch.timezone !== undefined && patch.timezone !== (existing ? current.user_timezone : undefined)) changed.push('timezone');
  return changed;
}

/**
 * Merge `patch` onto the saved settings and save through the same validation as the web route.
 *
 * Consent is never granted here: the merged payload carries the consent the account already has,
 * so turning the feed on without it is refused exactly as the route refuses it.
 *
 * Changing the roles or the countries also rebuilds the confirmed search list from them (role by
 * country, up to the plan's limit), because a confirmed list is reused by every daily run and would
 * otherwise keep searching the old roles and countries. The rows are returned so the caller can say
 * which combinations were kept.
 */
export async function updateFeedSettingsPartial(params: {
  userId: string;
  patch: FeedSettingsPatch;
  clientRequestId: string | null;
}): Promise<{ settings: JobFeedSettings; searches: ConfirmedSearchQuery[] | null; searchLimit: number }> {
  const { userId, patch } = params;
  const profile = await getProfile(userId);
  if (!profile) throw new FeedError(500, 'Failed to load profile.', 'profile_missing');
  if (!['plus', 'max'].includes(profile.subscription_tier)) {
    throw new FeedError(403, 'Job Feed is available on paid plans only.', 'plan_not_allowed');
  }

  const existing = await getSettings(userId);
  const base = toJobFeedInput(existing);
  const body: Record<string, unknown> = { ...base };
  // A first save has no consent yet: leave the feed off rather than carry the default 'on'.
  if (!existing) body.enabled = false;
  if (patch.roles) body.target_roles = patch.roles;
  if (patch.countries) body.target_countries = patch.countries;
  if (patch.workModes) {
    body.remote_preferences = patch.workModes;
    body.remote_preference = patch.workModes[0];
  }
  if (patch.employmentTypes) body.employment_types = patch.employmentTypes;
  if (patch.salaryFloor !== undefined) body.salary_floor = patch.salaryFloor;
  if (patch.automationEnabled !== undefined) body.enabled = patch.automationEnabled;
  if (patch.timezone !== undefined) body.user_timezone = patch.timezone;

  const searchLimit = planCapForTier(profile.subscription_tier);
  let searches: ConfirmedSearchQuery[] | null = null;
  const rolesChanged = rolesWouldChange(existing, patch, searchLimit);
  const countriesChanged = Boolean(patch.countries) && !sameSet(patch.countries ?? [], base.target_countries);
  if (rolesChanged || countriesChanged) {
    const plan = buildConfirmSearchPlan({
      roles: patch.roles ?? existing?.target_roles ?? [],
      countries: patch.countries ?? base.target_countries,
      cities: base.target_cities,
      cap: searchLimit,
    });
    if (plan.length > 0) {
      searches = plan;
      body.confirmed_queries = plan.map((row) => ({ query: row.query, targetCountry: row.targetCountry }));
    }
  }

  const { settings } = await persistFeedSettings({
    userId,
    subscriptionTier: profile.subscription_tier,
    body,
    clientRequestId: params.clientRequestId,
    llmRoute: 'mcp:update_feed_settings',
  });
  return { settings, searches, searchLimit };
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * Tier-agnostic consent withdrawal. GDPR does not care about the plan, so this
 * cannot live behind the plus/max gate on PUT /api/job-feed/settings.
 *
 * Clears consent_accepted_at and sets enabled: false. Idempotent.
 */
export async function withdrawFeedConsent(userId: string): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) {
    throw new FeedError(500, 'Failed to load profile.', 'profile_missing');
  }

  if (!canViewJobFeed(profile.subscription_tier)) {
    throw new FeedError(403, 'Job Feed is not available for this account.', 'plan_not_allowed');
  }

  await withdrawConsent(userId);
}
