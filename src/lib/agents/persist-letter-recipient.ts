/**
 * Save the recipient details a cover letter took from the ad onto its
 * application session, so the user can see and edit them later.
 *
 * Only empty columns are written. The writer reads company_address and
 * company_contact_person before the ad (cover-letter-structure.ts), so when a
 * column is empty and the letter still has that detail, the detail is the
 * verbatim extract from the ad. A value the user saved is never overwritten.
 *
 * This is the single write site for that rule; swap the updateSession call for
 * the revisioned session service when it lands.
 */

import { getSession, updateSession } from '@/db/repos/sessions';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';

export async function saveLetterRecipientFromAd(
  userId: string,
  sessionId: string,
  letter: StructuredCoverLetter,
): Promise<void> {
  const session = await getSession(userId, sessionId);
  if (!session) return;
  const updates: { company_address?: string; company_contact_person?: string } = {};
  if (!session.company_address?.trim() && letter.recipient.addressLines.length > 0) {
    updates.company_address = letter.recipient.addressLines.join('\n');
  }
  if (!session.company_contact_person?.trim() && letter.recipient.contactPerson) {
    updates.company_contact_person = letter.recipient.contactPerson;
  }
  if (Object.keys(updates).length === 0) return;
  const result = await updateSession(userId, sessionId, updates);
  if (result.error) throw result.error;
}
