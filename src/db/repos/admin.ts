/**
 * Cross-user / catalog queries. Only imported by cron handlers and the
 * Stripe webhook. Everything else must go through a user-scoped repo.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, notExists, or, sql } from 'drizzle-orm';
import type { Json } from '@/lib/supabase/types';
import { chunk, D1_MAX_PARAMS, isUniqueViolation, getDb, nowIso } from '../client';
import {
  anthropicUserProfiles,
  applicationSessions,
  chatMessages,
  connectedAccounts,
  creditReservations,
  creditTransactions,
  documents,
  jobFeedApplicationGenerationEvents,
  jobFeedApplicationGenerations,
  jobFeedCanonicalJobs,
  jobFeedFeedback,
  jobFeedRankedItems,
  jobFeedRawFetches,
  jobFeedRuns,
  jobFeedSettings,
  messageFeedback,
  profilePhotos,
  profiles,
  serpapiFilterTokens,
  subscriptions,
  userCareerProfiles,
  userCredits,
  userCvSuggestions,
  userJobPreferences,
  userNotifications,
  userSearchStrategies,
  user as authUsers,
  webhookEvents,
} from '../schema';
import type { JobFeedCanonicalJob, JobFeedApplicationGeneration, CreditReservation } from '@/lib/supabase/types';

export async function hasWebhookEvent(eventId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ event_id: webhookEvents.event_id }).from(webhookEvents).where(eq(webhookEvents.event_id, eventId)).limit(1);
  return Boolean(rows[0]);
}

/**
 * Authoritative dedupe step for the Stripe webhook. A losing concurrent
 * retry hits the primary key and reports 'duplicate'; anything else is a
 * real failure and is rethrown so the caller can answer non-2xx.
 */
export async function insertWebhookEvent(eventId: string, eventType: string): Promise<'inserted' | 'duplicate'> {
  const db = await getDb();
  try {
    await db.insert(webhookEvents).values({
      event_id: eventId,
      event_type: eventType,
      created_at: nowIso(),
    });
    return 'inserted';
  } catch (error) {
    if (isUniqueViolation(error)) {
      return 'duplicate';
    }
    throw error;
  }
}

export async function deleteWebhookEvent(eventId: string): Promise<void> {
  const db = await getDb();
  await db.delete(webhookEvents).where(eq(webhookEvents.event_id, eventId));
}

/**
 * Stripe webhook only. Keeps profiles.subscription_tier/status in sync so
 * AuthContext and PostHog reflect the current plan.
 */
export async function setProfileSubscription(userId: string, tier: string, status: string): Promise<void> {
  const db = await getDb();
  await db
    .update(profiles)
    .set({ subscription_tier: tier, subscription_status: status, updated_at: nowIso() })
    .where(eq(profiles.id, userId));
}

export async function updateRunById(runId: string, updates: Partial<import('@/lib/supabase/types').JobFeedRun>) {
  const db = await getDb();
  await db.update(jobFeedRuns).set({ ...updates, updated_at: nowIso() }).where(eq(jobFeedRuns.id, runId));
  const rows = await db.select().from(jobFeedRuns).where(eq(jobFeedRuns.id, runId)).limit(1);
  if (!rows[0]) throw new Error('Failed to update job feed run');
  return rows[0] as import('@/lib/supabase/types').JobFeedRun;
}

export async function listRankedItemsByRunId(runId: string) {
  const db = await getDb();
  return await db
    .select()
    .from(jobFeedRankedItems)
    .where(eq(jobFeedRankedItems.run_id, runId))
    .orderBy(jobFeedRankedItems.rank_position);
}

export async function deleteRankedItemsByRunId(runId: string): Promise<void> {
  const db = await getDb();
  await db.delete(jobFeedRankedItems).where(eq(jobFeedRankedItems.run_id, runId));
}

export async function deleteRunArtifactsByRunId(runId: string): Promise<void> {
  const db = await getDb();
  await db.delete(jobFeedRawFetches).where(eq(jobFeedRawFetches.run_id, runId));
  await db.delete(jobFeedRankedItems).where(eq(jobFeedRankedItems.run_id, runId));
}

export async function getCanonicalJob(jobId: string): Promise<JobFeedCanonicalJob | null> {
  const db = await getDb();
  const rows = await db.select().from(jobFeedCanonicalJobs).where(eq(jobFeedCanonicalJobs.id, jobId)).limit(1);
  return (rows[0] as JobFeedCanonicalJob | undefined) ?? null;
}

export async function getCanonicalJobsByIds(jobIds: string[]): Promise<JobFeedCanonicalJob[]> {
  if (jobIds.length === 0) return [];
  const db = await getDb();
  const out: JobFeedCanonicalJob[] = [];
  for (const ids of chunk(jobIds, D1_MAX_PARAMS)) {
    out.push(...(await db.select().from(jobFeedCanonicalJobs).where(inArray(jobFeedCanonicalJobs.id, ids)) as JobFeedCanonicalJob[]));
  }
  return out;
}

export async function getCanonicalJobsByKeys(keys: string[]): Promise<JobFeedCanonicalJob[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const out: JobFeedCanonicalJob[] = [];
  for (const part of chunk(keys, D1_MAX_PARAMS)) {
    out.push(...(await db.select().from(jobFeedCanonicalJobs).where(inArray(jobFeedCanonicalJobs.canonical_key, part)) as JobFeedCanonicalJob[]));
  }
  return out;
}

export async function updateCanonicalJob(jobId: string, updates: Partial<JobFeedCanonicalJob>): Promise<JobFeedCanonicalJob> {
  const db = await getDb();
  await db.update(jobFeedCanonicalJobs).set({ ...updates, updated_at: nowIso() }).where(eq(jobFeedCanonicalJobs.id, jobId));
  const row = await getCanonicalJob(jobId);
  if (!row) throw new Error('Failed to update canonical job');
  return row;
}

export async function insertCanonicalJob(values: Omit<Partial<JobFeedCanonicalJob>, 'id'> & {
  canonical_key: string;
  title: string;
  title_normalized: string;
  company: string;
  company_normalized: string;
}): Promise<JobFeedCanonicalJob> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.insert(jobFeedCanonicalJobs).values({
    id,
    first_seen_at: now,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    ...values,
  });
  const row = await getCanonicalJob(id);
  if (!row) throw new Error('Failed to insert canonical job');
  return row;
}

export async function upsertSerpApiFilterTokens(rows: Array<{
  country_code: string;
  filter_name: string;
  option_label: string;
  uds_token: string;
}>): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  const now = nowIso();
  for (const row of rows) {
    const existing = await db
      .select()
      .from(serpapiFilterTokens)
      .where(and(
        eq(serpapiFilterTokens.country_code, row.country_code),
        eq(serpapiFilterTokens.filter_name, row.filter_name),
        eq(serpapiFilterTokens.option_label, row.option_label),
      ))
      .limit(1);
    if (existing[0]) {
      await db
        .update(serpapiFilterTokens)
        .set({ uds_token: row.uds_token, last_seen_at: now })
        .where(and(
          eq(serpapiFilterTokens.country_code, row.country_code),
          eq(serpapiFilterTokens.filter_name, row.filter_name),
          eq(serpapiFilterTokens.option_label, row.option_label),
        ));
    } else {
      await db.insert(serpapiFilterTokens).values({
        ...row,
        last_seen_at: now,
        created_at: now,
      });
    }
  }
}

export async function loadSerpApiFilterTokens(countryCodes: string[], filterNames: string[]): Promise<Array<{
  country_code: string;
  option_label: string;
  uds_token: string;
}>> {
  if (countryCodes.length === 0 || filterNames.length === 0) return [];
  const db = await getDb();
  return await db
    .select({
      country_code: serpapiFilterTokens.country_code,
      option_label: serpapiFilterTokens.option_label,
      uds_token: serpapiFilterTokens.uds_token,
    })
    .from(serpapiFilterTokens)
    .where(and(
      inArray(serpapiFilterTokens.country_code, countryCodes),
      inArray(serpapiFilterTokens.filter_name, filterNames),
    ));
}

export async function listStaleReservations(cutoffIso: string, limit: number): Promise<CreditReservation[]> {
  const db = await getDb();
  return await db
    .select()
    .from(creditReservations)
    .where(and(
      eq(creditReservations.status, 'reserved'),
      lt(creditReservations.reserved_at, cutoffIso),
      // A reservation owned by a live queued operation is that operation's to
      // settle (capture, or release when it fails); the sweeper must not
      // refund a kit that is about to land.
      sql`NOT EXISTS (
        SELECT 1 FROM agent_operations o
        WHERE o.reservation_key = ${creditReservations.idempotency_key} AND o.status IN ('pending', 'running')
      )`,
    ))
    .orderBy(creditReservations.reserved_at)
    .limit(limit) as CreditReservation[];
}

export async function listStaleGenerations(cutoffIso: string, limit: number): Promise<JobFeedApplicationGeneration[]> {
  const db = await getDb();
  return await db
    .select()
    .from(jobFeedApplicationGenerations)
    .where(and(
      inArray(jobFeedApplicationGenerations.status, ['queued', 'running']),
      sql`${jobFeedApplicationGenerations.lease_expires_at} is not null`,
      lt(jobFeedApplicationGenerations.lease_expires_at, cutoffIso),
    ))
    .limit(limit) as JobFeedApplicationGeneration[];
}

export async function listProfilesByIds(ids: string[]): Promise<Array<{
  id: string;
  full_name: string | null;
  last_confirmation_resend_at: string | null;
  confirmation_resend_count: number;
}>> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const out: Array<{
    id: string;
    full_name: string | null;
    last_confirmation_resend_at: string | null;
    confirmation_resend_count: number;
  }> = [];
  for (const part of chunk(ids, D1_MAX_PARAMS)) {
    out.push(
      ...(await db
        .select({
          id: profiles.id,
          full_name: profiles.full_name,
          last_confirmation_resend_at: profiles.last_confirmation_resend_at,
          confirmation_resend_count: profiles.confirmation_resend_count,
        })
        .from(profiles)
        .where(inArray(profiles.id, part))),
    );
  }
  return out;
}

const NUDGE_THROTTLE_MS = 24 * 60 * 60 * 1000;

/**
 * Claim one confirmation nudge: sets the throttle timestamp AND bumps the
 * count in a single CAS write, so the MAX_NUDGES cap can never drift from the
 * throttle. Returns the claimed timestamp, or null when another run won.
 */
export async function claimConfirmationResend(userId: string, previousCount: number): Promise<string | null> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - NUDGE_THROTTLE_MS).toISOString();
  const claimedAt = nowIso();
  const result = await db
    .update(profiles)
    .set({
      last_confirmation_resend_at: claimedAt,
      confirmation_resend_count: previousCount + 1,
      updated_at: claimedAt,
    })
    .where(and(
      eq(profiles.id, userId),
      eq(profiles.confirmation_resend_count, previousCount),
      or(isNull(profiles.last_confirmation_resend_at), lt(profiles.last_confirmation_resend_at, cutoff)),
    ))
    .returning({ id: profiles.id });
  return result.length > 0 ? claimedAt : null;
}

/** Undo a claim whose send failed. Scoped to the exact claim so a newer claim is never clobbered. */
export async function releaseConfirmationResend(
  userId: string,
  claimedAt: string,
  previousCount: number,
  previousLastResendAt: string | null,
): Promise<void> {
  const db = await getDb();
  await db
    .update(profiles)
    .set({
      last_confirmation_resend_at: previousLastResendAt,
      confirmation_resend_count: previousCount,
      updated_at: nowIso(),
    })
    .where(and(
      eq(profiles.id, userId),
      eq(profiles.last_confirmation_resend_at, claimedAt),
      eq(profiles.confirmation_resend_count, previousCount + 1),
    ));
}

export async function deleteExpiredRankedItems(inboxCutoff: string): Promise<number> {
  const db = await getDb();
  // Subquery instead of an id list: the number of expired runs is unbounded
  // and D1 caps bound parameters at 100.
  const expiredRunIds = db
    .select({ id: jobFeedRuns.id })
    .from(jobFeedRuns)
    .where(and(eq(jobFeedRuns.status, 'completed'), lt(jobFeedRuns.completed_at, inboxCutoff)));
  // Saved bookmarks authorise through a live ranked row. Dropping those rows
  // at day 7 404s every action on a job that is still on the Saved tab.
  // Unsaving clears saved_at, so the next sweep can take the row.
  const result = await db.delete(jobFeedRankedItems).where(
    and(
      inArray(jobFeedRankedItems.run_id, expiredRunIds),
      notExists(
        db
          .select({ one: sql`1` })
          .from(jobFeedFeedback)
          .where(and(
            eq(jobFeedFeedback.user_id, jobFeedRankedItems.user_id),
            eq(jobFeedFeedback.canonical_job_id, jobFeedRankedItems.canonical_job_id),
            isNotNull(jobFeedFeedback.saved_at),
          )),
      ),
    ),
  );
  return Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0);
}

export async function redactOldRawFetchPayloads(cutoff: string): Promise<number> {
  const db = await getDb();
  const result = await db
    .update(jobFeedRawFetches)
    .set({ response_payload: { redacted: true } })
    .where(and(lt(jobFeedRawFetches.fetched_at, cutoff), sql`${jobFeedRawFetches.response_payload} not like '%"redacted"%'`));
  return Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0);
}

const JOB_FEED_CLEANUP_COMPACTION_VERSION = 1;

function isJsonRecord(value: Json): value is Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getArrayCount(value: Json | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function copyIfPresent(
  target: Record<string, Json>,
  source: Record<string, Json | undefined>,
  key: string,
) {
  const value = source[key];
  if (value !== undefined) {
    target[key] = value;
  }
}

/** Already compacted, so the nightly pass can skip the row instead of rewriting it. */
function isCompactedRunMetadata(value: Json): boolean {
  return isJsonRecord(value) && typeof value.cleanup_compacted_at === 'string';
}

/**
 * Shrink a finished run's metadata to the counters diagnostics actually read
 * (ranking model and status, duplicate count, prefilter rejections, stage) and
 * drop the bulky preview arrays. Replacing the blob wholesale would blind
 * getJobFeedRunDiagnostics for every run past the retention window.
 */
function compactRunMetadata(metadata: Json, compactedAt: string): Json {
  const record = isJsonRecord(metadata) ? metadata : {};
  const compact: Record<string, Json> = {
    cleanup_compacted_at: compactedAt,
    cleanup_compaction_version: JOB_FEED_CLEANUP_COMPACTION_VERSION,
    search_plan_count: getArrayCount(record.search_plan),
    raw_fetch_count: getArrayCount(record.raw_fetch_ids),
    failed_fetch_count: getArrayCount(record.failed_fetches),
    ingestion_preview_count: getArrayCount(record.ingestion_preview_jobs),
    survivors_preview_count: getArrayCount(record.prefilter_survivors_preview),
    shortlist_preview_count: getArrayCount(record.shortlist_preview_jobs),
    ranked_preview_count: getArrayCount(record.ranked_preview_jobs),
  };

  copyIfPresent(compact, record, 'stage');
  copyIfPresent(compact, record, 'foundation_mode');
  copyIfPresent(compact, record, 'target_market');
  copyIfPresent(compact, record, 'last_trigger_source');
  copyIfPresent(compact, record, 'orchestrator');
  copyIfPresent(compact, record, 'workflow_status');
  copyIfPresent(compact, record, 'canonical_jobs_count');
  copyIfPresent(compact, record, 'canonical_jobs_created');
  copyIfPresent(compact, record, 'canonical_jobs_updated');
  copyIfPresent(compact, record, 'duplicate_count');
  copyIfPresent(compact, record, 'prefilter_survivors_count');
  copyIfPresent(compact, record, 'prefilter_rejected_count');
  copyIfPresent(compact, record, 'prefilter_rejections_by_reason');
  copyIfPresent(compact, record, 'ranking_candidate_count');
  copyIfPresent(compact, record, 'ranking_status');
  copyIfPresent(compact, record, 'ranking_error');
  copyIfPresent(compact, record, 'ranking_model');
  copyIfPresent(compact, record, 'ranked_items_materialized');

  return compact;
}

const JOB_FEED_CLEANUP_COMPACTION_BATCH = 200;

export async function compactOldRunMetadata(cutoff: string): Promise<number> {
  const db = await getDb();
  // Bounded per pass, so a large backlog cannot blow the per-invocation
  // subrequest cap. The filter is what makes the bound drain: rows a previous
  // pass already compacted leave the result set, so each night takes the next
  // slice instead of refetching the same one and skipping all of it.
  const rows = await db
    .select({ id: jobFeedRuns.id, metadata: jobFeedRuns.metadata })
    .from(jobFeedRuns)
    .where(and(
      eq(jobFeedRuns.status, 'completed'),
      lt(jobFeedRuns.completed_at, cutoff),
      sql`json_extract(${jobFeedRuns.metadata}, '$.cleanup_compacted_at') is null`,
    ))
    .orderBy(jobFeedRuns.completed_at)
    .limit(JOB_FEED_CLEANUP_COMPACTION_BATCH);
  let compacted = 0;
  for (const row of rows) {
    // Skip rows a previous pass already compacted, otherwise every historical
    // run is rewritten on every nightly run, forever.
    if (isCompactedRunMetadata(row.metadata as Json)) continue;
    const now = nowIso();
    await db
      .update(jobFeedRuns)
      .set({ metadata: compactRunMetadata(row.metadata as Json, now), updated_at: now })
      .where(eq(jobFeedRuns.id, row.id));
    compacted += 1;
  }
  return compacted;
}

const USER_ID_TABLES = [
  chatMessages,
  creditReservations,
  jobFeedApplicationGenerationEvents,
  jobFeedApplicationGenerations,
  jobFeedFeedback,
  jobFeedRankedItems,
  jobFeedRawFetches,
  jobFeedRuns,
  jobFeedSettings,
  userCvSuggestions,
  userJobPreferences,
  userCareerProfiles,
  userSearchStrategies,
  userNotifications,
  applicationSessions,
  documents,
  profilePhotos,
  connectedAccounts,
  userCredits,
  creditTransactions,
  subscriptions,
  messageFeedback,
] as const;

/** Bound every cron batch; CAS claims make the remainder safe to pick up next run. */
export const CRON_BATCH_LIMIT = 200;

/**
 * Users welcomed between `welcomeFloorIso` and `welcomeCutoffIso` who have not
 * been checked in. The floor stops a fresh import (welcome_sent_at months old,
 * check_in_sent_at NULL) from mass-mailing historical users on the first run.
 */
export async function listCheckInCandidates(welcomeCutoffIso: string, welcomeFloorIso: string): Promise<Array<{
  id: string;
  email: string;
  full_name: string | null;
  auth_name: string;
}>> {
  const db = await getDb();
  return db
    .select({
      id: profiles.id,
      email: authUsers.email,
      full_name: profiles.full_name,
      auth_name: authUsers.name,
    })
    .from(profiles)
    .innerJoin(authUsers, eq(authUsers.id, profiles.id))
    .where(and(
      isNull(profiles.check_in_sent_at),
      sql`${profiles.welcome_sent_at} is not null`,
      lte(profiles.welcome_sent_at, welcomeCutoffIso),
      gte(profiles.welcome_sent_at, welcomeFloorIso),
      eq(authUsers.emailVerified, true),
    ))
    .orderBy(profiles.welcome_sent_at)
    .limit(CRON_BATCH_LIMIT);
}

export interface TrackerReminderCandidate {
  id: string;
  user_id: string;
  status: string;
  company: string | null;
  job_title: string | null;
  created_at: string | null;
  interview_at: string | null;
  follow_up_due_at: string | null;
  email: string;
  full_name: string | null;
  timezone: string | null;
}

/**
 * Interviews starting inside the reminder window whose owner still wants the
 * email. `interview_reminder_sent_at` is the guard: one date, one reminder.
 */
export async function listInterviewReminderCandidates(
  fromIso: string,
  toIso: string,
): Promise<TrackerReminderCandidate[]> {
  const db = await getDb();
  return db
    .select({
      id: applicationSessions.id,
      user_id: applicationSessions.user_id,
      status: applicationSessions.status,
      company: applicationSessions.company,
      job_title: applicationSessions.job_title,
      created_at: applicationSessions.created_at,
      interview_at: applicationSessions.interview_at,
      follow_up_due_at: applicationSessions.follow_up_due_at,
      email: authUsers.email,
      full_name: profiles.full_name,
      timezone: profiles.timezone,
    })
    .from(applicationSessions)
    .innerJoin(profiles, eq(profiles.id, applicationSessions.user_id))
    .innerJoin(authUsers, eq(authUsers.id, applicationSessions.user_id))
    .where(and(
      eq(applicationSessions.status, 'interview'),
      isNull(applicationSessions.interview_reminder_sent_at),
      sql`${applicationSessions.interview_at} is not null`,
      gte(applicationSessions.interview_at, fromIso),
      lt(applicationSessions.interview_at, toIso),
      eq(profiles.notify_interview_tomorrow, true),
      eq(authUsers.emailVerified, true),
    ))
    .orderBy(applicationSessions.interview_at)
    .limit(CRON_BATCH_LIMIT);
}

/** Follow-ups due by the end of the window, same one-reminder-per-date guard. */
/**
 * Follow-ups that have come due, plus the ones that never got a stored date.
 * An Applied row from before follow_up_due_at was written still shows the user
 * a follow-up date derived from created_at, so the sweep has to see it too or
 * the email the Notifications toggle promises never arrives. The sweep derives
 * it with the same helper the tracker does, so the two agree to within a day:
 * addBusinessDays walks with runtime-local date methods, which is UTC on the
 * Worker and the reader's own zone in the browser, so a created_at near a day
 * boundary can land the two on different weekdays; the two created_at bounds are only a coarse band so the query
 * does not drag in rows that cannot possibly be due yet, and does not drag in
 * every Applied row ever written. Without the lower bound the first sweep after
 * this shipped would have mailed 97 rows going back five months.
 */
export async function listFollowUpReminderCandidates(
  toIso: string,
  createdBeforeIso: string,
  createdAfterIso: string,
): Promise<TrackerReminderCandidate[]> {
  const db = await getDb();
  return db
    .select({
      id: applicationSessions.id,
      user_id: applicationSessions.user_id,
      status: applicationSessions.status,
      company: applicationSessions.company,
      job_title: applicationSessions.job_title,
      created_at: applicationSessions.created_at,
      interview_at: applicationSessions.interview_at,
      follow_up_due_at: applicationSessions.follow_up_due_at,
      email: authUsers.email,
      full_name: profiles.full_name,
      timezone: profiles.timezone,
    })
    .from(applicationSessions)
    .innerJoin(profiles, eq(profiles.id, applicationSessions.user_id))
    .innerJoin(authUsers, eq(authUsers.id, applicationSessions.user_id))
    .where(and(
      inArray(applicationSessions.status, ['applied', 'follow_up']),
      isNull(applicationSessions.follow_up_reminder_sent_at),
      or(
        and(
          sql`${applicationSessions.follow_up_due_at} is not null`,
          lte(applicationSessions.follow_up_due_at, toIso),
        ),
        and(
          isNull(applicationSessions.follow_up_due_at),
          eq(applicationSessions.status, 'applied'),
          lte(applicationSessions.created_at, createdBeforeIso),
          gte(applicationSessions.created_at, createdAfterIso),
        ),
      ),
      eq(profiles.notify_follow_up_due, true),
      eq(authUsers.emailVerified, true),
    ))
    .orderBy(sql`coalesce(${applicationSessions.follow_up_due_at}, ${applicationSessions.created_at})`)
    .limit(CRON_BATCH_LIMIT);
}

/**
 * Offers with a respond-by date that has come due. Its own query because an
 * offer deadline is always a date the user picked: there is no created_at
 * fallback to derive and nothing to backfill.
 *
 * The claim reuses `follow_up_reminder_sent_at`, which is safe because a row
 * holds one status at a time and entering Offer clears the guard.
 * `notify_follow_up_due` gates it, so Notifications says "a follow-up or offer
 * deadline is due" rather than promising a toggle that does not exist.
 *
 * `fromIso` is not optional. Offer is terminal, so nobody moves a row out of it:
 * without a floor a dead deadline stays a live candidate forever, and the day a
 * user verifies their email or turns the toggle back on the whole backlog goes
 * out at once, oldest first, pushing real reminders off the end of the batch.
 */
export async function listOfferDeadlineCandidates(
  toIso: string,
  fromIso: string,
): Promise<TrackerReminderCandidate[]> {
  const db = await getDb();
  return db
    .select({
      id: applicationSessions.id,
      user_id: applicationSessions.user_id,
      status: applicationSessions.status,
      company: applicationSessions.company,
      job_title: applicationSessions.job_title,
      created_at: applicationSessions.created_at,
      interview_at: applicationSessions.interview_at,
      follow_up_due_at: applicationSessions.follow_up_due_at,
      email: authUsers.email,
      full_name: profiles.full_name,
      timezone: profiles.timezone,
    })
    .from(applicationSessions)
    .innerJoin(profiles, eq(profiles.id, applicationSessions.user_id))
    .innerJoin(authUsers, eq(authUsers.id, applicationSessions.user_id))
    .where(and(
      eq(applicationSessions.status, 'accepted'),
      isNull(applicationSessions.follow_up_reminder_sent_at),
      sql`${applicationSessions.follow_up_due_at} is not null`,
      lte(applicationSessions.follow_up_due_at, toIso),
      gte(applicationSessions.follow_up_due_at, fromIso),
      eq(profiles.notify_follow_up_due, true),
      eq(authUsers.emailVerified, true),
    ))
    .orderBy(applicationSessions.follow_up_due_at)
    .limit(CRON_BATCH_LIMIT);
}

/**
 * Claims one reminder. The conditional update is the lock: a second run, or a
 * second Worker, gets false and sends nothing.
 */
export async function claimTrackerReminder(
  sessionId: string,
  kind: 'interview' | 'follow_up',
  sentAt: string,
): Promise<boolean> {
  const db = await getDb();
  const result = kind === 'interview'
    ? await db
        .update(applicationSessions)
        .set({ interview_reminder_sent_at: sentAt, updated_at: nowIso() })
        .where(and(eq(applicationSessions.id, sessionId), isNull(applicationSessions.interview_reminder_sent_at)))
        .returning({ id: applicationSessions.id })
    : await db
        .update(applicationSessions)
        .set({ follow_up_reminder_sent_at: sentAt, updated_at: nowIso() })
        .where(and(eq(applicationSessions.id, sessionId), isNull(applicationSessions.follow_up_reminder_sent_at)))
        .returning({ id: applicationSessions.id });
  return result.length > 0;
}

/** Releases a claim so the next run retries after a transient send failure. */
export async function releaseTrackerReminderClaim(
  sessionId: string,
  kind: 'interview' | 'follow_up',
  claimedAt: string,
): Promise<void> {
  const db = await getDb();
  // Matching the timestamp means a claim taken by another run, or a guard the
  // user's own status change already re-armed, is left alone.
  await db
    .update(applicationSessions)
    .set(
      kind === 'interview'
        ? { interview_reminder_sent_at: null, updated_at: nowIso() }
        : { follow_up_reminder_sent_at: null, updated_at: nowIso() },
    )
    .where(and(
      eq(applicationSessions.id, sessionId),
      kind === 'interview'
        ? eq(applicationSessions.interview_reminder_sent_at, claimedAt)
        : eq(applicationSessions.follow_up_reminder_sent_at, claimedAt),
    ));
}

export async function listUnverifiedAuthUsers(
  createdBefore: Date = new Date(Date.now() - 24 * 60 * 60 * 1000),
): Promise<
  Array<{ id: string; email: string; name: string; createdAt: Date }>
> {
  const db = await getDb();
  return db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
      createdAt: authUsers.createdAt,
    })
    .from(authUsers)
    .where(and(eq(authUsers.emailVerified, false), lt(authUsers.createdAt, createdBefore)))
    // Newest first: capped-out old signups must not crowd out users who still need a nudge.
    .orderBy(desc(authUsers.createdAt))
    .limit(CRON_BATCH_LIMIT);
}

/** Returns the Anthropic user profile ids it removed with the user's rows, for the caller to delete at Anthropic. */
export async function deleteAllUserData(userId: string): Promise<{ anthropicProfileIds: string[] }> {
  const db = await getDb();
  for (const table of USER_ID_TABLES) {
    await db.delete(table).where(eq(table.user_id, userId));
  }
  // One atomic batch: a profile a model call stores before it is returned here, and once `profiles` is gone the FK
  // refuses any later one (that caller deletes its own profile).
  const [anthropicRows] = await db.batch([
    db.delete(anthropicUserProfiles).where(eq(anthropicUserProfiles.user_id, userId)).returning({ profileId: anthropicUserProfiles.profile_id }),
    db.delete(profiles).where(eq(profiles.id, userId)),
  ]);
  return { anthropicProfileIds: anthropicRows.map((row) => row.profileId) };
}
