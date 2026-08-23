/**
 * D1 / SQLite schema for Useful Apply.
 *
 * Port of the live Supabase/Postgres tables. Mapping:
 *   uuid        -> text (same UUID values)
 *   jsonb       -> text JSON (Drizzle mode: 'json')
 *   timestamptz -> text ISO 8601
 *   text[]      -> text JSON string arrays
 *   enums       -> text + CHECK
 *   boolean     -> integer 0/1 (Drizzle mode: 'boolean')
 *   numeric     -> real (credits are fractional: 0.5)
 *
 * Postgres functions are not in this file. They become application code:
 *   initialize_user_credits          -> src/db/repos/credits.ts (Better Auth user.create.after)
 *   trigger_karko_confirmation_resend -> src/cron/resend-confirmations.ts (Task 3.4)
 *   set_updated_at / *_set_updated_at -> data layer sets updated_at on every update
 *
 * `avatars` in the Phase 4 table list is a Supabase Storage bucket, not a table.
 * The matching table is `profile_photos`. `user_notifications` is used by the
 * app (delete-account, job-feed) and is included.
 */

import { sql } from 'drizzle-orm';
import {
  check,
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

const isoNow = () => new Date().toISOString();
const emptyObject = (): Record<string, never> => ({});
const emptyArray = (): string[] => [];

// ---------------------------------------------------------------------------
// Lookup / config (no user FK)
// ---------------------------------------------------------------------------

export const subscriptionPlans = sqliteTable(
  'subscription_plans',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    tier: text('tier').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    price_monthly: real('price_monthly').notNull().default(0),
    credits_monthly: real('credits_monthly').notNull().default(0),
    rollover_months: integer('rollover_months').notNull().default(0),
    max_rollover_credits: real('max_rollover_credits').notNull().default(0),
    addon_enabled: integer('addon_enabled', { mode: 'boolean' }).notNull().default(false),
    stripe_product_id: text('stripe_product_id'),
    stripe_price_id_monthly: text('stripe_price_id_monthly'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    display_order: integer('display_order').notNull().default(0),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('subscription_plans_tier_uidx').on(t.tier),
    check('subscription_plans_tier_supported_check', sql`${t.tier} in ('free', 'plus', 'max')`),
  ],
);

export const addonCreditPacks = sqliteTable('addon_credit_packs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  credits: real('credits').notNull(),
  price: real('price').notNull(),
  discount_percent: real('discount_percent').notNull().default(0),
  stripe_product_id: text('stripe_product_id'),
  stripe_price_id: text('stripe_price_id'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  display_order: integer('display_order').notNull().default(0),
  created_at: text('created_at').notNull().$defaultFn(isoNow),
});

export const webhookEvents = sqliteTable('webhook_events', {
  event_id: text('event_id').primaryKey(),
  event_type: text('event_type').notNull(),
  created_at: text('created_at').notNull().$defaultFn(isoNow),
});

export const serpapiFilterTokens = sqliteTable(
  'serpapi_filter_tokens',
  {
    country_code: text('country_code').notNull(),
    filter_name: text('filter_name').notNull(),
    option_label: text('option_label').notNull(),
    uds_token: text('uds_token').notNull(),
    last_seen_at: text('last_seen_at').notNull().$defaultFn(isoNow),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('serpapi_filter_tokens_pk').on(t.country_code, t.filter_name, t.option_label),
    index('serpapi_filter_tokens_country_filter_idx').on(t.country_code, t.filter_name),
  ],
);

export const anonymousGenerations = sqliteTable(
  'anonymous_generations',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    ip_hash: text('ip_hash').notNull(),
    generated_at: text('generated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [uniqueIndex('anonymous_generations_ip_hash_uidx').on(t.ip_hash)],
);

export const contactSubmissions = sqliteTable('contact_submissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  submitted_at: text('submitted_at').notNull().$defaultFn(isoNow),
  created_at: text('created_at').notNull().$defaultFn(isoNow),
});

// ---------------------------------------------------------------------------
// Better Auth (Task 5.1)
//
// Table/column names follow Better Auth's Drizzle SQLite snapshot so the
// adapter can map camelCase fields to snake_case columns. `user.id` is a
// plain text PK with no default: callers (and Task 5.3 imports) may supply
// the existing Supabase UUID.
// ---------------------------------------------------------------------------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    // Better Auth 1.7: 'local:credential' for password accounts,
    // the provider's accountIssuer for social accounts (Google:
    // 'https://accounts.google.com'; providers without one get 'local:oauth:<id>').
    // Sign-in matches on (issuer, accountId).
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('account_userId_idx').on(t.userId),
    uniqueIndex('account_issuer_accountId_uidx').on(t.issuer, t.accountId),
  ],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    full_name: text('full_name'),
    phone: text('phone'),
    location: text('location'),
    avatar_url: text('avatar_url'),
    linkedin_url: text('linkedin_url'),
    github_url: text('github_url'),
    portfolio_url: text('portfolio_url'),
    website_url: text('website_url'),
    date_of_birth: text('date_of_birth'),
    nationality: text('nationality'),
    subscription_tier: text('subscription_tier').notNull().default('free'),
    subscription_status: text('subscription_status').notNull().default('active'),
    notify_tips: integer('notify_tips', { mode: 'boolean' }).notNull().default(true),
    notify_updates: integer('notify_updates', { mode: 'boolean' }).notNull().default(true),
    notify_weekly: integer('notify_weekly', { mode: 'boolean' }).notNull().default(true),
    // Product news in the Notifications pane.
    notify_marketing: integer('notify_marketing', { mode: 'boolean' }).notNull().default(false),
    notify_feed_ready: integer('notify_feed_ready', { mode: 'boolean' }).notNull().default(true),
    notify_follow_up_due: integer('notify_follow_up_due', { mode: 'boolean' }).notNull().default(true),
    notify_interview_tomorrow: integer('notify_interview_tomorrow', { mode: 'boolean' }).notNull().default(true),
    notify_credits_low: integer('notify_credits_low', { mode: 'boolean' }).notNull().default(true),
    // Tracker view filter, kept per user so it survives a reload.
    hide_rejected: integer('hide_rejected', { mode: 'boolean' }).notNull().default(false),
    timezone: text('timezone'),
    date_format: text('date_format'),
    job_searches_used: integer('job_searches_used').notNull().default(0),
    job_searches_reset_at: text('job_searches_reset_at').notNull().$defaultFn(isoNow),
    job_feed_last_seen_run_date: text('job_feed_last_seen_run_date'),
    welcome_sent_at: text('welcome_sent_at'),
    check_in_sent_at: text('check_in_sent_at'),
    last_confirmation_resend_at: text('last_confirmation_resend_at'),
    confirmation_resend_count: integer('confirmation_resend_count').notNull().default(0),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('profiles_email_uidx').on(t.email),
    check('profiles_subscription_tier_supported_check', sql`${t.subscription_tier} in ('free', 'plus', 'max')`),
    check(
      'profiles_subscription_status_check',
      sql`${t.subscription_status} in ('active', 'canceled', 'past_due', 'trialing')`,
    ),
  ],
);

export const userCredits = sqliteTable(
  'user_credits',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    monthly_credits: real('monthly_credits').notNull().default(0),
    rollover_credits: real('rollover_credits').notNull().default(0),
    addon_credits: real('addon_credits').notNull().default(0),
    plan_tier: text('plan_tier').notNull().default('free'),
    last_reset_date: text('last_reset_date'),
    next_reset_date: text('next_reset_date'),
    stripe_customer_id: text('stripe_customer_id'),
    stripe_subscription_id: text('stripe_subscription_id'),
    subscription_status: text('subscription_status'),
    // Optimistic concurrency for deduct/add. Not in the Postgres table;
    // required by Task 4.2 (conditional UPDATE ... AND version = ?).
    version: integer('version').notNull().default(0),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('user_credits_user_id_uidx').on(t.user_id),
    check('user_credits_plan_tier_supported_check', sql`${t.plan_tier} in ('free', 'plus', 'max')`),
  ],
);

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    file_name: text('file_name').notNull(),
    file_type: text('file_type').notNull(),
    file_size: integer('file_size'),
    storage_path: text('storage_path'),
    raw_text: text('raw_text'),
    sections: text('sections', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    all_skills: text('all_skills', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    all_experiences: text('all_experiences', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    all_education: text('all_education', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    structured_data: text('structured_data', { mode: 'json' }).$type<Json>(),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('documents_user_type_idx').on(t.user_id, t.type),
    check('documents_type_check', sql`${t.type} in ('primary_cv', 'master_cv')`),
    check('documents_file_type_check', sql`${t.file_type} in ('pdf', 'docx', 'txt')`),
  ],
);

export const applicationSessions = sqliteTable(
  'application_sessions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    job_title: text('job_title'),
    company: text('company'),
    job_description: text('job_description').notNull(),
    job_url: text('job_url'),
    match_score: integer('match_score'),
    matching_skills: text('matching_skills', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    missing_skills: text('missing_skills', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    suggestions: text('suggestions', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    requirements: text('requirements', { mode: 'json' }).$type<Json>(),
    gaps: text('gaps', { mode: 'json' }).$type<Json>(),
    generated_cv: text('generated_cv', { mode: 'json' }).$type<Json>(),
    cover_letter: text('cover_letter', { mode: 'json' }).$type<Json>(),
    email: text('email', { mode: 'json' }).$type<Json>(),
    company_research: text('company_research', { mode: 'json' }).$type<Json>(),
    company_address: text('company_address'),
    company_contact_person: text('company_contact_person'),
    cv_edits: text('cv_edits', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyArray),
    optimized_pdf_path: text('optimized_pdf_path'),
    optimized_cv_text: text('optimized_cv_text'),
    email_subject: text('email_subject'),
    email_body: text('email_body'),
    selected_template: text('selected_template').notNull().default('premium-ats'),
    status: text('status').notNull().default('drafted'),
    cover_letter_language: text('cover_letter_language').notNull().default('en'),
    fit_assessment: text('fit_assessment', { mode: 'json' }).$type<Json>(),
    generation_completed: integer('generation_completed', { mode: 'boolean' }).notNull().default(false),
    generation_status: text('generation_status').notNull().default('none'),
    generation_error: text('generation_error'),
    generation_started_at: text('generation_started_at'),
    generation_completed_at: text('generation_completed_at'),
    generation_failed_at: text('generation_failed_at'),
    generation_cancelled_at: text('generation_cancelled_at'),
    follow_up_email: text('follow_up_email', { mode: 'json' }).$type<Json>(),
    // Tracker: what the NEXT column says, and the reminder guard so one date
    // sends one email.
    interview_at: text('interview_at'),
    follow_up_due_at: text('follow_up_due_at'),
    interview_reminder_sent_at: text('interview_reminder_sent_at'),
    follow_up_reminder_sent_at: text('follow_up_reminder_sent_at'),
    // Server-owned turn counters. The client can write generated_cv wholesale,
    // so anything that rides in there is a display number, not a cap. These two
    // are the cap: only the route that spends the turn increments them.
    screening_turns_used: integer('screening_turns_used').notNull().default(0),
    // Interview prep is not built yet (A6). The column ships with A3's so the
    // production database takes one migration pass instead of two.
    prep_turns_used: integer('prep_turns_used').notNull().default(0),
    generated_artifacts: text('generated_artifacts', { mode: 'json' }).$type<Json>(),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('application_sessions_user_created_idx').on(t.user_id, t.created_at),
    // The daily reminder sweep scans by date; both stay tiny because they only
    // hold dated rows whose reminder has not gone out.
    // SQLite rejects qualified column names inside a partial index predicate,
    // so these are written bare on purpose.
    index('application_sessions_interview_reminder_idx')
      .on(t.interview_at)
      .where(sql`interview_reminder_sent_at is null and interview_at is not null`),
    index('application_sessions_follow_up_reminder_idx')
      .on(t.follow_up_due_at)
      .where(sql`follow_up_reminder_sent_at is null and follow_up_due_at is not null`),
    check('application_sessions_status_check', sql`${t.status} in ('drafted', 'applied', 'interview', 'rejected', 'accepted', 'follow_up')`),
    check(
      'application_sessions_generation_status_check',
      sql`${t.generation_status} in ('none', 'pending', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
  ],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    session_id: text('session_id')
      .notNull()
      .references(() => applicationSessions.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    actions: text('actions', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyArray),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('chat_messages_session_idx').on(t.session_id, t.created_at),
    index('chat_messages_user_idx').on(t.user_id),
    check('chat_messages_role_check', sql`${t.role} in ('user', 'assistant', 'system')`),
  ],
);

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    tier: text('tier').notNull(),
    status: text('status').notNull().default('active'),
    stripe_customer_id: text('stripe_customer_id'),
    stripe_subscription_id: text('stripe_subscription_id'),
    stripe_price_id: text('stripe_price_id'),
    current_period_start: text('current_period_start'),
    current_period_end: text('current_period_end'),
    cancel_at_period_end: integer('cancel_at_period_end', { mode: 'boolean' }).notNull().default(false),
    canceled_at: text('canceled_at'),
    trial_start: text('trial_start'),
    trial_end: text('trial_end'),
    applications_used: integer('applications_used').notNull().default(0),
    applications_limit: integer('applications_limit').notNull().default(5),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('subscriptions_user_idx').on(t.user_id),
    check('subscriptions_tier_supported_check', sql`${t.tier} in ('free', 'plus', 'max')`),
    check(
      'subscriptions_status_check',
      sql`${t.status} in ('active', 'canceled', 'past_due', 'trialing', 'incomplete')`,
    ),
  ],
);

export const connectedAccounts = sqliteTable(
  'connected_accounts',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    provider_user_id: text('provider_user_id').notNull(),
    provider_email: text('provider_email'),
    access_token: text('access_token'),
    refresh_token: text('refresh_token'),
    token_expires_at: text('token_expires_at'),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('connected_accounts_user_provider_uidx').on(t.user_id, t.provider),
    check('connected_accounts_provider_check', sql`${t.provider} in ('google', 'linkedin', 'github')`),
  ],
);

export const creditTransactions = sqliteTable(
  'credit_transactions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    amount: real('amount').notNull(),
    transaction_type: text('transaction_type').notNull(),
    // The bucket the usage breakdown reads. transaction_type stays free text
    // and keeps naming the exact action; this one is the closed set, so a new
    // credit action has to pick a bucket at the call site instead of landing in
    // "rewrite" by default. Null on rows written before the column existed.
    transaction_kind: text('transaction_kind'),
    session_id: text('session_id'),
    description: text('description'),
    metadata: text('metadata', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    balance_before: real('balance_before').notNull(),
    balance_after: real('balance_after').notNull(),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('credit_transactions_user_created_idx').on(t.user_id, t.created_at)],
);

export const messageFeedback = sqliteTable(
  'message_feedback',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    session_id: text('session_id'),
    message_id: text('message_id').notNull(),
    feedback_type: text('feedback_type').notNull(),
    feedback_text: text('feedback_text'),
    message_content: text('message_content'),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('message_feedback_user_message_uidx').on(t.user_id, t.message_id),
    index('message_feedback_session_idx').on(t.user_id, t.session_id),
    check('message_feedback_type_check', sql`${t.feedback_type} in ('positive', 'negative')`),
  ],
);

export const profilePhotos = sqliteTable(
  'profile_photos',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    file_name: text('file_name').notNull(),
    storage_path: text('storage_path').notNull(),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('profile_photos_user_idx').on(t.user_id)],
);

export const userCvSuggestions = sqliteTable('user_cv_suggestions', {
  user_id: text('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  suggestion: text('suggestion', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
  created_at: text('created_at').notNull().$defaultFn(isoNow),
  updated_at: text('updated_at').notNull().$defaultFn(isoNow),
});

export const userJobPreferences = sqliteTable(
  'user_job_preferences',
  {
    user_id: text('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    salary_floor: integer('salary_floor'),
    remote_preference: text('remote_preference'),
    employment_types: text('employment_types', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    target_roles: text('target_roles', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    user_skills: text('user_skills', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    target_market: text('target_market'),
    seniority_target: text('seniority_target'),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    check(
      'user_job_preferences_remote_check',
      sql`${t.remote_preference} is null or ${t.remote_preference} in ('remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible')`,
    ),
    check(
      'user_job_preferences_market_check',
      sql`${t.target_market} is null or ${t.target_market} in ('us', 'canada', 'us_canada')`,
    ),
    check(
      'user_job_preferences_seniority_check',
      sql`${t.seniority_target} is null or ${t.seniority_target} in ('intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager')`,
    ),
  ],
);

export const userCareerProfiles = sqliteTable(
  'user_career_profiles',
  {
    user_id: text('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    profile: text('profile', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    version: integer('version').notNull().default(1),
    source_document_id: text('source_document_id').references(() => documents.id, { onDelete: 'set null' }),
    source_document_updated_at: text('source_document_updated_at'),
    model_provider: text('model_provider'),
    model_name: text('model_name'),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('user_career_profiles_source_doc_idx').on(t.source_document_id)],
);

export const userSearchStrategies = sqliteTable(
  'user_search_strategies',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    settings_hash: text('settings_hash').notNull(),
    strategy: text('strategy', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    version: integer('version').notNull().default(1),
    source_profile_generated_at: text('source_profile_generated_at'),
    model_provider: text('model_provider'),
    model_name: text('model_name'),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('user_search_strategies_pk').on(t.user_id, t.settings_hash),
    index('user_search_strategies_user_updated_idx').on(t.user_id, t.updated_at),
  ],
);

export const userNotifications = sqliteTable(
  'user_notifications',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    event_type: text('event_type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    payload: text('payload', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    read_at: text('read_at'),
    dismissed_at: text('dismissed_at'),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('user_notifications_user_created_idx').on(t.user_id, t.created_at),
    check(
      'user_notifications_event_type_check',
      sql`${t.event_type} in (
        'feed_ready', 'feed_empty', 'feed_thin', 'feed_failed', 'new_jobs_available',
        'job_saved', 'job_dismissed', 'generation_started', 'generation_succeeded',
        'generation_failed', 'generation_cancelled', 'generation_expired', 'retry_available'
      )`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Job feed
// ---------------------------------------------------------------------------

export const jobFeedSettings = sqliteTable(
  'job_feed_settings',
  {
    user_id: text('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    consent_accepted_at: text('consent_accepted_at'),
    user_timezone: text('user_timezone').notNull().default('America/New_York'),
    target_market: text('target_market').notNull().default('us_canada'),
    target_countries: text('target_countries', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => ['us', 'ca']),
    target_cities: text('target_cities', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    target_roles: text('target_roles', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    preferred_locations: text('preferred_locations', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    remote_preference: text('remote_preference').notNull().default('flexible'),
    remote_preferences: text('remote_preferences', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => ['flexible']),
    salary_floor: integer('salary_floor'),
    languages: text('languages', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => ['English']),
    seniority_target: text('seniority_target'),
    seniority_targets: text('seniority_targets', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    employment_types: text('employment_types', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => ['full_time']),
    work_authorization_status: text('work_authorization_status'),
    user_skills: text('user_skills', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    excluded_terms: text('excluded_terms', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    check('job_feed_settings_target_market_check', sql`${t.target_market} in ('us', 'canada', 'us_canada')`),
    check(
      'job_feed_settings_remote_preference_check',
      sql`${t.remote_preference} in ('remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible')`,
    ),
    check(
      'job_feed_settings_seniority_target_check',
      sql`${t.seniority_target} is null or ${t.seniority_target} in ('intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager')`,
    ),
    check(
      'job_feed_settings_work_auth_check',
      sql`${t.work_authorization_status} is null or ${t.work_authorization_status} in ('authorized', 'needs_sponsorship', 'open_to_both')`,
    ),
    check('job_feed_settings_salary_floor_check', sql`${t.salary_floor} is null or ${t.salary_floor} >= 0`),
    check('job_feed_settings_target_roles_check', sql`json_array_length(${t.target_roles}) > 0`),
    check('job_feed_settings_target_countries_check', sql`json_array_length(${t.target_countries}) > 0`),
    check('job_feed_settings_remote_preferences_check', sql`json_array_length(${t.remote_preferences}) > 0`),
    check('job_feed_settings_employment_types_check', sql`json_array_length(${t.employment_types}) > 0`),
  ],
);

export const jobFeedRuns = sqliteTable(
  'job_feed_runs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    local_date: text('local_date').notNull(),
    local_timezone: text('local_timezone').notNull(),
    trigger_source: text('trigger_source').notNull().default('scheduled'),
    status: text('status').notNull().default('queued'),
    idempotency_key: text('idempotency_key').notNull(),
    started_at: text('started_at'),
    completed_at: text('completed_at'),
    error_message: text('error_message'),
    result_summary: text('result_summary'),
    raw_jobs_fetched: integer('raw_jobs_fetched').notNull().default(0),
    jobs_after_prefilter: integer('jobs_after_prefilter').notNull().default(0),
    ranked_jobs_count: integer('ranked_jobs_count').notNull().default(0),
    settings_snapshot: text('settings_snapshot', { mode: 'json' }).$type<Json>(),
    metadata: text('metadata', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('job_feed_runs_user_local_date_uidx').on(t.user_id, t.local_date),
    uniqueIndex('job_feed_runs_idempotency_uidx').on(t.idempotency_key),
    index('job_feed_runs_user_created_idx').on(t.user_id, t.created_at),
    check('job_feed_runs_status_check', sql`${t.status} in ('queued', 'running', 'completed', 'failed', 'skipped')`),
  ],
);

export const jobFeedRawFetches = sqliteTable(
  'job_feed_raw_fetches',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    run_id: text('run_id')
      .notNull()
      .references(() => jobFeedRuns.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('serpapi'),
    status: text('status').notNull().default('completed'),
    query_text: text('query_text').notNull(),
    market: text('market').notNull(),
    country_code: text('country_code'),
    language_code: text('language_code'),
    request_location: text('request_location'),
    request_filters: text('request_filters', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(emptyArray),
    page_number: integer('page_number').notNull().default(1),
    query_context: text('query_context', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    request_params: text('request_params', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    response_payload: text('response_payload', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    response_error: text('response_error'),
    fetched_jobs_count: integer('fetched_jobs_count').notNull().default(0),
    next_page_token: text('next_page_token'),
    fetched_at: text('fetched_at').notNull().$defaultFn(isoNow),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('job_feed_raw_fetches_run_idx').on(t.run_id),
    check('job_feed_raw_fetches_status_check', sql`${t.status} in ('completed', 'no_results', 'failed')`),
    check('job_feed_raw_fetches_market_check', sql`${t.market} in ('us', 'canada', 'us_canada')`),
  ],
);

export const jobFeedCanonicalJobs = sqliteTable(
  'job_feed_canonical_jobs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    canonical_key: text('canonical_key').notNull(),
    source_provider: text('source_provider').notNull().default('serpapi'),
    source_job_id: text('source_job_id'),
    title: text('title').notNull(),
    title_normalized: text('title_normalized').notNull(),
    company: text('company').notNull(),
    company_normalized: text('company_normalized').notNull(),
    location_text: text('location_text'),
    location_normalized: text('location_normalized'),
    work_mode: text('work_mode').notNull().default('unknown'),
    employment_type: text('employment_type'),
    salary_text: text('salary_text'),
    salary_min: integer('salary_min'),
    salary_max: integer('salary_max'),
    salary_currency: text('salary_currency'),
    description: text('description'),
    apply_url: text('apply_url'),
    source_url: text('source_url'),
    posted_at_text: text('posted_at_text'),
    freshness_days: integer('freshness_days'),
    source_identifiers: text('source_identifiers', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    first_seen_at: text('first_seen_at').notNull().$defaultFn(isoNow),
    last_seen_at: text('last_seen_at').notNull().$defaultFn(isoNow),
    last_raw_fetch_id: text('last_raw_fetch_id').references(() => jobFeedRawFetches.id, { onDelete: 'set null' }),
    times_seen: integer('times_seen').notNull().default(1),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('job_feed_canonical_jobs_key_uidx').on(t.canonical_key),
    index('job_feed_canonical_jobs_last_seen_idx').on(t.last_seen_at),
    check('job_feed_canonical_jobs_work_mode_check', sql`${t.work_mode} in ('remote', 'hybrid', 'onsite', 'unknown')`),
    check(
      'job_feed_canonical_jobs_employment_type_check',
      sql`${t.employment_type} is null or ${t.employment_type} in ('full_time', 'part_time', 'contract', 'internship', 'temporary')`,
    ),
  ],
);

export const jobFeedRankedItems = sqliteTable(
  'job_feed_ranked_items',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    run_id: text('run_id')
      .notNull()
      .references(() => jobFeedRuns.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    canonical_job_id: text('canonical_job_id')
      .notNull()
      .references(() => jobFeedCanonicalJobs.id, { onDelete: 'cascade' }),
    rank_position: integer('rank_position').notNull(),
    fit_label: text('fit_label').notNull(),
    ranking_source: text('ranking_source').notNull().default('deterministic'),
    reason: text('reason'),
    deterministic_score: integer('deterministic_score').notNull().default(0),
    metadata: text('metadata', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('job_feed_ranked_items_run_job_uidx').on(t.run_id, t.canonical_job_id),
    uniqueIndex('job_feed_ranked_items_run_rank_uidx').on(t.run_id, t.rank_position),
    index('job_feed_ranked_items_user_job_idx').on(t.user_id, t.canonical_job_id),
    check('job_feed_ranked_items_fit_label_check', sql`${t.fit_label} in ('strong', 'good')`),
    check('job_feed_ranked_items_ranking_source_check', sql`${t.ranking_source} in ('deterministic', 'llm')`),
  ],
);

export const jobFeedFeedback = sqliteTable(
  'job_feed_feedback',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    canonical_job_id: text('canonical_job_id')
      .notNull()
      .references(() => jobFeedCanonicalJobs.id, { onDelete: 'cascade' }),
    latest_run_id: text('latest_run_id').references(() => jobFeedRuns.id, { onDelete: 'set null' }),
    application_session_id: text('application_session_id').references(() => applicationSessions.id, { onDelete: 'set null' }),
    opened_at: text('opened_at'),
    saved_at: text('saved_at'),
    dismissed_at: text('dismissed_at'),
    apply_started_at: text('apply_started_at'),
    applied_at: text('applied_at'),
    generation_status: text('generation_status').notNull().default('none'),
    generation_error: text('generation_error'),
    generation_started_at: text('generation_started_at'),
    generation_completed_at: text('generation_completed_at'),
    generation_failed_at: text('generation_failed_at'),
    generation_cancelled_at: text('generation_cancelled_at'),
    metadata: text('metadata', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('job_feed_feedback_user_job_uidx').on(t.user_id, t.canonical_job_id),
    index('job_feed_feedback_user_session_idx').on(t.user_id, t.application_session_id),
    check(
      'job_feed_feedback_generation_status_check',
      sql`${t.generation_status} in ('none', 'pending', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      'job_feed_feedback_has_signal_check',
      sql`${t.opened_at} is not null
        or ${t.saved_at} is not null
        or ${t.dismissed_at} is not null
        or ${t.apply_started_at} is not null
        or ${t.applied_at} is not null
        or ${t.generation_status} <> 'none'
        or ${t.metadata} != '{}'`,
    ),
  ],
);

export const jobFeedApplicationGenerations = sqliteTable(
  'job_feed_application_generations',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    canonical_job_id: text('canonical_job_id')
      .notNull()
      .references(() => jobFeedCanonicalJobs.id, { onDelete: 'cascade' }),
    ranked_item_id: text('ranked_item_id').references(() => jobFeedRankedItems.id, { onDelete: 'set null' }),
    run_id: text('run_id').references(() => jobFeedRuns.id, { onDelete: 'set null' }),
    application_session_id: text('application_session_id')
      .notNull()
      .references(() => applicationSessions.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('intent_created'),
    attempt: integer('attempt').notNull().default(1),
    lease_owner: text('lease_owner'),
    lease_expires_at: text('lease_expires_at'),
    last_heartbeat_at: text('last_heartbeat_at'),
    error_code: text('error_code'),
    error_message: text('error_message'),
    metadata: text('metadata', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    intent_created_at: text('intent_created_at').notNull().$defaultFn(isoNow),
    queued_at: text('queued_at'),
    started_at: text('started_at'),
    completed_at: text('completed_at'),
    failed_at: text('failed_at'),
    cancelled_at: text('cancelled_at'),
    expired_at: text('expired_at'),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('job_feed_app_generations_user_job_session_uidx').on(
      t.user_id,
      t.canonical_job_id,
      t.application_session_id,
    ),
    index('job_feed_app_generations_user_status_idx').on(t.user_id, t.status, t.updated_at),
    index('job_feed_app_generations_session_idx').on(t.user_id, t.application_session_id),
    index('job_feed_app_generations_job_idx').on(t.user_id, t.canonical_job_id),
    check(
      'job_feed_app_generations_status_check',
      sql`${t.status} in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')`,
    ),
    check('job_feed_app_generations_attempt_check', sql`${t.attempt} >= 1`),
  ],
);

export const jobFeedApplicationGenerationEvents = sqliteTable(
  'job_feed_application_generation_events',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    generation_id: text('generation_id')
      .notNull()
      .references(() => jobFeedApplicationGenerations.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    from_status: text('from_status'),
    to_status: text('to_status').notNull(),
    attempt: integer('attempt').notNull(),
    transition_reason: text('transition_reason'),
    error_code: text('error_code'),
    error_message: text('error_message'),
    metadata: text('metadata', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('job_feed_app_generation_events_generation_idx').on(t.generation_id, t.created_at),
    check(
      'job_feed_generation_events_from_status_check',
      sql`${t.from_status} is null or ${t.from_status} in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')`,
    ),
    check(
      'job_feed_generation_events_to_status_check',
      sql`${t.to_status} in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')`,
    ),
    check('job_feed_generation_events_attempt_check', sql`${t.attempt} >= 1`),
  ],
);

export const creditReservations = sqliteTable(
  'credit_reservations',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    generation_id: text('generation_id').references(() => jobFeedApplicationGenerations.id, { onDelete: 'set null' }),
    session_id: text('session_id').references(() => applicationSessions.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    amount: real('amount').notNull(),
    status: text('status').notNull().default('reserved'),
    reserved_at: text('reserved_at').notNull().$defaultFn(isoNow),
    captured_at: text('captured_at'),
    released_at: text('released_at'),
    refunded_at: text('refunded_at'),
    idempotency_key: text('idempotency_key').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('credit_reservations_idempotency_uidx').on(t.idempotency_key),
    index('credit_reservations_user_status_idx').on(t.user_id, t.status),
    index('credit_reservations_generation_idx').on(t.generation_id),
    index('credit_reservations_session_idx').on(t.session_id),
    check('credit_reservations_amount_check', sql`${t.amount} > 0`),
    check('credit_reservations_status_check', sql`${t.status} in ('reserved', 'captured', 'released', 'refunded')`),
  ],
);

// ---------------------------------------------------------------------------
// Admin metrics
//
// Append-only operational ledgers. They carry no email address, CV content,
// job description or model cost. Dollar cost belongs to provider billing.
// ---------------------------------------------------------------------------

export const adminAuthEvents = sqliteTable(
  'admin_auth_events',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    source_id: text('source_id').notNull(),
    subject_hash: text('subject_hash').notNull(),
    event_type: text('event_type').notNull(),
    occurred_at: text('occurred_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('admin_auth_events_source_uidx').on(t.source_id),
    index('admin_auth_events_type_time_idx').on(t.event_type, t.occurred_at),
    index('admin_auth_events_subject_time_idx').on(t.subject_hash, t.occurred_at),
    check('admin_auth_events_type_check', sql`${t.event_type} in ('signup', 'session_started')`),
  ],
);

export const adminMetricSources = sqliteTable(
  'admin_metric_sources',
  {
    source: text('source').primaryKey(),
    tracking_started_at: text('tracking_started_at').notNull(),
  },
  (t) => [check('admin_metric_sources_source_check', sql`${t.source} in ('auth', 'llm')`)],
);

export const llmGenerations = sqliteTable(
  'llm_generations',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    request_execution_id: text('request_execution_id').notNull(),
    client_request_id: text('client_request_id'),
    parent_generation_id: text('parent_generation_id').references((): AnySQLiteColumn => llmGenerations.id, {
      onDelete: 'set null',
    }),
    user_id: text('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    anonymous_subject_hash: text('anonymous_subject_hash'),
    application_session_id: text('application_session_id').references(() => applicationSessions.id, {
      onDelete: 'set null',
    }),
    job_feed_run_id: text('job_feed_run_id').references(() => jobFeedRuns.id, { onDelete: 'set null' }),
    route: text('route').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    feature: text('feature').notNull(),
    operation: text('operation').notNull(),
    status: text('status').notNull(),
    started_at: text('started_at').notNull().$defaultFn(isoNow),
    response_received_at: text('response_received_at'),
    failed_at: text('failed_at'),
    latency_ms: integer('latency_ms'),
    attempt_count: integer('attempt_count').notNull().default(1),
    error_kind: text('error_kind'),
    http_status: integer('http_status'),
    provider_request_id: text('provider_request_id'),
    usage_reported: integer('usage_reported', { mode: 'boolean' }).notNull().default(false),
    input_tokens: integer('input_tokens'),
    output_tokens: integer('output_tokens'),
    cache_read_input_tokens: integer('cache_read_input_tokens'),
    cache_write_input_tokens: integer('cache_write_input_tokens'),
    provider_total_tokens: integer('provider_total_tokens'),
    provider_usage: text('provider_usage', { mode: 'json' }).$type<Json>(),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('llm_generations_status_time_idx').on(t.status, t.started_at),
    index('llm_generations_user_time_idx').on(t.user_id, t.started_at),
    index('llm_generations_feature_operation_time_idx').on(t.feature, t.operation, t.started_at),
    index('llm_generations_request_execution_idx').on(t.request_execution_id),
    index('llm_generations_job_feed_run_idx').on(t.job_feed_run_id),
    check(
      'llm_generations_provider_check',
      sql`${t.provider} in ('anthropic', 'bedrock', 'digitalocean', 'workers-ai')`,
    ),
    check('llm_generations_status_check', sql`${t.status} in ('started', 'response_received', 'failed')`),
    check(
      'llm_generations_tokens_check',
      sql`(${t.input_tokens} is null or ${t.input_tokens} >= 0)
        and (${t.output_tokens} is null or ${t.output_tokens} >= 0)
        and (${t.cache_read_input_tokens} is null or ${t.cache_read_input_tokens} >= 0)
        and (${t.cache_write_input_tokens} is null or ${t.cache_write_input_tokens} >= 0)
        and (${t.provider_total_tokens} is null or ${t.provider_total_tokens} >= 0)`,
    ),
    check('llm_generations_latency_check', sql`${t.latency_ms} is null or ${t.latency_ms} >= 0`),
    check('llm_generations_attempt_check', sql`${t.attempt_count} >= 1`),
    check('llm_generations_usage_reported_check', sql`${t.usage_reported} in (0, 1)`),
    check(
      'llm_generations_usage_state_check',
      sql`${t.usage_reported} = 0 or (
        ${t.status} = 'response_received'
        and (${t.provider_total_tokens} is not null or (${t.input_tokens} is not null and ${t.output_tokens} is not null))
      )`,
    ),
    check(
      'llm_generations_lifecycle_check',
      sql`(${t.status} = 'started' and ${t.response_received_at} is null and ${t.failed_at} is null)
        or (${t.status} = 'response_received' and ${t.response_received_at} is not null and ${t.failed_at} is null)
        or (${t.status} = 'failed' and ${t.failed_at} is not null and ${t.response_received_at} is null)`,
    ),
  ],
);
