/**
 * Kit service: read an application's generated documents, and be the one
 * writer of generation output.
 *
 * `getKit` reads the canonical columns (generated_cv, cover_letter, email,
 * follow_up_email) and falls back to `generated_artifacts` for rows a headless
 * run or an older build left only there, using the same mapping the browser
 * applies when it opens an application.
 *
 * `persistKit` writes what a generation produced: the four canonical columns
 * (with `_optimizedCVData` embedded in generated_cv exactly as the browser
 * always has), the job and match fields, `generated_artifacts` and the
 * generation status, then bumps the revision. Web and MCP both come through
 * here, which is what makes a headless kit land where `/api/regenerate` and
 * the canvas expect it.
 */

import { sql, type SQL } from 'drizzle-orm';
import { nowIso } from '@/db/client';
import * as sessionsRepo from '@/db/repos/sessions';
import type { ApplicationSession as StoredApplication } from '@/db/repos/sessions';
import type { KitDocumentErrors, MasterContext } from '@/lib/agents/types';
import { mapSessionRowToStore, type StoredSessionRow } from '@/lib/session-row-mapping';
import type { ApplicationSession as StoreSession } from '@/store/useSessionStore';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { NotFoundError, RevisionConflict } from './errors';

/** What a finished kit run hands over. Same shape the agent-v2 route streams as `workflow_complete.results`. */
export interface KitResults {
  job?: MasterContext['job'];
  companyResearch?: MasterContext['companyResearch'] | null;
  match?: MasterContext['match'];
  optimizedCV?: MasterContext['optimizedCV'] | null;
  optimizedCVData?: MasterContext['optimizedCVData'] | null;
  coverLetter?: string | null;
  /** The same letter as the structured contract the export renderer lays out. */
  coverLetterStructured?: StructuredCoverLetter | null;
  applicationEmail?: { subject: string; body: string } | null;
  followUpEmail?: { subject: string; body: string; recommendedDelay?: number } | null;
  detectedLanguage?: string;
  documentErrors?: KitDocumentErrors;
  sourceContext?: unknown;
}

export interface Kit {
  applicationId: string;
  revision: number;
  generationStatus: StoreSession['generationStatus'];
  generationError: string | null;
  jobTitle: string;
  company: string;
  selectedTemplate: string | undefined;
  matchScore: number | undefined;
  fitAssessment: StoreSession['fitAssessment'];
  cv: StoreSession['generatedCV'];
  optimizedCVData: StoreSession['optimizedCVData'];
  screeningAnswers: StoreSession['screeningAnswers'];
  coverLetter: StoreSession['coverLetter'];
  email: StoreSession['email'];
  followUpEmail: StoreSession['followUpEmail'];
  companyResearch: StoreSession['companyResearch'];
  documentErrors: KitDocumentErrors | null;
  /** True once any of the four documents exists. */
  hasKit: boolean;
}

/** The kit of one application, canonical columns first, `generated_artifacts` as the fallback. */
export async function getKit(userId: string, sessionId: string): Promise<Kit> {
  const row = await sessionsRepo.getSession(userId, sessionId);
  if (!row) throw new NotFoundError();
  return kitFromRow(row);
}

export function kitFromRow(row: StoredApplication): Kit {
  const mapped = mapSessionRowToStore(row as unknown as StoredSessionRow);
  return {
    applicationId: row.id,
    revision: row.revision,
    generationStatus: mapped.generationStatus,
    generationError: mapped.generationError ?? null,
    jobTitle: mapped.jobTitle,
    company: mapped.company,
    selectedTemplate: mapped.selectedTemplate,
    matchScore: mapped.matchScore,
    fitAssessment: mapped.fitAssessment,
    cv: mapped.generatedCV,
    optimizedCVData: mapped.optimizedCVData,
    screeningAnswers: mapped.screeningAnswers,
    coverLetter: mapped.coverLetter,
    email: mapped.email,
    followUpEmail: mapped.followUpEmail,
    companyResearch: mapped.companyResearch,
    documentErrors: mapped.kitDocumentErrors ?? null,
    hasKit: Boolean(mapped.generatedCV || mapped.optimizedCVData || mapped.coverLetter || mapped.email || mapped.followUpEmail),
  };
}

// ---------------------------------------------------------------------------
// Results -> columns
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/**
 * The fields every stored cover letter carries besides its body. The canvas
 * reads `applicantAddress.name` and friends unconditionally, so a letter
 * written to an application that had none (a retry of a failed letter) starts
 * from this shell rather than from `{}`.
 */
export function coverLetterShell(): Json {
  return {
    applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
    date: '',
    companyAddress: { companyName: '', street: '' },
    salutation: '',
    closing: '',
    signatureName: '',
  };
}

function asRecord(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

/**
 * generated_cv is the CV document plus the structured data and the screening
 * state that ride inside it. The embed matches what the browser always wrote
 * (`embedKitData` in useSupabaseSync): only keys the session holds are
 * written, so a regenerated kit keeps the screening answers and the turn
 * count already stored.
 */
function embedGeneratedCv(
  results: KitResults,
  existing: Json | null,
  screeningTurnsUsed: number,
): Json | null {
  const optimizedCV = results.optimizedCV;
  const optimizedCVData = results.optimizedCVData ?? undefined;
  const base: Json | null = optimizedCV
    ? {
        content: optimizedCV.content,
        changes: optimizedCV.changes?.map((change) => ({
          section: change.section,
          original: change.before,
          updated: change.after,
          reason: change.reason,
        })) ?? [],
        optimizedFor: results.job?.title || 'Position',
      }
    : optimizedCVData
      ? {}
      : null;
  if (!base) return null;
  if (optimizedCVData !== undefined) base._optimizedCVData = optimizedCVData;
  if (existing && Array.isArray(existing._screeningAnswers)) base._screeningAnswers = existing._screeningAnswers;
  else base._screeningAnswers = [];
  const embeddedCount = typeof existing?._screeningUsageCount === 'number' ? existing._screeningUsageCount : 0;
  base._screeningUsageCount = Math.max(embeddedCount, screeningTurnsUsed);
  return base;
}

function clampScore(score: unknown): number | undefined {
  return typeof score === 'number' && Number.isFinite(score)
    ? Math.round(Math.min(100, Math.max(0, score)))
    : undefined;
}

/**
 * The column values a finished kit becomes, given the row it lands on.
 * Pure: no I/O, so the same function backs the web route's write and the Queue
 * runner's atomic batch.
 */
export function kitColumnsFromResults(
  results: KitResults,
  row: Pick<StoredApplication, 'job_title' | 'company' | 'generated_cv' | 'screening_turns_used'>
    & Partial<Pick<StoredApplication, 'cover_letter' | 'email' | 'follow_up_email'>>,
  now: string = nowIso(),
): Json {
  const errors = results.documentErrors ?? {};
  const job = results.job;
  const match = results.match;
  const companyResearch = results.companyResearch ?? null;

  const generatedCv = errors.cv
    ? null
    : embedGeneratedCv(results, asRecord(row.generated_cv), row.screening_turns_used ?? 0);

  const coverLetter = !errors.coverLetter && results.coverLetter
    ? {
        ...coverLetterShell(),
        body: results.coverLetter,
        updatedAt: now,
        ...(results.coverLetterStructured ? { structured: results.coverLetterStructured } : {}),
      }
    : null;

  const applicationEmail = !errors.applicationEmail && results.applicationEmail
    ? {
        subject: results.applicationEmail.subject
          || `Application for ${job?.title || 'Position'} at ${job?.companyName || 'Company'}`,
        body: results.applicationEmail.body || '',
        attachmentNote: 'Please find my CV and cover letter attached.',
      }
    : null;

  const followUpEmail = !errors.followUpEmail && results.followUpEmail
    ? {
        subject: results.followUpEmail.subject,
        body: results.followUpEmail.body,
        recommendedDelay: results.followUpEmail.recommendedDelay || 5,
      }
    : null;

  const columns: Json = {
    generated_cv: generatedCv,
    cover_letter: coverLetter,
    // The export renderer picks the letter layout from the letter's language.
    ...(coverLetter && results.coverLetterStructured ? { cover_letter_language: results.coverLetterStructured.language } : {}),
    email: applicationEmail,
    follow_up_email: followUpEmail,
    // The old browser sync kept these duplicates of the documents in step.
    optimized_cv_text: generatedCv && typeof generatedCv.content === 'string' ? generatedCv.content : null,
    email_subject: applicationEmail?.subject ?? null,
    email_body: applicationEmail?.body ?? null,
    // The full results, so a reload before anything else still shows the kit
    // and `documentErrors` survives. This replaces the pending-fit stash.
    generated_artifacts: results,
    generation_completed: true,
    generation_status: 'succeeded',
    generation_error: null,
    generation_completed_at: now,
    generation_failed_at: null,
    generation_cancelled_at: null,
  };

  // A document that failed in a regenerate must not wipe the good one it was
  // meant to replace (the refund for it still applies). On a first kit there is
  // nothing to keep and the column simply stays empty.
  if (errors.cv && row.generated_cv != null) {
    delete columns.generated_cv;
    delete columns.optimized_cv_text;
  }
  if (errors.coverLetter && row.cover_letter != null) {
    delete columns.cover_letter;
    delete columns.cover_letter_language;
  }
  if (errors.applicationEmail && row.email != null) {
    delete columns.email;
    delete columns.email_subject;
    delete columns.email_body;
  }
  if (errors.followUpEmail && row.follow_up_email != null) delete columns.follow_up_email;

  if (job) {
    columns.requirements = {
      title: job.title || '',
      company: job.companyName || '',
      hardSkills: job.requiredSkills || [],
      softSkills: [],
      experienceLevel: '',
      keywords: [],
      responsibilities: job.responsibilities || [],
      niceToHave: job.niceToHaveSkills || [],
      expectedSalary: job.expectedSalary,
      startDate: job.startDate,
      location: job.location,
      workType: job.workType,
      detectedLanguage: results.detectedLanguage,
    };
    // A title or company the user already has stays. The ad's wording only
    // fills an empty field.
    if (!row.job_title?.trim() && job.title) columns.job_title = job.title;
    if (!row.company?.trim() && job.companyName) columns.company = job.companyName;
  }

  if (match) {
    columns.gaps = {
      matchScore: match.score || 0,
      matchingSkills: match.matchedRequirements || [],
      missingSkills: match.missingSkills || [],
      matchingExperience: [],
      missingExperience: [],
      suggestions: [],
    };
    const score = clampScore(match.score);
    if (score !== undefined) columns.match_score = score;
    columns.matching_skills = match.matchedRequirements || [];
    columns.missing_skills = match.missingSkills || [];
  }

  if (companyResearch) {
    // company_address and company_contact_person are not written here: they
    // are server-managed from the ad by the cover letter (fillLetterRecipient).
    columns.company_research = companyResearch;
  }

  return columns;
}

// ---------------------------------------------------------------------------
// Statement builder, shared with the Queue runner's atomic batch
// ---------------------------------------------------------------------------

/** Columns stored as JSON text. Everything else is bound as is. */
const JSON_COLUMNS = new Set([
  'requirements', 'gaps', 'generated_cv', 'cover_letter', 'email', 'follow_up_email', 'company_research',
  'cv_edits', 'fit_assessment', 'generated_artifacts', 'matching_skills', 'missing_skills', 'suggestions',
]);

const WRITABLE_COLUMNS = new Set([
  ...JSON_COLUMNS,
  'job_title', 'company', 'job_description', 'job_url', 'match_score',
  'optimized_cv_text', 'email_subject', 'email_body', 'selected_template', 'cover_letter_language',
  'generation_completed', 'generation_status', 'generation_error', 'generation_started_at',
  'generation_completed_at', 'generation_failed_at', 'generation_cancelled_at',
]);

function encodeColumn(name: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (JSON_COLUMNS.has(name)) return JSON.stringify(value);
  return value;
}

/**
 * `UPDATE application_sessions SET ..., revision = revision + 1 WHERE id AND
 * user_id AND revision = expected`. Column names come from a fixed allow-list,
 * never from input.
 */
export function buildSessionUpdateStatement(
  userId: string,
  sessionId: string,
  columns: Json,
  expectedRevision: number,
  now: string = nowIso(),
  extraGuard?: SQL,
): SQL {
  const sets: SQL[] = [];
  for (const [name, value] of Object.entries(columns)) {
    if (!WRITABLE_COLUMNS.has(name)) throw new Error(`Column "${name}" is not writable here`);
    sets.push(sql`${sql.identifier(name)} = ${encodeColumn(name, value)}`);
  }
  return sql`
    UPDATE application_sessions
    SET ${sql.join(sets, sql`, `)}, revision = revision + 1, updated_at = ${now}
    WHERE id = ${sessionId} AND user_id = ${userId} AND revision = ${expectedRevision}
      ${extraGuard ? sql`AND ${extraGuard}` : sql``}
  `;
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

const PERSIST_ATTEMPTS = 5;

/**
 * Write a finished kit. Returns the new revision.
 *
 * Without `expectedRevision` this is the "generation wins" writer: it reads the
 * row, builds the columns against it and writes conditional on the revision it
 * read, retrying if a user edit lands in between. A kit is a deliberate
 * overwrite of the previous kit, so it takes whatever revision is current.
 * With `expectedRevision` it is strictly conditional and throws
 * `RevisionConflict` instead of retrying.
 */
export async function persistKit(
  userId: string,
  sessionId: string,
  results: KitResults,
  options: { expectedRevision?: number } = {},
): Promise<{ revision: number }> {
  for (let attempt = 0; attempt < PERSIST_ATTEMPTS; attempt++) {
    const row = await sessionsRepo.getSession(userId, sessionId);
    if (!row) throw new NotFoundError();
    const expected = options.expectedRevision ?? row.revision;
    const columns = kitColumnsFromResults(results, row);
    const written = await sessionsRepo.updateSession(
      userId,
      sessionId,
      columns as Parameters<typeof sessionsRepo.updateSession>[2],
      { expectedRevision: expected },
    );
    if (!written.error) return { revision: written.revision as number };
    if (written.error instanceof RevisionConflict) {
      if (options.expectedRevision !== undefined) throw written.error;
      continue;
    }
    if (written.error.message === 'Application not found') throw new NotFoundError();
    throw written.error;
  }
  throw new RevisionConflict(null);
}

export type KitDocumentKey = 'coverLetter' | 'email' | 'followUpEmail';

const DOCUMENT_COLUMN: Record<KitDocumentKey, string> = {
  coverLetter: 'cover_letter',
  email: 'email',
  followUpEmail: 'follow_up_email',
};

/**
 * Replace one document (a regenerate, a direct edit). Bumps the revision.
 * Conditional on `expectedRevision` when given; the regenerate routes pass
 * nothing, because the document they replace is theirs by design and a user
 * edit to another field during the model call must not fail the paid write.
 */
export async function saveKitDocument(
  userId: string,
  sessionId: string,
  document: KitDocumentKey,
  value: unknown,
  options: { expectedRevision?: number; extra?: Json } = {},
): Promise<{ revision: number }> {
  const column = DOCUMENT_COLUMN[document];
  const extra: Json = { ...(options.extra ?? {}) };
  if (document === 'email' && value && typeof value === 'object') {
    const email = value as { subject?: unknown; body?: unknown };
    extra.email_subject = typeof email.subject === 'string' ? email.subject : null;
    extra.email_body = typeof email.body === 'string' ? email.body : null;
  }
  const written = await sessionsRepo.updateSession(
    userId,
    sessionId,
    { [column]: value, ...extra } as Parameters<typeof sessionsRepo.updateSession>[2],
    options.expectedRevision !== undefined ? { expectedRevision: options.expectedRevision } : {},
  );
  if (written.error) {
    if (written.error instanceof RevisionConflict) throw written.error;
    if (written.error.message === 'Application not found') throw new NotFoundError();
    throw written.error;
  }
  return { revision: written.revision as number };
}
