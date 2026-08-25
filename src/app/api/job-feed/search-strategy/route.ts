import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { requireJobFeedView } from '@/lib/job-feed/auth';
import {
  computeSettingsHash,
  isCurrentSearchStrategy,
  SEARCH_STRATEGY_SCHEMA_VERSION,
  type SearchStrategy,
} from '@/lib/job-feed/search-strategy';
import {
  getJobFeedSettingsAdmin,
  getUserCareerProfileAdmin,
  loadOrGenerateSearchStrategyAdmin,
} from '@/lib/job-feed/server';
import { getProfile } from '@/db/repos/profiles';
import { getLatestSearchStrategyRow, getSearchStrategyRow } from '@/db/repos/jobFeed';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { isUserConfirmedStrategy } from '@/lib/job-feed/search-plan';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface SearchStrategyResponseBody {
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

export async function GET(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const auth = await authenticateFeedViewer(request);
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const { allowed } = await checkRateLimit(`search-strategy:${userId}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const settings = await getJobFeedSettingsAdmin(userId);
    if (!settings) {
      return NextResponse.json<SearchStrategyResponseBody>({
        strategy: null,
        status: 'no_settings',
        generatedAt: null,
        sourceProfileGeneratedAt: null,
        profileNewerThanStrategy: false,
      });
    }

    if (!settings.target_countries || settings.target_countries.length === 0) {
      return NextResponse.json<SearchStrategyResponseBody>({
        strategy: null,
        status: 'no_countries',
        generatedAt: null,
        sourceProfileGeneratedAt: null,
        profileNewerThanStrategy: false,
      });
    }

    const profile = await getUserCareerProfileAdmin(userId);
    if (!profile) {
      return NextResponse.json<SearchStrategyResponseBody>({
        strategy: null,
        status: 'no_profile',
        generatedAt: null,
        sourceProfileGeneratedAt: null,
        profileNewerThanStrategy: false,
      });
    }

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
      return NextResponse.json({ error: 'Failed to load search strategy.' }, { status: 500 });
    }

    if (!row || row.version !== SEARCH_STRATEGY_SCHEMA_VERSION || !isCurrentSearchStrategy(row.strategy)) {
      // Profile exists but no cached strategy yet (or stale version).
      // Use 'profile_only' so the consumer can show "Generating your search
      // strategy..." rather than "Upload your CV to get started".
      return NextResponse.json<SearchStrategyResponseBody>({
        strategy: null,
        status: 'profile_only',
        generatedAt: null,
        sourceProfileGeneratedAt: null,
        profileNewerThanStrategy: false,
      });
    }

    const strategy = row.strategy as SearchStrategy;
    const profileNewerThanStrategy = Boolean(
      row.source_profile_generated_at
      && profile.generatedAt
      && profile.generatedAt > row.source_profile_generated_at,
    );

    return NextResponse.json<SearchStrategyResponseBody>({
      strategy,
      status: 'ok',
      generatedAt: strategy.generatedAt,
      sourceProfileGeneratedAt: row.source_profile_generated_at,
      profileNewerThanStrategy,
    });
  } catch (error) {
    console.error('[job-feed/search-strategy] GET unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load search strategy.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const auth = await authenticatePaidUser(request);
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const { allowed } = await checkRateLimit(`search-strategy-generate:${userId}`, RATE_LIMITS['search-strategy-generate']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const settings = await getJobFeedSettingsAdmin(userId);
    if (!settings) {
      return NextResponse.json({ error: 'Save your job feed settings before generating a strategy.' }, { status: 400 });
    }

    const profile = await getUserCareerProfileAdmin(userId);
    if (!profile) {
      return NextResponse.json({ error: 'Career profile required first. Open the wizard to generate it.' }, { status: 400 });
    }

    const generationContext: LlmGenerationContext = {
      requestExecutionId: crypto.randomUUID(),
      clientRequestId: request.headers.get('x-request-id'),
      userId,
      route: '/api/job-feed/search-strategy',
      feature: 'job_feed',
      operation: 'search_strategy_generation',
    };
    const strategy = await loadOrGenerateSearchStrategyAdmin({ userId, settings, profile, generationContext });

    return NextResponse.json<SearchStrategyResponseBody>({
      strategy: strategy ?? null,
      status: strategy ? 'ok' : 'no_countries',
      generatedAt: strategy?.generatedAt ?? null,
      sourceProfileGeneratedAt: strategy?.sourceProfileGeneratedAt ?? null,
      profileNewerThanStrategy: false,
    });
  } catch (error) {
    console.error('[job-feed/search-strategy] POST unexpected error:', error);
    return NextResponse.json({ error: 'Failed to generate search strategy.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AuthSuccess = { ok: true; userId: string };
type AuthFailure = { ok: false; response: NextResponse };

async function authenticateFeedViewer(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
  const user = await getCurrentUser(request);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  const access = await requireJobFeedView(user);
  if (!access.ok) {
    return { ok: false, response: NextResponse.json({ error: access.error }, { status: access.status }) };
  }

  return { ok: true, userId: user.id };
}

async function authenticatePaidUser(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
  const user = await getCurrentUser(request);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  const profile = await getProfile(user.id);

  if (!profile || !canAccessJobFeed(profile.subscription_tier)) {
    return { ok: false, response: NextResponse.json({ error: 'Search strategy is available on paid plans only.' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}
