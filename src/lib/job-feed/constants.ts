export const PREMIUM_JOB_FEED_TIERS = ['plus', 'max'] as const;
export const JOB_FEED_PROVIDER = 'serpapi' as const;
// The once-per-local-day cooldown is driven by runs the user kicked off, which
// is all of them: the feed runs in real time on a click, there is no scheduler.
// These are the exact values written to job_feed_runs.trigger_source by the run
// routes, so the cooldown query and the workflow must both read from this list.
// Preview mode writes a value outside this list on purpose, so its fake run
// never locks the button.
export const MANUAL_JOB_FEED_TRIGGER_SOURCES = [
  'manual_user',
  'manual_debug',
  'manual_debug_force',
] as const;
export const JOB_FEED_MAX_DAILY_QUERIES = 5;
// How many career-profile titles get mirrored into settings.target_roles. The
// settings writer and the drift check must slice to the same number, or the
// "your target roles are out of date" flag is true for every profile with more
// titles than this.
export const JOB_FEED_MIRRORED_ROLE_LIMIT = 6;
export const JOB_FEED_MAX_RAW_JOBS_PER_RUN = 40;
export const JOB_FEED_PREFILTER_HARD_CAP = 15;
// Default visible jobs when the feed panel first renders (pre-"Load more").
// First page shows this many; the "Load more" button fetches the rest from
// Supabase on demand so the initial payload stays light.
export const JOB_FEED_VISIBLE_DEFAULT_COUNT = 10;
// Page size for the inbox's Load More pagination. Small enough that
// loading feels snappy and the user can skim; total is capped by the
// tier visibleCount × 7 days anyway.
export const JOB_FEED_INBOX_PAGE_SIZE = 5;
// How long a ranked job stays in the user's 7-day inbox before the daily
// cleanup drops it. Also used server-side to scope the inbox query so an
// in-flight ranked row doesn't show up after the retention cutoff.
export const JOB_FEED_INBOX_RETENTION_DAYS = 7;
// Absolute upper bound the LLM is allowed to surface in a single day's feed.
// Matches the Max tier's visibleCount so the ranker's instruction respects
// the highest tier cap.
export const JOB_FEED_VISIBLE_MAX_COUNT = 25;

export type JobFeedTier = 'plus' | 'max';

export interface JobFeedTierLimits {
  /** Hard ceiling on SerpAPI calls per run, main plan plus every extra pass. */
  maxDailyQueries: number;
  /**
   * How many of those calls the main plan may spend. Anything left over is the
   * pool the pagination, fallback and unfiltered-retry passes draw from, and
   * those only fire when the day needs rescuing, so a reserved call is not a
   * call spent. Where this equals maxDailyQueries the extra passes are
   * unreachable by design.
   */
  maxMainQueries: number;
  maxRawJobsPerRun: number;
  prefilterHardCap: number;
  visibleCount: number;
  /**
   * Completed runs a user may start in one local day. A later run of the day takes the next slice of the
   * search list (it wraps), so it searches other queries, or the same ones again for what was posted since.
   * At 1 the classic gate applies: one completed run a day, the next at least 20 hours later.
   */
  runsPerDay: number;
}

/**
 * Free-tier limits. Kept separate from JOB_FEED_TIER_LIMITS so 'free' does NOT
 * enter the JobFeedTier union (which would force a 'free' entry into every
 * Record<JobFeedTier, ...> across the codebase).
 *
 * 1 SerpAPI call per run = real cash. Do not raise maxDailyQueries without
 * explicit approval.
 *
 * Free searches once and keeps a second call in reserve (Wasim, 20 Aug 2026).
 * One query used to mean an empty day had no way back. The reserve is only
 * spent when the run returned nothing at all, so a normal day still costs one
 * call and the average barely moves.
 */
export const JOB_FEED_FREE_TIER_LIMITS: JobFeedTierLimits = {
  maxDailyQueries: 2,
  maxMainQueries: 1,
  maxRawJobsPerRun: 10,
  prefilterHardCap: 10,
  visibleCount: 5,
  runsPerDay: 1,
};

export const JOB_FEED_TIER_LIMITS: Record<JobFeedTier, JobFeedTierLimits> = {
  plus: {
    // Plus searches twice and keeps a third call in reserve (Wasim, 20 Aug
    // 2026). The extra call is only spent on an empty or thin day, so a
    // normal day still costs two. Do not raise without explicit approval:
    // each call has a real cash cost.
    maxDailyQueries: 3,
    maxMainQueries: 2,
    maxRawJobsPerRun: 20,
    // prefilterHardCap is in-memory only (no API cost). Sized to match
    // the raw cap so we never drop a raw job before the LLM sees it.
    prefilterHardCap: 20,
    // Daily visible cap. The LLM may surface fewer when fewer genuinely
    // qualify ("quality over quantity" is explicit in its system prompt),
    // but we give it headroom when the day is strong. Held at the absolute
    // ceiling (25) so a strong day's genuine matches are never truncated;
    // Max keeps its edge via 2x search volume (4 queries vs Plus's 2), not a
    // smaller visible cap.
    visibleCount: 25,
    runsPerDay: 1,
  },
  max: {
    // Max searches eight times a run and keeps two calls in reserve, up to three
    // runs a day (Wasim, 25 Oct 2026: "increase the amount of calls", with the
    // SerpAPI quota raised to match). A reserve call is only spent on an empty
    // or thin run. At most 30 searches a day.
    maxDailyQueries: 10,
    maxMainQueries: 8,
    maxRawJobsPerRun: 60,
    prefilterHardCap: 45,
    visibleCount: 25,
    runsPerDay: 3,
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
    // 2 main queries. 1 country → 2 roles. 2 countries → 1 role each.
    maxRoles: 2,
    maxCountries: 2,
    maxCitiesPerCountry: 2,
  },
  max: {
    // 8 main queries a run. 1 country → 8 roles. 2 countries → 4 roles each.
    maxRoles: 8,
    maxCountries: 8,
    maxCitiesPerCountry: 8,
  },
};

// Free searches once (the second call is a reserve). 1 country, 1 role.
export const JOB_FEED_INPUT_CAPS_FREE: JobFeedInputCaps = {
  maxRoles: 1,
  maxCountries: 1,
  maxCitiesPerCountry: 1,
};

// Locked caps returned for unauthenticated / loading users.
// Shape-compatible with JobFeedInputCaps so all consumers compile unchanged.
export const JOB_FEED_INPUT_CAPS_LOCKED: JobFeedInputCaps = {
  maxRoles: 0,
  maxCountries: 0,
  maxCitiesPerCountry: 0,
};

export function getJobFeedInputCaps(subscriptionTier: string | null | undefined): JobFeedInputCaps {
  if (!subscriptionTier) return JOB_FEED_INPUT_CAPS_LOCKED;
  if (subscriptionTier === 'free') return JOB_FEED_INPUT_CAPS_FREE;
  if (subscriptionTier === 'max') return JOB_FEED_INPUT_CAPS.max;
  return JOB_FEED_INPUT_CAPS.plus;
}

/**
 * How long the confirmed search list may be: one run's searches times the runs a day, so every run of the
 * day can search its own slice.
 */
export function searchListCapForTier(subscriptionTier: string): number {
  const limits = getJobFeedTierLimits(subscriptionTier);
  return limits.maxMainQueries * limits.runsPerDay;
}

export function getJobFeedTierLimits(subscriptionTier: string): JobFeedTierLimits {
  if (subscriptionTier === 'free') return JOB_FEED_FREE_TIER_LIMITS;
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

/** Short forms boards and people actually use, on top of the full names. */
export const JOB_FEED_COUNTRY_ALIASES: Record<string, string> = {
  us: 'us',
  usa: 'us',
  'u.s.': 'us',
  'u.s.a.': 'us',
  america: 'us',
  states: 'us',
  uk: 'gb',
  'u.k.': 'gb',
  britain: 'gb',
  england: 'gb',
  canada: 'ca',
  germany: 'de',
  deutschland: 'de',
  netherlands: 'nl',
  holland: 'nl',
  ireland: 'ie',
  france: 'fr',
  spain: 'es',
  italy: 'it',
  switzerland: 'ch',
  austria: 'at',
  belgium: 'be',
  denmark: 'dk',
  sweden: 'se',
  norway: 'no',
  finland: 'fi',
  poland: 'pl',
  australia: 'au',
  'new zealand': 'nz',
  india: 'in',
  singapore: 'sg',
  uae: 'ae',
};

/**
 * Find every supported country named in a free-text string. Matches full
 * labels ("United States") and short forms ("US", "america"). Used by both
 * the one-line setup parser and the feed chat steering intents so the two
 * paths agree on what counts as a country. Returns ISO 3166-1 alpha-2 codes,
 * deduped, in the order they appear.
 */
export function matchCountriesInText(text: string): string[] {
  const lower = ` ${text.toLowerCase().replace(/[,/]/g, ' ')} `;
  const countries: string[] = [];
  const push = (code: string) => {
    if (!countries.includes(code)) countries.push(code);
  };
  for (const option of JOB_FEED_COUNTRY_OPTIONS) {
    if (lower.includes(` ${option.label.toLowerCase()} `)) push(option.value);
  }
  for (const [alias, code] of Object.entries(JOB_FEED_COUNTRY_ALIASES)) {
    if (lower.includes(` ${alias} `)) push(code);
  }
  return countries;
}

/** How many city chips to show per selected country during first-time setup. */
export const JOB_FEED_SETUP_CITY_CHIPS_PER_COUNTRY = 3;

/**
 * Find every known city named in a free-text string. Matches curated names
 * and short forms ("NYC", "sf"). Returns canonical city names, deduped, in
 * the order they appear. Unknown names are not invented.
 */
export function matchCitiesInText(text: string): string[] {
  const lower = ` ${text.toLowerCase().replace(/[,/]/g, ' ')} `;
  const cities: string[] = [];
  const push = (name: string) => {
    if (!cities.some((city) => normalizeCityKey(city) === normalizeCityKey(name))) {
      cities.push(name);
    }
  };
  const known = Object.values(JOB_FEED_CITY_SUGGESTIONS).flat()
    .slice()
    .sort((a, b) => b.length - a.length);
  for (const city of known) {
    if (lower.includes(` ${city.toLowerCase()} `)) push(city);
  }
  const aliases = Object.entries(JOB_FEED_CITY_ALIASES)
    .slice()
    .sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canonical] of aliases) {
    if (lower.includes(` ${alias} `)) push(canonical);
  }
  return cities;
}

/** City chips for the setup question: a short list from each selected country. */
export function setupCityChipsForCountries(countries: string[]): string[] {
  const chips: string[] = [];
  for (const code of countries) {
    const suggestions = JOB_FEED_CITY_SUGGESTIONS[code] ?? [];
    for (const city of suggestions.slice(0, JOB_FEED_SETUP_CITY_CHIPS_PER_COUNTRY)) {
      if (!chips.includes(city)) chips.push(city);
    }
  }
  return chips;
}


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

/** Short forms and local spellings of cities already in the list above. */
const JOB_FEED_CITY_ALIASES: Record<string, string> = {
  nyc: 'New York',
  'new york city': 'New York',
  sf: 'San Francisco',
  'bay area': 'San Francisco',
  'den haag': 'The Hague',
  muenchen: 'Munich',
  munchen: 'Munich',
  koln: 'Cologne',
  koeln: 'Cologne',
  wien: 'Vienna',
  kobenhavn: 'Copenhagen',
  goteborg: 'Gothenburg',
  warszawa: 'Warsaw',
  krakow: 'Kraków',
  wroclaw: 'Wrocław',
  bangalore: 'Bengaluru',
  'new delhi': 'Delhi NCR',
  delhi: 'Delhi NCR',
};

/** Accents, punctuation and casing all vary by who typed it. */
function normalizeCityKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CITY_TO_COUNTRY = new Map<string, string>(
  Object.entries(JOB_FEED_CITY_SUGGESTIONS).flatMap(([country, cities]) =>
    cities.map((city) => [normalizeCityKey(city), country] as [string, string])
  )
);

/**
 * "Berlin" implies Germany. Without this a city added from the chat is searched
 * in whatever markets the user already had, so "add Berlin" quietly returns US
 * results. Returns null for a city we do not know, because inventing a country
 * is worse than leaving the search as it was.
 */
export function countryForCity(city: string): string | null {
  const key = normalizeCityKey(city);
  const aliased = JOB_FEED_CITY_ALIASES[key];
  return CITY_TO_COUNTRY.get(aliased ? normalizeCityKey(aliased) : key) ?? null;
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

export const JOB_FEED_DEFAULT_SETTINGS = {
  enabled: true,
  user_timezone: 'America/New_York',
  target_market: 'us_canada',
  target_countries: ['us'] as string[],
  target_cities: [] as string[],
  target_roles: [] as string[],
  preferred_locations: [] as string[],
  remote_preference: 'remote_first',
  remote_preferences: ['remote_first', 'hybrid'] as string[],
  salary_floor: null as number | null,
  languages: ['English'],
  seniority_target: 'mid',
  seniority_targets: ['mid', 'senior'] as string[],
  employment_types: ['full_time'] as string[],
  work_authorization_status: 'open_to_both',
} as const;
