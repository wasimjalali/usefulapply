/**
 * Save the recipient details a cover letter took from the ad onto its
 * application session. The write itself (fill-only, atomic, revision-bumping)
 * lives in the applications service so every writer goes through the same
 * revisioned path; this keeps the name the routes and the eval import.
 */

import { fillLetterRecipient } from '@/lib/services/applications';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';

export async function saveLetterRecipientFromAd(
  userId: string,
  sessionId: string,
  jobDescription: string,
  letter: StructuredCoverLetter,
): Promise<{ revision?: number }> {
  return fillLetterRecipient(userId, sessionId, jobDescription, letter);
}
