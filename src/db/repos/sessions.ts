/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
import { getDb, nowIso, stripIdentity } from '../client';
import { applicationSessions, chatCompactions, chatMessages } from '../schema';
import { withRecipientReset } from '../session-recipient-reset';
import type { JobFeedGenerationStatus } from '@/db/types';
import { RevisionConflict } from '@/lib/services/errors';
import { isChatMessageId } from '@/lib/chat-message-id';

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
  interview_at?: string | null;
  follow_up_due_at?: string | null;
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
  updates: Partial<Omit<ApplicationSession, 'id' | 'user_id' | 'created_at' | 'screening_turns_used' | 'revision'>>,
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
    // rowid breaks ties: the sync can insert several rows in the same millisecond, and the chat route's history
    // (and its cache prefix) needs one fixed order.
    .orderBy(asc(chatMessages.created_at), sql`rowid`);
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
  message: { id?: string; role: 'user' | 'assistant' | 'system'; content: string; actions?: unknown[] },
): Promise<{ message: ChatMessage | null; error: Error | null }> {
  if (message.id !== undefined) return upsertChatMessage(userId, sessionId, { ...message, id: message.id });
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

/**
 * The client's write of a message it named (src/lib/chat-message-id.ts). The chat route may have stored the same
 * row already (the user's turn, or the reply under the id it returned), so a conflict on the id updates the text and
 * the actions instead of failing: the client's copy is what the user saw (a reply can carry a note the client added).
 * Only a row of this user, this application and the same role is ever updated, and only into an application the user
 * owns; anything else comes back as an error.
 */
async function upsertChatMessage(
  userId: string,
  sessionId: string,
  message: { id: string; role: 'user' | 'assistant' | 'system'; content: string; actions?: unknown[] },
): Promise<{ message: ChatMessage | null; error: Error | null }> {
  if (!isChatMessageId(message.id)) return { message: null, error: new Error('Invalid chat message id') };
  const db = await getDb();
  await db.run(sql`
    INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at)
    SELECT ${message.id}, s.id, s.user_id, ${message.role}, ${message.content}, ${JSON.stringify(message.actions ?? [])}, ${nowIso()}
    FROM application_sessions s
    WHERE s.id = ${sessionId} AND s.user_id = ${userId}
    ON CONFLICT(id) DO UPDATE SET content = excluded.content, actions = excluded.actions
    WHERE chat_messages.user_id = excluded.user_id
      AND chat_messages.session_id = excluded.session_id
      AND chat_messages.role = excluded.role
  `);
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(
      eq(chatMessages.id, message.id),
      eq(chatMessages.user_id, userId),
      eq(chatMessages.session_id, sessionId),
      eq(chatMessages.role, message.role),
    ))
    .limit(1);
  const row = rows[0] as ChatMessage | undefined;
  return { message: row ?? null, error: row ? null : new Error('Failed to add chat message') };
}

export type ChatTurnClaim =
  | { ok: true }
  | { ok: false; reason: 'cap_reached' | 'id_taken' | 'not_found' };

/**
 * The chat route stores the user's new message before it calls the model, and only while the application has
 * fewer than `cap` user messages besides this one. Each message is claimed for one model turn exactly once
 * (`claimed_at`), so reusing the id of a message that was already answered cannot buy another turn, and two requests
 * with the same id cannot both run. The client's sync writes the same row under the same id (upsertChatMessage), so
 * the row may already be there unclaimed: then the same statement claims it, if it holds this exact text. One
 * statement either way, so two requests at once cannot both take the last slot.
 */
export async function claimUserChatTurn(
  userId: string,
  sessionId: string,
  message: { id: string; content: string },
  cap: number,
): Promise<ChatTurnClaim> {
  if (!isChatMessageId(message.id)) return { ok: false, reason: 'id_taken' };
  const db = await getDb();
  const now = nowIso();
  const claimed = await db.run(sql`
    INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at, claimed_at)
    SELECT ${message.id}, s.id, s.user_id, 'user', ${message.content}, '[]', ${now}, ${now}
    FROM application_sessions s
    WHERE s.id = ${sessionId} AND s.user_id = ${userId}
      AND (
        SELECT count(*) FROM chat_messages m
        WHERE m.session_id = s.id AND m.user_id = s.user_id AND m.role = 'user' AND m.id != ${message.id}
      ) < ${cap}
    ON CONFLICT(id) DO UPDATE SET claimed_at = excluded.claimed_at
    WHERE chat_messages.claimed_at IS NULL
      AND chat_messages.user_id = excluded.user_id
      AND chat_messages.session_id = excluded.session_id
      AND chat_messages.role = 'user'
      AND chat_messages.content = excluded.content
  `);
  if (claimed.meta.changes === 1) return { ok: true };

  // Nothing written: say why, for the route's answer.
  const existing = await db
    .select({ user_id: chatMessages.user_id })
    .from(chatMessages)
    .where(eq(chatMessages.id, message.id))
    .limit(1);
  // Someone else's id, this user's message already claimed, or the id of a different text.
  if (existing[0]) {
    if (existing[0].user_id !== userId) return { ok: false, reason: 'id_taken' };
    const mine = await db
      .select({ claimed_at: chatMessages.claimed_at, session_id: chatMessages.session_id, role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(and(eq(chatMessages.id, message.id), eq(chatMessages.user_id, userId)))
      .limit(1);
    const row = mine[0];
    if (!row || row.claimed_at !== null || row.session_id !== sessionId || row.role !== 'user' || row.content !== message.content) {
      return { ok: false, reason: 'id_taken' };
    }
  }
  const owned = await db
    .select({ id: applicationSessions.id })
    .from(applicationSessions)
    .where(and(eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)))
    .limit(1);
  return { ok: false, reason: owned[0] ? 'cap_reached' : 'not_found' };
}

/**
 * The reply the chat route stores under the id it returns to the client, so the next turn's history has it even
 * when the user answers before the client's sync runs. Into an application the user owns, or nothing. Returns false
 * when nothing was written (the application is gone, or the id is taken): the client only learns the id from the
 * response, so its sync can never have written it first.
 */
export async function storeChatReply(
  userId: string,
  sessionId: string,
  message: { id: string; content: string; actions: unknown[] },
  /**
   * The user message this replies to. The reply sorts 1 ms after it, so a turn that finishes after the user already
   * sent the next message (a streamed turn keeps running when its client leaves) still reads in order. Without it, or
   * when that row is gone, the reply sorts at the time it is written.
   */
  afterMessageId?: string,
): Promise<boolean> {
  if (!isChatMessageId(message.id)) throw new Error('storeChatReply: invalid chat message id');
  const db = await getDb();
  const createdAt = afterMessageId
    ? sql`COALESCE((
        SELECT strftime('%Y-%m-%dT%H:%M:%fZ', julianday(u.created_at) + 0.001 / 86400.0)
        FROM chat_messages u
        WHERE u.id = ${afterMessageId} AND u.session_id = s.id AND u.user_id = s.user_id
      ), ${nowIso()})`
    : sql`${nowIso()}`;
  const stored = await db.run(sql`
    INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at)
    SELECT ${message.id}, s.id, s.user_id, 'assistant', ${message.content}, ${JSON.stringify(message.actions)}, ${createdAt}
    FROM application_sessions s
    WHERE s.id = ${sessionId} AND s.user_id = ${userId}
    ON CONFLICT(id) DO NOTHING
  `);
  return stored.meta.changes === 1;
}

export async function clearChatMessages(userId: string, sessionId: string): Promise<{ error: Error | null }> {
  const db = await getDb();
  await db.delete(chatMessages).where(and(eq(chatMessages.session_id, sessionId), eq(chatMessages.user_id, userId)));
  // The summary of a cleared conversation goes with it (the chat route would drop it as stale on the next turn anyway).
  await db.delete(chatCompactions).where(and(eq(chatCompactions.session_id, sessionId), eq(chatCompactions.user_id, userId)));
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

/**
 * Company and title of every application a user has, drafts included, for keeping jobs already in the
 * tracker out of the job feed. Newest first, capped well above any real tracker.
 */
export async function listApplicationIdentities(userId: string): Promise<Array<{ id: string; company: string | null; job_title: string | null }>> {
  const db = await getDb();
  return db
    .select({ id: applicationSessions.id, company: applicationSessions.company, job_title: applicationSessions.job_title })
    .from(applicationSessions)
    .where(eq(applicationSessions.user_id, userId))
    .orderBy(desc(applicationSessions.created_at))
    .limit(2000);
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
        // The four canonical columns, then the generated_artifacts fallback getKit reads for rows a
        // headless run or an older build left only there, so the list and get_application agree.
        has_kit: sql<number>`(
          ${applicationSessions.generated_cv} is not null or ${applicationSessions.cover_letter} is not null
          or ${applicationSessions.email} is not null or ${applicationSessions.follow_up_email} is not null
          or json_type(${applicationSessions.generated_artifacts}, '$.optimizedCV') = 'object'
          or json_type(${applicationSessions.generated_artifacts}, '$.optimizedCVData') = 'object'
          or (json_type(${applicationSessions.generated_artifacts}, '$.coverLetter') = 'text'
              and trim(json_extract(${applicationSessions.generated_artifacts}, '$.coverLetter')) != '')
          or json_type(${applicationSessions.generated_artifacts}, '$.applicationEmail') = 'object'
          or json_type(${applicationSessions.generated_artifacts}, '$.followUpEmail') = 'object'
        )`,
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

export interface BriefingApplicationRow {
  id: string;
  company: string | null;
  job_title: string | null;
  status: string;
  interview_at: string | null;
  follow_up_due_at: string | null;
  generation_status: string;
  generation_error: string | null;
  updated_at: string;
}

/**
 * The applications that need a look today: a follow-up that came due, an interview in the coming
 * window, a generation that is still going, or one that failed since `failedSince`.
 */
export async function listBriefingApplications(
  userId: string,
  window: { now: string; interviewUntil: string; failedSince: string },
): Promise<BriefingApplicationRow[]> {
  const db = await getDb();
  return db
    .select({
      id: applicationSessions.id,
      company: applicationSessions.company,
      job_title: applicationSessions.job_title,
      status: applicationSessions.status,
      interview_at: applicationSessions.interview_at,
      follow_up_due_at: applicationSessions.follow_up_due_at,
      generation_status: applicationSessions.generation_status,
      generation_error: applicationSessions.generation_error,
      updated_at: applicationSessions.updated_at,
    })
    .from(applicationSessions)
    .where(and(
      eq(applicationSessions.user_id, userId),
      or(
        and(
          inArray(applicationSessions.status, ['applied', 'follow_up']),
          isNotNull(applicationSessions.follow_up_due_at),
          lte(applicationSessions.follow_up_due_at, window.now),
        ),
        and(
          isNotNull(applicationSessions.interview_at),
          gte(applicationSessions.interview_at, window.now),
          lte(applicationSessions.interview_at, window.interviewUntil),
        ),
        inArray(applicationSessions.generation_status, ['pending', 'running']),
        and(
          eq(applicationSessions.generation_status, 'failed'),
          gte(applicationSessions.generation_failed_at, window.failedSince),
        ),
      ),
    ))
    .orderBy(desc(applicationSessions.updated_at))
    .limit(200);
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
