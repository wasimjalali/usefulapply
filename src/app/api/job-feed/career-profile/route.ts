import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { requireJobFeedAccess, requireJobFeedView } from '@/lib/job-feed/auth';
import { FeedError } from '@/lib/services/feed/errors';
import {
  generateCareerProfileForUser,
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

    // `force` reads the CV again even when the stored profile is current (the "Read my CV again" button).
    const body = await request.json().catch(() => null) as { force?: unknown } | null;
    const result = await generateCareerProfileForUser({
      userId,
      force: body?.force === true,
      clientRequestId: request.headers.get('x-request-id'),
      route: '/api/job-feed/career-profile',
    });
    return NextResponse.json<CareerProfileResponseBody & { regenerated: boolean }>(result);
  } catch (error) {
    if (error instanceof FeedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
