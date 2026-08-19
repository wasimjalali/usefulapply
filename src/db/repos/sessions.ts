/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, isNotNull, like, or, sql } from 'drizzle-orm';
import { getDb, nowIso, stripIdentity } from '../client';
import { applicationSessions, chatMessages } from '../schema';
import type { JobFeedGenerationStatus } from '@/lib/supabase/types';

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

export async function updateSession(
  userId: string,
  sessionId: string,
  updates: Partial<Omit<ApplicationSession, 'id' | 'user_id' | 'created_at'>>,
): Promise<{ error: Error | null }> {
  const db = await getDb();
  // `updates` can arrive from a server action and must never re-parent the row.
  await db
    .update(applicationSessions)
    .set({ ...stripIdentity(updates as Record<string, unknown>), updated_at: nowIso() } as never)
    .where(and(eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)));
  return { error: null };
}

export async function deleteSession(userId: string, sessionId: string): Promise<{ error: Error | null }> {
  const db = await getDb();
  await db
    .delete(applicationSessions)
    .where(and(eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)));
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
  created_at: string;
}

/**
 * Tracker page: generated sessions only (generated_cv not null), newest first,
 * optional status filter and case-insensitive company/job title search.
 */
export async function listTrackerApplications(
  userId: string,
  params: { offset: number; limit: number; search: string; status: string | 'all' },
): Promise<{ data: TrackerApplicationRow[]; count: number }> {
  const db = await getDb();
  const conditions = [eq(applicationSessions.user_id, userId), isNotNull(applicationSessions.generated_cv)];
  if (params.status !== 'all') {
    conditions.push(eq(applicationSessions.status, params.status));
  }
  const normalizedSearch = params.search.replace(/[,%()']/g, ' ').trim();
  if (normalizedSearch) {
    const searchValue = `%${normalizedSearch}%`;
    // SQLite LIKE is case-insensitive for ASCII, matching the old ilike.
    conditions.push(or(like(applicationSessions.company, searchValue), like(applicationSessions.job_title, searchValue))!);
  }
  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: applicationSessions.id,
        company: applicationSessions.company,
        job_title: applicationSessions.job_title,
        match_score: applicationSessions.match_score,
        status: applicationSessions.status,
        interview_at: applicationSessions.interview_at,
        follow_up_due_at: applicationSessions.follow_up_due_at,
        created_at: applicationSessions.created_at,
      })
      .from(applicationSessions)
      .where(where)
      .orderBy(desc(applicationSessions.created_at))
      .limit(params.limit)
      .offset(params.offset),
    db.select({ count: sql<number>`count(*)` }).from(applicationSessions).where(where),
  ]);
  return { data: rows, count: Number(countRows[0].count) };
}

/** Enough for any real job hunt, and it bounds the tracker chat prompt. */
const TRACKER_OVERVIEW_LIMIT = 300;

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
      created_at: applicationSessions.created_at,
    })
    .from(applicationSessions)
    .where(and(eq(applicationSessions.user_id, userId), isNotNull(applicationSessions.generated_cv)))
    .orderBy(desc(applicationSessions.created_at))
    .limit(TRACKER_OVERVIEW_LIMIT);
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
): Promise<{ error: Error | null }> {
  const db = await getDb();
  const updated = await db
    .update(applicationSessions)
    .set({
      status: next.status,
      interview_at: next.interview_at,
      follow_up_due_at: next.follow_up_due_at,
      // A reminder guard clears only when its date actually moved, so
      // re-saving the same date cannot send the same email twice.
      interview_reminder_sent_at: sql`case when coalesce(interview_at, '') = ${next.interview_at ?? ''} then interview_reminder_sent_at else null end`,
      follow_up_reminder_sent_at: sql`case when coalesce(follow_up_due_at, '') = ${next.follow_up_due_at ?? ''} then follow_up_reminder_sent_at else null end`,
      updated_at: nowIso(),
    })
    .where(and(eq(applicationSessions.id, sessionId), eq(applicationSessions.user_id, userId)))
    .returning({ id: applicationSessions.id });
  // A write that matched nothing is a failure, not a quiet success.
  if (updated.length === 0) return { error: new Error('Application not found') };
  return { error: null };
}
