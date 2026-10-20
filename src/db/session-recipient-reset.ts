/**
 * The cover letter recipient columns (company_address, company_contact_person)
 * belong to the job a session row describes. A write that changes the job
 * description clears them in the same statement (SQLite reads the old row in
 * SET), so the cover letter can refill them for the new job. Surrounding
 * space, tab, LF and CR are not a change (db/trim-text.ts, the same trim on
 * both sides). A caller that sets a column to a value keeps it; an explicit
 * undefined counts as not set. Pure, so the eval can check it offline.
 */

import { sql } from 'drizzle-orm';
import { applicationSessions } from './schema';
import { sqlTrimStoredText, trimStoredText } from './trim-text';

export function withRecipientReset(values: Record<string, unknown>): Record<string, unknown> {
  if (typeof values.job_description !== 'string') return values;
  const nextJob = trimStoredText(values.job_description);
  const keepIfSameJob = (column: typeof applicationSessions.company_address | typeof applicationSessions.company_contact_person) => (
    sql`CASE WHEN ${sqlTrimStoredText(applicationSessions.job_description)} = ${nextJob} THEN ${column} ELSE NULL END`
  );
  return {
    ...values,
    ...(values.company_address === undefined ? { company_address: keepIfSameJob(applicationSessions.company_address) } : {}),
    ...(values.company_contact_person === undefined ? { company_contact_person: keepIfSameJob(applicationSessions.company_contact_person) } : {}),
  };
}
