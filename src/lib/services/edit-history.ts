/**
 * Edit history: the last 10 prior versions of an application's tailored CV and
 * of each document, so an agent's edit can be undone (the MCP `undo_last_edit`
 * tool).
 *
 * `applyRecordedEdit` is a revisioned write that also keeps the value it
 * replaces. The history row, the write and the trim of old rows go in ONE D1
 * batch, and the history row is inserted only while the application is still at
 * the revision the write is conditional on. So a write that loses a race leaves
 * no history, and a history row always has exactly one write behind it.
 *
 * `undoLastEdit` puts the newest prior version back through the same revisioned
 * path: it is conditional on the revision it read, bumps the revision, and
 * conflicts instead of overwriting when something else wrote in between.
 *
 * Rows older than 30 days are removed by the daily cron (`deleteEditHistoryOlderThan`).
 */

import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb, nowIso, runBatch } from '@/db/client';
import { applicationEditHistory } from '@/db/schema';
import * as sessionsRepo from '@/db/repos/sessions';
import { InvalidInputError, NotFoundError, RevisionConflict } from './errors';
import { buildSessionUpdateStatement, kitDocumentColumns, type KitDocumentKey } from './kit';

export const EDIT_GROUPS = ['cv', 'cover_letter', 'email', 'follow_up_email'] as const;
export type EditGroup = (typeof EDIT_GROUPS)[number];

/** Prior versions kept per application and group. */
export const EDIT_HISTORY_KEEP = 10;
export const EDIT_HISTORY_RETENTION_DAYS = 30;

const WRITE_ATTEMPTS = 5;

type Json = Record<string, unknown>;

export interface RecordedEditResult {
  revision: number;
}

/**
 * Write `columns` to an application, keeping the values they replace.
 *
 * With `expectedRevision` the write is strictly conditional on it and throws
 * `RevisionConflict` on a miss. Without it the write takes whatever revision is
 * current (a regenerate replaces its document by design), retrying if another
 * write lands between the read and the batch.
 */
export async function applyRecordedEdit(
  userId: string,
  sessionId: string,
  group: EditGroup,
  columns: Json,
  options: { expectedRevision?: number } = {},
): Promise<RecordedEditResult> {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const row = await sessionsRepo.getSession(userId, sessionId);
    if (!row) throw new NotFoundError();
    const expected = options.expectedRevision ?? row.revision;
    if (options.expectedRevision !== undefined && row.revision !== options.expectedRevision) {
      throw new RevisionConflict(row.revision);
    }
    const prior: Json = {};
    for (const name of Object.keys(columns)) {
      prior[name] = (row as unknown as Json)[name] ?? null;
    }
    const now = nowIso();
    const historyId = crypto.randomUUID();
    const results = await runBatch([
      sql`
        INSERT INTO application_edit_history (id, user_id, session_id, edit_group, revision, prior_value, created_at)
        SELECT ${historyId}, ${userId}, ${sessionId}, ${group}, ${expected}, ${JSON.stringify(prior)}, ${now}
        WHERE EXISTS (
          SELECT 1 FROM application_sessions
          WHERE id = ${sessionId} AND user_id = ${userId} AND revision = ${expected}
        )
      `,
      buildSessionUpdateStatement(userId, sessionId, columns, expected, now),
      sql`
        DELETE FROM application_edit_history
        WHERE user_id = ${userId} AND session_id = ${sessionId} AND edit_group = ${group}
          AND id NOT IN (
            SELECT id FROM application_edit_history
            WHERE user_id = ${userId} AND session_id = ${sessionId} AND edit_group = ${group}
            ORDER BY created_at DESC, rowid DESC
            LIMIT ${EDIT_HISTORY_KEEP}
          )
      `,
    ]);
    if (results[1].meta.changes > 0) return { revision: expected + 1 };
    // The write matched nothing: the row moved on, or it is gone.
    if (options.expectedRevision !== undefined) {
      const current = await sessionsRepo.getSessionRevision(userId, sessionId);
      if (!current) throw new NotFoundError();
      throw new RevisionConflict(current.revision);
    }
  }
  throw new RevisionConflict(null);
}

const DOCUMENT_GROUP: Record<KitDocumentKey, EditGroup> = {
  coverLetter: 'cover_letter',
  email: 'email',
  followUpEmail: 'follow_up_email',
};

/** `saveKitDocument` that keeps the document it replaces. Same revision semantics as `applyRecordedEdit`. */
export async function saveRecordedKitDocument(
  userId: string,
  sessionId: string,
  document: KitDocumentKey,
  value: unknown,
  options: { expectedRevision?: number; extra?: Json } = {},
): Promise<RecordedEditResult> {
  return applyRecordedEdit(
    userId,
    sessionId,
    DOCUMENT_GROUP[document],
    kitDocumentColumns(document, value, options.extra),
    { expectedRevision: options.expectedRevision },
  );
}

export interface EditHistoryEntry {
  id: string;
  group: EditGroup;
  /** The revision the replaced value was at. */
  revision: number;
  createdAt: string;
}

export async function listEditHistory(userId: string, sessionId: string, group?: EditGroup): Promise<EditHistoryEntry[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(applicationEditHistory)
    .where(and(
      eq(applicationEditHistory.user_id, userId),
      eq(applicationEditHistory.session_id, sessionId),
      ...(group ? [eq(applicationEditHistory.edit_group, group)] : []),
    ))
    .orderBy(desc(applicationEditHistory.created_at), sql`rowid desc`)
    .limit(EDIT_HISTORY_KEEP * EDIT_GROUPS.length);
  return rows.map((row) => ({
    id: row.id,
    group: row.edit_group as EditGroup,
    revision: row.revision,
    createdAt: row.created_at,
  }));
}

export interface UndoResult {
  group: EditGroup;
  revision: number;
  /** The revision the restored value had been at. */
  restoredFromRevision: number;
  /** Versions still available to undo for this group. */
  remaining: number;
}

/**
 * Screening answers and their turn count live inside `generated_cv` but aren't part of a CV edit,
 * and saving them records no history. Restoring an older `generated_cv` keeps the current ones.
 */
function keepScreeningAnswers(prior: Json, current: Json): Json {
  const restored = prior.generated_cv;
  const now = current.generated_cv;
  if (!restored || typeof restored !== 'object' || !now || typeof now !== 'object') return prior;
  const live = now as Json;
  return {
    ...prior,
    generated_cv: {
      ...(restored as Json),
      _screeningAnswers: live._screeningAnswers ?? [],
      _screeningUsageCount: live._screeningUsageCount ?? 0,
    },
  };
}

/**
 * Restore the newest prior version of one group. Conditional on the revision it
 * read (and on `expectedRevision` when the caller passes the one it last saw), so
 * it bumps the revision and conflicts instead of overwriting a newer write.
 */
export async function undoLastEdit(
  userId: string,
  sessionId: string,
  group: EditGroup,
  options: { expectedRevision?: number } = {},
): Promise<UndoResult> {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const row = await sessionsRepo.getSession(userId, sessionId);
    if (!row) throw new NotFoundError();
    if (options.expectedRevision !== undefined && row.revision !== options.expectedRevision) {
      throw new RevisionConflict(row.revision);
    }
    const db = await getDb();
    const entries = await db
      .select()
      .from(applicationEditHistory)
      .where(and(
        eq(applicationEditHistory.user_id, userId),
        eq(applicationEditHistory.session_id, sessionId),
        eq(applicationEditHistory.edit_group, group),
      ))
      .orderBy(desc(applicationEditHistory.created_at), sql`rowid desc`)
      .limit(2);
    const latest = entries[0];
    if (!latest) throw new InvalidInputError('There is no earlier version to restore for this part of the application.');
    const prior = keepScreeningAnswers(latest.prior_value as Json, row as unknown as Json);
    const now = nowIso();
    const results = await runBatch([
      buildSessionUpdateStatement(userId, sessionId, prior, row.revision, now),
      sql`
        DELETE FROM application_edit_history
        WHERE id = ${latest.id} AND user_id = ${userId} AND (SELECT changes()) > 0
      `,
    ]);
    if (results[0].meta.changes > 0) {
      return {
        group,
        revision: row.revision + 1,
        restoredFromRevision: latest.revision,
        remaining: entries.length - 1,
      };
    }
    if (options.expectedRevision !== undefined) {
      const current = await sessionsRepo.getSessionRevision(userId, sessionId);
      if (!current) throw new NotFoundError();
      throw new RevisionConflict(current.revision);
    }
  }
  throw new RevisionConflict(null);
}

/** Delete history older than the retention window. Returns how many rows went. */
export async function deleteEditHistoryOlderThan(days: number = EDIT_HISTORY_RETENTION_DAYS, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const db = await getDb();
  const deleted = await db
    .delete(applicationEditHistory)
    .where(lt(applicationEditHistory.created_at, cutoff))
    .returning({ id: applicationEditHistory.id });
  return deleted.length;
}
