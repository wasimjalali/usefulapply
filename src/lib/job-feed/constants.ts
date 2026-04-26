export const PREMIUM_JOB_FEED_TIERS = ['plus', 'max'] as const;
export const JOB_FEED_PROVIDER = 'serpapi' as const;
export const JOB_FEED_MAX_DAILY_QUERIES = 4;
export const JOB_FEED_MAX_RAW_JOBS_PER_RUN = 40;
export const JOB_FEED_PREFILTER_TARGET_MIN = 8;
export const JOB_FEED_PREFILTER_HARD_CAP = 15;
// Default visible jobs when the feed panel first renders (pre-"Load more").
// First page shows this many; the "Load more" button fetches the rest from
// Supabase on demand so the initial payload stays light.
export const JOB_FEED_VISIBLE_DEFAULT_COUNT = 10;
// Absolute upper bound the LLM is allowed to surface in a single day's feed.
// Matches the Max tier's visibleCount so the ranker's instruction respects
// the highest tier cap.
export const JOB_FEED_VISIBLE_MAX_COUNT = 25;

export type JobFeedTier = 'plus' | 'max';

export interface JobFeedTierLimits {
  maxDailyQueries: number;
  maxRawJobsPerRun: number;
  prefilterHardCap: number;
  visibleCount: number;
}

export const JOB_FEED_TIER_LIMITS: Record<JobFeedTier, JobFeedTierLimits> = {
  plus: {
    maxDailyQueries: 2,
    maxRawJobsPerRun: 30,
    prefilterHardCap: 20,
    // Daily visible cap. The LLM may surface fewer when fewer genuinely
    // qualify ("quality over quantity" is explicit in its system prompt),
    // but we give it headroom when the day is strong.
    visibleCount: 15,
  },
  max: {
    maxDailyQueries: 4,
    maxRawJobsPerRun: 50,
    prefilterHardCap: 30,
    visibleCount: 25,
  },
};

// The backend runs one SerpAPI query per (role × country) combo, capped at
// `maxDailyQueries`. The UI uses these soft caps so users don't input more
// roles/countries/cities than the backend can actually search in a run.
// Going above these is allowed — we just warn the user that the extras will
// be ignored for today's feed but kept for future runs.
export interface JobFeedInputCaps {
  maxRoles: number;
  maxCountries: number;
  maxCitiesPerCountry: number;
}

export const JOB_FEED_INPUT_CAPS: Record<JobFeedTier, JobFeedInputCaps> = {
  plus: {
    // 2 queries total. 1 country → 2 roles. 2 countries → 1 role each.
    maxRoles: 2,
    maxCountries: 2,
    maxCitiesPerCountry: 2,
  },
  max: {
    // 4 queries total. 1 country → 4 roles. 2 countries → 2 roles each.
    maxRoles: 4,
    maxCountries: 4,
    maxCitiesPerCountry: 4,
  },
};

export function getJobFeedInputCaps(subscriptionTier: string): JobFeedInputCaps {
  if (subscriptionTier === 'max') return JOB_FEED_INPUT_CAPS.max;
  return JOB_FEED_INPUT_CAPS.plus;
}

export function getJobFeedTierLimits(subscriptionTier: string): JobFeedTierLimits {
  if (subscriptionTier === 'max') return JOB_FEED_TIER_LIMITS.max;
  return JOB_FEED_TIER_LIMITS.plus;
}
export const JOB_FEED_ALLOWED_FIT_LABELS = ['strong', 'good'] as const;
export const JOB_FEED_RAW_PAYLOAD_RETENTION_DAYS = 14;
export const JOB_FEED_RUN_METADATA_RETENTION_DAYS = 30;

export const JOB_FEED_MARKET_OPTIONS = [
  { value: 'us_canada', label: 'United States + Canada' },
  { value: 'us', label: 'United States only' },
  { value: 'canada', label: 'Canada only' },
] as const;

export const JOB_FEED_MARKET_COUNTRIES = {
  us: ['us'],
  canada: ['ca'],
  us_canada: ['us', 'ca'],
} as const;

// ---------------------------------------------------------------------------
// Curated country list for the Job Feed onboarding "where to search" dropdown.
// ISO 3166-1 alpha-2 codes (SerpAPI uses these via toSerpApiGl()).
// Ordered by likely user base, with the primary English-speaking + EU markets
// surfaced first.
// ---------------------------------------------------------------------------
export const JOB_FEED_COUNTRY_OPTIONS = [
  { value: 'us', label: 'United States' },
  { value: 'ca', label: 'Canada' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'ie', label: 'Ireland' },
  { value: 'de', label: 'Germany' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'fr', label: 'France' },
  { value: 'es', label: 'Spain' },
  { value: 'it', label: 'Italy' },
  { value: 'ch', label: 'Switzerland' },
  { value: 'at', label: 'Austria' },
  { value: 'be', label: 'Belgium' },
  { value: 'dk', label: 'Denmark' },
  { value: 'se', label: 'Sweden' },
  { value: 'no', label: 'Norway' },
  { value: 'fi', label: 'Finland' },
  { value: 'pl', label: 'Poland' },
  { value: 'au', label: 'Australia' },
  { value: 'nz', label: 'New Zealand' },
  { value: 'in', label: 'India' },
  { value: 'sg', label: 'Singapore' },
  { value: 'ae', label: 'United Arab Emirates' },
] as const;

export type JobFeedCountryCode = (typeof JOB_FEED_COUNTRY_OPTIONS)[number]['value'];

// Popular cities per country. Used as quick-pick suggestions and (when the
// user selects one) as location hints passed to SerpAPI. Users can still type
// their own city via the chip input.
// City-only suggestions. The user picks the country separately in the
// settings, so we don't duplicate the country name here. Remote preference
// is expressed via the "Work mode" step (JOB_FEED_REMOTE_PREFERENCE_OPTIONS).
export const JOB_FEED_CITY_SUGGESTIONS: Record<string, string[]> = {
  us: [
    'New York',
    'San Francisco',
    'Los Angeles',
    'Seattle',
    'Austin',
    'Chicago',
    'Boston',
    'Denver',
    'Atlanta',
  ],
  ca: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'],
  gb: ['London', 'Manchester', 'Edinburgh', 'Bristol', 'Cambridge'],
  ie: ['Dublin', 'Cork', 'Galway'],
  de: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne'],
  nl: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht'],
  fr: ['Paris', 'Lyon', 'Toulouse'],
  es: ['Madrid', 'Barcelona', 'Valencia'],
  it: ['Milan', 'Rome', 'Turin'],
  ch: ['Zurich', 'Geneva', 'Basel'],
  at: ['Vienna', 'Graz'],
  be: ['Brussels', 'Antwerp'],
  dk: ['Copenhagen', 'Aarhus'],
  se: ['Stockholm', 'Gothenburg', 'Malmö'],
  no: ['Oslo', 'Bergen'],
  fi: ['Helsinki', 'Espoo'],
  pl: ['Warsaw', 'Kraków', 'Wrocław'],
  au: ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
  nz: ['Auckland', 'Wellington'],
  in: ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune'],
  sg: ['Singapore'],
  ae: ['Dubai', 'Abu Dhabi'],
};

export function getJobFeedCityOptionsForCountries(countries: string[]): string[] {
  const unique = new Set<string>();
  for (const country of countries) {
    const cities = JOB_FEED_CITY_SUGGESTIONS[country] ?? [];
    for (const city of cities) unique.add(city);
  }
  return Array.from(unique);
}

export function legacyMarketFromCountries(countries: string[]): 'us' | 'canada' | 'us_canada' {
  const set = new Set(countries);
  if (set.has('us') && set.has('ca')) return 'us_canada';
  if (set.has('ca') && !set.has('us')) return 'canada';
  return 'us';
}

export const JOB_FEED_REMOTE_PREFERENCE_OPTIONS = [
  { value: 'remote_first', label: 'Remote first' },
  { value: 'remote_only', label: 'Remote only' },
  { value: 'hybrid', label: 'Hybrid okay' },
  { value: 'onsite', label: 'On-site okay' },
  { value: 'flexible', label: 'Flexible' },
] as const;

export const JOB_FEED_SENIORITY_OPTIONS = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'staff', label: 'Staff / Principal' },
  { value: 'manager', label: 'Manager' },
] as const;

export interface JobFeedTimeZoneOption {
  value: string;
  label: string;
}

export interface JobFeedTimeZoneGroup {
  region: string;
  zones: JobFeedTimeZoneOption[];
}

// Curated IANA timezones, grouped by region. United States listed first since
// the primary market for the job feed is US/Canada.
export const JOB_FEED_TIMEZONE_GROUPS: JobFeedTimeZoneGroup[] = [
  {
    region: 'United States',
    zones: [
      { value: 'America/New_York', label: 'Eastern Time — New York (ET)' },
      { value: 'America/Chicago', label: 'Central Time — Chicago (CT)' },
      { value: 'America/Denver', label: 'Mountain Time — Denver (MT)' },
      { value: 'America/Phoenix', label: 'Arizona — Phoenix (MST, no DST)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time — Los Angeles (PT)' },
      { value: 'America/Anchorage', label: 'Alaska — Anchorage (AKT)' },
      { value: 'Pacific/Honolulu', label: 'Hawaii — Honolulu (HST)' },
    ],
  },
  {
    region: 'Canada',
    zones: [
      { value: 'America/Toronto', label: 'Eastern Time — Toronto' },
      { value: 'America/Winnipeg', label: 'Central Time — Winnipeg' },
      { value: 'America/Edmonton', label: 'Mountain Time — Edmonton' },
      { value: 'America/Vancouver', label: 'Pacific Time — Vancouver' },
      { value: 'America/Halifax', label: 'Atlantic Time — Halifax' },
      { value: 'America/St_Johns', label: 'Newfoundland — St. John’s' },
    ],
  },
  {
    region: 'United Kingdom & Ireland',
    zones: [
      { value: 'Europe/London', label: 'United Kingdom — London (GMT/BST)' },
      { value: 'Europe/Dublin', label: 'Ireland — Dublin (GMT/IST)' },
    ],
  },
  {
    region: 'Europe',
    zones: [
      { value: 'Europe/Lisbon', label: 'Portugal — Lisbon' },
      { value: 'Europe/Madrid', label: 'Spain — Madrid' },
      { value: 'Europe/Paris', label: 'France — Paris' },
      { value: 'Europe/Brussels', label: 'Belgium — Brussels' },
      { value: 'Europe/Amsterdam', label: 'Netherlands — Amsterdam' },
      { value: 'Europe/Berlin', label: 'Germany — Berlin' },
      { value: 'Europe/Zurich', label: 'Switzerland — Zurich' },
      { value: 'Europe/Vienna', label: 'Austria — Vienna' },
      { value: 'Europe/Rome', label: 'Italy — Rome' },
      { value: 'Europe/Copenhagen', label: 'Denmark — Copenhagen' },
      { value: 'Europe/Oslo', label: 'Norway — Oslo' },
      { value: 'Europe/Stockholm', label: 'Sweden — Stockholm' },
      { value: 'Europe/Helsinki', label: 'Finland — Helsinki' },
      { value: 'Europe/Warsaw', label: 'Poland — Warsaw' },
      { value: 'Europe/Prague', label: 'Czech Republic — Prague' },
      { value: 'Europe/Athens', label: 'Greece — Athens' },
      { value: 'Europe/Istanbul', label: 'Turkey — Istanbul' },
    ],
  },
  {
    region: 'Australia & New Zealand',
    zones: [
      { value: 'Australia/Perth', label: 'Australia — Perth (AWST)' },
      { value: 'Australia/Adelaide', label: 'Australia — Adelaide (ACST)' },
      { value: 'Australia/Brisbane', label: 'Australia — Brisbane (AEST)' },
      { value: 'Australia/Sydney', label: 'Australia — Sydney (AEST/AEDT)' },
      { value: 'Australia/Melbourne', label: 'Australia — Melbourne' },
      { value: 'Pacific/Auckland', label: 'New Zealand — Auckland (NZST/NZDT)' },
    ],
  },
  {
    region: 'Asia & Middle East',
    zones: [
      { value: 'Asia/Dubai', label: 'United Arab Emirates — Dubai (GST)' },
      { value: 'Asia/Kolkata', label: 'India — Mumbai / Delhi (IST)' },
      { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
      { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
      { value: 'Asia/Shanghai', label: 'China — Shanghai (CST)' },
      { value: 'Asia/Seoul', label: 'South Korea — Seoul (KST)' },
      { value: 'Asia/Tokyo', label: 'Japan — Tokyo (JST)' },
    ],
  },
  {
    region: 'Africa & Other',
    zones: [
      { value: 'Africa/Johannesburg', label: 'South Africa — Johannesburg (SAST)' },
      { value: 'Africa/Lagos', label: 'Nigeria — Lagos (WAT)' },
      { value: 'Africa/Cairo', label: 'Egypt — Cairo (EET)' },
      { value: 'America/Sao_Paulo', label: 'Brazil — São Paulo (BRT)' },
      { value: 'America/Mexico_City', label: 'Mexico — Mexico City (CST)' },
      { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
    ],
  },
];

export const JOB_FEED_TIMEZONE_OPTIONS: JobFeedTimeZoneOption[] = JOB_FEED_TIMEZONE_GROUPS
  .flatMap((group) => group.zones);

export const JOB_FEED_TIMEZONE_LOOKUP = new Map<string, string>(
  JOB_FEED_TIMEZONE_OPTIONS.map((zone) => [zone.value, zone.label]),
);

export function getJobFeedTimeZoneLabel(value: string): string {
  return JOB_FEED_TIMEZONE_LOOKUP.get(value) ?? value;
}

export const JOB_FEED_EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'temporary', label: 'Temporary' },
] as const;

export const JOB_FEED_WORK_AUTH_OPTIONS = [
  { value: 'authorized', label: 'Already authorized' },
  { value: 'open_to_both', label: 'Open to both' },
  { value: 'needs_sponsorship', label: 'Needs sponsorship' },
] as const;

export const JOB_FEED_AGGRESSIVENESS_OPTIONS = [
  { value: 'strict', label: 'Strict', description: 'Exact role and location matches only. Fewer but highly targeted results.' },
  { value: 'balanced', label: 'Balanced', description: 'Core criteria matched, some flexibility on adjacent roles and locations.' },
  { value: 'broad', label: 'Broad', description: 'Wider net — includes adjacent roles, nearby cities, and flexible requirements.' },
] as const;

export const JOB_FEED_SUGGESTED_ROLES = [
  'Software Engineer',
  'Frontend Engineer',
  'Full Stack Engineer',
  'Product Manager',
  'Data Analyst',
  'AI Engineer',
];

// City-only examples. The country is selected separately in the settings,
// so users don't need to type it here.
export const JOB_FEED_SUGGESTED_LOCATIONS = [
  'New York',
  'San Francisco',
  'Berlin',
  'London',
  'Tokyo',
];

export const JOB_FEED_SUGGESTED_LANGUAGES = ['English', 'French'];

export const JOB_FEED_DEFAULT_SETTINGS = {
  enabled: true,
  user_timezone: 'America/New_York',
  delivery_hour_local: 8,
  target_market: 'us_canada',
  target_countries: ['us'] as string[],
  target_cities: [] as string[],
  target_roles: [] as string[],
  adjacent_roles_enabled: false,
  adjacent_roles: [] as string[],
  preferred_locations: [] as string[],
  remote_preference: 'remote_first',
  remote_preferences: ['remote_first', 'hybrid'] as string[],
  salary_floor: null as number | null,
  languages: ['English'],
  seniority_target: 'mid',
  seniority_targets: ['mid', 'senior'] as string[],
  employment_types: ['full_time'] as string[],
  work_authorization_status: 'open_to_both',
  aggressiveness: 'balanced',
} as const;

export function formatDeliveryHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const period = normalized >= 12 ? 'PM' : 'AM';
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${hour12}:00 ${period}`;
}

export function isJobFeedDebugModeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG === 'true';
}
