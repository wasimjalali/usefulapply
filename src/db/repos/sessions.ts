/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { getDb, nowIso, stripIdentity } from '../client';
import { applicationSessions, chatMessages } from '../schema';
import { withRecipientReset } from '../session-recipient-reset';
import type { JobFeedGenerationStatus } from '@/lib/supabase/types';
import { RevisionConflict } from '@/lib/services/errors';

export interface ApplicationSession {
  id: string;
  user_id: string;
  job_title?: string | null;
  company?: string | null;
  job_description: string;
  job_url?: string | null;
  match_score?: number | null;
  matching_skills: string[];
  missing_skills: string[];
  suggestions: string[];
  requirements?: any;
  gaps?: any;
  generated_cv?: any;
  cover_letter?: any;
  email?: any;
  follow_up_email?: any;
  company_research?: any;
  company_address?: string | null;
  company_contact_person?: string | null;
  cv_edits: any;
  optimized_pdf_path?: string | null;
  optimized_cv_text?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  selected_template?: string;
  status?: 'drafted' | 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up';
  cover_letter_language?: string;
  fit_assessment?: any;
  generation_completed?: boolean;
  generation_status?: JobFeedGenerationStatus;
  generation_error?: string | null;
  generation_started_at?: string | null;
  generation_completed_at?: string | null;
  generation_failed_at?: string | null;
  generation_cancelled_at?: string | null;
  generated_artifacts?: any;
  screening_turns_used?: number;
  prep_turns_used?: number;
  /** Bumped by every write to the application's content. See `updateSession`. */
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actions?: any[];
  created_at: string;
}

export async function getSessions(userId: string): Promise<ApplicationSession[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(applicationSessions)
    .where(eq(applicationSessions.user_id, userId))
    .orderBy(desc(applicationSessions.created_at));
  return rows as ApplicationSession[];
}

export async function getSession(userId: string, sessionId: string): Promise<ApplicationSession | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(applicationSessions)
    .where(and(eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)))
    .limit(1);
  return (rows[0] as ApplicationSession | undefined) ?? null;
}

export async function createSession(
  userId: string,
  jobDescription: string,
  extras?: Partial<ApplicationSession>,
): Promise<{ session: ApplicationSession | null; error: Error | null }> {
  const db = await getDb();
  const now = nowIso();
  const id = extras?.id ?? crypto.randomUUID();
  await db.insert(applicationSessions).values({
    id,
    user_id: userId,
    job_description: jobDescription,
    job_title: extras?.job_title ?? null,
    company: extras?.company ?? null,
    job_url: extras?.job_url ?? null,
    matching_skills: extras?.matching_skills ?? [],
    missing_skills: extras?.missing_skills ?? [],
    suggestions: extras?.suggestions ?? [],
    cv_edits: (extras?.cv_edits ?? []) as never[],
    created_at: now,
    updated_at: now,
  });
  const session = await getSession(userId, id);
  return { session, error: session ? null : new Error('Failed to create session') };
}

/**
 * The turn counters are server-owned: only claimScreeningTurn writes them. They
 * are dropped here as well as typed out of the signature, because this update
 * runs from a server action and takes whatever JSON the client sent.
 */
function stripServerOwnedCounters(values: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...values };
  delete rest.screening_turns_used;
  delete rest.prep_turns_used;
  return rest;
}

export interface UpdateSessionOptions {
  /**
   * Only write if the application is still at this revision. A miss comes back
   * as a `RevisionConflict` in `error` and nothing is written.
   */
  expectedRevision?: number;
  /**
   * Whether this write bumps the revision. Defaults to true, so a writer that
   * forgets to think about it still invalidates every stale tab. Pass false
   * only for pure workflow-state columns (generation_*, the pending-fit stash)
   * that no editor ever writes back: bumping on those would make a web
   * session conflict with its own generation.
   */
  bumpRevision?: boolean;
}

export async function updateSession(
  userId: string,
  sessionId: string,
  updates: Partial<Omit<ApplicationSession, 'id' | 'user_id' | 'created_at' | 'screening_turns_used' | 'prep_turns_used' | 'revision'>>,
  options: UpdateSessionOptions = {},
): Promise<{ error: Error | null; revision?: number }> {
  const db = await getDb();
  const bump = options.bumpRevision !== false;
  // `updates` can arrive from a server action and must never re-parent the row
  // or set the revision itself. A job description change clears the cover
  // letter recipient columns in the same statement (db/session-recipient-reset.ts).
  const values = withRecipientReset(stripServerOwnedCounters(stripIdentity(updates as Record<string, unknown>)));
  delete values.revision;
  const conditions = [eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)];
  if (options.expectedRevision !== undefined) {
    conditions.push(eq(applicationSessions.revision, options.expectedRevision));
  }
  const updated = await db
    .update(applicationSessions)
    .set({
      ...values,
      ...(bump ? { revision: sql`${applicationSessions.revision} + 1` } : {}),
      updated_at: nowIso(),
    } as never)
    .where(and(...conditions))
    .returning({ revision: applicationSessions.revision });
  // A write that matched nothing is a failure, not a quiet success, same as
  // setTrackerStatus below. It matters more since the reuse path stopped
  // inserting: without this, a generation landing on a row that is no longer
  // there would vanish behind a success log.
  if (updated.length === 0) {
    if (options.expectedRevision !== undefined) {
      const current = await getSessionRevision(userId, sessionId);
      if (current) return { error: new RevisionConflict(current.revision) };
    }
    return { error: new Error('Application not found') };
  }
  return { error: null, revision: updated[0].revision };
}

/** Just the revision (and generation state) of one application, for cheap polling. */
export async function getSessionRevision(
  userId: string,
  sessionId: string,
): Promise<{ revision: number; updatedAt: string; generationStatus: string } | null> {
  const db = await getDb();
  const rows = await db
    .select({
      revision: applicationSessions.revision,
      updatedAt: applicationSessions.updated_at,
      generationStatus: applicationSessions.generation_status,
    })
    .from(applicationSessions)
    .where(and(eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The kit documents a single-document regenerate can write. */
export type RegeneratedKitDocument = 'coverLetter' | 'applicationEmail' | 'followUpEmail';

const KIT_DOCUMENT_ERROR_PATHS: Record<RegeneratedKitDocument, string> = {
  coverLetter: '$.documentErrors.coverLetter',
  applicationEmail: '$.documentErrors.applicationEmail',
  followUpEmail: '$.documentErrors.followUpEmail',
};

/**
 * Remove one document's failure mark from generated_artifacts, in SQL.
 *
 * A partial kit lists its failed documents there. Once a regenerate writes
 * one, its mark goes, so a reload never shows an error for a document that
 * exists. json_remove on the stored value, not a write-back of a snapshot
 * read before the model call: two retries on different documents of one
 * application, or a kit persist landing meanwhile, must not restore each
 * other's marks. Scoped to the owner like every other session write. The
 * path is chosen from a fixed map, never built from input.
 */
export async function clearKitDocumentError(
  userId: string,
  sessionId: string,
  document: RegeneratedKitDocument,
): Promise<void> {
  const db = await getDb();
  const path = KIT_DOCUMENT_ERROR_PATHS[document];
  await db
    .update(applicationSessions)
    .set({ generated_artifacts: sql`json_remove(${applicationSessions.generated_artifacts}, ${path})` as never })
    .where(and(
      eq(applicationSessions.id, sessionId),
      eq(applicationSessions.user_id, userId),
      sql`json_type(${applicationSessions.generated_artifacts}, ${path}) IS NOT NULL`,
    ));
}

export type ScreeningTurnClaim =
  | { ok: true; turnsUsed: number }
  | { ok: false; reason: 'cap_reached' | 'not_found'; turnsUsed: number };

/**
 * Spend one screening turn on an application, server side.
 *
 * The increment and the cap test are one conditional UPDATE, so two requests
 * racing cannot both pass the cap. A miss means either the row is not this
 * user's or the cap is already spent, and the follow-up read tells them apart
 * so the route can answer 404 or 429 rather than one vague number.
 */
export async function claimScreeningTurn(
  userId: string,
  sessionId: string,
  cap: number,
): Promise<ScreeningTurnClaim> {
  const db = await getDb();
  const claimed = await db
    .update(applicationSessions)
    .set({ screening_turns_used: sql`screening_turns_used + 1`, updated_at: nowIso() })
    .where(and(
      eq(applicationSessions.id, sessionId),
      eq(applicationSessions.user_id, userId),
      lt(applicationSessions.screening_turns_used, cap),
    ))
    .returning({ turnsUsed: applicationSessions.screening_turns_used });
  if (claimed[0]) return { ok: true, turnsUsed: claimed[0].turnsUsed };

  const rows = await db
    .select({ turnsUsed: applicationSessions.screening_turns_used })
    .from(applicationSessions)
    .where(and(eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)))
    .limit(1);
  if (!rows[0]) return { ok: false, reason: 'not_found', turnsUsed: 0 };
  return { ok: false, reason: 'cap_reached', turnsUsed: rows[0].turnsUsed };
}

/**
 * Hand a claimed turn back when the model call itself failed. Only the server
 * calls this, on its own error path, so a client that aborts still pays for the
 * turn it started.
 *
 * `claimedTurn` is the value the claim returned, and the release only fires
 * while the counter still reads it. Without that guard a slow failure could
 * take back a turn a second request had already claimed and reported to its
 * own client, leaving the two permanently one apart.
 */
export async function releaseScreeningTurn(
  userId: string,
  sessionId: string,
  claimedTurn: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(applicationSessions)
    .set({ screening_turns_used: sql`screening_turns_used - 1`, updated_at: nowIso() })
    .where(and(
      eq(applicationSessions.id, sessionId),
      eq(applicationSessions.user_id, userId),
      eq(applicationSessions.screening_turns_used, claimedTurn),
    ));
}

export async function deleteSession(
  userId: string,
  sessionId: string,
  expectedRevision?: number,
): Promise<{ error: Error | null }> {
  const db = await getDb();
  const conditions = [eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)];
  if (expectedRevision !== undefined) conditions.push(eq(applicationSessions.revision, expectedRevision));
  const deleted = await db
    .delete(applicationSessions)
    .where(and(...conditions))
    .returning({ id: applicationSessions.id });
  if (deleted.length === 0) {
    if (expectedRevision !== undefined) {
      const current = await getSessionRevision(userId, sessionId);
      if (current) return { error: new RevisionConflict(current.revision) };
    }
    return { error: new Error('Application not found') };
  }
  return { error: null };
}

export async function getChatMessages(userId: string, sessionId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.session_id, sessionId), eq(chatMessages.user_id, userId)))
    .orderBy(asc(chatMessages.created_at));
  return rows as ChatMessage[];
}

export async function countUserChatMessages(userId: string, sessionId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(chatMessages)
    .where(and(
      eq(chatMessages.session_id, sessionId),
      eq(chatMessages.user_id, userId),
      eq(chatMessages.role, 'user'),
    ));
  return Number(rows[0]?.count ?? 0);
}

export async function addChatMessage(
  userId: string,
  sessionId: string,
  message: { role: 'user' | 'assistant' | 'system'; content: string; actions?: unknown[] },
): Promise<{ message: ChatMessage | null; error: Error | null }> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.insert(chatMessages).values({
    id,
    session_id: sessionId,
    user_id: userId,
    role: message.role,
    content: message.content,
    actions: (message.actions ?? []) as never[],
    created_at: now,
  });
  const rows = await db.select().from(chatMessages).where(and(eq(chatMessages.id, id), eq(chatMessages.user_id, userId))).limit(1);
  const row = rows[0] as ChatMessage | undefined;
  return { message: row ?? null, error: row ? null : new Error('Failed to add chat message') };
}

export async function clearChatMessages(userId: string, sessionId: string): Promise<{ error: Error | null }> {
  const db = await getDb();
  await db.delete(chatMessages).where(and(eq(chatMessages.session_id, sessionId), eq(chatMessages.user_id, userId)));
  return { error: null };
}

export interface TrackerApplicationRow {
  id: string;
  company: string | null;
  job_title: string | null;
  match_score: number | null;
  status: string;
  interview_at: string | null;
  follow_up_due_at: string | null;
  /** The revision this row was read at, so a status change can be conditional on it. */
  revision: number;
  created_at: string;
}

/** Enough for any real job hunt, and it bounds the tracker chat prompt. */
export const TRACKER_OVERVIEW_LIMIT = 300;

/**
 * Tracker: every generated session with the fields the count pills, the header
 * line and the conversation's state of play all read. One query so the pills
 * can never disagree with the rows.
 */
export async function listTrackerOverview(userId: string): Promise<TrackerApplicationRow[]> {
  const db = await getDb();
  return db
    .select({
      id: applicationSessions.id,
      company: applicationSessions.company,
      job_title: applicationSessions.job_title,
      match_score: applicationSessions.match_score,
      status: applicationSessions.status,
      interview_at: applicationSessions.interview_at,
      follow_up_due_at: applicationSessions.follow_up_due_at,
      revision: applicationSessions.revision,
      created_at: applicationSessions.created_at,
    })
    .from(applicationSessions)
    .where(and(eq(applicationSessions.user_id, userId), isNotNull(applicationSessions.generated_cv)))
    .orderBy(desc(applicationSessions.created_at))
    .limit(TRACKER_OVERVIEW_LIMIT);
}

export interface ApplicationSummaryRow {
  id: string;
  company: string | null;
  job_title: string | null;
  match_score: number | null;
  status: string;
  interview_at: string | null;
  follow_up_due_at: string | null;
  generation_status: string;
  has_kit: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
}

/**
 * Every application of a user (drafts that only had a fit check included), newest first, as the
 * short rows an agent lists: no job description, no documents. `status` narrows by tracker status.
 */
export async function listApplicationSummaries(
  userId: string,
  options: { status?: string; limit: number; offset: number },
): Promise<{ rows: ApplicationSummaryRow[]; total: number }> {
  const db = await getDb();
  const where = options.status
    ? and(eq(applicationSessions.user_id, userId), eq(applicationSessions.status, options.status))
    : eq(applicationSessions.user_id, userId);
  const [rows, counted] = await Promise.all([
    db
      .select({
        id: applicationSessions.id,
        company: applicationSessions.company,
        job_title: applicationSessions.job_title,
        match_score: applicationSessions.match_score,
        status: applicationSessions.status,
        interview_at: applicationSessions.interview_at,
        follow_up_due_at: applicationSessions.follow_up_due_at,
        generation_status: applicationSessions.generation_status,
        has_kit: sql<number>`(${applicationSessions.generated_cv} is not null or ${applicationSessions.cover_letter} is not null or ${applicationSessions.email} is not null or ${applicationSessions.follow_up_email} is not null)`,
        revision: applicationSessions.revision,
        created_at: applicationSessions.created_at,
        updated_at: applicationSessions.updated_at,
      })
      .from(applicationSessions)
      .where(where)
      .orderBy(desc(applicationSessions.created_at))
      .limit(options.limit)
      .offset(options.offset),
    db.select({ count: sql<number>`count(*)` }).from(applicationSessions).where(where),
  ]);
  return {
    rows: rows.map((row) => ({ ...row, has_kit: Boolean(row.has_kit) })),
    total: Number(counted[0]?.count ?? 0),
  };
}

/**
 * Tracker: move one application to a status, with the date that status implies.
 * `interview_at` and `follow_up_due_at` are always written together so a row
 * never keeps a stale date from the status it just left, and the reminder
 * guards reset so a new date sends a new reminder.
 */
export async function setTrackerStatus(
  userId: string,
  sessionId: string,
  next: { status: string; interview_at: string | null; follow_up_due_at: string | null },
  expectedRevision?: number,
): Promise<{ error: Error | null; revision?: number }> {
  const db = await getDb();
  const conditions = [eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)];
  if (expectedRevision !== undefined) conditions.push(eq(applicationSessions.revision, expectedRevision));
  const updated = await db
    .update(applicationSessions)
    .set({
      status: next.status,
      interview_at: next.interview_at,
      follow_up_due_at: next.follow_up_due_at,
      // A reminder guard clears only when its date actually moved, so
      // re-saving the same date cannot send the same email twice.
      interview_reminder_sent_at: sql`case when coalesce(interview_at, '') = ${next.interview_at ?? ''} then interview_reminder_sent_at else null end`,
      // The follow-up guard also clears when the row crosses into or out of
      // Offer, because the two share this column but are different emails. The
      // popover pins every non-interview date to 09:00 local, so a follow-up
      // already chased and an offer due the same day serialise to the same
      // string, and without this the offer email would be swallowed by a guard
      // set for the follow-up while the popover promised it.
      follow_up_reminder_sent_at: sql`case
        when coalesce(follow_up_due_at, '') <> ${next.follow_up_due_at ?? ''} then null
        when (status = 'accepted') <> (${next.status} = 'accepted') then null
        else follow_up_reminder_sent_at end`,
      revision: sql`${applicationSessions.revision} + 1`,
      updated_at: nowIso(),
    })
    .where(and(...conditions))
    .returning({ revision: applicationSessions.revision });
  // A write that matched nothing is a failure, not a quiet success.
  if (updated.length === 0) {
    if (expectedRevision !== undefined) {
      const current = await getSessionRevision(userId, sessionId);
      if (current) return { error: new RevisionConflict(current.revision) };
    }
    return { error: new Error('Application not found') };
  }
  return { error: null, revision: updated[0].revision };
}
