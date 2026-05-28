/**
 * Career profile — AI-synthesized semantic view of a user's CV.
 *
 * SCOPE: read by the job-feed pipeline only (search-strategy generator,
 * ranking, optional dashboard preview). NEVER imported by `src/lib/agents/**`
 * (CV writer, fit assessment, cover letter, email). Application-kit
 * generation must stay grounded in the literal `StructuredCV` to avoid
 * hallucinated facts in user-facing artifacts.
 *
 * Storage: `public.user_career_profiles`. One row per user. Regenerated
 * when the source primary_cv document changes.
 */

import type { JobFeedSettings } from '@/lib/supabase/types';

export const CAREER_PROFILE_SCHEMA_VERSION = 2 as const;

export type CareerProfileConfidence = 'high' | 'medium' | 'low';
export type CareerProfileEvidenceStrength = 'strong' | 'moderate' | 'mentioned';
export type CareerProfileSeniorityLevel = NonNullable<JobFeedSettings['seniority_target']>;

export interface CareerProfileInferredTitle {
  /** Canonical job title, market-normalized (e.g. "Senior Frontend Engineer"). */
  canonical: string;
  confidence: CareerProfileConfidence;
  /** Short justification pointing to evidence in the CV. */
  rationale: string;
}

export interface CareerProfileSeniority {
  level: CareerProfileSeniorityLevel;
  confidence: CareerProfileConfidence;
  rationale: string;
}

export interface CareerProfileSkillCluster {
  /** Human-readable cluster name, e.g. "modern web frontend". */
  name: string;
  /** Canonical skill names that make up the cluster. */
  skills: string[];
  evidenceStrength: CareerProfileEvidenceStrength;
}

export interface CareerProfileTargetDirection {
  /**
   * Titles the candidate is moving TOWARD (where they're going), which may
   * differ from inferredTitles (where they are). Empty when the candidate is
   * clearly staying on their current track.
   */
  aspirationalTitles: string[];
  /**
   * Set when the candidate is mid-pivot (e.g. IC -> management, analyst ->
   * data engineering). Null when they're deepening on their current track.
   */
  pivot: { from: string; to: string } | null;
  confidence: CareerProfileConfidence;
  rationale: string;
}

export interface CareerProfile {
  version: typeof CAREER_PROFILE_SCHEMA_VERSION;
  generatedAt: string;

  /** Discipline / function (e.g. "engineering", "product", "design", "growth"). */
  function: string;

  inferredTitles: CareerProfileInferredTitle[];
  seniority: CareerProfileSeniority;

  /**
   * Where the candidate is heading next. Lets search + ranking favour the
   * roles they WANT, not only the roles they've held. Synthesized from the
   * summary, recency trends, and the trajectory of the most recent role.
   */
  targetDirection: CareerProfileTargetDirection;

  /** Total professional years inferred from start/end dates across roles. */
  yearsTotal: number;
  /** Years in the current function (subset of yearsTotal). */
  yearsInFunction: number;

  primarySkillClusters: CareerProfileSkillCluster[];
  secondarySkillClusters: CareerProfileSkillCluster[];

  /** Industries the candidate has actually worked in (e.g. "fintech"). */
  industryDomains: string[];

  /** Tools / cloud / stack signals (e.g. "AWS", "Postgres", "Next.js"). */
  toolsEnvironment: string[];

  /** Languages the candidate ships work in (distinct from spoken languages). */
  workingLanguages: string[];

  /** 3-5 sentence narrative summary used by the ranker as a soft prior. */
  narrative: string;

  /** Roles the candidate is clearly NOT a fit for (used as keyword negatives). */
  negativeSignals: string[];
}

export interface CareerProfileRecord {
  userId: string;
  profile: CareerProfile;
  version: number;
  sourceDocumentId: string | null;
  sourceDocumentUpdatedAt: string | null;
  modelProvider: string | null;
  modelName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Type guard for runtime profile payloads loaded from jsonb.
 * Used to gracefully handle stale rows after a schema bump.
 */
export function isCurrentCareerProfile(value: unknown): value is CareerProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CareerProfile>;
  return (
    candidate.version === CAREER_PROFILE_SCHEMA_VERSION
    && typeof candidate.function === 'string'
    && Array.isArray(candidate.inferredTitles)
    && Array.isArray(candidate.primarySkillClusters)
    && Array.isArray(candidate.secondarySkillClusters)
    && Array.isArray(candidate.workingLanguages)
    && candidate.seniority !== null
    && typeof candidate.seniority === 'object'
    && typeof (candidate.seniority as CareerProfileSeniority).level === 'string'
    && candidate.targetDirection !== null
    && typeof candidate.targetDirection === 'object'
    && Array.isArray((candidate.targetDirection as CareerProfileTargetDirection).aspirationalTitles)
  );
}
