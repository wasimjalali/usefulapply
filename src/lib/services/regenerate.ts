/**
 * Regenerate one document of an application (cover letter, application email,
 * follow-up email) or rewrite one CV section, from the data the server holds.
 *
 * This is the body of POST /api/regenerate, moved out of the route so the MCP
 * tools (`regenerate_document`, `rewrite_cv_section`) run exactly the same
 * code with the same guards. The route and the tools differ only in how they
 * pay: each reserves credits between `prepareRegeneration` (which settles every
 * check that can refuse a request, so nothing is reserved for a request that
 * could never succeed) and `execute`, then captures or releases the
 * reservation from the result.
 *
 * Ownership comes from `userId`. The applicant, the CV text and the job
 * description are read from the user's stored rows, never from the caller.
 */

import type { TokenUsage } from '@/lib/agents/types';
import { sql, type SQL } from 'drizzle-orm';
import {
  unifiedWriterAgent,
  resolveCVSectionTarget,
  type CVSectionRewriteResult,
  type ResolvedCVSection,
  type WriterCacheOptions,
} from '@/lib/agents/unified-writer-agent';
import type { MasterContext } from '@/lib/agents/types';
import { loadApplicantLogistics } from '@/lib/profile/logistics.server';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { MAX_INSTRUCTION_CHARS, flattenInstruction } from '@/lib/agents/chat-tools/untrusted';
import { saveLetterRecipientFromAd } from '@/lib/agents/persist-letter-recipient';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { getDocumentByType, type Document } from '@/db/repos/documents';
import { clearKitDocumentError, getSession, updateSession } from '@/db/repos/sessions';
import { applyRewrittenSection, type CvRewriteSection } from '@/lib/cv-structure/apply-rewrite';
import type { TailoredCV } from '@/lib/cv-structure/types';
import type { CreditAction } from '@/lib/credit-costs';
import { detectLanguage, isSupportedLanguage, normalizeLanguage } from '@/lib/utils/language-detector';
import { editTailoredCv, getTailoredCv } from './cv';
import { EDIT_HISTORY_KEEP, historyPriorValue, saveRecordedKitDocument, type EditGroup } from './edit-history';
import { InvalidInputError, NotFoundError, RevisionConflict } from './errors';
import { buildSessionUpdateStatement, coverLetterShell, kitDocumentColumns, kitFromRow, type KitDocumentKey } from './kit';

export type RegenerateType = 'cover-letter' | 'email' | 'follow_up_email' | 'cv_section';

/** The writer answered with an empty document. Nothing was saved; callers release the reservation. */
export class EmptyGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyGenerationError';
  }
}

/** A request that can never succeed as sent. Raised before anything is reserved, so nothing was charged. */
export class RegenerateRequestError extends Error {
  constructor(
    readonly status: 400 | 404,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'RegenerateRequestError';
  }
}

export interface RegenerateRequest {
  sessionId: string;
  type: RegenerateType;
  /** One sentence from the user. Capped and flattened here. */
  instruction?: unknown;
  /** For `cv_section`: the section kind and, for a role, project or custom section, its entry id. */
  section?: { kind?: unknown; id?: unknown };
  /** The language the user asked for, when it differs from the ad's. */
  userLanguageOverride?: unknown;
}

export interface ExecuteOptions {
  /**
   * Write an applied CV section rewrite onto the tailored CV (a revisioned, recorded edit).
   * The browser applies the section itself and saves it with the revision it holds, so the
   * route leaves this off; the MCP tool turns it on.
   */
  persistSection?: boolean;
}

export type RegenerationResult =
  | {
      type: 'cover-letter';
      coverLetter: string;
      coverLetterStructured: StructuredCoverLetter;
      revision: number;
      tokens: TokenUsage;
    }
  | { type: 'email'; email: { subject: string; body: string }; revision: number; tokens: TokenUsage }
  | {
      type: 'follow_up_email';
      followUpEmail: { subject: string; body: string; recommendedDelay: number };
      revision: number;
      tokens: TokenUsage;
    }
  | {
      type: 'cv_section';
      outcome: CVSectionRewriteResult;
      /** Set when `persistSection` was on and the rewrite landed on the stored CV. */
      landed?: boolean;
      revision?: number;
    };

/** What a writer produced, before any of it is saved. */
export type GeneratedRegeneration =
  | {
      kind: 'document';
      document: KitDocumentKey;
      value: unknown;
      /** Columns that ride with the document (the letter's language). */
      extra?: Record<string, unknown>;
      /** Bookkeeping once the document is saved (the recipient, the failure mark). It never fails the save. Returns the revision afterwards. */
      afterSave(revision: number): Promise<number>;
      toResult(revision: number): RegenerationResult;
    }
  | { kind: 'cv_section'; outcome: CVSectionRewriteResult };

/** The statements that save a generated output, built and not run. The last one is the revision-guarded write that lands it. */
export interface BuiltRegenerationWrite {
  statements: SQL[];
  result: RegenerationResult;
  /** Bookkeeping to run once the statements have committed. */
  afterLanded(): Promise<void>;
}

export interface PreparedRegeneration {
  sessionId: string;
  type: RegenerateType;
  creditAction: Extract<CreditAction, 'COVER_LETTER_REGEN' | 'EMAIL_REGEN' | 'FOLLOW_UP_REGEN' | 'CV_SECTION_REWRITE'>;
  /** For `cv_section`: the section as it stands now (its `before` text), resolved while the request was checked. Null for documents. */
  section: ResolvedCVSection | null;
  /** Run the writer. Saves nothing, except the detected language of the ad when the application has none. */
  generate(generationContext: LlmGenerationContext): Promise<GeneratedRegeneration>;
  /** `generate`, then save the output now (the route's path: it settles credits around this call). */
  execute(generationContext: LlmGenerationContext, options?: ExecuteOptions): Promise<RegenerationResult>;
  /**
   * The statements that save a generated output, for a caller that commits them together with its
   * own settlement (inline-operations.ts). Reads the application as it stands now, so it can be called
   * again after a lost revision race. Null when an applied section rewrite has nowhere to land (the
   * section was deleted while the writer ran). `guard` is ANDed into every statement.
   */
  buildWrite(generated: GeneratedRegeneration, guard: SQL, now: string): Promise<BuiltRegenerationWrite | null>;
}

/**
 * A regenerated document is often rewritten again in the same session (a new instruction after reading the
 * result), so its writer keeps the session context in the prompt cache for an hour. See WriterCacheOptions.
 */
const SESSION_REUSE: WriterCacheOptions = { reusedInSession: true };

const CREDIT_ACTION = {
  'cover-letter': 'COVER_LETTER_REGEN',
  follow_up_email: 'FOLLOW_UP_REGEN',
  cv_section: 'CV_SECTION_REWRITE',
  email: 'EMAIL_REGEN',
} as const;

/** Settle every check that can refuse the request. Nothing is reserved, written or charged here. */
export async function prepareRegeneration(userId: string, request: RegenerateRequest): Promise<PreparedRegeneration> {
  const sessionId = typeof request.sessionId === 'string' ? request.sessionId.trim() : '';
  if (!sessionId) throw new RegenerateRequestError(404, undefined, 'Application not found');
  const session = await getSession(userId, sessionId);
  if (!session) throw new RegenerateRequestError(404, undefined, 'Application not found');

  const [primaryCv, storedMasterCv] = await Promise.all([
    getDocumentByType(userId, 'primary_cv'),
    getDocumentByType(userId, 'master_cv'),
  ]);
  const rawCV = primaryCv?.raw_text?.trim() || '';
  if (!rawCV) throw new RegenerateRequestError(400, 'NO_SOURCE_CV', 'We need your CV to rewrite this.');
  const storedGeneratedCv = session.generated_cv && typeof session.generated_cv === 'object'
    ? session.generated_cv as Record<string, unknown>
    : null;
  const storedOptimizedCvData = storedGeneratedCv?._optimizedCVData
    ?? storedGeneratedCv;
  const documentApplicant = mergeApplicants(
    applicantFromDocument(primaryCv),
    applicantFromDocument(storedMasterCv),
  );
  const applicant = mergeApplicants(
    documentApplicant,
    applicantFromStructuredData(storedOptimizedCvData),
  );
  if (!applicant?.name.trim()) {
    throw new RegenerateRequestError(400, 'NO_APPLICANT', 'We could not resolve the applicant from the saved CV.');
  }
  const verifiedMetrics = verifiedMetricsFromDocuments(primaryCv, storedMasterCv);

  // A rewrite instruction typed by the user. It is user-authored, not ad-authored, but it still
  // rides into a prompt, so it is length-capped and flattened here rather than trusted. Anything
  // past the cap is a paste, not an instruction, and is refused rather than silently truncated: a
  // half-read instruction is worse than none.
  let userInstruction: string | undefined;
  const instruction = request.instruction;
  if (instruction !== undefined && instruction !== null) {
    if (typeof instruction !== 'string') {
      throw new RegenerateRequestError(400, undefined, 'instruction must be a string');
    }
    if (instruction.length > MAX_INSTRUCTION_CHARS) {
      throw new RegenerateRequestError(400, 'INSTRUCTION_TOO_LONG', 'instruction is too long');
    }
    userInstruction = flattenInstruction(instruction) || undefined;
  }

  // A section rewrite needs a generated CV to rewrite a section of, and a target that exists
  // inside it. Both are settled before anything is reserved, so a request that could never
  // succeed never touches credits.
  let resolvedSection: ResolvedCVSection | null = null;
  if (request.type === 'cv_section') {
    // Without the Primary CV there is no source to check a claim against. The two guards fail in
    // opposite directions on an empty haystack: the number guard passes everything, since no
    // number can be contradicted by a document that is not there, and the claim guard refuses
    // everything, since no word in the rewrite can be traced. Neither answer is worth charging
    // for, so refuse before anything is reserved.
    if (!storedOptimizedCvData || typeof storedOptimizedCvData !== 'object') {
      throw new RegenerateRequestError(
        400,
        'NO_CV_DATA',
        'There is no generated CV on this application yet, so there is no section to rewrite.',
      );
    }
    resolvedSection = resolveCVSectionTarget(
      storedOptimizedCvData as NonNullable<MasterContext['optimizedCVData']>,
      (request.section ?? {}) as { kind?: unknown; id?: unknown },
    );
    if (!resolvedSection) {
      throw new RegenerateRequestError(400, 'INVALID_SECTION', 'That is not a section we can rewrite, or it is not in this CV.');
    }
  }

  const creditAction = CREDIT_ACTION[request.type as keyof typeof CREDIT_ACTION];
  if (!creditAction) throw new RegenerateRequestError(400, undefined, 'Invalid type. Must be "cover-letter", "email", "follow_up_email", or "cv_section"');

  const prepared: PreparedRegeneration = {
    sessionId: session.id,
    type: request.type,
    creditAction,
    section: resolvedSection,
    async generate(generationContext) {
      const storedArtifacts = readRecord(session.generated_artifacts);
      const storedRequirements = readRecord(session.requirements);
      const storedLanguage = isSupportedLanguage(storedRequirements?.detectedLanguage)
        ? storedRequirements.detectedLanguage
        : storedDetectedLanguage(storedArtifacts);
      const claimableEvidence = persistedClaimableEvidence(storedArtifacts)
        .filter((evidence) => isExplicitlyInCv(evidence, rawCV, storedMasterCv?.raw_text));
      const detectedLanguage = storedLanguage
        ?? await detectLanguage(session.job_description || '', generationContext);
      if (!storedLanguage) {
        // `requirements` is a column the browser also writes, so this write bumps the
        // revision: a write the revision does not announce could be overwritten by a
        // browser save, or never seen by an open tab. An open tab merges it field by
        // field, so it does not conflict with an unrelated edit.
        const persistedLanguage = await updateSession(userId, session.id, {
          generated_artifacts: { ...(storedArtifacts ?? {}), detectedLanguage },
          requirements: { ...(storedRequirements ?? {}), detectedLanguage },
        });
        if (persistedLanguage.error) throw persistedLanguage.error;
      }

      // The applicant's saved start date and salary expectation, read fresh from D1 (an answer saved
      // after the kit was written still counts). Not swallowed: a failed read fails the generation,
      // which both callers release as for any other failure. A CV section has no use for them.
      const logistics = request.type === 'cv_section' ? undefined : await loadApplicantLogistics(userId);

      // CRITICAL: masterCV, verifiedMetrics, and match must be passed through so that
      // anti-hallucination rules have the same source data as first generation.
      const masterContext: MasterContext = {
        sessionId: session.id,
        jobDescription: session.job_description,
        rawCV,
        masterCV: storedMasterCv?.raw_text || undefined,
        detectedLanguage: detectedLanguage,
        userLanguageOverride: request.userLanguageOverride === undefined
          ? undefined
          : normalizeLanguage(request.userLanguageOverride),
        applicant,
        job: jobFromSession(session),
        companyResearch: session.company_research && typeof session.company_research === 'object'
          ? session.company_research as MasterContext['companyResearch']
          : undefined,
        match: session.matching_skills.length > 0 || session.missing_skills.length > 0 || claimableEvidence.length > 0
            ? {
              score: session.match_score ?? 0,
              matchedRequirements: session.matching_skills,
              claimableEvidence,
              missingSkills: session.missing_skills.filter((skill) => !isExplicitlyInCv(skill, rawCV, storedMasterCv?.raw_text)),
            }
          : undefined,
        verifiedMetrics,
        userInstruction,
        letterRecipient: {
          companyName: session.company,
          address: session.company_address,
          contactPerson: session.company_contact_person,
        },
        logistics,
      };

      if (request.type === 'cover-letter') {
        const { result: letter, tokens } = await unifiedWriterAgent.generateCoverLetter(masterContext, generationContext, SESSION_REUSE);
        const coverLetter = letter.body;
        if (!coverLetter.trim()) {
          throw new EmptyGenerationError('Empty cover letter generation');
        }
        const existingCoverLetter = session.cover_letter && typeof session.cover_letter === 'object'
          ? session.cover_letter as Record<string, unknown>
          : {};
        // A new letter replaces any structured copy of the old one.
        const persistedCoverLetter = {
          ...coverLetterShell(),
          ...existingCoverLetter,
          body: coverLetter,
          structured: letter.structured,
          updatedAt: new Date().toISOString(),
        };
        return {
          kind: 'document',
          document: 'coverLetter',
          value: persistedCoverLetter,
          extra: { cover_letter_language: letter.structured.language },
          async afterSave(saved) {
            let revision = saved;
            try {
              const filled = await saveLetterRecipientFromAd(userId, session.id, session.job_description, letter.structured);
              // Filling the recipient bumps the revision once more; report the final one.
              if (filled.revision !== undefined) revision = filled.revision;
            } catch (error) {
              // The letter already carries the recipient; only the editable copy on
              // the session row is missing.
              console.error('[regenerate] Failed to save the cover letter recipient:', error);
            }
            await clearDocumentMark(userId, session.id, 'coverLetter');
            return revision;
          },
          toResult: (revision) => ({ type: 'cover-letter', coverLetter, coverLetterStructured: letter.structured, revision, tokens }),
        };
      }

      if (request.type === 'email') {
        const { result: email, tokens } = await unifiedWriterAgent.generateApplicationEmail(masterContext, generationContext, SESSION_REUSE);
        if (!email?.subject?.trim() || !email?.body?.trim()) {
          throw new EmptyGenerationError('Empty application email generation');
        }
        return {
          kind: 'document',
          document: 'email',
          value: {
            subject: email.subject,
            body: email.body,
            attachmentNote: 'Please find my CV and cover letter attached.',
          },
          async afterSave(saved) {
            await clearDocumentMark(userId, session.id, 'applicationEmail');
            return saved;
          },
          toResult: (revision) => ({ type: 'email', email: { subject: email.subject, body: email.body }, revision, tokens }),
        };
      }

      if (request.type === 'follow_up_email') {
        if (session.email && typeof session.email === 'object') {
          const storedEmail = session.email as Record<string, unknown>;
          if (typeof storedEmail.subject === 'string' && typeof storedEmail.body === 'string') {
            masterContext.applicationEmail = { subject: storedEmail.subject, body: storedEmail.body };
          }
        }
        const { result: followUpEmail, tokens } = await unifiedWriterAgent.generateFollowUpEmail(masterContext, generationContext, SESSION_REUSE);
        if (!followUpEmail?.subject?.trim() || !followUpEmail?.body?.trim()) {
          throw new EmptyGenerationError('Empty follow-up email generation');
        }
        return {
          kind: 'document',
          document: 'followUpEmail',
          value: {
            subject: followUpEmail.subject,
            body: followUpEmail.body,
            recommendedDelay: followUpEmail.recommendedDelay || 5,
          },
          async afterSave(saved) {
            await clearDocumentMark(userId, session.id, 'followUpEmail');
            return saved;
          },
          toResult: (revision) => ({
            type: 'follow_up_email',
            followUpEmail: {
              subject: followUpEmail.subject,
              body: followUpEmail.body,
              recommendedDelay: followUpEmail.recommendedDelay || 5,
            },
            revision,
            tokens,
          }),
        };
      }

      // cv_section: resolvedSection is set (checked above).
      const outcome = await unifiedWriterAgent.rewriteCVSection(masterContext, resolvedSection as ResolvedCVSection, generationContext);
      return { kind: 'cv_section', outcome };
    },

    async execute(generationContext, options = {}) {
      const generated = await prepared.generate(generationContext);
      if (generated.kind === 'document') {
        const saved = await saveRecordedKitDocument(userId, session.id, generated.document, generated.value, { extra: generated.extra });
        return generated.toResult(await generated.afterSave(saved.revision));
      }
      const { outcome } = generated;
      if (outcome.status === 'applied' && options.persistSection) {
        const written = await persistRewrittenSection(userId, session.id, outcome);
        return { type: 'cv_section', outcome, landed: written !== null, revision: written?.revision };
      }
      return { type: 'cv_section', outcome };
    },

    async buildWrite(generated, guard, now) {
      const row = await getSession(userId, session.id);
      if (!row) throw new NotFoundError();
      const revision = row.revision + 1;
      if (generated.kind === 'document') {
        const columns = kitDocumentColumns(generated.document, generated.value, generated.extra);
        return {
          statements: await recordedEditStatements({
            userId,
            sessionId: session.id,
            group: DOCUMENT_GROUP[generated.document],
            columns,
            row,
            now,
            guard,
          }),
          result: generated.toResult(revision),
          afterLanded: async () => {
            await generated.afterSave(revision);
          },
        };
      }
      const { outcome } = generated;
      if (outcome.status !== 'applied') throw new Error('Only an applied section rewrite has something to save');
      // The same value saveTailoredCvData writes: the structured CV replaced inside the stored generated_cv.
      const kit = kitFromRow(row);
      if (!kit.optimizedCVData) return null;
      const next = applyRewrittenSection(kit.optimizedCVData as TailoredCV, outcome.kind as CvRewriteSection, outcome.id, outcome.content);
      if (!next) return null;
      const base = readRecord(row.generated_cv) ?? (kit.cv ? { ...(kit.cv as unknown as Record<string, unknown>) } : {});
      const generatedCv = { ...base, _optimizedCVData: next };
      if (JSON.stringify(generatedCv).length > MAX_TAILORED_CV_CHARS) throw new InvalidInputError('That change makes the CV too large');
      return {
        statements: await recordedEditStatements({
          userId,
          sessionId: session.id,
          group: 'cv',
          columns: { generated_cv: generatedCv },
          row,
          now,
          guard,
        }),
        result: { type: 'cv_section', outcome, landed: true, revision },
        afterLanded: async () => {},
      };
    },
  };
  return prepared;
}

const DOCUMENT_GROUP: Record<KitDocumentKey, EditGroup> = {
  coverLetter: 'cover_letter',
  email: 'email',
  followUpEmail: 'follow_up_email',
};

/** Same ceiling saveTailoredCvData applies to one CV write. */
const MAX_TAILORED_CV_CHARS = 3_000_000;

/**
 * `applyRecordedEdit` as statements, so a caller can run them in a batch of its own: the history row
 * of the value being replaced (only while the application is still at `row.revision`), the trim of
 * old history, and the revision-guarded write last. Every statement also needs `guard`.
 */
async function recordedEditStatements(params: {
  userId: string;
  sessionId: string;
  group: EditGroup;
  columns: Record<string, unknown>;
  row: Awaited<ReturnType<typeof getSession>> & object;
  now: string;
  guard: SQL;
}): Promise<SQL[]> {
  const { userId, sessionId, group, columns, row, now, guard } = params;
  const prior = await historyPriorValue(group, row, columns);
  return [
    sql`
      INSERT INTO application_edit_history (id, user_id, session_id, edit_group, revision, prior_value, created_at)
      SELECT ${crypto.randomUUID()}, ${userId}, ${sessionId}, ${group}, ${row.revision}, ${JSON.stringify(prior)}, ${now}
      WHERE EXISTS (
        SELECT 1 FROM application_sessions
        WHERE id = ${sessionId} AND user_id = ${userId} AND revision = ${row.revision}
      ) AND ${guard}
    `,
    sql`
      DELETE FROM application_edit_history
      WHERE user_id = ${userId} AND session_id = ${sessionId} AND edit_group = ${group} AND ${guard}
        AND id NOT IN (
          SELECT id FROM application_edit_history
          WHERE user_id = ${userId} AND session_id = ${sessionId} AND edit_group = ${group}
          ORDER BY created_at DESC, rowid DESC
          LIMIT ${EDIT_HISTORY_KEEP}
        )
    `,
    buildSessionUpdateStatement(userId, sessionId, columns, row.revision, now, guard),
  ];
}

/**
 * Put an applied section rewrite onto the stored tailored CV. The CV is read again at write time
 * (a canvas or agent edit may have landed while the writer ran) and only the one field changes. A
 * revision conflict is retried against the fresh copy; `null` means the section is no longer on
 * the CV, so the rewrite had nowhere to land.
 */
async function persistRewrittenSection(
  userId: string,
  sessionId: string,
  outcome: Extract<CVSectionRewriteResult, { status: 'applied' }>,
): Promise<{ revision: number } | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getTailoredCv(userId, sessionId);
    if (!current.data) return null;
    const next = applyRewrittenSection(current.data as TailoredCV, outcome.kind as CvRewriteSection, outcome.id, outcome.content);
    if (!next) return null;
    try {
      return await editTailoredCv(userId, sessionId, current.revision, () => next as unknown as Record<string, unknown>);
    } catch (error) {
      if (error instanceof RevisionConflict) continue;
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
  throw new RevisionConflict(null);
}

/**
 * The failure mark is cosmetic once the document exists (tabs only show it
 * while the document is missing), so a miss is logged and never turns a saved
 * document into a failure and a refund.
 */
async function clearDocumentMark(
  userId: string,
  sessionId: string,
  document: 'coverLetter' | 'applicationEmail' | 'followUpEmail',
): Promise<void> {
  try {
    await clearKitDocumentError(userId, sessionId, document);
  } catch (error) {
    console.error('[regenerate] Could not clear the failure mark:', document, error);
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function storedDetectedLanguage(artifacts: Record<string, unknown> | null): string | undefined {
  if (isSupportedLanguage(artifacts?.detectedLanguage)) return artifacts.detectedLanguage;
  const pending = readRecord(artifacts?.pendingFitAnalysis);
  const contextData = readRecord(pending?.contextData);
  return isSupportedLanguage(contextData?.detectedLanguage) ? contextData.detectedLanguage : undefined;
}

function persistedClaimableEvidence(artifacts: Record<string, unknown> | null): string[] {
  const match = readRecord(artifacts?.match);
  const details = Array.isArray(match?.details) ? match.details : [];
  const detailEvidence = details.flatMap((value) => {
    const detail = readRecord(value);
    const evidence = readString(detail?.evidence);
    return detail?.claimable === true && evidence ? [evidence] : [];
  });
  const canonical = readStringList(match?.claimableEvidence);
  return uniqueStrings([...canonical, ...detailEvidence]);
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readDate(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  const date = readRecord(value);
  return readString(date?.raw) || undefined;
}

function applicantFromStructuredData(structured: unknown): MasterContext['applicant'] | undefined {
  const data = readRecord(structured);
  const personal = readRecord(data?.personal);
  if (!data || !personal) return undefined;

  const name = readString(personal.fullName);
  const email = readString(personal.email);
  const experiences = Array.isArray(data.experience)
    ? data.experience.flatMap((value) => {
        const item = readRecord(value);
        if (!item) return [];
        return [{
          company: readString(item.company),
          title: readString(item.position) || readString(item.title),
          startDate: readDate(item.startDate),
          endDate: readDate(item.endDate),
          bullets: readStringList(item.bullets),
        }];
      })
    : [];
  const skillGroups = Array.isArray(data.skills) ? data.skills : [];
  const skills = skillGroups.flatMap((value) => {
    const item = readRecord(value);
    return readStringList(item?.skills ?? item?.items);
  });
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const tools = [
    ...experiences.flatMap((_, index) => {
      const item = readRecord((data.experience as unknown[])[index]);
      return readStringList(item?.technologies);
    }),
    ...projects.flatMap((value) => readStringList(readRecord(value)?.technologies)),
  ];
  const languages = Array.isArray(data.languages)
    ? data.languages.flatMap((value) => {
        const item = readRecord(value);
        if (!item) return [];
        const language = readString(item.language);
        const proficiency = readString(item.proficiency);
        return language ? [`${language}${proficiency ? ` ${proficiency}` : ''}`] : [];
      })
    : [];
  const certifications = Array.isArray(data.certifications)
    ? data.certifications.flatMap((value) => {
        const item = readRecord(value);
        if (!item) return [];
        const name = readString(item.name);
        const issuer = readString(item.issuer);
        return name ? [`${name}${issuer ? ` (${issuer})` : ''}`] : [];
      })
    : [];

  if (!name && !email && experiences.length === 0 && skills.length === 0) return undefined;
  return {
    name,
    email,
    phone: readString(personal.phone) || undefined,
    address: [personal.address, personal.city, personal.country]
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .join(', ') || undefined,
    headline: readString(personal.currentTitle) || undefined,
    skills: uniqueStrings(skills),
    tools: uniqueStrings(tools),
    languages: uniqueStrings(languages),
    experiences,
    certifications: uniqueStrings(certifications),
  };
}

function applicantFromDocument(doc: Document | null): MasterContext['applicant'] | undefined {
  return applicantFromStructuredData(doc?.structured_data);
}

function mergeApplicants(
  primary: MasterContext['applicant'] | undefined,
  master: MasterContext['applicant'] | undefined,
): MasterContext['applicant'] | undefined {
  if (!primary) return master;
  if (!master) return primary;
  return {
    name: primary.name || master.name,
    email: primary.email || master.email,
    phone: primary.phone || master.phone,
    address: primary.address || master.address,
    headline: primary.headline || master.headline,
    skills: uniqueStrings([...primary.skills, ...master.skills]),
    tools: uniqueStrings([...primary.tools, ...master.tools]),
    languages: uniqueStrings([...primary.languages, ...master.languages]),
    experiences: [...primary.experiences, ...master.experiences],
    certifications: uniqueStrings([...primary.certifications, ...master.certifications]),
  };
}

function isExplicitlyInCv(value: string, ...sources: Array<string | null | undefined>): boolean {
  const claim = value.trim().normalize('NFKC').replace(/\s+/g, ' ');
  if (!claim) return false;
  const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
  return sources.some((source) => pattern.test(source?.normalize('NFKC').replace(/\s+/g, ' ') ?? ''));
}

function verifiedMetricsFromDocuments(...docs: Array<Document | null>): string[] | undefined {
  const metrics = docs.flatMap((doc) => {
    const structured = readRecord(doc?.structured_data);
    const summary = readString(structured?.summary);
    const experiences = Array.isArray(structured?.experience) ? structured.experience : [];
    const sourceBullets = (doc?.raw_text?.split(/\r?\n/) ?? [])
      .filter((line) => /^\s*[•·▪◦*-]\s+/.test(line));
    return [summary, ...experiences.flatMap((value) => readStringList(readRecord(value)?.bullets)), ...sourceBullets]
      .filter(looksLikeQuantifiedAchievement);
  });
  const unique = uniqueStrings(metrics).slice(0, 30);
  return unique.length > 0 ? unique : undefined;
}

function looksLikeQuantifiedAchievement(value: string): boolean {
  const text = value.trim().replace(/^\s*[•·▪◦*-]\s+/u, '').replace(/\s+/g, ' ');
  if (!/\d/.test(text)) return false;
  if (/https?:\/\/|www\.|\b\S+@\S+\b/i.test(text)) return false;
  if (/^(?:phone|tel|mobile|fax)?\s*:?\s*\+?\d[\d\s().-]{7,}\d$/i.test(text)) return false;
  // Postcode/address lines only: a 4-5 digit number followed by at most two
  // capitalized tokens ("10115 Berlin", "1234 AB Amsterdam"). Quantified
  // achievements ("3000 users onboarded", "5000 tickets resolved") stay in.
  if (/^\d{4,5}\s+[\p{Lu}][\p{L}\p{M}.'-]*(?:[,\s]+[\p{Lu}][\p{L}\p{M}.'-]*)?$/u.test(text)) return false;

  const withoutDates = text
    .replace(/\b(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|present|current|heute|aktuell)\b/giu, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ');
  return /%|[$€£¥]|\b\d+(?:[.,]\d+)?\s*[x×]\b|\b\d+(?:[.,]\d+)?\s*(?:USD|EUR|GBP)\b|\b\d+(?:[.,]\d+)?\s+\p{L}{3,}\b/iu.test(withoutDates);
}

function jobFromSession(session: Awaited<ReturnType<typeof getSession>>): MasterContext['job'] | undefined {
  if (!session) return undefined;
  const requirements = session.requirements && typeof session.requirements === 'object'
    ? session.requirements as Record<string, unknown>
    : null;
  const list = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    title: readString(requirements?.title) || session.job_title || '',
    companyName: readString(requirements?.company) || session.company || '',
    location: readString(requirements?.location) || undefined,
    workType: readString(requirements?.workType) || undefined,
    requiredSkills: list(requirements?.hardSkills),
    niceToHaveSkills: list(requirements?.niceToHave),
    responsibilities: list(requirements?.responsibilities),
    startDate: readString(requirements?.startDate) || undefined,
    expectedSalary: readString(requirements?.expectedSalary) || undefined,
  };
}
