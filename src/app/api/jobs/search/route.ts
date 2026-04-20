/**
 * Job Board Search API - Proxy to SerpAPI Google Jobs
 *
 * - Requires authenticated user with Plus or Max plan
 * - Tracks monthly search usage with plan-based limits
 * - Plus: 50 searches/month, Max: 100 searches/month
 * - Uses SerpAPI (cost per search, returns ~10 jobs per page)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Plan-based search limits
const SEARCH_LIMITS: Record<string, number> = {
  plus: 50,
  max: 100,
  pro: 100, // Legacy pro gets same as max
};

// Type for profile data (columns may not be in generated types yet)
interface ProfileData {
  subscription_tier: string;
  job_searches_used: number;
  job_searches_reset_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

// Rate limit config for job search (per user, not IP)
const JOB_SEARCH_RATE_LIMIT = { limit: 10, windowMs: 60_000 }; // 10 searches per minute

// SerpAPI Google Jobs response types
interface SerpApiJob {
  job_id: string;
  title: string;
  company_name: string;
  location: string;
  via: string;
  share_link: string;
  thumbnail?: string;
  extensions?: string[];
  detected_extensions?: {
    posted_at?: string;
    schedule_type?: string;
    work_from_home?: boolean;
    salary?: string;
  };
  description: string;
  job_highlights?: Array<{
    title: string;
    items: string[];
  }>;
  apply_options?: Array<{
    title: string;
    link: string;
  }>;
}

interface SerpApiResponse {
  jobs_results?: SerpApiJob[];
  serpapi_pagination?: {
    next_page_token?: string;
  };
  error?: string;
}

interface SearchRequestBody {
  query?: string;
  location?: string;
  remote?: boolean;
  job_type?: 'full_time' | 'part_time' | 'contract' | 'internship';
  next_page_token?: string;
}

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

    // 5. Check if user has remaining searches
    if (searchesUsed >= searchLimit) {
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

    // 6. Validate and parse request body
    let body: SearchRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Validate input lengths
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

    // 7. Build SerpAPI request
    const serpApiKey = process.env.SERPAPI_API_KEY;
    if (!serpApiKey) {
      console.error('SERPAPI_API_KEY not configured');
      return NextResponse.json(
        { error: 'Job search service unavailable' },
        { status: 503 }
      );
    }

    const searchParams = new URLSearchParams({
      engine: 'google_jobs',
      api_key: serpApiKey,
      q: body.query.trim(),
      hl: 'en',
      gl: 'us',
    });

    if (body.location) {
      searchParams.set('location', body.location.trim());
    }

    // Handle remote filter - SerpAPI uses ltype=1 for remote jobs
    if (body.remote === true) {
      searchParams.set('ltype', '1');
    }

    // Handle pagination via next_page_token
    if (body.next_page_token) {
      searchParams.set('next_page_token', body.next_page_token);
    }

    // 8. Call SerpAPI
    const serpApiUrl = `https://serpapi.com/search?${searchParams.toString()}`;
    const serpResponse = await fetch(serpApiUrl);

    if (!serpResponse.ok) {
      const errorText = await serpResponse.text();
      console.error('SerpAPI error:', serpResponse.status, errorText);

      if (serpResponse.status === 401 || serpResponse.status === 403) {
        return NextResponse.json(
          { error: 'Job search service authentication failed' },
          { status: 503 }
        );
      }
      if (serpResponse.status === 429) {
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

    const serpData: SerpApiResponse = await serpResponse.json();

    if (serpData.error) {
      console.error('SerpAPI returned error:', serpData.error);
      return NextResponse.json(
        { error: 'Job search failed. Please try again.' },
        { status: 502 }
      );
    }

    // 9. Increment search usage (only count successful searches)
    const { error: updateError } = await (supabase
      .from('profiles') as SupabaseAny)
      .update({ job_searches_used: searchesUsed + 1 })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update search count:', updateError);
    }

    // 10. Transform and return results
    const jobs = (serpData.jobs_results || []).map((job) => ({
      id: job.job_id,
      title: job.title,
      company: job.company_name,
      location: job.location || 'Not specified',
      remote: job.detected_extensions?.work_from_home || false,
      via: job.via,
      share_link: job.share_link,
      thumbnail: job.thumbnail,
      posted_date: job.detected_extensions?.posted_at,
      employment_type: job.detected_extensions?.schedule_type,
      salary: job.detected_extensions?.salary,
      description: job.description ? truncateDescription(job.description, 500) : undefined,
      highlights: job.job_highlights,
      apply_options: job.apply_options?.slice(0, 3), // Limit to 3 apply options
    }));

    return NextResponse.json({
      jobs,
      total: jobs.length,
      next_page_token: serpData.serpapi_pagination?.next_page_token,
      searches_used: searchesUsed + 1,
      searches_limit: searchLimit,
    });

  } catch (error) {
    console.error('Job search error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

function truncateDescription(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

function getNextMonthReset(lastReset: Date): Date {
  const next = new Date(lastReset);
  next.setMonth(next.getMonth() + 1);
  return next;
}
