/**
 * The WHERE condition of the fill-only recipient save
 * (lib/agents/persist-letter-recipient.ts): the user's own row, still holding
 * the job description the letter was written for (the shared narrow trim on
 * both sides), with the column empty (NULL, or only space, tab, LF, CR).
 * Pure, so the eval runs this exact SQL in sqlite3.
 */

import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { applicationSessions } from './schema';
import { sqlTrimStoredText, trimStoredText } from './trim-text';

export type RecipientColumn = typeof applicationSessions.company_address | typeof applicationSessions.company_contact_person;

export function recipientFillCondition(input: {
  sessionId: string;
  userId: string;
  jobDescription: string;
  column: RecipientColumn;
}): SQL {
  return and(
    eq(applicationSessions.id, input.sessionId),
    eq(applicationSessions.user_id, input.userId),
    sql`${sqlTrimStoredText(applicationSessions.job_description)} = ${trimStoredText(input.jobDescription)}`,
    or(isNull(input.column), sql`${sqlTrimStoredText(input.column)} = ''`),
  ) as SQL;
}
