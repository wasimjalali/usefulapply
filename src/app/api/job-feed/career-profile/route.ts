import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import { requireJobFeedAccess } from '@/lib/job-feed/auth';
import {
  CAREER_PROFILE_SCHEMA_VERSION,
  isCurrentCareerProfile,
  type CareerProfile,
} from '@/lib/job-feed/career-profile';
import { generateCareerProfile } from '@/lib/job-feed/career-profile-synthesis';
import type { StructuredCV } from '@/lib/types/cv-schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface CareerProfileResponseBody {
  profile: CareerProfile | null;
  /** True when the cached profile is older than the latest primary_cv. */
  cvNewerThanProfile: boolean;
  /** "ok" when a profile is returned (cached or freshly generated). */
  status: 'ok' | 'no_cv' | 'no_profile';
  generatedAt: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`career-profile:${ip}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const auth = await authenticatePaidUser();
    if (!auth.ok) return auth.response;
    const { userId, supabase } = auth;

    const { profileRow, primaryDoc } = await loadProfileAndPrimaryCV(supabase, userId);

    if (!profileRow?.profile || !isCurrentCareerProfile(profileRow.profile)) {
      const body: CareerProfileResponseBody = {
        profile: null,
        cvNewerThanProfile: false,
        status: primaryDoc ? 'no_profile' : 'no_cv',
        generatedAt: null,
      };
      return NextResponse.json(body);
    }

    const cvNewerThanProfile = isCVNewerThanProfile({
      profileSourceUpdatedAt: profileRow.source_document_updated_at,
      primaryDocUpdatedAt: primaryDoc?.updated_at ?? null,
    });

    const body: CareerProfileResponseBody = {
      profile: profileRow.profile,
      cvNewerThanProfile,
      status: 'ok',
      generatedAt: profileRow.profile.generatedAt,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error('[job-feed/career-profile] GET unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load career profile.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate-limit by user ID (not IP) so users behind shared IPs or VPNs
    // don't burn each other's budget. Must authenticate first to get the ID.
    const supabaseForRateLimit = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedSupabaseForRateLimit = supabaseForRateLimit as any;
    const { data: { user: userForRateLimit } } = await typedSupabaseForRateLimit.auth.getUser();
    const rateLimitKey = userForRateLimit?.id
      ? `career-profile-generate:${userForRateLimit.id}`
      : `career-profile-generate:${getClientIP(request)}`;
    const { allowed } = checkRateLimit(rateLimitKey, RATE_LIMITS['career-profile-generate']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const auth = await authenticatePaidUser();
    if (!auth.ok) return auth.response;
    const { userId, supabase } = auth;

    let force = false;
    try {
      const body = await request.json();
      force = Boolean(body?.force);
    } catch {
      // No body / malformed body — treat as non-forced regeneration.
    }

    const { profileRow, primaryDoc } = await loadProfileAndPrimaryCV(supabase, userId);

    if (!primaryDoc?.structured_data) {
      const body: CareerProfileResponseBody = {
        profile: null,
        cvNewerThanProfile: false,
        status: 'no_cv',
        generatedAt: null,
      };
      return NextResponse.json(body, { status: 200 });
    }

    if (
      !force
      && profileRow?.profile
      && isCurrentCareerProfile(profileRow.profile)
      && profileRow.version === CAREER_PROFILE_SCHEMA_VERSION
      && !isCVNewerThanProfile({
        profileSourceUpdatedAt: profileRow.source_document_updated_at,
        primaryDocUpdatedAt: primaryDoc.updated_at,
      })
    ) {
      // Cache hit, no force, no CV change — return existing profile unchanged.
      const body: CareerProfileResponseBody = {
        profile: profileRow.profile,
        cvNewerThanProfile: false,
        status: 'ok',
        generatedAt: profileRow.profile.generatedAt,
      };
      return NextResponse.json(body);
    }

    // Idempotency guard for force=true: if the profile was generated very
    // recently (within the last 30 seconds) AND the source CV hasn't changed
    // since then, return the cached profile instead of burning another LLM
    // call. This prevents duplicate generations from rapid re-mounts or
    // parallel requests (e.g., AISearchProfileCard auto-regen race).
    if (
      force
      && profileRow?.profile
      && isCurrentCareerProfile(profileRow.profile)
      && profileRow.source_document_updated_at
      && primaryDoc.updated_at
    ) {
      const profileAge = Date.now() - Date.parse(profileRow.profile.generatedAt);
      const cvNewerThanCached = isCVNewerThanProfile({
        profileSourceUpdatedAt: profileRow.source_document_updated_at,
        primaryDocUpdatedAt: primaryDoc.updated_at,
      });
      if (profileAge < 30_000 && !cvNewerThanCached) {
        const body: CareerProfileResponseBody = {
          profile: profileRow.profile,
          cvNewerThanProfile: false,
          status: 'ok',
          generatedAt: profileRow.profile.generatedAt,
        };
        return NextResponse.json(body);
      }
    }

    const cv = primaryDoc.structured_data as StructuredCV;
    const result = await generateCareerProfile(cv);

    const { error: persistError } = await supabase
      .from('user_career_profiles')
      .upsert({
        user_id: userId,
        profile: result.profile,
        version: CAREER_PROFILE_SCHEMA_VERSION,
        source_document_id: primaryDoc.id ?? null,
        source_document_updated_at: primaryDoc.updated_at ?? null,
        model_provider: result.modelProvider,
        model_name: result.modelName,
      }, { onConflict: 'user_id' });

    if (persistError) {
      console.error('[career-profile] Failed to persist generated profile:', {
        userId,
        error: persistError.message,
      });
      return NextResponse.json({ error: 'Failed to save career profile.' }, { status: 500 });
    }

    console.log(
      `[career-profile] Generated for user ${userId}: ${result.modelName} | ${result.inputTokens}in/${result.outputTokens}out | ${result.latencyMs}ms`,
    );

    const body: CareerProfileResponseBody = {
      profile: result.profile,
      cvNewerThanProfile: false,
      status: 'ok',
      generatedAt: result.profile.generatedAt,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error('[job-feed/career-profile] POST unexpected error:', error);
    return NextResponse.json({ error: 'Failed to generate career profile.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added user_career_profiles table here.
type TypedSupabase = any;
type AuthSuccess = { ok: true; userId: string; supabase: TypedSupabase };
type AuthFailure = { ok: false; response: NextResponse };

async function authenticatePaidUser(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added user_career_profiles table here.
  const typedSupabase = supabase as any;
  const { data: { user }, error: authError } = await typedSupabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  // requireJobFeedAccess correctly distinguishes missing profiles row (500)
  // from plan gate (403), avoiding a misleading "paid plans only" message
  // when the profiles row is simply absent (account setup incomplete).
  const access = await requireJobFeedAccess(typedSupabase, user);
  if (!access.ok) {
    return { ok: false, response: NextResponse.json({ error: access.error }, { status: access.status }) };
  }

  return { ok: true, userId: user.id as string, supabase: typedSupabase };
}

interface ProfileRow {
  profile: CareerProfile | null;
  version: number;
  source_document_id: string | null;
  source_document_updated_at: string | null;
}

interface PrimaryDocRow {
  id: string;
  structured_data: StructuredCV | null;
  updated_at: string;
}

async function loadProfileAndPrimaryCV(
  supabase: TypedSupabase,
  userId: string,
): Promise<{ profileRow: ProfileRow | null; primaryDoc: PrimaryDocRow | null }> {
  const [profileResult, primaryDocResult] = await Promise.all([
    supabase
      .from('user_career_profiles')
      .select('profile, version, source_document_id, source_document_updated_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('documents')
      .select('id, structured_data, updated_at')
      .eq('user_id', userId)
      .eq('type', 'primary_cv')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    console.error('[job-feed/career-profile] profile fetch error:', profileResult.error.message);
  }
  if (primaryDocResult.error) {
    console.error('[job-feed/career-profile] primary CV fetch error:', primaryDocResult.error.message);
  }

  const profileRow = profileResult.data
    ? {
        profile: (profileResult.data.profile as CareerProfile | null) ?? null,
        version: (profileResult.data.version as number | null) ?? 0,
        source_document_id: (profileResult.data.source_document_id as string | null) ?? null,
        source_document_updated_at: (profileResult.data.source_document_updated_at as string | null) ?? null,
      }
    : null;

  const primaryDoc = primaryDocResult.data
    ? {
        id: primaryDocResult.data.id as string,
        structured_data: (primaryDocResult.data.structured_data as StructuredCV | null) ?? null,
        updated_at: primaryDocResult.data.updated_at as string,
      }
    : null;

  return { profileRow, primaryDoc };
}

function isCVNewerThanProfile(params: {
  profileSourceUpdatedAt: string | null;
  primaryDocUpdatedAt: string | null;
}): boolean {
  if (!params.profileSourceUpdatedAt || !params.primaryDocUpdatedAt) return false;
  const profileTime = Date.parse(params.profileSourceUpdatedAt);
  const cvTime = Date.parse(params.primaryDocUpdatedAt);
  if (Number.isNaN(profileTime) || Number.isNaN(cvTime)) return false;
  // Require a meaningful gap (>1s) so harmless writes that touch the
  // documents row don't reopen the auto-regen loop in AISearchProfileCard.
  return cvTime - profileTime > 1000;
}
