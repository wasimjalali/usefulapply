import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { extractJobFeedSuggestionsFromCV } from '@/lib/job-feed/cv-suggestions';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import type { JobFeedSettingsSuggestion } from '@/lib/job-feed/types';
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { Json } from '@/lib/supabase/types';
import { getProfile } from '@/db/repos/profiles';
import { getDocumentByType } from '@/db/repos/documents';
import { getCvSuggestion, upsertCvSuggestion } from '@/db/repos/jobFeed';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('force') === 'true';

    // Load the cached suggestion and the latest primary CV in parallel so
    // we can decide whether the cache is fresh. We deliberately ONLY look
    // at the primary CV here — master CVs are too long and skill-dense
    // for feed prefill, which would overwhelm the form and hurt ranking
    // quality. Primary CV is the single source of truth for job-feed
    // settings.
    // Read errors are not swallowed here. A failed lookup throws out to the
    // outer catch so a storage problem never silently presents as "no CV found".
    const [cached, sourceDoc] = await Promise.all([
      getCvSuggestion(user.id),
      getDocumentByType(user.id, 'primary_cv'),
    ]);

    const cachedUpdatedAt = cached?.updated_at ? Date.parse(cached.updated_at) : 0;
    const docUpdatedAt = sourceDoc?.updated_at ? Date.parse(sourceDoc.updated_at) : 0;
    // Only mark "CV newer than cache" when we have BOTH timestamps. A row
    // written by the old POST without updated_at would otherwise trigger
    // the banner for every existing user on first load after this ships.
    const cvNewerThanCache = cachedUpdatedAt > 0 && docUpdatedAt > cachedUpdatedAt;

    // Fast path: cache is present AND not stale AND caller didn't force
    // refresh → return cached.
    if (cached?.suggestion && !cvNewerThanCache && !forceRefresh) {
      return NextResponse.json({
        suggestion: cached.suggestion as unknown as JobFeedSettingsSuggestion,
        cvNewerThanCache: false,
      });
    }

    // Fall back to live extraction from the most recent CV document.
    if (!sourceDoc?.structured_data) {
      return NextResponse.json({
        suggestion: cached?.suggestion ?? null,
        cvNewerThanCache: false,
        reason: cached?.suggestion ? undefined : 'no_cv',
      });
    }

    const cv = sourceDoc.structured_data as StructuredCV;
    const suggestion = extractJobFeedSuggestionsFromCV(cv);

    // Write the freshly-derived suggestion back to the cache so the next
    // caller hits the fast path.
    await upsertCvSuggestion(user.id, suggestion as unknown as Json);

    return NextResponse.json({
      suggestion,
      cvNewerThanCache,
    });
  } catch (error) {
    console.error('[job-feed/settings/suggest] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions.' }, { status: 500 });
  }
}

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
    const structuredData = body?.structured_data as StructuredCV | undefined;

    if (!structuredData) {
      return NextResponse.json({ error: 'structured_data is required.' }, { status: 400 });
    }

    const suggestion = extractJobFeedSuggestionsFromCV(structuredData);

    await upsertCvSuggestion(user.id, suggestion as unknown as Json);

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error('[job-feed/settings/suggest] Cache write error:', error);
    return NextResponse.json({ error: 'Failed to cache suggestions.' }, { status: 500 });
  }
}
