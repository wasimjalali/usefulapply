/**
 * Feed job → application session. The apply route returns the D1 row shape;
 * the store wants the client shape. This builds on the standard row mapper
 * (`mapSessionRowToStore`), so a field added to the store session is mapped in
 * one place; only the feed's generation state is added here.
 */

import type { JobFeedApplyResponse } from '@/lib/job-feed/types';
import type { ApplicationSession as StoreApplicationSession } from '@/store/useSessionStore';
import { mapSessionRowToStore, type StoredSessionRow } from '@/lib/session-row-mapping';

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
  // The standard row mapper, so a feed handoff produces exactly the fields every
  // other load does (template, revision, the generated_artifacts fallbacks, the
  // pending fit). Only the generation state is the feed's own.
  const standard = mapSessionRowToStore(session as unknown as StoredSessionRow);
  return {
    ...standard,
    generationStatus: toSessionGenerationStatus(generation.status),
    generationError: generation.error_message ?? session.generation_error,
    jobFeedGenerationId: generation.id,
    jobFeedGenerationAttempt: generation.attempt,
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
