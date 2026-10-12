/**
 * Type-level check that every sonnet55 variant module is a drop-in replacement
 * for the production module it shadows: same export names, same value types and
 * same exported type aliases, in both directions. Checked by `npx tsc --noEmit`;
 * nothing here runs. This file has no production counterpart, so the eval hook
 * (evals/lib/hooks.ts) never loads it as a prompt override.
 */

import type * as ProdCV from '@/lib/agents/prompts/cv-prompt';
import type * as VarCV from './cv-prompt';
import type * as ProdCL from '@/lib/agents/prompts/cover-letter-prompt';
import type * as VarCL from './cover-letter-prompt';
import type * as ProdEmail from '@/lib/agents/prompts/email-prompts';
import type * as VarEmail from './email-prompts';
import type * as ProdFit from '@/lib/agents/prompts/fit-assessment-prompt';
import type * as VarFit from './fit-assessment-prompt';

/** true only when A and B are mutually assignable (same shape both ways). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type SameKeys<A, B> = Same<keyof A, keyof B>;

// Runtime exports: identical names and identical signatures.
export const cvKeys: SameKeys<typeof ProdCV, typeof VarCV> = true;
export const cvTypes: Same<typeof ProdCV, typeof VarCV> = true;
export const coverLetterKeys: SameKeys<typeof ProdCL, typeof VarCL> = true;
export const coverLetterTypes: Same<typeof ProdCL, typeof VarCL> = true;
export const emailKeys: SameKeys<typeof ProdEmail, typeof VarEmail> = true;
export const emailTypes: Same<typeof ProdEmail, typeof VarEmail> = true;
export const fitKeys: SameKeys<typeof ProdFit, typeof VarFit> = true;
export const fitTypes: Same<typeof ProdFit, typeof VarFit> = true;

// Exported type-only declarations.
export const cvSectionKind: Same<ProdCV.CVSectionKind, VarCV.CVSectionKind> = true;
export const cvResolvedSection: Same<ProdCV.ResolvedCVSection, VarCV.ResolvedCVSection> = true;
export const fitInput: Same<ProdFit.FitAssessmentPromptInput, VarFit.FitAssessmentPromptInput> = true;
