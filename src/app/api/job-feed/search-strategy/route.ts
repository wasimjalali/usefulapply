import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { requireJobFeedView } from '@/lib/job-feed/auth';
import {
  getJobFeedSettingsAdmin,
  getUserCareerProfileAdmin,
  loadOrGenerateSearchStrategyAdmin,
} from '@/lib/job-feed/server';
import { getProfile } from '@/db/repos/profiles';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { FeedError } from '@/lib/services/feed/errors';
import { readSearchStrategy, type SearchStrategyResponseBody } from '@/lib/services/feed/career-profile';

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

    const { allowed } = await checkRateLimit(`search-strategy:${userId}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    return NextResponse.json<SearchStrategyResponseBody>(await readSearchStrategy(userId));
  } catch (error) {
    if (error instanceof FeedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
