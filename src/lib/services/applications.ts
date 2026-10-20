/**
 * Applications service: create, read, edit, track and delete an application.
 *
 * Every function takes the `userId` from the verified session (never from a
 * request body) and every query it reaches filters by it, so asking for
 * someone else's id looks exactly like asking for one that does not exist.
 * Every write is revision-conditional when the caller passes the revision it
 * loaded: `UPDATE ... WHERE id=? AND user_id=? AND revision=?`. A miss throws
 * `RevisionConflict`; the writer reloads instead of overwriting.
 *
 * Web server actions (src/db/actions.ts), the agent-v2 route, the Queue runner
 * and, later, the MCP tools all call these.
 */

import * as sessionsRepo from '@/db/repos/sessions';
import type { ApplicationSession, TrackerApplicationRow } from '@/db/repos/sessions';
import { InvalidInputError, NotFoundError, RevisionConflict } from './errors';

export type { ApplicationSession, TrackerApplicationRow };

export const TRACKER_STATUSES = ['drafted', 'applied', 'follow_up', 'interview', 'accepted', 'rejected'] as const;
export type TrackerStatusValue = (typeof TRACKER_STATUSES)[number];

/** A plain-JSON patch for the columns an editor may write. */
export type ApplicationFieldPatch = Partial<{
  job_title: string | null;
  company: string | null;
  job_description: string;
  job_url: string | null;
  match_score: number | null;
  matching_skills: string[];
  missing_skills: string[];
  suggestions: string[];
  requirements: unknown;
  gaps: unknown;
  generated_cv: unknown;
  cover_letter: unknown;
  email: unknown;
  follow_up_email: unknown;
  company_research: unknown;
  company_address: string | null;
  company_contact_person: string | null;
  cv_edits: unknown[];
  optimized_cv_text: string | null;
  email_subject: string | null;
  email_body: string | null;
  selected_template: string;
  cover_letter_language: string;
  fit_assessment: unknown;
}>;

type FieldKind = 'text' | 'text-required' | 'int-0-100' | 'string-array' | 'json' | 'json-array';

/**
 * The columns `updateApplicationFields` accepts, with the shape each must have.
 * Anything not listed (status, generation_*, revision, counters, generated_artifacts,
 * ids) is owned by a server path and is rejected, not ignored: a client that
 * sends one has a bug worth hearing about.
 */
const EDITABLE_FIELDS: Record<keyof ApplicationFieldPatch, { kind: FieldKind; max?: number }> = {
  job_title: { kind: 'text', max: 500 },
  company: { kind: 'text', max: 500 },
  job_description: { kind: 'text-required', max: 100_000 },
  job_url: { kind: 'text', max: 2_000 },
  match_score: { kind: 'int-0-100' },
  matching_skills: { kind: 'string-array' },
  missing_skills: { kind: 'string-array' },
  suggestions: { kind: 'string-array' },
  requirements: { kind: 'json' },
  gaps: { kind: 'json' },
  generated_cv: { kind: 'json' },
  cover_letter: { kind: 'json' },
  email: { kind: 'json' },
  follow_up_email: { kind: 'json' },
  company_research: { kind: 'json' },
  company_address: { kind: 'text', max: 2_000 },
  company_contact_person: { kind: 'text', max: 500 },
  cv_edits: { kind: 'json-array' },
  optimized_cv_text: { kind: 'text', max: 300_000 },
  email_subject: { kind: 'text', max: 2_000 },
  email_body: { kind: 'text', max: 100_000 },
  selected_template: { kind: 'text-required', max: 100 },
  cover_letter_language: { kind: 'text-required', max: 16 },
  fit_assessment: { kind: 'json' },
};

/** One patch may not carry more than this many serialized characters in total. */
const MAX_PATCH_CHARS = 3_000_000;

function validatePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  let total = 0;
  for (const [key, value] of Object.entries(patch)) {
    const rule = (EDITABLE_FIELDS as Record<string, { kind: FieldKind; max?: number } | undefined>)[key];
    if (!rule) throw new InvalidInputError(`Field "${key}" cannot be edited`);
    if (value === undefined) continue;
    switch (rule.kind) {
      case 'text':
      case 'text-required': {
        if (value === null && rule.kind === 'text') break;
        if (typeof value !== 'string') throw new InvalidInputError(`Field "${key}" must be text`);
        if (rule.kind === 'text-required' && !value.trim()) throw new InvalidInputError(`Field "${key}" cannot be empty`);
        if (rule.max !== undefined && value.length > rule.max) throw new InvalidInputError(`Field "${key}" is too long`);
        total += value.length;
        break;
      }
      case 'int-0-100': {
        if (value === null) break;
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidInputError(`Field "${key}" must be a number`);
        break;
      }
      case 'string-array': {
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
          throw new InvalidInputError(`Field "${key}" must be a list of text`);
        }
        total += JSON.stringify(value).length;
        break;
      }
      case 'json-array': {
        if (!Array.isArray(value)) throw new InvalidInputError(`Field "${key}" must be a list`);
        total += JSON.stringify(value).length;
        break;
      }
      case 'json': {
        if (value !== null && typeof value !== 'object' && typeof value !== 'string') {
          throw new InvalidInputError(`Field "${key}" must be a document`);
        }
        total += JSON.stringify(value).length;
        break;
      }
    }
    clean[key] = key === 'match_score' && typeof value === 'number'
      ? Math.round(Math.min(100, Math.max(0, value)))
      : value;
  }
  if (total > MAX_PATCH_CHARS) throw new InvalidInputError('That change is too large');
  return clean;
}

function unwrap(result: { error: Error | null; revision?: number }): number {
  if (result.error) {
    if (result.error instanceof RevisionConflict) throw result.error;
    if (result.error.message === 'Application not found') throw new NotFoundError();
    throw result.error;
  }
  if (result.revision === undefined) throw new Error('Write did not report a revision');
  return result.revision;
}

export async function createApplication(
  userId: string,
  input: { jobDescription: string; jobTitle?: string | null; company?: string | null; jobUrl?: string | null },
): Promise<ApplicationSession> {
  if (!input.jobDescription?.trim()) throw new InvalidInputError('A job description is required');
  const { session, error } = await sessionsRepo.createSession(userId, input.jobDescription, {
    job_title: input.jobTitle ?? null,
    company: input.company ?? null,
    job_url: input.jobUrl ?? null,
  });
  if (error || !session) throw error ?? new Error('Failed to create application');
  return session;
}

export async function getApplication(userId: string, sessionId: string): Promise<ApplicationSession | null> {
  return sessionsRepo.getSession(userId, sessionId);
}

export async function requireApplication(userId: string, sessionId: string): Promise<ApplicationSession> {
  const session = await sessionsRepo.getSession(userId, sessionId);
  if (!session) throw new NotFoundError();
  return session;
}

export async function listApplications(userId: string): Promise<ApplicationSession[]> {
  return sessionsRepo.getSessions(userId);
}

export async function listTrackerOverview(userId: string): Promise<TrackerApplicationRow[]> {
  return sessionsRepo.listTrackerOverview(userId);
}

/** Cheap read for polling: has anything changed since I loaded revision N? */
export async function getApplicationRevision(
  userId: string,
  sessionId: string,
): Promise<{ revision: number; updatedAt: string; generationStatus: string } | null> {
  return sessionsRepo.getSessionRevision(userId, sessionId);
}

/**
 * Write the changed fields of an application, if it is still at
 * `expectedRevision`. Returns the new revision.
 */
export async function updateApplicationFields(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
): Promise<{ revision: number }> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new InvalidInputError('A revision is required');
  }
  const clean = validatePatch(patch);
  if (Object.keys(clean).length === 0) {
    const current = await sessionsRepo.getSessionRevision(userId, sessionId);
    if (!current) throw new NotFoundError();
    if (current.revision !== expectedRevision) throw new RevisionConflict(current.revision);
    return { revision: current.revision };
  }
  const result = await sessionsRepo.updateSession(
    userId,
    sessionId,
    clean as Parameters<typeof sessionsRepo.updateSession>[2],
    { expectedRevision },
  );
  return { revision: unwrap(result) };
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new InvalidInputError('Invalid date');
  return parsed.toISOString();
}

/**
 * Move an application to a tracker status, with the dates that status implies.
 * Conditional on `expectedRevision` when given.
 */
export async function setTrackerStatus(
  userId: string,
  sessionId: string,
  next: { status: string; interviewAt?: string | null; followUpDueAt?: string | null },
  expectedRevision?: number,
): Promise<{ revision: number }> {
  if (!TRACKER_STATUSES.includes(next.status as TrackerStatusValue)) {
    throw new InvalidInputError('Unknown status');
  }
  const result = await sessionsRepo.setTrackerStatus(
    userId,
    sessionId,
    {
      status: next.status,
      interview_at: cleanDate(next.interviewAt),
      follow_up_due_at: cleanDate(next.followUpDueAt),
    },
    expectedRevision,
  );
  return { revision: unwrap(result) };
}

export async function deleteApplication(
  userId: string,
  sessionId: string,
  expectedRevision?: number,
): Promise<void> {
  const { error } = await sessionsRepo.deleteSession(userId, sessionId, expectedRevision);
  if (error) {
    if (error instanceof RevisionConflict) throw error;
    if (error.message === 'Application not found') throw new NotFoundError();
    throw error;
  }
}
