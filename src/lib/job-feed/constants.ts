export const PREMIUM_JOB_FEED_TIERS = ['plus', 'max', 'pro'] as const;

export const JOB_FEED_MARKET_OPTIONS = [
  { value: 'us_canada', label: 'United States + Canada' },
  { value: 'us', label: 'United States only' },
  { value: 'canada', label: 'Canada only' },
] as const;

export const JOB_FEED_REMOTE_PREFERENCE_OPTIONS = [
  { value: 'remote_first', label: 'Remote first' },
  { value: 'remote_only', label: 'Remote only' },
  { value: 'hybrid', label: 'Hybrid okay' },
  { value: 'onsite', label: 'On-site okay' },
  { value: 'flexible', label: 'Flexible' },
] as const;

export const JOB_FEED_SENIORITY_OPTIONS = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'staff', label: 'Staff / Principal' },
  { value: 'manager', label: 'Manager' },
] as const;

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
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'broad', label: 'Broad' },
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
  user_timezone: 'UTC',
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
