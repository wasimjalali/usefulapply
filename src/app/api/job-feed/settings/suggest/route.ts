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

    // Try cache first
    const { data: cached } = await typedSupabase
      .from('user_cv_suggestions')
      .select('suggestion')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cached?.suggestion) {
      return NextResponse.json({ suggestion: cached.suggestion as JobFeedSettingsSuggestion });
    }

    // Fall back to live extraction
    const { data: document, error: docError } = await typedSupabase
      .from('documents')
      .select('structured_data')
      .eq('user_id', user.id)
      .eq('document_type', 'primary_cv')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (docError) {
      console.error('[job-feed/settings/suggest] Document fetch error:', docError.message);
      return NextResponse.json({ error: 'Failed to load CV data.' }, { status: 500 });
    }

    if (!document?.structured_data) {
      return NextResponse.json({ suggestion: null, reason: 'no_cv' });
    }

    const cv = document.structured_data as StructuredCV;
    const suggestion = extractJobFeedSuggestionsFromCV(cv);

    return NextResponse.json({ suggestion });
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
      .upsert({ user_id: user.id, suggestion }, { onConflict: 'user_id' });

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error('[job-feed/settings/suggest] Cache write error:', error);
    return NextResponse.json({ error: 'Failed to cache suggestions.' }, { status: 500 });
  }
}
