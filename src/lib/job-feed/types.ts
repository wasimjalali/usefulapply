import type { JobFeedRun, JobFeedSettings } from '@/lib/supabase/types';

export type JobFeedOverviewState =
  | 'upgrade_required'
  | 'setup_required'
  | 'paused'
  | 'awaiting_first_run'
  | 'generating'
  | 'empty'
  | 'error';

export interface JobFeedOverviewResponse {
  canAccess: boolean;
  settings: JobFeedSettings | null;
  latestRun: JobFeedRun | null;
  state: JobFeedOverviewState;
  foundationMode: boolean;
}

export interface JobFeedSettingsInput {
  enabled: boolean;
  consent_accepted: boolean;
  user_timezone: string;
  delivery_hour_local: number;
  target_market: JobFeedSettings['target_market'];
  target_roles: string[];
  adjacent_roles_enabled: boolean;
  adjacent_roles: string[];
  preferred_locations: string[];
  remote_preference: JobFeedSettings['remote_preference'];
  salary_floor: number | null;
  languages: string[];
  seniority_target: JobFeedSettings['seniority_target'];
  employment_types: JobFeedSettings['employment_types'];
  work_authorization_status: JobFeedSettings['work_authorization_status'];
  aggressiveness: JobFeedSettings['aggressiveness'];
}

export interface JobFeedRunWorkflowResult {
  run: JobFeedRun;
  created: boolean;
  skipped: boolean;
}
