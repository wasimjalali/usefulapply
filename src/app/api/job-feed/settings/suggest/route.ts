import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { extractJobFeedSuggestionsFromCV } from '@/lib/job-feed/cv-suggestions';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { Json } from '@/lib/supabase/types';
import { getProfile } from '@/db/repos/profiles';
import { upsertCvSuggestion } from '@/db/repos/jobFeed';

export const runtime = 'nodejs';

// A parsed CV is a few tens of KB. Anything past this is not a CV.
const MAX_STRUCTURED_CV_BYTES = 512_000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`job-feed-settings:${ip}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const profile = await getProfile(user.id);

    if (!profile || !canAccessJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const body = await request.json();
    const raw = body?.structured_data;

    // Shape and size guard: this goes straight into extraction and then into
    // D1, so a truthiness check is not enough.
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return NextResponse.json({ error: 'structured_data is required.' }, { status: 400 });
    }
    if (JSON.stringify(raw).length > MAX_STRUCTURED_CV_BYTES) {
      return NextResponse.json({ error: 'structured_data is too large.' }, { status: 400 });
    }

    const suggestion = extractJobFeedSuggestionsFromCV(raw as StructuredCV);

    await upsertCvSuggestion(user.id, suggestion as unknown as Json);

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error('[job-feed/settings/suggest] Cache write error:', error);
    return NextResponse.json({ error: 'Failed to cache suggestions.' }, { status: 500 });
  }
}
