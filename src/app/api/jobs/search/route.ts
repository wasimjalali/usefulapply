/**
 * Job Board Search API - Proxy to SerpAPI Google Jobs
 *
 * - Requires authenticated user with Plus or Max plan
 * - Tracks monthly search usage with plan-based limits
 * - Plus: 50 searches/month, Max: 100 searches/month
 * - Uses SerpAPI Google Jobs engine
 * - Supports dynamic filters via uds parameter
 * - Supports international searches via gl, hl, google_domain, and location
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/middleware/rateLimiter';
import {
  buildSerpApiFilterGroups,
  fetchSerpApiJobs,
  isSerpApiNoResultsError,
  SerpApiHttpError,
  toLegacyJobSearchResult,
} from '@/lib/job-feed/serpapi';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Plan-based search limits
const SEARCH_LIMITS: Record<string, number> = {
  plus: 50,
  max: 100,
  pro: 100,
};

interface ProfileData {
  subscription_tier: string;
  job_searches_used: number;
  job_searches_reset_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const JOB_SEARCH_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

interface SearchRequestBody {
  query?: string;
  location?: string;
  country?: string; // Country code (e.g., 'us', 'de', 'gb')
  language?: string; // hl override (e.g., 'en', 'de')
  filters?: string[]; // Array of uds values to apply
  next_page_token?: string;
  page?: number; // Current page number (1-based), sent by frontend
}

// 1 search credit = up to FREE_PAGES_PER_CREDIT pages (10 results each).
// After that, each additional "Load More" costs 1 more credit.
const FREE_PAGES_PER_CREDIT = 3; // 30 results per credit

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // 2. Rate limit (per user)
    const rateLimitKey = `jobs-search:${user.id}`;
    const rateLimitResult = checkRateLimit(rateLimitKey, JOB_SEARCH_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimitResult.retryAfterMs || 60000) / 1000)) } }
      );
    }

    // 3. Get user profile and check subscription tier
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_tier, job_searches_used, job_searches_reset_at')
      .eq('id', user.id)
      .single() as { data: ProfileData | null; error: SupabaseAny };

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to load user profile' },
        { status: 500 }
      );
    }

    const tier = profile.subscription_tier as string;
    const searchLimit = SEARCH_LIMITS[tier];

    // Check if user has access (Plus or Max only)
    if (!searchLimit) {
      return NextResponse.json(
        {
          error: 'Job Board is available for Plus and Max subscribers',
          upgrade_required: true
        },
        { status: 403 }
      );
    }

    // 4. Check and reset monthly usage if needed
    const now = new Date();
    const resetAt = new Date(profile.job_searches_reset_at);
    let searchesUsed = profile.job_searches_used || 0;

    // Reset if we're in a different month
    if (now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
      searchesUsed = 0;
      await (supabase
        .from('profiles') as SupabaseAny)
        .update({
          job_searches_used: 0,
          job_searches_reset_at: now.toISOString()
        })
        .eq('id', user.id);
    }

    // 5. Parse request body (needed before limit check to detect pagination)
    let body: SearchRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Determine if this is a pagination request and whether it's within the free page allowance.
    // Page 1 = initial search (always costs 1 credit).
    // Pages 2-3 = free (included in the initial credit).
    // Pages 4+ = each costs 1 additional credit.
    const isPagination = !!body.next_page_token;
    const currentPage = body.page || 1;
    const isFreePageLoad = isPagination && currentPage <= FREE_PAGES_PER_CREDIT;
    const shouldDeductCredit = !isFreePageLoad;

    // 6. Check if user has remaining searches
    if (shouldDeductCredit && searchesUsed >= searchLimit) {
      return NextResponse.json(
        {
          error: 'Monthly search limit reached',
          searches_used: searchesUsed,
          searches_limit: searchLimit,
          resets_at: getNextMonthReset(resetAt).toISOString()
        },
        { status: 429 }
      );
    }

    // 7. Validate inputs
    if (body.query && body.query.length > 200) {
      return NextResponse.json(
        { error: 'Search query too long (max 200 characters)' },
        { status: 400 }
      );
    }
    if (body.location && body.location.length > 100) {
      return NextResponse.json(
        { error: 'Location too long (max 100 characters)' },
        { status: 400 }
      );
    }

    // Require at least a query
    if (!body.query?.trim()) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    // 7. Call SerpAPI through the shared provider helper
    let serpData;
    try {
      const result = await fetchSerpApiJobs({
        query: body.query.trim(),
        location: body.location?.trim() || undefined,
        country: body.country?.trim() || undefined,
        language: body.language?.trim() || undefined,
        filters: body.filters,
        nextPageToken: body.next_page_token,
      });

      serpData = result.data;
    } catch (error) {
      console.error('SerpAPI request failed:', error);

      if (error instanceof SerpApiHttpError) {
        if (error.status === 401 || error.status === 403) {
          return NextResponse.json(
            { error: 'Job search service authentication failed' },
            { status: 503 }
          );
        }

        if (error.status === 429) {
          return NextResponse.json(
            { error: 'Job search service rate limited. Please try again later.' },
            { status: 429 }
          );
        }

        return NextResponse.json(
          { error: 'Job search failed. Please try again.' },
          { status: 502 }
        );
      }

      if (error instanceof Error && error.message.includes('SERPAPI_API_KEY')) {
        return NextResponse.json(
          { error: 'Job search service unavailable' },
          { status: 503 }
        );
      }

      if (error instanceof Error && error.message.includes('parse SerpApi response JSON')) {
        return NextResponse.json(
          { error: 'Invalid response from job search service' },
          { status: 502 }
        );
      }

      throw error;
    }

    // Handle "no results" as empty array, not error
    if (serpData.error) {
      if (isSerpApiNoResultsError(serpData.error)) {
        console.log('[SerpAPI] No results found for query');
        if (shouldDeductCredit) {
          await (supabase.from('profiles') as SupabaseAny)
            .update({ job_searches_used: searchesUsed + 1 })
            .eq('id', user.id);
        }

        return NextResponse.json({
          jobs: [],
          filters: [],
          total: 0,
          next_page_token: null,
          searches_used: shouldDeductCredit ? searchesUsed + 1 : searchesUsed,
          searches_limit: searchLimit,
        });
      }

      // Log the actual error for debugging but never expose to client
      console.error('SerpAPI returned error:', serpData.error);
      return NextResponse.json(
        { error: 'Job search failed. Please try a different query or location.' },
        { status: 502 }
      );
    }

    // 8. Increment search usage
    // Free pages (2-3) don't cost credits. Pages 4+ cost 1 credit each.
    if (shouldDeductCredit) {
      const { error: updateError } = await (supabase
        .from('profiles') as SupabaseAny)
        .update({ job_searches_used: searchesUsed + 1 })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update search count:', updateError);
      }
    }

    // 9. Transform jobs + filters for the frontend
    const jobs = (serpData.jobs_results || []).map(toLegacyJobSearchResult);
    const filters = buildSerpApiFilterGroups(serpData.filters);

    return NextResponse.json({
      jobs,
      filters,
      total: jobs.length,
      next_page_token: serpData.serpapi_pagination?.next_page_token,
      searches_used: shouldDeductCredit ? searchesUsed + 1 : searchesUsed,
      searches_limit: searchLimit,
    });

  } catch (error) {
    console.error('Job search error:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

function getNextMonthReset(lastReset: Date): Date {
  const next = new Date(lastReset);
  next.setMonth(next.getMonth() + 1);
  return next;
}
