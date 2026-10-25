/**
 * Reading the career profile and the search strategy: the GET handlers of
 * /api/job-feed/career-profile and /api/job-feed/search-strategy, shared with the MCP
 * `get_career_profile` tool. The sign-in, plan gate (`requireFeedViewer`) and rate limit stay with
 * the caller.
 */

import { getDocumentByType } from '@/db/repos/documents';
import { getCareerProfileRow, getLatestSearchStrategyRow, getSearchStrategyRow, upsertCareerProfile } from '@/db/repos/jobFeed';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import type { Json } from '@/db/types';
import { CAREER_PROFILE_SCHEMA_VERSION, isCurrentCareerProfile, type CareerProfile } from '@/lib/job-feed/career-profile';
import { generateCareerProfile } from '@/lib/job-feed/career-profile-synthesis';
import { isUserConfirmedStrategy } from '@/lib/job-feed/search-plan';
import {
  computeSettingsHash,
  isCurrentSearchStrategy,
  SEARCH_STRATEGY_SCHEMA_VERSION,
  type SearchStrategy,
} from '@/lib/job-feed/search-strategy';
import { getJobFeedSettingsAdmin, getUserCareerProfileAdmin } from '@/lib/job-feed/server';
import type { StructuredCV } from '@/lib/types/cv-schema';
import { FeedError } from './errors';

export interface CareerProfileResponseBody {
  profile: CareerProfile | null;
  /** True when the cached profile is older than the latest primary_cv. */
  cvNewerThanProfile: boolean;
  /** "ok" when a profile is returned (cached or freshly generated). */
  status: 'ok' | 'no_cv' | 'no_profile';
  generatedAt: string | null;
}

export interface SearchStrategyResponseBody {
  strategy: SearchStrategy | null;
  /**
   * "ok"           — strategy returned (cached or freshly generated).
   * "no_profile"   — no AI career profile exists yet (user hasn't generated one).
   * "profile_only" — profile exists but no strategy cached yet (generating shortly).
   * "no_settings"  — no job feed settings saved.
   * "no_countries" — settings exist but no target countries selected.
   */
  status: 'ok' | 'no_profile' | 'profile_only' | 'no_settings' | 'no_countries';
  generatedAt: string | null;
  sourceProfileGeneratedAt: string | null;
  /** True when the cached strategy was synthesized against an older profile. */
  profileNewerThanStrategy: boolean;
}

interface ProfileRow {
  profile: CareerProfile | null;
  version: number;
  source_document_updated_at: string | null;
}

interface PrimaryDocRow {
  id: string;
  structured_data: StructuredCV | null;
  updated_at: string;
}

export async function loadProfileAndPrimaryCV(
  userId: string,
): Promise<{ profileRow: ProfileRow | null; primaryDoc: PrimaryDocRow | null }> {
  // Read failures throw out to the route handler's catch rather than being
  // logged and downgraded to "no profile / no CV".
  const [careerProfileRow, primaryDocRow] = await Promise.all([
    getCareerProfileRow(userId),
    getDocumentByType(userId, 'primary_cv'),
  ]);

  const profileRow = careerProfileRow
    ? {
        profile: (careerProfileRow.profile as CareerProfile | null) ?? null,
        version: careerProfileRow.version ?? 0,
        source_document_updated_at: careerProfileRow.source_document_updated_at ?? null,
      }
    : null;

  const primaryDoc = primaryDocRow
    ? {
        id: primaryDocRow.id,
        structured_data: (primaryDocRow.structured_data as StructuredCV | null) ?? null,
        updated_at: primaryDocRow.updated_at,
      }
    : null;

  return { profileRow, primaryDoc };
}

export function isCVNewerThanProfile(params: {
  profileSourceUpdatedAt: string | null;
  primaryDocUpdatedAt: string | null;
}): boolean {
  if (!params.profileSourceUpdatedAt || !params.primaryDocUpdatedAt) return false;
  const profileTime = Date.parse(params.profileSourceUpdatedAt);
  const cvTime = Date.parse(params.primaryDocUpdatedAt);
  if (Number.isNaN(profileTime) || Number.isNaN(cvTime)) return false;
  // Require a meaningful gap (>1s) so harmless writes that touch the
  // documents row don't reopen the auto-regen loop on the client.
  return cvTime - profileTime > 1000;
}

/** The stored career profile, never generating one. */
export async function readCareerProfile(userId: string): Promise<CareerProfileResponseBody> {
  const { profileRow, primaryDoc } = await loadProfileAndPrimaryCV(userId);

  if (!profileRow?.profile || !isCurrentCareerProfile(profileRow.profile)) {
    return {
      profile: null,
      cvNewerThanProfile: false,
      status: primaryDoc ? 'no_profile' : 'no_cv',
      generatedAt: null,
    };
  }

  const cvNewerThanProfile = isCVNewerThanProfile({
    profileSourceUpdatedAt: profileRow.source_document_updated_at,
    primaryDocUpdatedAt: primaryDoc?.updated_at ?? null,
  });

  return {
    profile: profileRow.profile,
    cvNewerThanProfile,
    status: 'ok',
    generatedAt: profileRow.profile.generatedAt,
  };
}

/** The stored search strategy, never generating one. */
export async function readSearchStrategy(userId: string): Promise<SearchStrategyResponseBody> {
  const none = (status: SearchStrategyResponseBody['status']): SearchStrategyResponseBody => ({
    strategy: null,
    status,
    generatedAt: null,
    sourceProfileGeneratedAt: null,
    profileNewerThanStrategy: false,
  });

  const settings = await getJobFeedSettingsAdmin(userId);
  if (!settings) return none('no_settings');

  if (!settings.target_countries || settings.target_countries.length === 0) return none('no_countries');

  const profile = await getUserCareerProfileAdmin(userId);
  if (!profile) return none('no_profile');

  const settingsHash = computeSettingsHash(settings);
  let row;
  try {
    row = await getSearchStrategyRow(userId, settingsHash);
    if (!row || row.version !== SEARCH_STRATEGY_SCHEMA_VERSION || !isCurrentSearchStrategy(row.strategy)) {
      const latest = await getLatestSearchStrategyRow(userId);
      if (
        latest
        && latest.version === SEARCH_STRATEGY_SCHEMA_VERSION
        && isCurrentSearchStrategy(latest.strategy)
        && isUserConfirmedStrategy(latest.strategy)
      ) {
        row = latest;
      }
    }
  } catch (error) {
    console.error('[job-feed/search-strategy] fetch error:', error instanceof Error ? error.message : error);
    throw new FeedError(500, 'Failed to load search strategy.', 'load_failed');
  }

  if (!row || row.version !== SEARCH_STRATEGY_SCHEMA_VERSION || !isCurrentSearchStrategy(row.strategy)) {
    // Profile exists but no cached strategy yet (or stale version).
    // Use 'profile_only' so the consumer can show "Generating your search
    // strategy..." rather than "Upload your CV to get started".
    return none('profile_only');
  }

  const strategy = row.strategy as SearchStrategy;
  const profileNewerThanStrategy = Boolean(
    row.source_profile_generated_at
    && profile.generatedAt
    && profile.generatedAt > row.source_profile_generated_at,
  );

  return {
    strategy,
    status: 'ok',
    generatedAt: strategy.generatedAt,
    sourceProfileGeneratedAt: row.source_profile_generated_at,
    profileNewerThanStrategy,
  };
}

/** How old a stored profile must be before a forced re-read replaces it. */
const FORCED_REREAD_MIN_AGE_MS = 5 * 60 * 1000;

/**
 * Read the primary CV into a career profile and store it: the body of POST /api/job-feed/career-profile,
 * shared with the MCP `regenerate_career_profile` tool. Without `force`, a stored profile that is current
 * and no older than the CV is returned as it is. With `force`, the CV is read again whatever is stored,
 * so a wrong reading can be redone. The caller gates the plan and the rate limit.
 */
export async function generateCareerProfileForUser(params: {
  userId: string;
  force: boolean;
  clientRequestId: string | null;
  route: string;
}): Promise<CareerProfileResponseBody & { regenerated: boolean }> {
  const { userId } = params;
  const { profileRow, primaryDoc } = await loadProfileAndPrimaryCV(userId);

  if (!primaryDoc?.structured_data) {
    return { profile: null, cvNewerThanProfile: false, status: 'no_cv', generatedAt: null, regenerated: false };
  }

  const current = profileRow?.profile
    && isCurrentCareerProfile(profileRow.profile)
    && profileRow.version === CAREER_PROFILE_SCHEMA_VERSION;
  // A forced re-read is a model call with no credit cost, so one profile is read again at most every few
  // minutes whatever the caller sends.
  const justRead = current && Date.now() - Date.parse(profileRow!.profile!.generatedAt) < FORCED_REREAD_MIN_AGE_MS;
  if (
    current
    && (justRead || (!params.force && !isCVNewerThanProfile({
      profileSourceUpdatedAt: profileRow!.source_document_updated_at,
      primaryDocUpdatedAt: primaryDoc.updated_at,
    })))
  ) {
    return {
      profile: profileRow!.profile,
      cvNewerThanProfile: false,
      status: 'ok',
      generatedAt: profileRow!.profile!.generatedAt,
      regenerated: false,
    };
  }

  const generationContext: LlmGenerationContext = {
    requestExecutionId: crypto.randomUUID(),
    clientRequestId: params.clientRequestId,
    userId,
    route: params.route,
    feature: 'job_feed',
    operation: 'career_profile_synthesis',
  };
  const result = await generateCareerProfile(primaryDoc.structured_data, generationContext);

  try {
    await upsertCareerProfile(userId, {
      profile: result.profile as unknown as Json,
      version: CAREER_PROFILE_SCHEMA_VERSION,
      source_document_id: primaryDoc.id ?? null,
      source_document_updated_at: primaryDoc.updated_at ?? null,
      model_provider: result.modelProvider,
      model_name: result.modelName,
    });
  } catch (persistError) {
    console.error('[career-profile] Failed to persist generated profile:', {
      userId,
      error: persistError instanceof Error ? persistError.message : persistError,
    });
    throw new FeedError(500, 'Failed to save career profile.', 'save_failed');
  }

  console.log(
    `[career-profile] Generated for user ${userId}: ${result.modelName} | ${result.inputTokens}in/${result.outputTokens}out | ${result.latencyMs}ms`,
  );

  return {
    profile: result.profile,
    cvNewerThanProfile: false,
    status: 'ok',
    generatedAt: result.profile.generatedAt,
    regenerated: true,
  };
}
