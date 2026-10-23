/**
 * Row types for the D1 tables, derived from `src/db/schema.ts`.
 *
 * Drizzle infers text columns as `string`. Columns whose values are a closed set are
 * narrowed here to literal unions, so callers keep the precise types the old Supabase
 * `Database` type gave them. Scalar columns are guarded by a CHECK in SQL. The array
 * columns are not: remote_preferences and employment_types only have a non-empty
 * CHECK and seniority_targets has none, so their element unions are held by the
 * settings normalisation in src/lib/job-feed/helpers.ts. No SQL changes.
 */
import type {
  applicationSessions,
  creditReservations,
  jobFeedApplicationGenerationEvents,
  jobFeedApplicationGenerations,
  jobFeedCanonicalJobs,
  jobFeedFeedback,
  jobFeedRankedItems,
  jobFeedRawFetches,
  jobFeedRuns,
  jobFeedSettings,
  profiles,
} from '@/db/schema';

export type { Json } from '@/db/schema';

export type SubscriptionTier = 'free' | 'plus' | 'max';
export type JobFeedGenerationStatus = 'none' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type JobFeedApplicationGenerationStatus =
  | 'intent_created'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';
export type CreditReservationStatus = 'reserved' | 'captured' | 'released' | 'refunded';

type TargetMarket = 'us' | 'canada' | 'us_canada';
type RemotePreference = 'remote_only' | 'remote_first' | 'hybrid' | 'onsite' | 'flexible';
type SeniorityTarget = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'staff' | 'manager';
type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary';
type WorkAuthorizationStatus = 'authorized' | 'needs_sponsorship' | 'open_to_both';

/** Replace the listed keys with narrower types, keeping each key's optional and nullable shape. */
type Narrow<T, O> = {
  [K in keyof T]: K extends keyof O ? O[K] | Extract<T[K], null | undefined> : T[K];
};

type ProfileNarrow = {
  subscription_tier: SubscriptionTier;
  subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing';
};
type SettingsNarrow = {
  target_market: TargetMarket;
  remote_preference: RemotePreference;
  remote_preferences: RemotePreference[];
  seniority_target: SeniorityTarget;
  seniority_targets: SeniorityTarget[];
  employment_types: EmploymentType[];
  work_authorization_status: WorkAuthorizationStatus;
};
type RunNarrow = { status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped' };
type RawFetchNarrow = { status: 'completed' | 'no_results' | 'failed'; market: TargetMarket };
type CanonicalJobNarrow = {
  work_mode: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  employment_type: EmploymentType;
};
type FeedbackNarrow = { generation_status: JobFeedGenerationStatus };
type GenerationNarrow = { status: JobFeedApplicationGenerationStatus };
type GenerationEventNarrow = {
  from_status: JobFeedApplicationGenerationStatus;
  to_status: JobFeedApplicationGenerationStatus;
};
type RankedItemNarrow = { fit_label: 'strong' | 'good'; ranking_source: 'deterministic' | 'llm' };
type SessionNarrow = {
  status: 'drafted' | 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up';
  generation_status: JobFeedGenerationStatus;
};
type ReservationNarrow = { status: CreditReservationStatus };

export type Profile = Narrow<typeof profiles.$inferSelect, ProfileNarrow>;
export type JobFeedSettings = Narrow<typeof jobFeedSettings.$inferSelect, SettingsNarrow>;
export type JobFeedRun = Narrow<typeof jobFeedRuns.$inferSelect, RunNarrow>;
export type JobFeedRawFetch = Narrow<typeof jobFeedRawFetches.$inferSelect, RawFetchNarrow>;
export type JobFeedCanonicalJob = Narrow<typeof jobFeedCanonicalJobs.$inferSelect, CanonicalJobNarrow>;
export type JobFeedFeedback = Narrow<typeof jobFeedFeedback.$inferSelect, FeedbackNarrow>;
export type JobFeedApplicationGeneration = Narrow<
  typeof jobFeedApplicationGenerations.$inferSelect,
  GenerationNarrow
>;
export type JobFeedApplicationGenerationEvent = Narrow<
  typeof jobFeedApplicationGenerationEvents.$inferSelect,
  GenerationEventNarrow
>;
export type JobFeedRankedItem = Narrow<typeof jobFeedRankedItems.$inferSelect, RankedItemNarrow>;
export type ApplicationSession = Narrow<typeof applicationSessions.$inferSelect, SessionNarrow>;
export type CreditReservation = Narrow<typeof creditReservations.$inferSelect, ReservationNarrow>;

interface TableShapes {
  job_feed_raw_fetches: {
    insert: Narrow<typeof jobFeedRawFetches.$inferInsert, RawFetchNarrow>;
  };
  job_feed_canonical_jobs: {
    insert: Narrow<typeof jobFeedCanonicalJobs.$inferInsert, CanonicalJobNarrow>;
  };
}

export type InsertTables<T extends keyof TableShapes> = TableShapes[T]['insert'];
export type UpdateTables<T extends keyof TableShapes> = Partial<TableShapes[T]['insert']>;
