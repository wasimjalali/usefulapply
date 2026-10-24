import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { requireJobFeedAccess, requireJobFeedView } from '@/lib/job-feed/auth';
import {
  CAREER_PROFILE_SCHEMA_VERSION,
  isCurrentCareerProfile,
} from '@/lib/job-feed/career-profile';
import { generateCareerProfile } from '@/lib/job-feed/career-profile-synthesis';
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { Json } from '@/db/types';
import { upsertCareerProfile } from '@/db/repos/jobFeed';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import {
  isCVNewerThanProfile,
  loadProfileAndPrimaryCV,
  readCareerProfile,
  type CareerProfileResponseBody,
} from '@/lib/services/feed/career-profile';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const auth = await authenticateFeedViewer(request);
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    const { allowed } = await checkRateLimit(`career-profile:${userId}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    return NextResponse.json(await readCareerProfile(userId));
  } catch (error) {
    console.error('[job-feed/career-profile] GET unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load career profile.' }, { status: 500 });
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

    // Keyed by user, not IP, so people behind one shared address or a VPN
    // don't burn each other's budget.
    const { allowed } = await checkRateLimit(`career-profile-generate:${userId}`, RATE_LIMITS['career-profile-generate']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const { profileRow, primaryDoc } = await loadProfileAndPrimaryCV(userId);

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
      profileRow?.profile
      && isCurrentCareerProfile(profileRow.profile)
      && profileRow.version === CAREER_PROFILE_SCHEMA_VERSION
      && !isCVNewerThanProfile({
        profileSourceUpdatedAt: profileRow.source_document_updated_at,
        primaryDocUpdatedAt: primaryDoc.updated_at,
      })
    ) {
      // Cache hit and no CV change — return existing profile unchanged.
      const body: CareerProfileResponseBody = {
        profile: profileRow.profile,
        cvNewerThanProfile: false,
        status: 'ok',
        generatedAt: profileRow.profile.generatedAt,
      };
      return NextResponse.json(body);
    }

    const cv = primaryDoc.structured_data as StructuredCV;
    const generationContext: LlmGenerationContext = {
      requestExecutionId: crypto.randomUUID(),
      clientRequestId: request.headers.get('x-request-id'),
      userId,
      route: '/api/job-feed/career-profile',
      feature: 'job_feed',
      operation: 'career_profile_synthesis',
    };
    const result = await generateCareerProfile(cv, generationContext);

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

  // requireJobFeedAccess correctly distinguishes missing profiles row (500)
  // from plan gate (403), avoiding a misleading "paid plans only" message
  // when the profiles row is simply absent (account setup incomplete).
  const access = await requireJobFeedAccess(user);
  if (!access.ok) {
    return { ok: false, response: NextResponse.json({ error: access.error }, { status: access.status }) };
  }

  return { ok: true, userId: user.id };
}
