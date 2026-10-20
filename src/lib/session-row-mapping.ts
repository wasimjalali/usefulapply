/**
 * Pure mapping between stored application rows and the store's session shape.
 *
 * No 'use client' on purpose: the server-side kit service reads the same
 * canonical-columns-then-generated_artifacts fallback, and a module marked
 * 'use client' cannot be called from server code.
 */

import type { JobFeedGenerationStatus } from '@/lib/supabase/types';
import { KIT_DOCUMENTS, type KitDocumentErrors } from '@/lib/agents/types';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import type { ApplicationSession, ChatMessage } from '@/store/useSessionStore';

export interface StoredSessionRow {
  id: string;
  job_title?: string | null;
  company?: string | null;
  job_description?: string | null;
  selected_template?: string | null;
  match_score?: number | null;
  matching_skills?: string[] | null;
  missing_skills?: string[] | null;
  suggestions?: string[] | null;
  requirements?: unknown;
  gaps?: unknown;
  generated_cv?: Record<string, unknown> | null;
  cover_letter?: unknown;
  email?: unknown;
  follow_up_email?: unknown;
  generated_artifacts?: Record<string, unknown> | null;
  company_research?: Record<string, unknown> | null;
  company_address?: string | null;
  company_contact_person?: string | null;
  fit_assessment?: unknown;
  generation_status?: JobFeedGenerationStatus | null;
  generation_error?: string | null;
  generation_started_at?: string | null;
  generation_completed_at?: string | null;
  generation_failed_at?: string | null;
  generation_cancelled_at?: string | null;
  cv_edits?: unknown[] | null;
  optimized_pdf_path?: string | null;
  status?: string | null;
  /** Server-owned. Optional because a row read before the migration has no value. */
  screening_turns_used?: number | null;
  /** Optional because a row read before migration 0010 has no value. */
  revision?: number | null;
  created_at: string;
  updated_at: string;
}

/** The failed-document map a partial kit run stored, or null. Unknown keys and values are dropped. */
export function readKitDocumentErrors(value: unknown): KitDocumentErrors | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const errors: KitDocumentErrors = {};
  for (const document of KIT_DOCUMENTS) {
    const code = record[document];
    if (code === 'VALIDATION_FAILED' || code === 'GENERATION_FAILED') errors[document] = code;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * A stored letter written without the address blocks (older retries of a
 * failed letter) would crash the canvas, which reads them unconditionally.
 */
function withLetterShell(letter: unknown): unknown {
  if (!letter || typeof letter !== 'object' || Array.isArray(letter)) return letter;
  return {
    applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
    date: '',
    companyAddress: { companyName: '', street: '' },
    salutation: '',
    closing: '',
    signatureName: '',
    ...(letter as Record<string, unknown>),
  };
}

export function mapSessionRowToStore(row: StoredSessionRow): ApplicationSession {
  const artifacts = row.generated_artifacts ?? null;
  const pendingFitCandidate = artifacts?.pendingFitAnalysis;
  const pendingFit = pendingFitCandidate
    && typeof pendingFitCandidate === 'object'
    && !Array.isArray(pendingFitCandidate)
    && typeof (pendingFitCandidate as Record<string, unknown>).contextId === 'string'
    && typeof (pendingFitCandidate as Record<string, unknown>).jobDescription === 'string'
    && typeof (pendingFitCandidate as Record<string, unknown>).createdAt === 'string'
    && Date.now() - Date.parse((pendingFitCandidate as Record<string, unknown>).createdAt as string) < 30 * 60 * 1000
      ? pendingFitCandidate as ApplicationSession['pendingFitAnalysis']
      : null;
  const artifactCV = artifacts?.optimizedCV && typeof artifacts.optimizedCV === 'object'
    ? artifacts.optimizedCV as Record<string, unknown>
    : null;
  const generated = row.generated_cv ?? (artifactCV
    ? {
        content: typeof artifactCV.content === 'string' ? artifactCV.content : '',
        changes: Array.isArray(artifactCV.changes) ? artifactCV.changes : [],
        optimizedFor: 'Position',
      }
    : null);
  const artifactCoverLetter = typeof artifacts?.coverLetter === 'string' && artifacts.coverLetter.trim()
    ? {
        applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
        date: '',
        companyAddress: { companyName: '', street: '' },
        salutation: '',
        body: artifacts.coverLetter,
        closing: '',
        signatureName: '',
        updatedAt: row.updated_at,
        ...(isStructuredCoverLetter(artifacts.coverLetterStructured) ? { structured: artifacts.coverLetterStructured } : {}),
      }
    : null;
  const artifactEmail = artifacts?.applicationEmail && typeof artifacts.applicationEmail === 'object'
    ? artifacts.applicationEmail as ApplicationSession['email']
    : null;
  const artifactFollowUp = artifacts?.followUpEmail && typeof artifacts.followUpEmail === 'object'
    ? artifacts.followUpEmail as ApplicationSession['followUpEmail']
    : null;
  return {
    id: row.id,
    status: row.status ?? 'drafted',
    revision: typeof row.revision === 'number' ? row.revision : 0,
    jobTitle: row.job_title || '',
    company: row.company || '',
    jobDescription: row.job_description || '',
    selectedTemplate: row.selected_template || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchScore: row.match_score ?? undefined,
    matchingSkills: row.matching_skills || [],
    missingSkills: row.missing_skills || [],
    suggestions: row.suggestions || [],
    requirements: (row.requirements ?? null) as ApplicationSession['requirements'],
    gaps: (row.gaps ?? null) as ApplicationSession['gaps'],
    generatedCV: generated as ApplicationSession['generatedCV'],
    optimizedCVData: (generated?._optimizedCVData as ApplicationSession['optimizedCVData'])
      ?? (artifacts?.optimizedCVData as ApplicationSession['optimizedCVData'])
      ?? undefined,
    screeningAnswers: Array.isArray(generated?._screeningAnswers)
      ? (generated._screeningAnswers as ApplicationSession['screeningAnswers'])
      : [],
    coverLetter: withLetterShell(row.cover_letter ?? artifactCoverLetter) as ApplicationSession['coverLetter'],
    email: (row.email ?? artifactEmail) as ApplicationSession['email'],
    followUpEmail: (row.follow_up_email ?? artifactFollowUp) as ApplicationSession['followUpEmail'],
    companyResearch: row.company_research
      ? {
          ...row.company_research,
          address: row.company_address || (row.company_research.address as string | undefined),
          contactPerson: row.company_contact_person || (row.company_research.contactPerson as string | undefined),
        } as ApplicationSession['companyResearch']
      : null,
    fitAssessment: (row.fit_assessment ?? null) as ApplicationSession['fitAssessment'],
    kitDocumentErrors: readKitDocumentErrors(artifacts?.documentErrors),
    pendingFitAnalysis: pendingFit,
    generationStatus: row.generation_status ?? 'none',
    generationError: row.generation_error ?? null,
    generationStartedAt: row.generation_started_at ?? null,
    generationCompletedAt: row.generation_completed_at ?? null,
    generationFailedAt: row.generation_failed_at ?? null,
    generationCancelledAt: row.generation_cancelled_at ?? null,
    cvEdits: (row.cv_edits || []) as ApplicationSession['cvEdits'],
    optimizedPdfRef: row.optimized_pdf_path
      ? {
          id: row.id,
          fileName: 'optimized.pdf',
          size: 0,
          type: 'optimized' as const,
          createdAt: row.created_at,
          url: row.optimized_pdf_path,
        }
      : undefined,
    // The server-owned column is the truth. The old embedded number is not a
    // fallback for a database without the column (drizzle names the column in
    // every select, so an unmigrated database throws, and the migration goes on
    // before the deploy). It is the fallback for a row written before the
    // column, which starts at 0 with no backfill. Taking the higher of the two
    // means such a row keeps the turns it already spent. Measured on the live
    // database: 115 applications, none carrying an embedded count.
    screeningUsageCount: Math.max(
      typeof row.screening_turns_used === 'number' ? row.screening_turns_used : 0,
      typeof generated?._screeningUsageCount === 'number' ? generated._screeningUsageCount : 0,
    ),
    chatMessages: [],
  };
}

export function mapChatRowsToStore(
  messages: Array<{
    id: string;
    role: ChatMessage['role'];
    content: string;
    created_at: string;
    actions?: ChatMessage['actions'];
  }>,
): ChatMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.created_at,
    actions: msg.actions || [],
  }));
}
