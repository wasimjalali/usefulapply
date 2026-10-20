/**
 * Client side of /api/regenerate. The chat is the only place a regeneration
 * starts (cost chip first), so the context building and the result write live
 * here instead of in each kit panel.
 */

import { useCVStore } from '@/store/useCVStore';
import { useSessionStore, type ApplicationSession } from '@/store/useSessionStore';
import type { KitTab } from '@/store/useUIStore';
import type { GeneratedCoverLetter } from '@/lib/types';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { generateRequestId } from '@/lib/utils/requestId';
import { triggerCreditUpdate } from '@/lib/utils/creditEvents';
import { MAX_INSTRUCTION_CHARS, flattenInstruction } from '@/lib/agents/chat-tools/untrusted';
import type { KitDocument } from '@/lib/agents/types';

export type RegenTarget = 'cover-letter' | 'email' | 'follow-up';

export const REGEN_META: Record<RegenTarget, {
  type: 'cover-letter' | 'email' | 'follow_up_email';
  cost: number;
  tab: KitTab;
  /** What the user calls it. */
  noun: string;
  /** Named stage shown while it runs. */
  stage: string;
}> = {
  'cover-letter': {
    type: 'cover-letter',
    cost: CREDIT_COSTS.COVER_LETTER_REGEN,
    tab: 'cover-letter',
    noun: 'cover letter',
    stage: 'Rewriting the cover letter',
  },
  email: {
    type: 'email',
    cost: CREDIT_COSTS.EMAIL_REGEN,
    tab: 'email',
    noun: 'application email',
    stage: 'Rewriting the application email',
  },
  'follow-up': {
    type: 'follow_up_email',
    cost: CREDIT_COSTS.FOLLOW_UP_REGEN,
    tab: 'email',
    noun: 'follow-up email',
    stage: 'Rewriting the follow-up email',
  },
};

/**
 * Reads the composer text for a rewrite request and names the document.
 * Returns null when the message is not a rewrite request. Explicit document
 * words win over the verb list so "make it shorter" alone stays a chat turn.
 */
export function detectRegenTarget(text: string, openDocument: RegenTarget | 'cv' | null = null): RegenTarget | 'cv' | null {
  const t = text.trim().toLowerCase();
  // "What did you change in the CV?" is a question about the kit, not an order.
  if (/^(what|why|how|when|where|which|who|did|do|does|is|are|was|were|have|has)\b/.test(t)) return null;
  // Two families. Shape verbs ask for the same content written differently;
  // content verbs ask for something specific to go in or come out. Capability
  // 14's own example is "mention the Munich project", which carries no shape
  // verb at all, so leaving that family out would strand the feature's most
  // natural phrasing. Widening is safe because a verb alone never routes: the
  // message still has to name a document, or say "it" with one open.
  const verbs = /\b(rewrite|re-write|redo|regenerate|generate again|write (it )?again|try again|shorter|shorten|longer|tighten|trim|cut|expand|punchier|formal|casual|friendlier|warmer|tone|rephrase|reword|change|make (it|the|my|this)|improve|better|fix|update|adjust|different|new version|another version|two paragraphs|one paragraph|three paragraphs|mention|include|add|put in|emphasi[sz]e|highlight|focus on|lead with|open with|start with|end with|remove|drop|leave out|take out|swap)\b/;
  if (!verbs.test(t)) return null;
  if (/\bfollow[- ]?up\b/.test(t)) return 'follow-up';
  if (/\bcover letter\b|\bletter\b/.test(t)) return 'cover-letter';
  if (/\b(application )?e-?mail\b/.test(t)) return 'email';
  if (/\b(cv|resume|résumé)\b/.test(t)) return 'cv';
  // "Make it shorter" while a document is open means that document.
  if (openDocument && /\b(it|this|that)\b/.test(t)) return openDocument;
  return null;
}

/**
 * The composer message that asked for the rewrite IS the instruction: it is
 * user-authored and short. Returns null when there is nothing usable, or when
 * the message is long enough to be a paste rather than a request, so the
 * caller can say so instead of quietly dropping it.
 */
export function instructionFromMessage(text: string): { ok: true; instruction: string } | { ok: false; reason: 'too_long' | 'empty' } {
  const clean = flattenInstruction(text);
  if (!clean) return { ok: false, reason: 'empty' };
  if (clean.length > MAX_INSTRUCTION_CHARS) return { ok: false, reason: 'too_long' };
  return { ok: true, instruction: clean };
}

export type RegenResult =
  | { ok: true; wordCount: number; sessionId: string }
  | { ok: false; code: 'INSUFFICIENT_CREDITS'; required: number; available: number }
  | { ok: false; code: 'NO_CONTEXT' }
  | { ok: false; code: 'SIGNED_OUT' }
  | { ok: false; code: 'REQUEST_IN_PROGRESS' | 'REQUEST_ALREADY_COMPLETED' }
  | { ok: false; code: 'ERROR' };

function buildContext() {
  const { currentCV, structuredCV, masterCV } = useCVStore.getState();
  const currentSession = useSessionStore.getState().currentSession;
  if (!currentSession?.jobDescription || !currentCV) return null;
  const requirements = currentSession.requirements;
  return {
    sessionId: currentSession.id,
    jobDescription: currentSession.jobDescription,
    rawCV: currentCV.rawText,
    masterCV: masterCV?.rawText,
    applicant: structuredCV?.personal ? {
      name: structuredCV.personal.fullName || '',
      email: structuredCV.personal.email || '',
      phone: structuredCV.personal.phone || '',
      address: [
        structuredCV.personal.address,
        structuredCV.personal.city,
        structuredCV.personal.country,
      ].filter(Boolean).join(', '),
      skills: [],
      tools: [],
      languages: [],
      experiences: [],
      certifications: [],
    } : undefined,
    job: requirements ? {
      title: requirements.title || '',
      companyName: requirements.company || '',
      location: requirements.location,
      workType: requirements.workType,
      requiredSkills: requirements.hardSkills || [],
      niceToHaveSkills: requirements.niceToHave || [],
      responsibilities: requirements.responsibilities || [],
      startDate: requirements.startDate,
      expectedSalary: requirements.expectedSalary,
    } : undefined,
    match: (currentSession.matchingSkills?.length || currentSession.missingSkills?.length) ? {
      score: currentSession.matchScore ?? 0,
      matchingSkills: currentSession.matchingSkills || [],
      missingSkills: currentSession.missingSkills || [],
    } : undefined,
    companyResearch: currentSession.companyResearch || undefined,
    applicationEmail: currentSession.email
      ? { subject: currentSession.email.subject, body: currentSession.email.body }
      : undefined,
  };
}

/**
 * One regenerate per document per application at a time, across every caller
 * (a tab's Try again, the chat's Rewrite it). Module level on purpose: a
 * component's own state is lost when a tab switch remounts it, and a second
 * click there would start a second paid request with a fresh request id.
 */
const inFlightRegens = new Set<string>();
const inFlightListeners = new Set<() => void>();

function regenKey(sessionId: string, target: RegenTarget): string {
  return `${sessionId}:${target}`;
}

function setRegenInFlight(key: string, running: boolean) {
  if (running) inFlightRegens.add(key);
  else inFlightRegens.delete(key);
  for (const listener of inFlightListeners) listener();
}

export function subscribeRegenInFlight(listener: () => void): () => void {
  inFlightListeners.add(listener);
  return () => { inFlightListeners.delete(listener); };
}

export function isRegenInFlight(sessionId: string | null | undefined, target: RegenTarget): boolean {
  return Boolean(sessionId) && inFlightRegens.has(regenKey(sessionId as string, target));
}

/** The kit document a regenerate target writes. */
const REGEN_KIT_DOCUMENT: Record<RegenTarget, KitDocument> = {
  'cover-letter': 'coverLetter',
  email: 'applicationEmail',
  'follow-up': 'followUpEmail',
};

/**
 * A partial kit marks its failed documents. Once one is written, its mark
 * goes, so the tab never shows an error next to a document that exists.
 */
function clearKitDocumentError(sessionId: string, document: KitDocument): Partial<ApplicationSession> {
  const state = useSessionStore.getState();
  const session = state.sessions.find((candidate) => candidate.id === sessionId)
    ?? (state.currentSession?.id === sessionId ? state.currentSession : undefined);
  const errors = session?.kitDocumentErrors;
  if (!errors?.[document]) return {};
  const rest = { ...errors };
  delete rest[document];
  return { kitDocumentErrors: Object.keys(rest).length > 0 ? rest : null };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calls the regenerate route and writes the result into the session the
 * request was built for. If the user has moved to another application while
 * it ran, nothing is written. `requestId` becomes the server's idempotency
 * key. Every caller currently passes a fresh one, so a genuine retry reserves
 * again: pass a stored id to make a retry dedupe.
 */
export async function regenerateDocument(
  target: RegenTarget,
  requestId: string = generateRequestId(),
  instruction?: string,
  expectedSessionId?: string | null,
): Promise<RegenResult> {
  const context = buildContext();
  if (!context) return { ok: false, code: 'NO_CONTEXT' };
  const meta = REGEN_META[target];
  const sessionId = context.sessionId;
  // The caller quoted a cost for one application. The context is read from the
  // store here rather than passed in, so this check is what makes "spend on the
  // job the cost was quoted for" structural instead of a timing accident that a
  // future await in the caller could quietly undo.
  if (expectedSessionId != null && expectedSessionId !== sessionId) {
    return { ok: false, code: 'NO_CONTEXT' };
  }
  // Flattened here as well as on the server so the two agree on what "empty"
  // means: a message of only punctuation must not travel as an instruction.
  const cleanInstruction = instruction ? flattenInstruction(instruction).slice(0, MAX_INSTRUCTION_CHARS) : '';

  const key = regenKey(sessionId, target);
  if (inFlightRegens.has(key)) return { ok: false, code: 'REQUEST_IN_PROGRESS' };
  setRegenInFlight(key, true);
  try {
    return await requestRegeneration(target, meta, context, sessionId, requestId, cleanInstruction);
  } finally {
    setRegenInFlight(key, false);
  }
}

async function requestRegeneration(
  target: RegenTarget,
  meta: (typeof REGEN_META)[RegenTarget],
  context: NonNullable<ReturnType<typeof buildContext>>,
  sessionId: string,
  requestId: string,
  cleanInstruction: string,
): Promise<RegenResult> {
  try {
    const response = await fetch('/api/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
      body: JSON.stringify({
        type: meta.type,
        context,
        ...(cleanInstruction ? { instruction: cleanInstruction } : {}),
      }),
    });

    if (response.status === 401) return { ok: false, code: 'SIGNED_OUT' };
    if (response.status === 402) {
      const data = await response.json().catch(() => null);
      return {
        ok: false,
        code: 'INSUFFICIENT_CREDITS',
        required: data?.details?.required ?? meta.cost,
        available: data?.details?.available ?? 0,
      };
    }
    if (response.status === 409) {
      const data = await response.json().catch(() => null);
      if (data?.code === 'REQUEST_IN_PROGRESS' || data?.code === 'REQUEST_ALREADY_COMPLETED') {
        return { ok: false, code: data.code };
      }
    }
    if (!response.ok) {
      console.error('[Regenerate] failed:', response.status);
      return { ok: false, code: 'ERROR' };
    }

    const data = await response.json();
    // Land the result on the application that asked for it, even if the user
    // moved to another one while it ran.
    const update = (updates: Partial<ApplicationSession>) =>
      useSessionStore.getState().updateSessionById(sessionId, {
        ...updates,
        ...clearKitDocumentError(sessionId, REGEN_KIT_DOCUMENT[target]),
      });
    let wordCount = 0;

    if (target === 'cover-letter') {
      if (typeof data.coverLetter !== 'string' || !data.coverLetter.trim()) return { ok: false, code: 'ERROR' };
      const sessionState = useSessionStore.getState();
      const existingLetter = sessionState.sessions.find((session) => session.id === sessionId)?.coverLetter
        ?? (sessionState.currentSession?.id === sessionId ? sessionState.currentSession.coverLetter : undefined);
      const letter: GeneratedCoverLetter = {
        applicantAddress: existingLetter?.applicantAddress
          ?? { name: '', street: '', city: '', country: '', phone: '', email: '' },
        date: existingLetter?.date ?? '',
        companyAddress: existingLetter?.companyAddress ?? { companyName: '', street: '' },
        salutation: existingLetter?.salutation ?? '',
        body: data.coverLetter,
        closing: existingLetter?.closing ?? '',
        signatureName: existingLetter?.signatureName ?? '',
        updatedAt: new Date().toISOString(),
        // The old letter's structured copy never carries over to the new body.
        ...(isStructuredCoverLetter(data.coverLetterStructured) ? { structured: data.coverLetterStructured } : {}),
      };
      update({ coverLetter: letter });
      wordCount = countWords(data.coverLetter);
    } else if (target === 'email') {
      if (!data.email?.subject || !data.email?.body) return { ok: false, code: 'ERROR' };
      update({
        email: {
          subject: data.email.subject,
          body: data.email.body,
          attachmentNote: 'Please find my CV and cover letter attached.',
        },
      });
      wordCount = countWords(data.email.body);
    } else {
      if (!data.followUpEmail?.subject || !data.followUpEmail?.body) return { ok: false, code: 'ERROR' };
      update({
        followUpEmail: {
          subject: data.followUpEmail.subject,
          body: data.followUpEmail.body,
          recommendedDelay: data.followUpEmail.recommendedDelay || 5,
        },
      });
      wordCount = countWords(data.followUpEmail.body);
    }

    triggerCreditUpdate();
    return { ok: true, wordCount, sessionId };
  } catch (error) {
    console.error('[Regenerate] error:', error);
    return { ok: false, code: 'ERROR' };
  }
}

/**
 * Tracker follow-up: the server loads the session and CV itself, so this
 * does not depend on currentSession or currentCV being in memory.
 */
export async function regenerateFollowUpForSession(
  sessionId: string,
  requestId: string = generateRequestId(),
): Promise<RegenResult> {
  // The tracker route is a second paid path to the same follow-up, so it
  // shares the follow-up's in-flight guard with the tab retry and the chat.
  const key = regenKey(sessionId, 'follow-up');
  if (inFlightRegens.has(key)) return { ok: false, code: 'REQUEST_IN_PROGRESS' };
  setRegenInFlight(key, true);
  try {
    return await requestTrackerFollowUp(sessionId, requestId);
  } finally {
    setRegenInFlight(key, false);
  }
}

async function requestTrackerFollowUp(sessionId: string, requestId: string): Promise<RegenResult> {
  try {
    const response = await fetch('/api/tracker/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
      body: JSON.stringify({ sessionId }),
    });

    if (response.status === 401) return { ok: false, code: 'SIGNED_OUT' };
    if (response.status === 402) {
      const data = await response.json().catch(() => null);
      return {
        ok: false,
        code: 'INSUFFICIENT_CREDITS',
        required: data?.details?.required ?? REGEN_META['follow-up'].cost,
        available: data?.details?.available ?? 0,
      };
    }
    if (response.status === 400) {
      const data = await response.json().catch(() => null);
      if (data?.code === 'NO_CONTEXT') return { ok: false, code: 'NO_CONTEXT' };
      return { ok: false, code: 'ERROR' };
    }
    if (!response.ok) {
      console.error('[Tracker follow-up] failed:', response.status);
      return { ok: false, code: 'ERROR' };
    }

    const data = await response.json();
    if (!data.followUpEmail?.subject || !data.followUpEmail?.body) return { ok: false, code: 'ERROR' };
    useSessionStore.getState().updateSessionById(sessionId, {
      followUpEmail: {
        subject: data.followUpEmail.subject,
        body: data.followUpEmail.body,
        recommendedDelay: data.followUpEmail.recommendedDelay || 5,
      },
      ...clearKitDocumentError(sessionId, 'followUpEmail'),
    });
    triggerCreditUpdate();
    return { ok: true, wordCount: countWords(data.followUpEmail.body), sessionId };
  } catch (error) {
    console.error('[Tracker follow-up] error:', error);
    return { ok: false, code: 'ERROR' };
  }
}

/**
 * One section of the tailored CV, rewritten by the Sonnet writer.
 *
 * Unlike the three document rewrites above, this one sends `optimizedCVData`
 * with the request: the store is the source of truth for the tailored CV and
 * D1 is downstream of a debounced write, so the server must operate on what
 * the canvas is showing rather than on what has made it to the database.
 *
 * `applied` is computed on the server by diffing the returned section against
 * the section as it stands, so a refusal is a fact rather than a claim. When
 * the writer will not honour part of the instruction the section is left
 * exactly as it was and nothing is charged.
 */
export type CvSectionRewriteResult =
  | { ok: true; applied: true; label: string; omitted: string[]; sessionId: string }
  | { ok: true; applied: false; message: string; sessionId: string }
  | { ok: false; code: 'INSUFFICIENT_CREDITS'; required: number; available: number }
  | { ok: false; code: 'NO_CONTEXT' }
  | { ok: false; code: 'SIGNED_OUT' }
  | { ok: false; code: 'ERROR' };

/**
 * The rewrite targets the route accepts, mirroring CVSectionKind in
 * src/lib/agents/prompts/cv-prompt.ts. Exported as a value so the chip handler
 * can check a section name off the wire before it spends anything.
 */
export const CV_REWRITE_SECTIONS = [
  'summary',
  'experience_bullets',
  'project_description',
  'custom_section_items',
] as const;

export type CvRewriteSection = (typeof CV_REWRITE_SECTIONS)[number];

/**
 * Writes the rewritten section onto the tailored CV. Only the one field the
 * rewrite targeted changes, so `analysis`, `sectionHeaders` and
 * `localizedStrings` survive by construction rather than by reassembly, which
 * is the same guarantee CVPanel.onSave gets by listing them.
 *
 * Returns null when the target is no longer on the CV. That is not an error
 * worth throwing: the section was deleted while the rewrite ran, and the
 * honest outcome is to leave the document alone.
 */
/**
 * The FIRST entry with this id, matching how `resolveCVSectionTarget` on the
 * server picks the entry it rewrites. Entry ids come from model-generated JSON
 * and nothing enforces that they are unique, which is why the structure tools
 * address items by a hash of their content instead. This path has to use the
 * id, because that is what the rewrite contract takes, so the least it can do
 * is resolve it the same way both ends do. Writing every match would rewrite a
 * role the user never named and destroy its bullets.
 */
function firstIndexById(list: Array<{ id: string }>, id: string | undefined): number {
  if (!id) return -1;
  return list.findIndex((entry) => entry.id === id);
}

function applyRewrittenSection(
  cv: NonNullable<ApplicationSession['optimizedCVData']>,
  kind: CvRewriteSection,
  id: string | undefined,
  content: string | string[],
): NonNullable<ApplicationSession['optimizedCVData']> | null {
  if (kind === 'summary') {
    if (typeof content !== 'string') return null;
    return { ...cv, summary: content };
  }
  if (kind === 'experience_bullets') {
    if (!Array.isArray(content)) return null;
    const at = firstIndexById(cv.experience, id);
    if (at < 0) return null;
    const experience = [...cv.experience];
    experience[at] = { ...experience[at], bullets: content };
    return { ...cv, experience };
  }
  if (kind === 'project_description') {
    if (typeof content !== 'string' || !cv.projects) return null;
    const at = firstIndexById(cv.projects, id);
    if (at < 0) return null;
    const projects = [...cv.projects];
    projects[at] = { ...projects[at], description: content };
    return { ...cv, projects };
  }
  if (!Array.isArray(content) || !cv.customSections) return null;
  const at = firstIndexById(cv.customSections, id);
  if (at < 0) return null;
  const customSections = [...cv.customSections];
  customSections[at] = { ...customSections[at], items: content };
  return { ...cv, customSections };
}

export async function rewriteCvSection(
  section: CvRewriteSection,
  entryId: string,
  expectedSessionId: string,
  instruction?: string,
  requestId: string = generateRequestId(),
): Promise<CvSectionRewriteResult> {
  const context = buildContext();
  if (!context) return { ok: false, code: 'NO_CONTEXT' };
  const sessionId = context.sessionId;
  // Same structural guard the document rewrites use: the chip quoted a cost
  // for one application, so a switch between the quote and the click drops the
  // request rather than spending against the wrong job.
  if (expectedSessionId !== sessionId) return { ok: false, code: 'NO_CONTEXT' };

  const live = useSessionStore.getState().currentSession?.optimizedCVData;
  if (!live) return { ok: false, code: 'NO_CONTEXT' };

  const cleanInstruction = instruction ? flattenInstruction(instruction).slice(0, MAX_INSTRUCTION_CHARS) : '';

  try {
    const response = await fetch('/api/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
      body: JSON.stringify({
        type: 'cv_section',
        context: { ...context, optimizedCVData: live },
        section: { kind: section, ...(entryId ? { id: entryId } : {}) },
        ...(cleanInstruction ? { instruction: cleanInstruction } : {}),
      }),
    });

    if (response.status === 401) return { ok: false, code: 'SIGNED_OUT' };
    if (response.status === 402) {
      const data = await response.json().catch(() => null);
      return {
        ok: false,
        code: 'INSUFFICIENT_CREDITS',
        required: data?.details?.required ?? CREDIT_COSTS.CV_SECTION_REWRITE,
        available: data?.details?.available ?? 0,
      };
    }
    // The route settles NO_SOURCE_CV, NO_CV_DATA and INVALID_SECTION before it
    // reserves anything, so a 400 means nothing ran and nothing was charged.
    // Saying so matters: INVALID_SECTION is reachable in ordinary use, because
    // the chip carries an entry id frozen at proposal time and the entry can be
    // deleted from the canvas before the click. Falling through to the generic
    // error would tell the user a rewrite they never paid for might have landed.
    if (response.status === 400) {
      return {
        ok: true,
        applied: false,
        message: 'That section is not on your CV any more, so nothing ran. Nothing was charged.',
        sessionId,
      };
    }
    if (!response.ok) {
      console.error('[CV section rewrite] failed:', response.status);
      return { ok: false, code: 'ERROR' };
    }

    const data = await response.json();
    if (data.applied !== true) {
      // Refused or unchanged. The section was not touched and the route has
      // already released the reservation, so there is nothing to write here.
      return {
        ok: true,
        applied: false,
        message: typeof data.message === 'string' && data.message.trim()
          ? data.message
          : 'That section is unchanged.',
        sessionId,
      };
    }

    // Re-read at write time rather than reusing `live`: a canvas edit may have
    // landed while the writer ran, and rebuilding from the stale copy would
    // silently revert it. The rewritten section still goes on, because that is
    // what was paid for; everything else comes from what is stored now. Read
    // by id, not from currentSession, so the result lands on the application
    // that asked for it even if the user has moved to another one.
    const { currentSession, sessions } = useSessionStore.getState();
    const target = currentSession?.id === sessionId
      ? currentSession
      : sessions.find((candidate) => candidate.id === sessionId);
    const next = target?.optimizedCVData
      ? applyRewrittenSection(target.optimizedCVData, section, entryId || undefined, data.content)
      : null;
    if (!next) {
      // The credits are spent: the route captured before it answered. Say so
      // rather than implying a free retry, which is the mistake Phase 4 fixed
      // on the follow-up route.
      return {
        ok: true,
        applied: false,
        message: 'That section is not on your CV any more, so the rewrite had nowhere to land. It was still charged.',
        sessionId,
      };
    }
    useSessionStore.getState().updateSessionById(sessionId, { optimizedCVData: next });
    triggerCreditUpdate();
    return {
      ok: true,
      applied: true,
      label: typeof data.label === 'string' ? data.label : '',
      // What the writer would not put in, on a rewrite that otherwise
      // succeeded. Half of it is the model's own wording, so it is advisory and
      // the reply says "left out" rather than stating it as a finding. Capped
      // and flattened server-side; re-capped here because a UI string should
      // never trust a length promise it did not make itself.
      omitted: Array.isArray(data.omitted)
        ? data.omitted
          .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .slice(0, 5)
          .map((entry: string) => entry.trim().slice(0, 120))
        : [],
      sessionId,
    };
  } catch (error) {
    console.error('[CV section rewrite] error:', error);
    return { ok: false, code: 'ERROR' };
  }
}
