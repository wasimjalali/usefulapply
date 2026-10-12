/**
 * Feed job → application session. The apply route returns the D1 row shape;
 * the store wants the client shape.
 *
 * IMPORTANT: every field added to `ApplicationSession` in useSessionStore has
 * to be mapped here AND in `src/hooks/useSupabaseSync.ts`. A field missing
 * from this mapper is wiped the moment a feed handoff loads the session.
 */

import type { JobFeedApplyResponse } from '@/lib/job-feed/types';
import type { ApplicationSession as StoreApplicationSession } from '@/store/useSessionStore';
import { readKitDocumentErrors } from '@/lib/open-session';

export function toSessionGenerationStatus(
  status: JobFeedApplyResponse['generation']['status']
): StoreApplicationSession['generationStatus'] {
  switch (status) {
    case 'intent_created':
    case 'queued':
      return 'pending';
    case 'running':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'expired':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
  }
}

export function toStoreApplicationSession(
  session: JobFeedApplyResponse['session'],
  generation: JobFeedApplyResponse['generation']
): StoreApplicationSession {
  const companyResearch = session.company_research && typeof session.company_research === 'object' && !Array.isArray(session.company_research)
    ? {
        ...(session.company_research as Record<string, unknown>),
        address: session.company_address ?? (session.company_research as Record<string, unknown>).address as string | undefined,
        contactPerson: session.company_contact_person ?? (session.company_research as Record<string, unknown>).contactPerson as string | undefined,
      } as unknown as StoreApplicationSession['companyResearch']
    : null;

  const generatedCvBlob = session.generated_cv as Record<string, unknown> | null;
  // The row carries the server-owned counter, but the generated Supabase type
  // predates the column. Same rule as open-session.ts: take the higher of the
  // column and the old embedded number, so a row written before the column
  // keeps the turns it already spent.
  const screeningTurnsUsed = (session as unknown as { screening_turns_used?: number | null }).screening_turns_used;

  return {
    id: session.id,
    jobTitle: session.job_title ?? '',
    company: session.company ?? '',
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    jobDescription: session.job_description,
    matchScore: session.match_score ?? undefined,
    matchingSkills: session.matching_skills ?? [],
    missingSkills: session.missing_skills ?? [],
    suggestions: session.suggestions ?? [],
    requirements: session.requirements as unknown as StoreApplicationSession['requirements'],
    gaps: session.gaps as unknown as StoreApplicationSession['gaps'],
    generatedCV: session.generated_cv as unknown as StoreApplicationSession['generatedCV'],
    // Structured CV data and screening answers ride inside generated_cv (see useSupabaseSync).
    optimizedCVData: (generatedCvBlob?._optimizedCVData as StoreApplicationSession['optimizedCVData']) ?? undefined,
    screeningAnswers: Array.isArray(generatedCvBlob?._screeningAnswers)
      ? (generatedCvBlob._screeningAnswers as StoreApplicationSession['screeningAnswers'])
      : [],
    coverLetter: session.cover_letter as unknown as StoreApplicationSession['coverLetter'],
    email: session.email as unknown as StoreApplicationSession['email'],
    followUpEmail: session.follow_up_email as unknown as StoreApplicationSession['followUpEmail'],
    fitAssessment: session.fit_assessment as unknown as StoreApplicationSession['fitAssessment'],
    kitDocumentErrors: readKitDocumentErrors(
      (session.generated_artifacts as Record<string, unknown> | null)?.documentErrors,
    ),
    generationStatus: toSessionGenerationStatus(generation.status),
    generationError: generation.error_message ?? session.generation_error,
    generationStartedAt: session.generation_started_at,
    generationCompletedAt: session.generation_completed_at,
    generationFailedAt: session.generation_failed_at,
    generationCancelledAt: session.generation_cancelled_at,
    jobFeedGenerationId: generation.id,
    jobFeedGenerationAttempt: generation.attempt,
    companyResearch,
    screeningUsageCount: Math.max(
      typeof screeningTurnsUsed === 'number' ? screeningTurnsUsed : 0,
      typeof generatedCvBlob?._screeningUsageCount === 'number' ? (generatedCvBlob._screeningUsageCount as number) : 0,
    ),
    cvEdits: Array.isArray(session.cv_edits) ? session.cv_edits as unknown as StoreApplicationSession['cvEdits'] : [],
    optimizedPdfRef: session.optimized_pdf_path
      ? {
          id: session.id,
          fileName: 'optimized.pdf',
          size: 0,
          type: 'optimized' as const,
          createdAt: session.created_at,
          url: session.optimized_pdf_path,
        }
      : undefined,
    chatMessages: [],
  };
}

/** Keep local chat / fit state when a feed handoff reloads the same session. */
export function mergeFeedSession(
  mapped: StoreApplicationSession,
  existing: StoreApplicationSession | undefined,
): StoreApplicationSession {
  if (!existing || existing.id !== mapped.id) return mapped;
  return {
    ...mapped,
    chatMessages: existing.chatMessages.length > 0 ? existing.chatMessages : mapped.chatMessages,
    pendingFitAnalysis: existing.pendingFitAnalysis ?? mapped.pendingFitAnalysis,
    optimizedPdfRef: mapped.optimizedPdfRef ?? existing.optimizedPdfRef,
    kitDocumentErrors: mapped.kitDocumentErrors ?? existing.kitDocumentErrors ?? null,
  };
}
