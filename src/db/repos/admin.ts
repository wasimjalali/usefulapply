/**
 * Cross-user / catalog queries. Only imported by cron handlers and the
 * Stripe webhook. Everything else must go through a user-scoped repo.
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { chunk, D1_MAX_PARAMS, isUniqueViolation, getDb, nowIso } from '../client';
import {
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
    .where(and(eq(creditReservations.status, 'reserved'), lt(creditReservations.reserved_at, cutoffIso)))
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
  const result = await db.delete(jobFeedRankedItems).where(inArray(jobFeedRankedItems.run_id, expiredRunIds));
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

export async function compactOldRunMetadata(cutoff: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: jobFeedRuns.id, metadata: jobFeedRuns.metadata })
    .from(jobFeedRuns)
    .where(and(eq(jobFeedRuns.status, 'completed'), lt(jobFeedRuns.completed_at, cutoff)));
  let compacted = 0;
  for (const row of rows) {
    await db
      .update(jobFeedRuns)
      .set({ metadata: { compacted: true }, updated_at: nowIso() })
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

export async function deleteAllUserData(userId: string): Promise<void> {
  const db = await getDb();
  for (const table of USER_ID_TABLES) {
    await db.delete(table).where(eq(table.user_id, userId));
  }
  await db.delete(profiles).where(eq(profiles.id, userId));
}
