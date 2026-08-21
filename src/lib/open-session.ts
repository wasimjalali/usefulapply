'use client';

/**
 * Open an application that may not be in the session store yet.
 *
 * Tracker rows and the sidebar can appear before useSupabaseSync has filled
 * `sessions`, and loadSession used to blank the kit on a miss. The row is in
 * D1. Fetch it. Chat messages load here too, so an older application is not
 * stuck with the ten-newest sweep.
 */

import {
  getSession as getStoredSession,
  getChatMessages,
} from '@/lib/supabase';
import type { JobFeedGenerationStatus } from '@/lib/supabase/types';
import {
  useSessionStore,
  type ApplicationSession,
  type ChatMessage,
} from '@/store/useSessionStore';

export interface StoredSessionRow {
  id: string;
  job_title?: string | null;
  company?: string | null;
  job_description?: string | null;
  selected_template?: string | null;
  match_score?: number | null;
  matching_skills?: string[] | null;
  missing_skills?: string[] | null;
  suggestions?: string[] | null;
  requirements?: unknown;
  gaps?: unknown;
  generated_cv?: Record<string, unknown> | null;
  cover_letter?: unknown;
  email?: unknown;
  follow_up_email?: unknown;
  company_research?: Record<string, unknown> | null;
  company_address?: string | null;
  company_contact_person?: string | null;
  fit_assessment?: unknown;
  generation_status?: JobFeedGenerationStatus | null;
  generation_error?: string | null;
  generation_started_at?: string | null;
  generation_completed_at?: string | null;
  generation_failed_at?: string | null;
  generation_cancelled_at?: string | null;
  cv_edits?: unknown[] | null;
  optimized_pdf_path?: string | null;
  status?: string | null;
  /** Server-owned. Optional because a row read before the migration has no value. */
  screening_turns_used?: number | null;
  created_at: string;
  updated_at: string;
}

let openGeneration = 0;
const hydratedChatIds = new Set<string>();

export function mapSessionRowToStore(row: StoredSessionRow): ApplicationSession {
  const generated = row.generated_cv ?? null;
  return {
    id: row.id,
    status: row.status ?? 'drafted',
    jobTitle: row.job_title || '',
    company: row.company || '',
    jobDescription: row.job_description || '',
    selectedTemplate: row.selected_template || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchScore: row.match_score ?? undefined,
    matchingSkills: row.matching_skills || [],
    missingSkills: row.missing_skills || [],
    suggestions: row.suggestions || [],
    requirements: (row.requirements ?? null) as ApplicationSession['requirements'],
    gaps: (row.gaps ?? null) as ApplicationSession['gaps'],
    generatedCV: generated as ApplicationSession['generatedCV'],
    optimizedCVData: (generated?._optimizedCVData as ApplicationSession['optimizedCVData']) ?? undefined,
    screeningAnswers: Array.isArray(generated?._screeningAnswers)
      ? (generated._screeningAnswers as ApplicationSession['screeningAnswers'])
      : [],
    coverLetter: (row.cover_letter ?? null) as ApplicationSession['coverLetter'],
    email: (row.email ?? null) as ApplicationSession['email'],
    followUpEmail: (row.follow_up_email ?? null) as ApplicationSession['followUpEmail'],
    companyResearch: row.company_research
      ? {
          ...row.company_research,
          address: row.company_address || (row.company_research.address as string | undefined),
          contactPerson: row.company_contact_person || (row.company_research.contactPerson as string | undefined),
        } as ApplicationSession['companyResearch']
      : null,
    fitAssessment: (row.fit_assessment ?? null) as ApplicationSession['fitAssessment'],
    generationStatus: row.generation_status ?? 'none',
    generationError: row.generation_error ?? null,
    generationStartedAt: row.generation_started_at ?? null,
    generationCompletedAt: row.generation_completed_at ?? null,
    generationFailedAt: row.generation_failed_at ?? null,
    generationCancelledAt: row.generation_cancelled_at ?? null,
    cvEdits: (row.cv_edits || []) as ApplicationSession['cvEdits'],
    optimizedPdfRef: row.optimized_pdf_path
      ? {
          id: row.id,
          fileName: 'optimized.pdf',
          size: 0,
          type: 'optimized' as const,
          createdAt: row.created_at,
          url: row.optimized_pdf_path,
        }
      : undefined,
    // The server-owned column is the truth. The old embedded number is not a
    // fallback for a database without the column (drizzle names the column in
    // every select, so an unmigrated database throws, and the migration goes on
    // before the deploy). It is the fallback for a row written before the
    // column, which starts at 0 with no backfill. Taking the higher of the two
    // means such a row keeps the turns it already spent. Measured on the live
    // database: 115 applications, none carrying an embedded count.
    screeningUsageCount: Math.max(
      typeof row.screening_turns_used === 'number' ? row.screening_turns_used : 0,
      typeof generated?._screeningUsageCount === 'number' ? generated._screeningUsageCount : 0,
    ),
    chatMessages: [],
  };
}

export function mapChatRowsToStore(
  messages: Array<{
    id: string;
    role: ChatMessage['role'];
    content: string;
    created_at: string;
    actions?: ChatMessage['actions'];
  }>,
): ChatMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.created_at,
    actions: msg.actions || [],
  }));
}

function applyChat(sessionId: string, chatMessages: ChatMessage[]) {
  // Do not go through updateCurrentSession: that stamps updatedAt and the
  // sync effect would write the whole row back to D1 just because chat loaded.
  const store = useSessionStore.getState();
  useSessionStore.setState({
    currentSession: store.currentSession?.id === sessionId
      ? { ...store.currentSession, chatMessages }
      : store.currentSession,
    sessions: store.sessions.map((session) =>
      session.id === sessionId ? { ...session, chatMessages } : session,
    ),
  });
}

export async function hydrateChatIfEmpty(sessionId: string, generation = openGeneration): Promise<void> {
  if (sessionId.startsWith('session-')) return;
  if (hydratedChatIds.has(sessionId)) return;

  const messages = await getChatMessages(sessionId);
  if (generation !== openGeneration) return;
  if (useSessionStore.getState().currentSession?.id !== sessionId) return;
  hydratedChatIds.add(sessionId);
  if (!messages || messages.length === 0) return;
  applyChat(sessionId, mapChatRowsToStore(messages));
}

/**
 * Put this application on screen. Fetches from D1 when the store does not
 * have it. Never clears currentSession on a miss: that used to blank the kit.
 */
export async function openStoredSession(sessionId: string): Promise<boolean> {
  const generation = ++openGeneration;
  const store = useSessionStore.getState();
  const inStore = store.sessions.find((session) => session.id === sessionId)
    ?? (store.currentSession?.id === sessionId ? store.currentSession : null);

  if (inStore) {
    store.loadSession(sessionId);
    await hydrateChatIfEmpty(sessionId, generation).catch((err) => {
      console.error('[openStoredSession] Chat did not load:', err);
    });
    return useSessionStore.getState().currentSession?.id === sessionId;
  }

  if (sessionId.startsWith('session-')) {
    store.loadSession(sessionId);
    return useSessionStore.getState().currentSession?.id === sessionId;
  }

  let row;
  try {
    row = await getStoredSession(sessionId);
  } catch (err) {
    console.error('[openStoredSession] Session did not load:', err);
    return false;
  }
  if (generation !== openGeneration) return false;
  if (!row) return false;

  const mapped = mapSessionRowToStore(row as StoredSessionRow);
  const latest = useSessionStore.getState();
  latest.setSessions([
    mapped,
    ...latest.sessions.filter((session) => session.id !== mapped.id),
  ]);
  latest.loadSession(sessionId);
  await hydrateChatIfEmpty(sessionId, generation).catch((err) => {
    console.error('[openStoredSession] Chat did not load:', err);
  });
  return useSessionStore.getState().currentSession?.id === sessionId;
}
