import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
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
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`search-strategy:${ip}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const auth = await authenticatePaidUser();
    if (!auth.ok) return auth.response;
    const { userId, supabase } = auth;

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
    const { data, error } = await supabase
      .from('user_search_strategies')
      .select('strategy, version, source_profile_generated_at')
      .eq('user_id', userId)
      .eq('settings_hash', settingsHash)
      .maybeSingle();

    if (error) {
      console.error('[job-feed/search-strategy] fetch error:', error.message);
      return NextResponse.json({ error: 'Failed to load search strategy.' }, { status: 500 });
    }

    if (!data || data.version !== SEARCH_STRATEGY_SCHEMA_VERSION || !isCurrentSearchStrategy(data.strategy)) {
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

    const profileNewerThanStrategy = Boolean(
      data.source_profile_generated_at
      && profile.generatedAt
      && profile.generatedAt > data.source_profile_generated_at,
    );

    return NextResponse.json<SearchStrategyResponseBody>({
      strategy: data.strategy,
      status: 'ok',
      generatedAt: data.strategy.generatedAt,
      sourceProfileGeneratedAt: data.source_profile_generated_at,
      profileNewerThanStrategy,
    });
  } catch (error) {
    console.error('[job-feed/search-strategy] GET unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load search strategy.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`search-strategy-generate:${ip}`, { limit: 3, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const auth = await authenticatePaidUser();
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const settings = await getJobFeedSettingsAdmin(userId);
    if (!settings) {
      return NextResponse.json({ error: 'Save your job feed settings before generating a strategy.' }, { status: 400 });
    }

    const profile = await getUserCareerProfileAdmin(userId);
    if (!profile) {
      return NextResponse.json({ error: 'Career profile required first. Open the wizard to generate it.' }, { status: 400 });
    }

    const strategy = await loadOrGenerateSearchStrategyAdmin({ userId, settings, profile });

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added user_search_strategies table here.
type TypedSupabase = any;
type AuthSuccess = { ok: true; userId: string; supabase: TypedSupabase };
type AuthFailure = { ok: false; response: NextResponse };

async function authenticatePaidUser(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added user_search_strategies table here.
  const typedSupabase = supabase as any;
  const { data: { user }, error: authError } = await typedSupabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  const { data: profile } = await typedSupabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();

  if (!profile || !canAccessJobFeed(profile.subscription_tier)) {
    return { ok: false, response: NextResponse.json({ error: 'Search strategy is available on paid plans only.' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id as string, supabase: typedSupabase };
}
