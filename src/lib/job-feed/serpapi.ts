import { JOB_FEED_PROVIDER } from '@/lib/job-feed/constants';
import { captureJobFeedEvent } from '@/lib/job-feed/analytics';
import type { JobFeedCanonicalJob, Json } from '@/lib/supabase/types';

export interface SerpApiJob {
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

export interface SerpApiFilterOption {
  name?: string;
  uds?: string;
  q?: string;
  serpapi_link?: string;
}

export interface SerpApiFilter {
  name: string;
  options?: SerpApiFilterOption[];
}

export interface SerpApiResponse {
  jobs_results?: SerpApiJob[];
  filters?: SerpApiFilter[];
  serpapi_pagination?: {
    next_page_token?: string;
  };
  error?: string;
}

export interface SerpApiSearchInput {
  query: string;
  location?: string;
  country?: string;
  language?: string;
  filters?: string[];
  nextPageToken?: string;
}

export interface SerpApiFetchResult {
  data: SerpApiResponse;
  requestParams: Record<string, string>;
}

export interface NormalizedSerpApiJob {
  canonical_key: string;
  source_provider: string;
  source_job_id: string | null;
  title: string;
  title_normalized: string;
  company: string;
  company_normalized: string;
  location_text: string | null;
  location_normalized: string | null;
  work_mode: JobFeedCanonicalJob['work_mode'];
  employment_type: JobFeedCanonicalJob['employment_type'];
  salary_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description: string | null;
  apply_url: string | null;
  source_url: string | null;
  posted_at_text: string | null;
  freshness_days: number | null;
  source_identifiers: Json;
}

export class SerpApiHttpError extends Error {
  status: number;
  bodyText: string;

  constructor(status: number, bodyText: string) {
    super(`SerpApi request failed with status ${status}.`);
    this.name = 'SerpApiHttpError';
    this.status = status;
    this.bodyText = bodyText;
  }
}

// SerpAPI uses non-standard country codes for `gl` in some cases.
// ISO 3166-1 alpha-2 uses `gb`, but SerpAPI/Google expects `uk`.
export function toSerpApiGl(code: string): string {
  const normalized = code.toLowerCase().trim();
  if (normalized === 'gb') return 'uk';
  return normalized;
}

export function normalizeCountryCode(code: string): string {
  const normalized = code.toLowerCase().trim();
  if (normalized === 'gb') return 'uk';
  return normalized;
}

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

export function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code.toUpperCase();
}

/**
 * Drop trailing comma-segments that duplicate the country we already pin
 * with `gl`. Handles the 2-letter code, the canonical country name, and a
 * handful of common aliases people put in their CV / settings. Idempotent.
 *
 * Examples (countryCode = 'us', countryName = 'United States'):
 *   "San Francisco, US"             -> "San Francisco"
 *   "San Francisco, USA"            -> "San Francisco"
 *   "San Francisco, United States"  -> "San Francisco"
 *   "Berlin, Germany"               -> "Berlin"          (when called with de/Germany)
 *   "Berlin"                        -> "Berlin"          (no-op)
 *   "London, UK"                    -> "London"          (when called with uk/United Kingdom)
 */
function stripTrailingCountrySegment(
  location: string,
  countryCode: string,
  countryName: string,
): string {
  const segments = location.split(',').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length <= 1) return segments.join(', ');

  const code = countryCode.toLowerCase();
  const name = countryName.toLowerCase();
  // A short, conservative list of country aliases / codes the upstream
  // CV-suggestions layer or hand-typed values commonly produce. We do
  // NOT strip arbitrary 2-letter trailing segments — that would eat
  // legitimate state codes ("New York, NY") and break disambiguation.
  const ALIASES = new Set<string>([
    'usa', 'u.s.', 'u.s.a', 'us',
    'uk', 'gb',
    'deutschland',
  ]);

  while (segments.length > 1) {
    const tail = segments[segments.length - 1].toLowerCase().replace(/\.+$/, '');
    if (tail === code || tail === name || ALIASES.has(tail)) {
      segments.pop();
      continue;
    }
    break;
  }

  return segments.join(', ');
}

export function buildSerpApiSearchParams(input: SerpApiSearchInput): URLSearchParams {
  const searchParams = new URLSearchParams({
    engine: 'google_jobs',
    q: input.query.trim(),
  });

  const countryCode = input.country?.trim()
    ? normalizeCountryCode(input.country.trim())
    : '';

  if (countryCode) {
    searchParams.set('gl', toSerpApiGl(countryCode));
    searchParams.set('google_domain', COUNTRY_GOOGLE_DOMAINS[countryCode] || 'google.com');
    const language = input.language || COUNTRY_LANGUAGES[countryCode] || 'en';
    searchParams.set('hl', language);

    if (input.location?.trim()) {
      const countryName = getCountryName(countryCode);
      // Strip a trailing country-like segment so we never end up with
      // "San Francisco, US, United States" — SerpAPI rejects that as
      // 400 "Unsupported location parameter". The upstream cv-suggestions
      // layer appends `cv.personal.country` (often the 2-letter code)
      // without knowing how SerpAPI scopes by `gl`. We normalize at the
      // boundary so user input stays untouched in our DB.
      const location = stripTrailingCountrySegment(input.location.trim(), countryCode, countryName);
      const locationValue = location.toLowerCase().includes(countryName.toLowerCase())
        ? location
        : `${location}, ${countryName}`;
      searchParams.set('location', locationValue);
    } else {
      searchParams.set('location', getCountryName(countryCode));
    }
  } else if (input.location?.trim()) {
    searchParams.set('location', input.location.trim());
  } else {
    searchParams.set('gl', 'us');
    searchParams.set('google_domain', 'google.com');
    searchParams.set('hl', 'en');
  }

  if (input.filters && input.filters.length > 0) {
    const validFilters = input.filters.filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (validFilters.length > 0) {
      searchParams.set('uds', validFilters.join(','));
    }
  }

  if (input.nextPageToken?.trim()) {
    searchParams.set('next_page_token', input.nextPageToken.trim());
  }

  return searchParams;
}

export function serializeSearchParams(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(params.entries());
}

export async function fetchSerpApiJobs(input: SerpApiSearchInput): Promise<SerpApiFetchResult> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY is not configured.');
  }

  const sanitizedParams = buildSerpApiSearchParams(input);
  const requestParams = new URLSearchParams(sanitizedParams);
  requestParams.set('api_key', apiKey);

  const response = await fetch(`https://serpapi.com/search?${requestParams.toString()}`, {
    cache: 'no-store',
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new SerpApiHttpError(response.status, bodyText);
  }

  let data: SerpApiResponse;
  try {
    data = JSON.parse(bodyText) as SerpApiResponse;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to parse SerpApi response JSON: ${error.message}`
        : 'Failed to parse SerpApi response JSON.'
    );
  }

  return {
    data,
    requestParams: serializeSearchParams(sanitizedParams),
  };
}

export function isSerpApiNoResultsError(errorMessage?: string): boolean {
  if (!errorMessage) return false;

  const normalized = errorMessage.toLowerCase();
  return [
    "hasn't returned any results",
    'no results',
    'could not get results',
  ].some((pattern) => normalized.includes(pattern));
}

export function normalizeSerpApiJob(job: SerpApiJob): NormalizedSerpApiJob {
  const title = normalizeDisplayText(job.title) || 'Untitled role';
  const company = normalizeDisplayText(job.company_name) || 'Unknown company';
  const locationText = normalizeOptionalText(job.location);
  const workMode = inferWorkMode(job);
  const applyUrl = extractApplyUrl(job);
  const sourceUrl = isHttpUrl(job.share_link) ? normalizeOptionalText(job.share_link) : null;
  const postedAtText = normalizeOptionalText(job.detected_extensions?.posted_at);
  const salary = parseSalaryText(job.detected_extensions?.salary);

  const titleNormalized = normalizeIdentitySegment(title);
  const companyNormalized = normalizeIdentitySegment(company);
  const locationNormalized = normalizeLocation(locationText);

  return {
    canonical_key: buildCanonicalKey({
      titleNormalized,
      companyNormalized,
      applyUrl,
      sourceUrl,
      sourceJobId: normalizeOptionalText(job.job_id),
      locationNormalized,
      workMode,
    }),
    source_provider: JOB_FEED_PROVIDER,
    source_job_id: normalizeOptionalText(job.job_id),
    title,
    title_normalized: titleNormalized,
    company,
    company_normalized: companyNormalized,
    location_text: locationText,
    location_normalized: locationNormalized,
    work_mode: workMode,
    employment_type: normalizeEmploymentType(job.detected_extensions?.schedule_type),
    salary_text: salary.salaryText,
    salary_min: salary.salaryMin,
    salary_max: salary.salaryMax,
    salary_currency: salary.salaryCurrency,
    description: normalizeOptionalMultilineText(job.description),
    apply_url: applyUrl,
    source_url: sourceUrl,
    posted_at_text: postedAtText,
    freshness_days: estimateFreshnessDays(postedAtText),
    source_identifiers: {
      job_id: normalizeOptionalText(job.job_id),
      via: normalizeOptionalText(job.via),
      share_link: sourceUrl,
      apply_options: sanitizeApplyOptions(job.apply_options),
      highlights: job.job_highlights ?? [],
      extensions: job.extensions ?? [],
      thumbnail: normalizeOptionalText(job.thumbnail),
      posted_at: postedAtText,
      work_from_home: Boolean(job.detected_extensions?.work_from_home),
      salary: salary.salaryText,
    },
  };
}

function buildCanonicalKey(params: {
  titleNormalized: string;
  companyNormalized: string;
  applyUrl: string | null;
  sourceUrl: string | null;
  sourceJobId: string | null;
  locationNormalized: string | null;
  workMode: JobFeedCanonicalJob['work_mode'];
}): string {
  const title = params.titleNormalized || 'unknown-title';
  const company = params.companyNormalized || 'unknown-company';

  const canonicalUrl = normalizeUrlForDedupe(params.applyUrl)
    || normalizeUrlForDedupe(params.sourceUrl);

  if (canonicalUrl) {
    return `${JOB_FEED_PROVIDER}:${title}|${company}|${canonicalUrl}`;
  }

  if (params.sourceJobId) {
    return `${JOB_FEED_PROVIDER}:job:${normalizeIdentitySegment(params.sourceJobId)}`;
  }

  return `${JOB_FEED_PROVIDER}:${title}|${company}|${params.locationNormalized || params.workMode || 'unknown'}`;
}

function inferWorkMode(job: SerpApiJob): JobFeedCanonicalJob['work_mode'] {
  const signals = [
    job.location,
    ...(job.extensions ?? []),
    job.detected_extensions?.schedule_type,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  // Multi-language work-mode keywords. SerpAPI returns listings in the search
  // language, so we match on the common ways each mode is expressed.
  const REMOTE_KEYWORDS = [
    'remote', 'work from home', 'wfh',
    'télétravail', 'a distance', 'à distance', // fr
    'remoto', 'teletrabajo', 'trabajo a distancia', // es/pt
    'homeoffice', 'home office', 'fernarbeit', // de
    'smart working', 'lavoro da remoto', // it
    'thuiswerk', 'op afstand', // nl
    'リモート', '在宅', 'テレワーク', // ja
    '재택', '원격', // ko
    '远程', '遠端', // zh
  ];
  const HYBRID_KEYWORDS = [
    'hybrid', 'hybride', 'híbrido', 'ibrido', 'hybrid-arbeit', 'ハイブリッド', '하이브리드', '混合',
  ];
  const ONSITE_KEYWORDS = [
    'on-site', 'onsite', 'on site', 'in office', 'in-office',
    'sur site', 'au bureau', // fr
    'presencial', 'en oficina', // es/pt
    'vor ort', 'im büro', // de
    'in sede', 'in ufficio', // it
    'op kantoor', // nl
    'オフィス', '出社', // ja
    '사무실', '현장', // ko
    '现场办公', '到場', // zh
  ];

  if (job.detected_extensions?.work_from_home || REMOTE_KEYWORDS.some((kw) => signals.includes(kw))) {
    return 'remote';
  }

  if (HYBRID_KEYWORDS.some((kw) => signals.includes(kw))) {
    return 'hybrid';
  }

  if (ONSITE_KEYWORDS.some((kw) => signals.includes(kw))) {
    return 'onsite';
  }

  return normalizeOptionalText(job.location) ? 'onsite' : 'unknown';
}

function normalizeEmploymentType(value?: string): JobFeedCanonicalJob['employment_type'] {
  const normalized = normalizeOptionalText(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('full')) return 'full_time';
  if (normalized.includes('part')) return 'part_time';
  if (normalized.includes('contract')) return 'contract';
  if (normalized.includes('intern')) return 'internship';
  if (normalized.includes('temp')) return 'temporary';
  return null;
}

function extractApplyUrl(job: SerpApiJob): string | null {
  const directApply = job.apply_options?.find((option) => isHttpUrl(option.link))?.link;
  if (directApply) {
    return directApply;
  }

  return isHttpUrl(job.share_link) ? job.share_link : null;
}

function sanitizeApplyOptions(options?: SerpApiJob['apply_options']): Array<{ title: string; link: string }> {
  if (!Array.isArray(options)) return [];

  const safeOptions: Array<{ title: string; link: string }> = [];

  for (const option of options) {
    const title = normalizeOptionalText(option.title) ?? 'Apply';
    const link = normalizeOptionalText(option.link) ?? '';
    if (!title) continue;

    if (!isHttpUrl(link)) {
      captureJobFeedEvent({
        event: 'job_feed_unsafe_external_link_dropped',
        logLevel: 'warn',
        properties: {
          provider: JOB_FEED_PROVIDER,
          source: 'serpapi_apply_options',
          link_protocol: readUrlProtocol(link),
          link_length: link.length,
        },
      });
      continue;
    }

    safeOptions.push({ title, link });
    if (safeOptions.length >= 8) break;
  }

  return safeOptions;
}

function readUrlProtocol(value: string): string | null {
  try {
    return new URL(value).protocol.replace(':', '') || null;
  } catch {
    const separatorIndex = value.indexOf(':');
    return separatorIndex > 0 ? value.slice(0, separatorIndex).toLowerCase() : null;
  }
}

// "today" / "just posted" / "x hours ago" equivalents across the markets we
// serve (EN + DE/FR/ES/IT/NL/PT). SerpAPI returns the posted-at string in the
// query locale (driven by hl), so a German query yields "vor 3 Tagen", a French
// one "il y a 2 jours". English-only parsing zeroed the freshness signal for
// every EU posting; this restores it.
const FRESHNESS_TODAY_TOKENS = [
  'today', 'just posted', 'new', 'hours ago', 'hour ago',
  'heute', 'gerade', 'soeben', 'vor wenigen', 'stunden', 'stunde',
  "aujourd'hui", 'à l\'instant', 'heures', 'heure',
  'hoy', 'recién', 'horas', 'hora',
  'oggi', 'poco fa', 'ore fa', 'ora fa',
  'vandaag', 'zojuist', 'uur geleden',
  'hoje', 'agora', 'horas atrás',
];
const FRESHNESS_YESTERDAY_TOKENS = ['yesterday', 'gestern', 'hier', 'ayer', 'ieri', 'gisteren', 'ontem'];

// Unit patterns: the count always precedes the unit in every supported
// locale ("3 days ago", "vor 3 Tagen", "il y a 2 jours", "hace 5 días").
const FRESHNESS_DAY_UNIT = /(\d+)\+?\s*(?:days?|tage?n?|jours?|d[ií]as?|giorni|giorno|dag(?:en)?|dni|dzie[nń])/;
const FRESHNESS_WEEK_UNIT = /(\d+)\+?\s*(?:weeks?|wochen?|semaines?|semanas?|settimane?|weken|week|tygodni|tydzie[nń])/;
const FRESHNESS_MONTH_UNIT = /(\d+)\+?\s*(?:months?|monate?n?|mois|mes(?:es)?|mesi|mese|maand(?:en)?|miesi)/;

function estimateFreshnessDays(value?: string | null): number | null {
  const normalized = normalizeOptionalText(value)?.toLowerCase();
  if (!normalized) return null;

  if (FRESHNESS_TODAY_TOKENS.some((token) => normalized.includes(token))) {
    return 0;
  }

  if (FRESHNESS_YESTERDAY_TOKENS.some((token) => normalized.includes(token))) {
    return 1;
  }

  const dayMatch = normalized.match(FRESHNESS_DAY_UNIT);
  if (dayMatch) {
    return Number.parseInt(dayMatch[1], 10);
  }

  const weekMatch = normalized.match(FRESHNESS_WEEK_UNIT);
  if (weekMatch) {
    return Number.parseInt(weekMatch[1], 10) * 7;
  }

  const monthMatch = normalized.match(FRESHNESS_MONTH_UNIT);
  if (monthMatch) {
    return Number.parseInt(monthMatch[1], 10) * 30;
  }

  return null;
}

function parseSalaryText(value?: string): {
  salaryText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
} {
  const salaryText = normalizeOptionalText(value);
  if (!salaryText) {
    return {
      salaryText: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
    };
  }

  const matches = Array.from(salaryText.matchAll(/(\d[\d,.]*)(?:\s*([kKmM]))?/g));
  const numericValues = matches
    .map((match) => parseSalaryNumber(match[1], match[2]))
    .filter((candidate): candidate is number => candidate !== null)
    .slice(0, 2)
    .sort((left, right) => left - right);

  return {
    salaryText,
    salaryMin: numericValues[0] ?? null,
    // When only a single value is present (e.g. "$60k"), use it as both min
    // and max so the prefilter ceiling check can still apply. A truly
    // range-less posting ("$60k") should be treated as an exact point, not
    // as "unknown ceiling".
    salaryMax: numericValues[1] ?? numericValues[0] ?? null,
    salaryCurrency: detectCurrency(salaryText),
  };
}

function parseSalaryNumber(rawValue: string, suffix?: string): number | null {
  const normalized = rawValue.replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;

  const multiplier = suffix?.toLowerCase() === 'm'
    ? 1_000_000
    : suffix?.toLowerCase() === 'k'
      ? 1_000
      : 1;

  return Math.round(parsed * multiplier);
}

function detectCurrency(value: string): string | null {
  const normalized = value.toUpperCase();
  if (normalized.includes('CAD') || normalized.includes('C$') || normalized.includes('CA$')) return 'CAD';
  if (normalized.includes('USD') || normalized.includes('$')) return 'USD';
  if (normalized.includes('EUR') || normalized.includes('€')) return 'EUR';
  if (normalized.includes('GBP') || normalized.includes('£')) return 'GBP';
  return null;
}

function normalizeLocation(value: string | null): string | null {
  if (!value) return null;

  return normalizeIdentitySegment(
    value
      .replace(/\bremote\b/gi, ' ')
      .replace(/\bhybrid\b/gi, ' ')
      .replace(/\bon[\s-]?site\b/gi, ' ')
  );
}

function normalizeDisplayText(value?: string | null): string {
  return normalizeWhitespace(value).replace(/\s+/g, ' ').trim();
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = normalizeDisplayText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeMultilineText(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeOptionalMultilineText(value?: string | null): string | null {
  const normalized = normalizeMultilineText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeIdentitySegment(value?: string | null): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWhitespace(value?: string | null): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeUrlForDedupe(value?: string | null): string | null {
  if (!value || !isHttpUrl(value)) return null;

  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
}

function isHttpUrl(value?: string | null): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value);
}
