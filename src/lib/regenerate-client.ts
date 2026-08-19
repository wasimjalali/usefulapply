/**
 * Client side of /api/regenerate. The chat is the only place a regeneration
 * starts (cost chip first), so the context building and the result write live
 * here instead of in each kit panel.
 */

import { useCVStore } from '@/store/useCVStore';
import { useSessionStore, type ApplicationSession } from '@/store/useSessionStore';
import type { KitTab } from '@/store/useUIStore';
import type { GeneratedCoverLetter } from '@/lib/types';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { generateRequestId } from '@/lib/utils/requestId';
import { triggerCreditUpdate } from '@/lib/utils/creditEvents';

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
  const verbs = /\b(rewrite|re-write|redo|regenerate|generate again|write (it )?again|try again|shorter|shorten|longer|tighten|trim|cut|expand|punchier|formal|casual|friendlier|warmer|tone|rephrase|reword|change|make (it|the|my|this)|improve|better|fix|update|adjust|different|new version|another version|two paragraphs|one paragraph|three paragraphs)\b/;
  if (!verbs.test(t)) return null;
  if (/\bfollow[- ]?up\b/.test(t)) return 'follow-up';
  if (/\bcover letter\b|\bletter\b/.test(t)) return 'cover-letter';
  if (/\b(application )?e-?mail\b/.test(t)) return 'email';
  if (/\b(cv|resume|résumé)\b/.test(t)) return 'cv';
  // "Make it shorter" while a document is open means that document.
  if (openDocument && /\b(it|this|that)\b/.test(t)) return openDocument;
  return null;
}

export type RegenResult =
  | { ok: true; wordCount: number; sessionId: string }
  | { ok: false; code: 'INSUFFICIENT_CREDITS'; required: number; available: number }
  | { ok: false; code: 'NO_CONTEXT' }
  | { ok: false; code: 'SIGNED_OUT' }
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calls the regenerate route and writes the result into the session the
 * request was built for. If the user has moved to another application while
 * it ran, nothing is written. `requestId` lets a retry of the same rewrite
 * reuse the server's idempotency key instead of reserving credits twice.
 */
export async function regenerateDocument(target: RegenTarget, requestId: string = generateRequestId()): Promise<RegenResult> {
  const context = buildContext();
  if (!context) return { ok: false, code: 'NO_CONTEXT' };
  const meta = REGEN_META[target];
  const sessionId = context.sessionId;

  try {
    const response = await fetch('/api/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
      body: JSON.stringify({ type: meta.type, context }),
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
    if (!response.ok) {
      console.error('[Regenerate] failed:', response.status);
      return { ok: false, code: 'ERROR' };
    }

    const data = await response.json();
    // Land the result on the application that asked for it, even if the user
    // moved to another one while it ran.
    const update = (updates: Partial<ApplicationSession>) =>
      useSessionStore.getState().updateSessionById(sessionId, updates);
    let wordCount = 0;

    if (target === 'cover-letter') {
      if (typeof data.coverLetter !== 'string' || !data.coverLetter.trim()) return { ok: false, code: 'ERROR' };
      // Body-only format (3-agent architecture)
      const letter: GeneratedCoverLetter = {
        applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
        date: '',
        companyAddress: { companyName: '', street: '' },
        salutation: '',
        body: data.coverLetter,
        closing: '',
        signatureName: '',
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
