export const PREMIUM_JOB_FEED_TIERS = ['plus', 'max'] as const;
export const JOB_FEED_PROVIDER = 'serpapi' as const;
export const JOB_FEED_MAX_DAILY_QUERIES = 4;
export const JOB_FEED_MAX_RAW_JOBS_PER_RUN = 40;
export const JOB_FEED_PREFILTER_TARGET_MIN = 8;
export const JOB_FEED_PREFILTER_HARD_CAP = 15;
export const JOB_FEED_VISIBLE_DEFAULT_COUNT = 5;
export const JOB_FEED_VISIBLE_MAX_COUNT = 10;

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
    maxRawJobsPerRun: 20,
    prefilterHardCap: 10,
    visibleCount: 5,
  },
  max: {
    maxDailyQueries: 4,
    maxRawJobsPerRun: 40,
    prefilterHardCap: 15,
    visibleCount: 10,
  },
};

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

export const JOB_FEED_SUGGESTED_LOCATIONS = [
  'New York, NY',
  'San Francisco, CA',
  'Toronto, ON',
  'Remote (US)',
  'Remote (Canada)',
];

export const JOB_FEED_SUGGESTED_LANGUAGES = ['English', 'French'];

export const JOB_FEED_DEFAULT_SETTINGS = {
  enabled: true,
  user_timezone: 'America/New_York',
  delivery_hour_local: 8,
  target_market: 'us_canada',
  target_roles: [] as string[],
  adjacent_roles_enabled: true,
  adjacent_roles: [] as string[],
  preferred_locations: [] as string[],
  remote_preference: 'remote_first',
  salary_floor: null as number | null,
  languages: ['English'],
  seniority_target: 'mid',
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
