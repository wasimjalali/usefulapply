/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, gt, isNotNull, like, or, sql } from 'drizzle-orm';
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
  status?: 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up';
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

/**
 * A row for the same user + job title + company created in the last few
 * minutes is a double insert (two writers or a double click), not a new
 * application. Older matches are legit re-applications and stay separate.
 */
const RECENT_SESSION_WINDOW_MS = 10 * 60 * 1000;

export async function findRecentSessionByJobIdentity(
  userId: string,
  jobTitle: string,
  company: string,
): Promise<ApplicationSession | null> {
  const title = jobTitle.trim();
  const companyName = company.trim();
  if (!title || !companyName) return null;
  const db = await getDb();
  const since = new Date(Date.now() - RECENT_SESSION_WINDOW_MS).toISOString();
  const rows = await db
    .select()
    .from(applicationSessions)
    .where(and(
      eq(applicationSessions.user_id, userId),
      eq(applicationSessions.job_title, title),
      eq(applicationSessions.company, companyName),
      gt(applicationSessions.created_at, since),
    ))
    .orderBy(desc(applicationSessions.created_at))
    .limit(1);
  return (rows[0] as ApplicationSession | undefined) ?? null;
}

export async function createSession(
  userId: string,
  jobDescription: string,
  extras?: Partial<ApplicationSession>,
): Promise<{ session: ApplicationSession | null; error: Error | null }> {
  if (extras?.job_title && extras?.company) {
    const existing = await findRecentSessionByJobIdentity(userId, extras.job_title, extras.company);
    if (existing) {
      return { session: existing, error: null };
    }
  }
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

/** Tracker page: status of every generated session, for the status count chips. */
export async function listTrackerStatuses(userId: string): Promise<Array<{ status: string | null }>> {
  const db = await getDb();
  return db
    .select({ status: applicationSessions.status })
    .from(applicationSessions)
    .where(and(eq(applicationSessions.user_id, userId), isNotNull(applicationSessions.generated_cv)));
}
