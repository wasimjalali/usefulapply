/**
 * One definition of "this is the same job", shared by the two places that need
 * it: the sync layer, which reuses an unsent entry rather than writing a second
 * one, and the chat, which says so when a repeat lands on an application the
 * user already sent.
 *
 * Keeping it in one file is the point. Two copies of a rule this consequential
 * would drift, and the consequence here is overwriting someone's CV.
 */
import type { ApplicationSession } from '@/store/useSessionStore';

/** Whitespace and casing vary between a pasted ad and a feed handoff. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Same company, same title and the same ad text.
 *
 * The ad is in the key on purpose. Measured against the real database: of the
 * six duplicate (user, company, title) groups, four hold two genuinely
 * different ads, so company and title alone would call four different roles the
 * same job. All three parts must be present, because an ad we could not parse
 * has none of them and matching on blanks would fold every unparsed
 * application together.
 */
export function isSameJob(
  a: Pick<ApplicationSession, 'company' | 'jobTitle' | 'jobDescription'>,
  b: Pick<ApplicationSession, 'company' | 'jobTitle' | 'jobDescription'>,
): boolean {
  const company = normalizeText(a.company);
  const title = normalizeText(a.jobTitle);
  const ad = normalizeText(a.jobDescription);
  if (!company || !title || !ad) return false;
  return normalizeText(b.company) === company
    && normalizeText(b.jobTitle) === title
    && normalizeText(b.jobDescription) === ad;
}

/**
 * The entry for this job the user has already sent, if there is one. Anything
 * past `drafted` is a document they told us went out, so a repeat generation
 * never touches it. The chat uses this to explain the second entry instead of
 * leaving it looking like a duplicate.
 */
export function findSentApplicationForJob(
  sessions: ApplicationSession[],
  candidate: Pick<ApplicationSession, 'id' | 'company' | 'jobTitle' | 'jobDescription'>,
): ApplicationSession | null {
  return sessions.find((session) =>
    !session.id.startsWith('session-')
    && session.id !== candidate.id
    && Boolean(session.status)
    && session.status !== 'drafted'
    && isSameJob(candidate, session),
  ) ?? null;
}
