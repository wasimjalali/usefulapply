/**
 * Reading the career profile and the search strategy: the GET handlers of
 * /api/job-feed/career-profile and /api/job-feed/search-strategy, shared with the MCP
 * `get_career_profile` tool. The sign-in, plan gate (`requireFeedViewer`) and rate limit stay with
 * the caller.
 */

import { getDocumentByType } from '@/db/repos/documents';
import { getCareerProfileRow, getLatestSearchStrategyRow, getSearchStrategyRow } from '@/db/repos/jobFeed';
import { isCurrentCareerProfile, type CareerProfile } from '@/lib/job-feed/career-profile';
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
