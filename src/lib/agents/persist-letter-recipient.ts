/**
 * Save the recipient details a cover letter took from the ad onto its
 * application session, so the user can see and edit them later.
 *
 * Fill-only and atomic: each column is written by one conditional UPDATE that
 * matches only while the column is empty and the row still holds the job
 * description the letter was written for. The writer reads company_address
 * and company_contact_person before the ad (cover-letter-structure.ts), so
 * when a column is empty and the letter still has that detail, the detail is
 * the verbatim extract from the ad. A value the user saved is never
 * overwritten, and a letter for a job the row no longer describes never fills
 * it (a JD change clears both columns, see db/repos/sessions.ts updateSession).
 *
 * This is the single write site for that rule; swap it for the revisioned
 * session service when it lands.
 */

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { getDb, nowIso } from '@/db/client';
import { applicationSessions } from '@/db/schema';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';

export async function saveLetterRecipientFromAd(
  userId: string,
  sessionId: string,
  jobDescription: string,
  letter: StructuredCoverLetter,
): Promise<void> {
  const fills = [
    { column: applicationSessions.company_address, key: 'company_address', value: letter.recipient.addressLines.join('\n') },
    { column: applicationSessions.company_contact_person, key: 'company_contact_person', value: letter.recipient.contactPerson ?? '' },
  ].filter((fill) => fill.value.trim());
  if (fills.length === 0) return;
  const db = await getDb();
  const sameJob = sql`trim(${applicationSessions.job_description}, ' ' || char(9) || char(10) || char(13)) = ${jobDescription.trim()}`;
  for (const fill of fills) {
    await db
      .update(applicationSessions)
      .set({ [fill.key]: fill.value, updated_at: nowIso() } as never)
      .where(and(
        eq(applicationSessions.id, sessionId),
        eq(applicationSessions.user_id, userId),
        sameJob,
        or(isNull(fill.column), eq(fill.column, '')),
      ));
  }
}
