import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import { extractJobFeedSuggestionsFromCV } from '@/lib/job-feed/cv-suggestions';
import type { JobFeedSettingsSuggestion } from '@/lib/job-feed/types';
import type { StructuredCV } from '@/lib/types/cv-schema';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-settings:${ip}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added tables here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('force') === 'true';

    // Load the cached suggestion (if any) and the latest CV document in
    // parallel so we can decide whether the cache is fresh.
    const [cachedResult, primaryDoc, masterDoc] = await Promise.all([
      typedSupabase
        .from('user_cv_suggestions')
        .select('suggestion, updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      typedSupabase
        .from('documents')
        .select('structured_data, updated_at')
        .eq('user_id', user.id)
        .eq('document_type', 'primary_cv')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      typedSupabase
        .from('documents')
        .select('structured_data, updated_at')
        .eq('user_id', user.id)
        .eq('document_type', 'master_cv')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Surface Supabase errors so RLS / network problems don't silently
    // present as "no CV found" to the client.
    if (cachedResult.error) console.error('[job-feed/settings/suggest] cache fetch error:', cachedResult.error.message);
    if (primaryDoc.error) console.error('[job-feed/settings/suggest] primary CV fetch error:', primaryDoc.error.message);
    if (masterDoc.error) console.error('[job-feed/settings/suggest] master CV fetch error:', masterDoc.error.message);

    const cached = cachedResult.data;
    // Prefer the master CV when available — it carries richer history.
    const sourceDoc = masterDoc.data?.structured_data ? masterDoc.data : primaryDoc.data;

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
        suggestion: cached.suggestion as JobFeedSettingsSuggestion,
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
    await typedSupabase
      .from('user_cv_suggestions')
      .upsert(
        { user_id: user.id, suggestion, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

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
    const { allowed } = checkRateLimit(`job-feed-settings:${ip}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added tables here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const structuredData = body?.structured_data as StructuredCV | undefined;

    if (!structuredData) {
      return NextResponse.json({ error: 'structured_data is required.' }, { status: 400 });
    }

    const suggestion = extractJobFeedSuggestionsFromCV(structuredData);

    await typedSupabase
      .from('user_cv_suggestions')
      .upsert(
        { user_id: user.id, suggestion, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error('[job-feed/settings/suggest] Cache write error:', error);
    return NextResponse.json({ error: 'Failed to cache suggestions.' }, { status: 500 });
  }
}
