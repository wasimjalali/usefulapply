import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { MANUAL_JOB_FEED_TRIGGER_SOURCES } from '@/lib/job-feed/constants';
import { chunk, D1_MAX_PARAMS, getDb, nowIso, stripIdentity } from '../client';
import {
  jobFeedApplicationGenerationEvents,
  jobFeedApplicationGenerations,
  jobFeedFeedback,
  jobFeedRankedItems,
  jobFeedRawFetches,
  jobFeedRuns,
  jobFeedSettings,
  userCareerProfiles,
  userJobPreferences,
  userSearchStrategies,
} from '../schema';
import type {
  JobFeedApplicationGeneration,
  JobFeedApplicationGenerationEvent,
  JobFeedApplicationGenerationStatus,
  JobFeedFeedback,
  JobFeedRankedItem,
  JobFeedRawFetch,
  JobFeedRun,
  JobFeedSettings,
  Json,
} from '@/db/types';
import { RevisionConflict } from '@/lib/services/errors';

export async function getSettings(userId: string): Promise<JobFeedSettings | null> {
  const db = await getDb();
  const rows = await db.select().from(jobFeedSettings).where(eq(jobFeedSettings.user_id, userId)).limit(1);
  return (rows[0] as JobFeedSettings | undefined) ?? null;
}

/**
 * Write the settings row. Every write moves `revision` up by one. With `expectedRevision`, the write only
 * happens while the row is still at that revision (a first insert counts as revision 0); otherwise it
 * throws a RevisionConflict carrying the current revision and nothing changes.
 */
export async function upsertSettings(
  userId: string,
  values: Record<string, unknown> & { user_id: string },
  options: { expectedRevision?: number } = {},
): Promise<JobFeedSettings> {
  const db = await getDb();
  const now = nowIso();
  const existing = await getSettings(userId);
  const safe = stripIdentity(values);
  delete safe.revision;
  const { expectedRevision } = options;
  if (existing) {
    const conditions = [eq(jobFeedSettings.user_id, userId)];
    if (expectedRevision !== undefined) conditions.push(eq(jobFeedSettings.revision, expectedRevision));
    const updated = await db
      .update(jobFeedSettings)
      .set({ ...safe, revision: sql`${jobFeedSettings.revision} + 1`, updated_at: now } as never)
      .where(and(...conditions))
      .returning({ revision: jobFeedSettings.revision });
    if (updated.length === 0) {
      const current = await getSettings(userId);
      throw new RevisionConflict(current?.revision ?? null);
    }
  } else {
    if (expectedRevision !== undefined && expectedRevision !== 0) throw new RevisionConflict(null);
    await db.insert(jobFeedSettings).values({
      ...safe,
      user_id: userId,
      created_at: now,
      updated_at: now,
    });
  }
  const row = await getSettings(userId);
  if (!row) throw new Error('Failed to persist job feed settings');
  return row;
}

/**
 * Clears the consent timestamp and pauses the feed. Idempotent: a missing
 * row or an already-cleared one is still a successful withdraw.
 */
export async function withdrawConsent(userId: string): Promise<JobFeedSettings | null> {
  const existing = await getSettings(userId);
  if (!existing) return null;
  if (!existing.consent_accepted_at && !existing.enabled) return existing;

  const db = await getDb();
  await db
    .update(jobFeedSettings)
    .set({
      consent_accepted_at: null,
      enabled: false,
      revision: sql`${jobFeedSettings.revision} + 1`,
      updated_at: nowIso(),
    } as never)
    .where(eq(jobFeedSettings.user_id, userId));

  return getSettings(userId);
}

/**
 * Records an explicit consent assertion on an existing settings row and
 * turns the feed back on. Only those two columns move.
 */
export async function grantConsent(userId: string): Promise<JobFeedSettings> {
  const db = await getDb();
  await db
    .update(jobFeedSettings)
    .set({
      consent_accepted_at: new Date().toISOString(),
      enabled: true,
      revision: sql`${jobFeedSettings.revision} + 1`,
      updated_at: nowIso(),
    } as never)
    .where(eq(jobFeedSettings.user_id, userId));
  const row = await getSettings(userId);
  if (!row) throw new Error('Failed to persist job feed consent');
  return row;
}

export async function getLatestRun(userId: string): Promise<JobFeedRun | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedRuns)
    .where(eq(jobFeedRuns.user_id, userId))
    .orderBy(desc(jobFeedRuns.created_at))
    .limit(1);
  return (rows[0] as JobFeedRun | undefined) ?? null;
}

export async function getRun(userId: string, runId: string): Promise<JobFeedRun | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedRuns)
    .where(and(eq(jobFeedRuns.id, runId), eq(jobFeedRuns.user_id, userId)))
    .limit(1);
  return (rows[0] as JobFeedRun | undefined) ?? null;
}

/** The latest run of a local day: the highest slot. */
export async function getRunByDate(userId: string, localDate: string): Promise<JobFeedRun | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedRuns)
    .where(and(eq(jobFeedRuns.user_id, userId), eq(jobFeedRuns.local_date, localDate)))
    .orderBy(desc(jobFeedRuns.run_slot))
    .limit(1);
  return (rows[0] as JobFeedRun | undefined) ?? null;
}

/** Every run of a local day, latest slot first. */
export async function listRunsByDate(userId: string, localDate: string): Promise<JobFeedRun[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedRuns)
    .where(and(eq(jobFeedRuns.user_id, userId), eq(jobFeedRuns.local_date, localDate)))
    .orderBy(desc(jobFeedRuns.run_slot));
  return rows as JobFeedRun[];
}

export async function getLatestCompletedRun(userId: string): Promise<JobFeedRun | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedRuns)
    .where(and(eq(jobFeedRuns.user_id, userId), eq(jobFeedRuns.status, 'completed')))
    .orderBy(desc(jobFeedRuns.completed_at), desc(jobFeedRuns.created_at))
    .limit(1);
  return (rows[0] as JobFeedRun | undefined) ?? null;
}

export async function getLatestManualCompletedRun(userId: string): Promise<JobFeedRun | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedRuns)
    .where(and(
      eq(jobFeedRuns.user_id, userId),
      eq(jobFeedRuns.status, 'completed'),
      // Never a bare 'manual': the run routes write 'manual_user' and the
      // debug variants, so matching one literal would return nothing.
      inArray(jobFeedRuns.trigger_source, [...MANUAL_JOB_FEED_TRIGGER_SOURCES]),
    ))
    .orderBy(desc(jobFeedRuns.completed_at), desc(jobFeedRuns.created_at))
    .limit(1);
  return (rows[0] as JobFeedRun | undefined) ?? null;
}

export async function insertRun(userId: string, insert: {
  local_date: string;
  run_slot?: number;
  local_timezone: string;
  trigger_source: string;
  idempotency_key: string;
  metadata: Json;
  settings_snapshot?: Json | null;
}): Promise<JobFeedRun> {
  const db = await getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  await db.insert(jobFeedRuns).values({
    id,
    user_id: userId,
    ...insert,
    created_at: now,
    updated_at: now,
  });
  const row = await getRun(userId, id);
  if (!row) throw new Error('Failed to create job feed run');
  return row;
}

export async function updateRun(userId: string, runId: string, updates: Partial<JobFeedRun>): Promise<JobFeedRun> {
  const db = await getDb();
  await db
    .update(jobFeedRuns)
    .set({ ...stripIdentity(updates), updated_at: nowIso() })
    .where(and(eq(jobFeedRuns.id, runId), eq(jobFeedRuns.user_id, userId)));
  const row = await getRun(userId, runId);
  if (!row) throw new Error('Failed to update job feed run');
  return row;
}

export async function claimQueuedRun(
  userId: string,
  runId: string,
  updates: Partial<JobFeedRun>,
): Promise<JobFeedRun | null> {
  const db = await getDb();
  const rows = await db
    .update(jobFeedRuns)
    .set({ ...stripIdentity(updates), status: 'running', updated_at: nowIso() })
    .where(and(
      eq(jobFeedRuns.id, runId),
      eq(jobFeedRuns.user_id, userId),
      eq(jobFeedRuns.status, 'queued'),
    ))
    .returning();
  return (rows[0] as JobFeedRun | undefined) ?? null;
}

/**
 * Put a run that ended badly (failed) or stalled (running) back on the queue. Conditional on the
 * row still being in the state and at the `updated_at` the caller read, so two callers cannot both
 * requeue it, and a run that moved on in the meantime is left alone. Null when the guard missed.
 */
export async function requeueRun(
  userId: string,
  runId: string,
  expected: { status: 'failed' | 'running' | 'completed'; updatedAt: string },
): Promise<JobFeedRun | null> {
  const db = await getDb();
  const rows = await db
    .update(jobFeedRuns)
    .set({ status: 'queued', error_message: null, completed_at: null, updated_at: nowIso() })
    .where(and(
      eq(jobFeedRuns.id, runId),
      eq(jobFeedRuns.user_id, userId),
      eq(jobFeedRuns.status, expected.status),
      eq(jobFeedRuns.updated_at, expected.updatedAt),
    ))
    .returning();
  return (rows[0] as JobFeedRun | undefined) ?? null;
}

/** End a run nobody ever claimed. Conditional on it still being queued, so a run that started is never touched. */
export async function failQueuedRun(userId: string, runId: string, errorMessage: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(jobFeedRuns)
    .set({ status: 'failed', completed_at: nowIso(), error_message: errorMessage, updated_at: nowIso() })
    .where(and(
      eq(jobFeedRuns.id, runId),
      eq(jobFeedRuns.user_id, userId),
      eq(jobFeedRuns.status, 'queued'),
    ))
    .returning({ id: jobFeedRuns.id });
  return rows.length > 0;
}

export async function insertRawFetch(userId: string, insert: Omit<Partial<JobFeedRawFetch>, 'user_id'> & {
  run_id: string;
  query_text: string;
  market: JobFeedRawFetch['market'];
}): Promise<JobFeedRawFetch> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.insert(jobFeedRawFetches).values({
    id,
    user_id: userId,
    fetched_at: now,
    created_at: now,
    ...insert,
  });
  const rows = await db.select().from(jobFeedRawFetches).where(and(eq(jobFeedRawFetches.id, id), eq(jobFeedRawFetches.user_id, userId))).limit(1);
  if (!rows[0]) throw new Error('Failed to persist raw job feed fetch');
  return rows[0] as JobFeedRawFetch;
}

export async function getRankedItem(userId: string, jobId: string, runId?: string | null): Promise<JobFeedRankedItem | null> {
  const db = await getDb();
  const conditions = [eq(jobFeedRankedItems.user_id, userId), eq(jobFeedRankedItems.canonical_job_id, jobId)];
  if (runId) conditions.push(eq(jobFeedRankedItems.run_id, runId));
  const rows = await db
    .select()
    .from(jobFeedRankedItems)
    .where(and(...conditions))
    .orderBy(desc(jobFeedRankedItems.created_at))
    .limit(1);
  return (rows[0] as JobFeedRankedItem | undefined) ?? null;
}

export async function listInboxRankedItems(userId: string, sinceIso: string): Promise<JobFeedRankedItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ item: jobFeedRankedItems })
    .from(jobFeedRankedItems)
    .innerJoin(jobFeedRuns, eq(jobFeedRankedItems.run_id, jobFeedRuns.id))
    .where(and(
      eq(jobFeedRankedItems.user_id, userId),
      eq(jobFeedRuns.user_id, userId),
      eq(jobFeedRuns.status, 'completed'),
      gte(jobFeedRuns.completed_at, sinceIso),
    ))
    .orderBy(desc(jobFeedRuns.created_at), jobFeedRankedItems.rank_position);
  return rows.map((r) => r.item) as JobFeedRankedItem[];
}

/**
 * Ranked rows for a set of canonical jobs, newest run first. Used by the Saved
 * list, which is not scoped to one run, so it can still show a match badge and
 * the ranker's reason for a role bookmarked days ago.
 */
export async function listRankedItemsByJobIds(userId: string, jobIds: string[]): Promise<JobFeedRankedItem[]> {
  if (jobIds.length === 0) return [];
  const db = await getDb();
  const out: JobFeedRankedItem[] = [];
  for (const ids of chunk(jobIds, D1_MAX_PARAMS - 1)) {
    const rows = await db
      .select()
      .from(jobFeedRankedItems)
      .where(and(eq(jobFeedRankedItems.user_id, userId), inArray(jobFeedRankedItems.canonical_job_id, ids)))
      .orderBy(desc(jobFeedRankedItems.created_at)) as JobFeedRankedItem[];
    out.push(...rows);
  }
  return out;
}

// 11 bound values per ranked item row; keep each INSERT under D1's 100-param cap.
const RANKED_ITEMS_ROWS_PER_INSERT = 8;

/**
 * Swap a run's ranked items for a new set. The delete rides in the same batch
 * as the inserts, so a run can never be left with the old list half gone and
 * the new one not yet in. Callers must not pass an empty list: clearing a run
 * without putting a ranking back wipes the user's feed.
 */
export async function replaceRankedItemsForRun(
  userId: string,
  runId: string,
  items: Array<Omit<JobFeedRankedItem, 'id' | 'created_at' | 'user_id' | 'run_id'>>
): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  const now = nowIso();
  const rows = items.map((item) => ({
    id: crypto.randomUUID(),
    created_at: now,
    ...item,
    run_id: runId,
    user_id: userId,
  }));
  const removal = db.delete(jobFeedRankedItems).where(eq(jobFeedRankedItems.run_id, runId));
  const inserts = chunk(rows, RANKED_ITEMS_ROWS_PER_INSERT).map((part) => db.insert(jobFeedRankedItems).values(part));
  await db.batch([removal, ...inserts]);
}

export async function getFeedback(userId: string, jobId: string): Promise<JobFeedFeedback | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedFeedback)
    .where(and(eq(jobFeedFeedback.user_id, userId), eq(jobFeedFeedback.canonical_job_id, jobId)))
    .limit(1);
  return (rows[0] as JobFeedFeedback | undefined) ?? null;
}

export async function getFeedbackBySession(userId: string, sessionId: string): Promise<JobFeedFeedback | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedFeedback)
    .where(and(eq(jobFeedFeedback.user_id, userId), eq(jobFeedFeedback.application_session_id, sessionId)))
    .limit(1);
  return (rows[0] as JobFeedFeedback | undefined) ?? null;
}

export async function listFeedbackForJobs(userId: string, jobIds: string[]): Promise<JobFeedFeedback[]> {
  if (jobIds.length === 0) return [];
  const db = await getDb();
  const out: JobFeedFeedback[] = [];
  for (const ids of chunk(jobIds, D1_MAX_PARAMS - 1)) {
    const rows = await db
      .select()
      .from(jobFeedFeedback)
      .where(and(eq(jobFeedFeedback.user_id, userId), inArray(jobFeedFeedback.canonical_job_id, ids))) as JobFeedFeedback[];
    out.push(...rows);
  }
  return out;
}

export async function listFeedback(userId: string): Promise<JobFeedFeedback[]> {
  const db = await getDb();
  return await db.select().from(jobFeedFeedback).where(eq(jobFeedFeedback.user_id, userId)) as JobFeedFeedback[];
}

export async function upsertFeedback(userId: string, values: Partial<JobFeedFeedback> & { canonical_job_id: string }): Promise<JobFeedFeedback> {
  const db = await getDb();
  const now = nowIso();
  const existing = await getFeedback(userId, values.canonical_job_id);
  if (existing) {
    await db
      .update(jobFeedFeedback)
      .set({ ...stripIdentity(values), updated_at: now })
      .where(and(eq(jobFeedFeedback.id, existing.id), eq(jobFeedFeedback.user_id, userId)));
    const row = await getFeedback(userId, values.canonical_job_id);
    if (!row) throw new Error('Failed to update job feed feedback');
    return row;
  }
  const id = crypto.randomUUID();
  await db.insert(jobFeedFeedback).values({
    ...stripIdentity(values),
    id,
    user_id: userId,
    created_at: now,
    updated_at: now,
  });
  const row = await getFeedback(userId, values.canonical_job_id);
  if (!row) throw new Error('Failed to insert job feed feedback');
  return row;
}

export async function getGeneration(userId: string, generationId: string): Promise<JobFeedApplicationGeneration | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedApplicationGenerations)
    .where(and(eq(jobFeedApplicationGenerations.id, generationId), eq(jobFeedApplicationGenerations.user_id, userId)))
    .limit(1);
  return (rows[0] as JobFeedApplicationGeneration | undefined) ?? null;
}

export async function getLatestGenerationForSession(userId: string, sessionId: string): Promise<JobFeedApplicationGeneration | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedApplicationGenerations)
    .where(and(
      eq(jobFeedApplicationGenerations.user_id, userId),
      eq(jobFeedApplicationGenerations.application_session_id, sessionId),
    ))
    .orderBy(desc(jobFeedApplicationGenerations.updated_at))
    .limit(1);
  return (rows[0] as JobFeedApplicationGeneration | undefined) ?? null;
}

export async function getGenerationBySessionJob(
  userId: string,
  jobId: string,
  sessionId: string,
): Promise<JobFeedApplicationGeneration | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(jobFeedApplicationGenerations)
    .where(and(
      eq(jobFeedApplicationGenerations.user_id, userId),
      eq(jobFeedApplicationGenerations.canonical_job_id, jobId),
      eq(jobFeedApplicationGenerations.application_session_id, sessionId),
    ))
    .limit(1);
  return (rows[0] as JobFeedApplicationGeneration | undefined) ?? null;
}

export async function insertGeneration(userId: string, values: Omit<Partial<JobFeedApplicationGeneration>, 'user_id'> & {
  canonical_job_id: string;
  application_session_id: string;
}): Promise<JobFeedApplicationGeneration> {
  const db = await getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  await db.insert(jobFeedApplicationGenerations).values({
    id,
    user_id: userId,
    intent_created_at: now,
    created_at: now,
    updated_at: now,
    ...values,
  });
  const row = await getGeneration(userId, id);
  if (!row) throw new Error('Failed to create job feed application generation');
  return row;
}

export async function updateGeneration(
  userId: string,
  generationId: string,
  values: Partial<JobFeedApplicationGeneration>,
  extraWhere?: { status?: JobFeedApplicationGenerationStatus },
): Promise<JobFeedApplicationGeneration | null> {
  const db = await getDb();
  const conditions = [
    eq(jobFeedApplicationGenerations.id, generationId),
    eq(jobFeedApplicationGenerations.user_id, userId),
  ];
  if (extraWhere?.status) {
    conditions.push(eq(jobFeedApplicationGenerations.status, extraWhere.status));
  }
  // application_session_id / canonical_job_id / run_id are identity keys too.
  const patch: Record<string, unknown> = { ...stripIdentity(values) };
  delete patch.application_session_id;
  delete patch.canonical_job_id;
  delete patch.run_id;
  const changed = await db
    .update(jobFeedApplicationGenerations)
    .set({ ...patch, updated_at: nowIso() })
    .where(and(...conditions))
    .returning({ id: jobFeedApplicationGenerations.id });
  // null when nothing matched (missing row or a lost status CAS), so callers
  // never mistake an untouched row for a completed transition.
  if (changed.length === 0) return null;
  return getGeneration(userId, generationId);
}

export async function insertGenerationEvent(userId: string, values: {
  generation_id: string;
  from_status: JobFeedApplicationGenerationStatus | null;
  to_status: JobFeedApplicationGenerationStatus;
  attempt: number;
  transition_reason?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  metadata?: Json;
}): Promise<JobFeedApplicationGenerationEvent> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.insert(jobFeedApplicationGenerationEvents).values({
    id,
    user_id: userId,
    created_at: now,
    ...values,
  });
  const rows = await db
    .select()
    .from(jobFeedApplicationGenerationEvents)
    .where(and(eq(jobFeedApplicationGenerationEvents.id, id), eq(jobFeedApplicationGenerationEvents.user_id, userId)))
    .limit(1);
  if (!rows[0]) throw new Error('Failed to insert generation event');
  return rows[0] as JobFeedApplicationGenerationEvent;
}

export async function getCareerProfileRow(userId: string): Promise<{ profile: Json; version: number; source_document_updated_at: string | null } | null> {
  const db = await getDb();
  const rows = await db.select().from(userCareerProfiles).where(eq(userCareerProfiles.user_id, userId)).limit(1);
  if (!rows[0]) return null;
  return {
    profile: rows[0].profile as Json,
    version: rows[0].version,
    source_document_updated_at: rows[0].source_document_updated_at,
  };
}

export async function upsertCareerProfile(userId: string, values: {
  profile: Json;
  version: number;
  source_document_id?: string | null;
  source_document_updated_at?: string | null;
  model_provider?: string | null;
  model_name?: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  const existing = await getCareerProfileRow(userId);
  if (existing) {
    await db.update(userCareerProfiles).set({ ...values, updated_at: now }).where(eq(userCareerProfiles.user_id, userId));
    return;
  }
  await db.insert(userCareerProfiles).values({
    user_id: userId,
    created_at: now,
    updated_at: now,
    ...values,
  });
}

export async function getSearchStrategyRow(userId: string, settingsHash: string): Promise<{
  strategy: Json;
  version: number;
  source_profile_generated_at: string | null;
} | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userSearchStrategies)
    .where(and(eq(userSearchStrategies.user_id, userId), eq(userSearchStrategies.settings_hash, settingsHash)))
    .limit(1);
  if (!rows[0]) return null;
  return {
    strategy: rows[0].strategy as Json,
    version: rows[0].version,
    source_profile_generated_at: rows[0].source_profile_generated_at,
  };
}

export async function getLatestSearchStrategyRow(userId: string): Promise<{
  strategy: Json;
  version: number;
  settings_hash: string;
  source_profile_generated_at: string | null;
} | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userSearchStrategies)
    .where(eq(userSearchStrategies.user_id, userId))
    .orderBy(desc(userSearchStrategies.updated_at))
    .limit(1);
  if (!rows[0]) return null;
  return {
    strategy: rows[0].strategy as Json,
    version: rows[0].version,
    settings_hash: rows[0].settings_hash,
    source_profile_generated_at: rows[0].source_profile_generated_at,
  };
}

export async function upsertSearchStrategy(userId: string, values: {
  settings_hash: string;
  strategy: Json;
  version: number;
  source_profile_generated_at?: string | null;
  model_provider?: string | null;
  model_name?: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  const existing = await getSearchStrategyRow(userId, values.settings_hash);
  if (existing) {
    await db
      .update(userSearchStrategies)
      .set({ ...values, updated_at: now })
      .where(and(eq(userSearchStrategies.user_id, userId), eq(userSearchStrategies.settings_hash, values.settings_hash)));
    return;
  }
  await db.insert(userSearchStrategies).values({
    user_id: userId,
    created_at: now,
    updated_at: now,
    ...values,
  });
}

export async function listSavedFeedback(userId: string): Promise<JobFeedFeedback[]> {
  const db = await getDb();
  return await db
    .select()
    .from(jobFeedFeedback)
    .where(and(eq(jobFeedFeedback.user_id, userId), sql`${jobFeedFeedback.saved_at} is not null`))
    .orderBy(desc(jobFeedFeedback.saved_at)) as JobFeedFeedback[];
}

export type UserJobPreferences = typeof userJobPreferences.$inferSelect;

export async function getJobPreferences(userId: string): Promise<UserJobPreferences | null> {
  const db = await getDb();
  const rows = await db.select().from(userJobPreferences).where(eq(userJobPreferences.user_id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertJobPreferences(
  userId: string,
  values: Omit<Partial<UserJobPreferences>, 'user_id' | 'created_at' | 'updated_at'>,
): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db
    .insert(userJobPreferences)
    .values({ ...values, user_id: userId, created_at: now, updated_at: now })
    .onConflictDoUpdate({
      target: userJobPreferences.user_id,
      set: { ...values, updated_at: now },
    });
}
