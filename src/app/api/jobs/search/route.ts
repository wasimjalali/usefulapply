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

interface SerpApiFilterOption {
  name?: string;
  uds?: string;
  q?: string;
  serpapi_link?: string;
}

interface SerpApiFilter {
  name: string;
  options?: SerpApiFilterOption[];
}

interface SerpApiResponse {
  jobs_results?: SerpApiJob[];
  filters?: SerpApiFilter[];
  serpapi_pagination?: {
    next_page_token?: string;
  };
  error?: string;
}

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

// SerpAPI uses non-standard country codes for `gl` in some cases
// ISO 3166-1 alpha-2 uses 'gb' but SerpAPI/Google uses 'uk'
function toSerpApiGl(code: string): string {
  const normalized = code.toLowerCase().trim();
  if (normalized === 'gb') return 'uk';
  return normalized;
}

// Normalize incoming country code to a consistent internal key
function normalizeCountryCode(code: string): string {
  const normalized = code.toLowerCase().trim();
  // Accept both 'gb' and 'uk' — internally use 'uk' as canonical
  if (normalized === 'gb') return 'uk';
  return normalized;
}

// Map internal country codes to default languages
const COUNTRY_LANGUAGES: Record<string, string> = {
  us: 'en',
  uk: 'en',
  de: 'de',
  fr: 'fr',
  nl: 'nl',
  ca: 'en',
  au: 'en',
  in: 'en',
  sg: 'en',
  ae: 'en',
  ch: 'de',
  se: 'sv',
  es: 'es',
  it: 'it',
  ie: 'en',
  jp: 'ja',
  br: 'pt',
  mx: 'es',
  pl: 'pl',
  at: 'de',
  be: 'nl',
  dk: 'da',
  fi: 'fi',
  no: 'no',
  nz: 'en',
  za: 'en',
  hk: 'zh-TW',
  kr: 'ko',
  tw: 'zh-TW',
};

// Map internal country codes to full country names for location parameter
const COUNTRY_NAMES: Record<string, string> = {
  us: 'United States',
  uk: 'United Kingdom',
  de: 'Germany',
  fr: 'France',
  nl: 'Netherlands',
  ca: 'Canada',
  au: 'Australia',
  in: 'India',
  sg: 'Singapore',
  ae: 'United Arab Emirates',
  ch: 'Switzerland',
  se: 'Sweden',
  es: 'Spain',
  it: 'Italy',
  ie: 'Ireland',
  jp: 'Japan',
  br: 'Brazil',
  mx: 'Mexico',
  pl: 'Poland',
  at: 'Austria',
  be: 'Belgium',
  dk: 'Denmark',
  fi: 'Finland',
  no: 'Norway',
  nz: 'New Zealand',
  za: 'South Africa',
  hk: 'Hong Kong',
  kr: 'South Korea',
  tw: 'Taiwan',
};

// Google domain per country — critical for international result quality
const COUNTRY_GOOGLE_DOMAINS: Record<string, string> = {
  us: 'google.com',
  uk: 'google.co.uk',
  de: 'google.de',
  fr: 'google.fr',
  nl: 'google.nl',
  ca: 'google.ca',
  au: 'google.com.au',
  in: 'google.co.in',
  sg: 'google.com.sg',
  ae: 'google.ae',
  ch: 'google.ch',
  se: 'google.se',
  es: 'google.es',
  it: 'google.it',
  ie: 'google.ie',
  jp: 'google.co.jp',
  br: 'google.com.br',
  mx: 'google.com.mx',
  pl: 'google.pl',
  at: 'google.at',
  be: 'google.be',
  dk: 'google.dk',
  fi: 'google.fi',
  no: 'google.no',
  nz: 'google.co.nz',
  za: 'google.co.za',
  hk: 'google.com.hk',
  kr: 'google.co.kr',
  tw: 'google.com.tw',
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code.toUpperCase();
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
    });

    // Normalize country code: both 'gb' and 'uk' → 'uk' internally
    const countryCode = body.country?.trim()
      ? normalizeCountryCode(body.country.trim())
      : '';

    // Location + Country logic:
    // The location field is the PRIMARY search signal for "where".
    // Country dropdown supplements it with gl/google_domain/hl for localization.
    //
    // Three scenarios:
    // A) Country selected + location: full localization (gl + google_domain + hl + location with country)
    // B) Country selected, no location: broad country search (gl + google_domain + hl + country as location)
    // C) No country, location provided: pass location as-is, no gl/hl bias — SerpAPI resolves it
    // D) Neither: default to US
    if (countryCode) {
      // Scenario A or B — full international localization
      searchParams.set('gl', toSerpApiGl(countryCode));
      searchParams.set('google_domain', COUNTRY_GOOGLE_DOMAINS[countryCode] || 'google.com');
      const language = body.language || COUNTRY_LANGUAGES[countryCode] || 'en';
      searchParams.set('hl', language);

      if (body.location?.trim()) {
        // Append country name to disambiguate (e.g., "Berlin, Germany")
        const loc = body.location.trim();
        const countryName = getCountryName(countryCode);
        const locationValue = !loc.toLowerCase().includes(countryName.toLowerCase())
          ? `${loc}, ${countryName}`
          : loc;
        searchParams.set('location', locationValue);
      } else {
        // No city — use country name as broad location
        searchParams.set('location', getCountryName(countryCode));
      }
    } else if (body.location?.trim()) {
      // Scenario C — location only, no country selected
      // Do NOT set gl or google_domain — let SerpAPI resolve from the location string.
      // Do NOT force hl=en — let SerpAPI pick language based on resolved location.
      // This allows "Berlin" to resolve to Berlin, Germany and show German jobs,
      // "London" to resolve to London, UK, etc.
      searchParams.set('location', body.location.trim());
    } else {
      // Scenario D — nothing specified, default to US
      searchParams.set('gl', 'us');
      searchParams.set('google_domain', 'google.com');
      searchParams.set('hl', 'en');
    }

    // Apply dynamic filters (uds values) — filter out any undefined/empty values
    if (body.filters && body.filters.length > 0) {
      const validFilters = body.filters.filter((f): f is string => typeof f === 'string' && f.length > 0);
      if (validFilters.length > 0) {
        searchParams.set('uds', validFilters.join(','));
      }
    }

    // Handle pagination via next_page_token
    if (body.next_page_token) {
      searchParams.set('next_page_token', body.next_page_token);
    }

    // 8. Call SerpAPI
    const serpApiUrl = `https://serpapi.com/search?${searchParams.toString()}`;
    console.log('[SerpAPI] Calling:', serpApiUrl.replace(serpApiKey, 'REDACTED'));

    const serpResponse = await fetch(serpApiUrl);
    const serpText = await serpResponse.text();

    console.log('[SerpAPI] Status:', serpResponse.status);
    console.log('[SerpAPI] Response preview:', serpText.substring(0, 500));

    if (!serpResponse.ok) {
      console.error('SerpAPI error:', serpResponse.status, serpText);

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

    let serpData: SerpApiResponse;
    try {
      serpData = JSON.parse(serpText);
    } catch (parseError) {
      console.error('SerpAPI JSON parse error:', parseError);
      return NextResponse.json(
        { error: 'Invalid response from job search service' },
        { status: 502 }
      );
    }

    // Handle "no results" as empty array, not error
    if (serpData.error) {
      // SerpAPI returns various "no results" messages — treat them all as empty
      const noResultsPatterns = [
        "hasn't returned any results",
        'no results',
        'could not get results',
      ];
      const isNoResults = noResultsPatterns.some(
        (pattern) => serpData.error!.toLowerCase().includes(pattern)
      );

      if (isNoResults) {
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

    // 9. Increment search usage
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

    // 10. Transform jobs
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
      description: job.description || undefined,
      highlights: job.job_highlights,
      apply_options: job.apply_options?.slice(0, 5),
      extensions: job.extensions, // Raw extension tags
    }));

    // 11. Transform filters for frontend
    // SerpAPI can return duplicate filter group names — merge them by name
    const filterMap = new Map<string, { label: string; value: string }[]>();
    for (const filter of serpData.filters || []) {
      if (!Array.isArray(filter.options) || filter.options.length === 0) continue;
      const existing = filterMap.get(filter.name) || [];
      for (const opt of filter.options) {
        if (!opt.uds || typeof opt.uds !== 'string') continue;
        // Avoid duplicate values within the same group
        if (existing.some((e) => e.value === opt.uds)) continue;
        existing.push({ label: opt.name || opt.q || 'Other', value: opt.uds });
      }
      if (existing.length > 0) {
        filterMap.set(filter.name, existing);
      }
    }
    const filters = Array.from(filterMap.entries()).map(([name, options]) => ({
      name,
      options,
    }));

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
