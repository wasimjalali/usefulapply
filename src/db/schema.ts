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
 * Profile photos are files in R2 (the CV photo is the avatar), with no table.
 * Migration 0015 dropped the unused `connected_accounts`, `profile_photos`,
 * `user_cv_suggestions` and `user_notifications` tables.
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
    // Better Auth 1.7.0 to 1.7.2 wrote this ('local:credential' for password
    // accounts, the provider's issuer for social ones) and matched sign-in on
    // (issuer, accountId). 1.7.3 and later never write it and match on
    // (providerId, accountId), as in 1.6. The column stays NOT NULL in D1, so
    // the default below fills it for new rows and old rows keep their value.
    // Nothing reads it. Drop it, and its unique index, in a later migration
    // once 1.7.11 is live (SQLite: DROP INDEX, then ALTER TABLE DROP COLUMN).
    issuer: text('issuer').notNull().$defaultFn(() => 'unset'),
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
// MCP OAuth (migration 0009)
//
// Tables for `jwt()`, `@better-auth/mcp` (on `@better-auth/oauth-provider`) and
// `@better-auth/cimd`. Field names are Better Auth's (camelCase keys), columns
// are snake_case like the tables above. Better Auth's SQLite path stores
// string[] and json fields as JSON text, so they are plain text columns here.
// On a Better Auth upgrade, compare these with `getAuthTables({ plugins })`
// from `better-auth/db` (the field list is what the adapter reads and writes).
// ---------------------------------------------------------------------------

const baDate = (column: string) => integer(column, { mode: 'timestamp_ms' });

export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: baDate('created_at').notNull(),
  expiresAt: baDate('expires_at'),
  alg: text('alg'),
  crv: text('crv'),
});

export const oauthClient = sqliteTable(
  'oauth_client',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: integer('disabled', { mode: 'boolean' }).default(false),
    skipConsent: integer('skip_consent', { mode: 'boolean' }),
    enableEndSession: integer('enable_end_session', { mode: 'boolean' }),
    subjectType: text('subject_type'),
    scopes: text('scopes'),
    clientCredentialsScopes: text('client_credentials_scopes'),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: baDate('created_at'),
    updatedAt: baDate('updated_at'),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts'),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris'),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: integer('backchannel_logout_session_required', { mode: 'boolean' }),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types'),
    responseTypes: text('response_types'),
    requirePKCE: integer('require_pkce', { mode: 'boolean' }),
    dpopBoundAccessTokens: integer('dpop_bound_access_tokens', { mode: 'boolean' }).default(false),
    referenceId: text('reference_id'),
    metadata: text('metadata'),
  },
  (t) => [
    uniqueIndex('oauth_client_client_id_uidx').on(t.clientId),
    index('oauth_client_user_id_idx').on(t.userId),
  ],
);

export const oauthResource = sqliteTable(
  'oauth_resource',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    name: text('name').notNull(),
    accessTokenTtl: integer('access_token_ttl'),
    refreshTokenTtl: integer('refresh_token_ttl'),
    signingAlgorithm: text('signing_algorithm'),
    signingKeyId: text('signing_key_id'),
    allowedScopes: text('allowed_scopes'),
    customClaims: text('custom_claims'),
    dpopBoundAccessTokensRequired: integer('dpop_bound_access_tokens_required', { mode: 'boolean' }).default(false),
    disabled: integer('disabled', { mode: 'boolean' }).default(false),
    createdAt: baDate('created_at'),
    updatedAt: baDate('updated_at'),
    policyVersion: integer('policy_version').default(1),
    metadata: text('metadata'),
  },
  (t) => [uniqueIndex('oauth_resource_identifier_uidx').on(t.identifier)],
);

export const oauthClientResource = sqliteTable(
  'oauth_client_resource',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: text('metadata'),
    createdAt: baDate('created_at'),
  },
  (t) => [
    index('oauth_client_resource_client_id_idx').on(t.clientId),
    index('oauth_client_resource_resource_id_idx').on(t.resourceId),
  ],
);

export const oauthRefreshToken = sqliteTable(
  'oauth_refresh_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requested_user_info_claims'),
    expiresAt: baDate('expires_at').notNull(),
    createdAt: baDate('created_at').notNull(),
    revoked: baDate('revoked'),
    rotatedAt: baDate('rotated_at'),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: baDate('rotation_replay_expires_at'),
    authTime: baDate('auth_time'),
    confirmation: text('confirmation'),
    scopes: text('scopes').notNull(),
  },
  (t) => [
    uniqueIndex('oauth_refresh_token_token_uidx').on(t.token),
    index('oauth_refresh_token_client_id_idx').on(t.clientId),
    index('oauth_refresh_token_session_id_idx').on(t.sessionId),
    index('oauth_refresh_token_user_id_idx').on(t.userId),
    index('oauth_refresh_token_auth_code_idx').on(t.authorizationCodeId),
  ],
);

export const oauthAccessToken = sqliteTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requested_user_info_claims'),
    refreshId: text('refresh_id').references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
    expiresAt: baDate('expires_at').notNull(),
    createdAt: baDate('created_at').notNull(),
    revoked: baDate('revoked'),
    confirmation: text('confirmation'),
    scopes: text('scopes').notNull(),
  },
  (t) => [
    uniqueIndex('oauth_access_token_token_uidx').on(t.token),
    index('oauth_access_token_client_id_idx').on(t.clientId),
    index('oauth_access_token_session_id_idx').on(t.sessionId),
    index('oauth_access_token_user_id_idx').on(t.userId),
    index('oauth_access_token_auth_code_idx').on(t.authorizationCodeId),
    index('oauth_access_token_refresh_id_idx').on(t.refreshId),
  ],
);

export const oauthConsent = sqliteTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources'),
    requestedUserInfoClaims: text('requested_user_info_claims'),
    scopes: text('scopes').notNull(),
    createdAt: baDate('created_at').notNull(),
    updatedAt: baDate('updated_at').notNull(),
  },
  (t) => [
    index('oauth_consent_client_id_idx').on(t.clientId),
    index('oauth_consent_user_id_idx').on(t.userId),
  ],
);

export const oauthClientAssertion = sqliteTable('oauth_client_assertion', {
  id: text('id').primaryKey(),
  expiresAt: baDate('expires_at').notNull(),
});

/**
 * Our own record per (user, OAuth client), beside Better Auth's tables.
 * `revoked_at` is the revocation record the /mcp token check reads: an access
 * token minted before it is refused, so JWT access tokens (which Better Auth
 * cannot revoke) die within the verifier's cache window. `last_used_at` feeds
 * "last used" in Settings > Connected apps.
 */
export const mcpGrantState = sqliteTable(
  'mcp_grant_state',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    client_id: text('client_id').notNull(),
    revoked_at: integer('revoked_at'),
    last_used_at: integer('last_used_at'),
  },
  (t) => [uniqueIndex('mcp_grant_state_user_client_uidx').on(t.user_id, t.client_id)],
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
    notify_feed_ready: integer('notify_feed_ready', { mode: 'boolean' }).notNull().default(true),
    notify_follow_up_due: integer('notify_follow_up_due', { mode: 'boolean' }).notNull().default(true),
    notify_interview_tomorrow: integer('notify_interview_tomorrow', { mode: 'boolean' }).notNull().default(true),
    // Tracker view filter, kept per user so it survives a reload.
    hide_rejected: integer('hide_rejected', { mode: 'boolean' }).notNull().default(false),
    timezone: text('timezone'),
    date_format: text('date_format'),
    // The applicant's own start date and salary expectation (migration 0012). The kit writers use these
    // and never invent them; NULL availability falls back to a neutral notice-period line, NULL salary is
    // never mentioned. availability_asked_at is stamped by the server so a skip is remembered.
    availability: text('availability'),
    availability_note: text('availability_note'),
    salary_expectation: text('salary_expectation'),
    availability_asked_at: text('availability_asked_at'),
    // Credits AI agents (MCP) may spend per UTC day on this account. Enforced
    // from the tool catalog PR on; the Connected apps pane edits it.
    mcp_daily_credit_limit: real('mcp_daily_credit_limit').notNull().default(10),
    // Unused. Kept because it is NOT NULL with no DB default and dropping it needs a profiles rebuild.
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
      'profiles_availability_check',
      sql`${t.availability} is null or ${t.availability} in ('immediately', '2_weeks', '1_month', '3_months', 'other')`,
    ),
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
    generated_artifacts: text('generated_artifacts', { mode: 'json' }).$type<Json>(),
    // Bumped by every write to the application's content (migration 0010). A
    // writer that loaded revision N updates `WHERE revision = N`, so a stale tab
    // or a background generation cannot silently overwrite a newer write.
    revision: integer('revision').notNull().default(0),
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
    // Migration 0013: when /api/chat claimed this user message for a model turn (claimUserChatTurn). Null for every
    // other row. A message is claimed at most once.
    claimed_at: text('claimed_at'),
  },
  (t) => [
    index('chat_messages_session_idx').on(t.session_id, t.created_at),
    index('chat_messages_user_idx').on(t.user_id),
    // Migration 0013: backs the per-application user-message count of the chat cap.
    index('chat_messages_session_role_idx').on(t.session_id, t.role),
    check('chat_messages_role_check', sql`${t.role} in ('user', 'assistant', 'system')`),
  ],
);

/**
 * The chat's compaction block for one application (migration 0013). Written and read only by /api/chat.
 * `block` is the API's signed `compaction` block, sent back verbatim. `covers_through_message_id` is the last
 * chat_messages row it summarizes, deliberately without a foreign key (see the migration).
 */
export const chatCompactions = sqliteTable(
  'chat_compactions',
  {
    session_id: text('session_id')
      .primaryKey()
      .references(() => applicationSessions.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    block: text('block', { mode: 'json' }).$type<Json>().notNull(),
    covers_through_message_id: text('covers_through_message_id').notNull(),
    input_tokens: integer('input_tokens').notNull(),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('chat_compactions_user_idx').on(t.user_id),
    check('chat_compactions_input_tokens_check', sql`${t.input_tokens} >= 0`),
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
    /** Moves up on every write; a save based on an older revision is refused (migration 0017). */
    revision: integer('revision').notNull().default(0),
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
    /** 'serp' (Google Jobs' copy) or 'employer_page' (the JobPosting read from the ad's own page). */
    description_source: text('description_source').notNull().default('serp'),
    /** Whether the description is the whole ad. Null on rows from before migration 0016. */
    description_complete: integer('description_complete', { mode: 'boolean' }),
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

// One row per idempotent agent request (queued kit generation today). The
// Queue consumer claims it with a lease, the same pattern as
// job_feed_application_generations. `reservation_key` names the credit
// reservation the operation owns; `input` is what the runner needs, since the
// queue message carries only the operation id.
export const agentOperations = sqliteTable(
  'agent_operations',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    session_id: text('session_id').references(() => applicationSessions.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    idempotency_key: text('idempotency_key').notNull(),
    input_hash: text('input_hash').notNull(),
    input: text('input', { mode: 'json' }).$type<Json>().notNull().$defaultFn(emptyObject),
    status: text('status').notNull().default('pending'),
    result_ref: text('result_ref'),
    // JSON result of an operation that runs inside the tool call (fit analysis, a regenerate), returned again on a retry.
    result: text('result', { mode: 'json' }).$type<Json>(),
    reservation_key: text('reservation_key'),
    lease_owner: text('lease_owner'),
    lease_expires_at: text('lease_expires_at'),
    attempt: integer('attempt').notNull().default(0),
    error_code: text('error_code'),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
    updated_at: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('agent_operations_idempotency_uidx').on(t.user_id, t.kind, t.idempotency_key),
    // At most one live operation per identical request, whatever idempotency key the client sent.
    uniqueIndex('agent_operations_active_input_uidx')
      .on(t.user_id, t.kind, t.input_hash)
      .where(sql`${t.status} in ('pending', 'running')`),
    index('agent_operations_user_status_idx').on(t.user_id, t.status),
    index('agent_operations_status_updated_idx').on(t.status, t.updated_at),
    index('agent_operations_session_idx').on(t.session_id),
    index('agent_operations_reservation_idx').on(t.reservation_key),
    check('agent_operations_status_check', sql`${t.status} in ('pending', 'running', 'succeeded', 'failed', 'cancelled')`),
    check('agent_operations_attempt_check', sql`${t.attempt} >= 0`),
  ],
);

// The last 10 prior versions of an application's tailored CV and documents, for undo_last_edit.
// One row is the value of the columns an edit changed, read just before the edit, and it is written
// in the same batch as that edit. Rows older than 30 days are removed by the daily cron.
export const applicationEditHistory = sqliteTable(
  'application_edit_history',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    session_id: text('session_id')
      .notNull()
      .references(() => applicationSessions.id, { onDelete: 'cascade' }),
    edit_group: text('edit_group').notNull(),
    revision: integer('revision').notNull(),
    prior_value: text('prior_value', { mode: 'json' }).$type<Json>().notNull(),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('application_edit_history_lookup_idx').on(t.user_id, t.session_id, t.edit_group, t.created_at),
    index('application_edit_history_created_idx').on(t.created_at),
    check('application_edit_history_group_check', sql`${t.edit_group} in ('cv', 'cover_letter', 'email', 'follow_up_email')`),
    check('application_edit_history_revision_check', sql`${t.revision} >= 0`),
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

/**
 * Which consent a token belongs to. A consent row's id is its "generation":
 * revoking deletes the row and reconnecting creates a new one. Every access
 * token (`at:<jti>`) and refresh token (`rt:<sha256 b64url>`) is bound to the
 * generation it was issued under, captured when the exchange started, so a
 * token minted by an exchange that was already past the revoke check is still
 * tied to the connection the user revoked. /mcp and the refresh grant refuse a
 * token whose generation is not the current consent's id.
 */
export const mcpTokenGeneration = sqliteTable(
  'mcp_token_generation',
  {
    token_key: text('token_key').primaryKey(),
    consent_id: text('consent_id').notNull(),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    client_id: text('client_id').notNull(),
    expires_at: integer('expires_at').notNull(),
  },
  (t) => [
    index('mcp_token_generation_user_client_idx').on(t.user_id, t.client_id),
    index('mcp_token_generation_expires_idx').on(t.expires_at),
  ],
);

// ---------------------------------------------------------------------------
// Anthropic user profiles (migration 0014): our user id -> the `uprof_` id sent in the
// `anthropic-user-profile-id` header, so an enforcement action hits one user, not the org.
// ---------------------------------------------------------------------------

export const anthropicUserProfiles = sqliteTable(
  'anthropic_user_profiles',
  {
    user_id: text('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    profile_id: text('profile_id').notNull(),
    created_at: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    uniqueIndex('anthropic_user_profiles_profile_id_unique').on(t.profile_id),
    check('anthropic_user_profiles_profile_id_check', sql`substr(${t.profile_id}, 1, 6) = 'uprof_' AND length(${t.profile_id}) > 6`),
  ],
);
