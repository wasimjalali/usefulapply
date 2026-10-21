/**
 * Screening answers: the rules, the prompt and the model call, shared by the
 * chat route (`mode: 'screening_answers'`) and the MCP `draft_screening_answers`
 * tool so the two cannot drift.
 *
 * The rules today:
 * - paid plans only (Plus and Max);
 * - at most `SCREENING_TURN_CAP` turns per application, spent by an atomic
 *   claim (`claimScreeningTurn`) on a column only the server writes, and handed
 *   back (`releaseScreeningTurn`) only when the model call itself fails;
 * - no credits are charged;
 * - the answers are written by Workers AI (gpt-oss) from the applicant's CV and
 *   the job description, and live on the application as `_screeningAnswers`
 *   inside `generated_cv`, which is where the Answers tab and the export read them.
 *
 * What the route owns and this module does not: the HTTP shape, the chat
 * message limit and the order of its gates.
 */

import type { SQL } from 'drizzle-orm';
import { getDocumentByType } from '@/db/repos/documents';
import * as sessionsRepo from '@/db/repos/sessions';
import { callWorkersAI, type WorkersAiChatMessage } from '@/lib/models/workers-ai';
import { sanitizeDashes } from '@/lib/config/typo-corrections';
import { InvalidInputError, NotFoundError } from './errors';
import { isSectionHidden, visibleCvData } from '@/lib/cv-templates/hidden';
import { withDrivingLicenceLine } from '@/lib/cv-templates/driving-licence';
import type { CVData } from '@/lib/cv-templates/types';
import { buildSessionUpdateStatement, kitFromRow, type Kit } from './kit';

/** Plans that include screening answers. */
export function screeningAllowedForTier(tier: string | null | undefined): boolean {
  return tier === 'plus' || tier === 'max';
}

/** A screening request is one message: a question or a short list of them. The chat route caps it at the same length. */
export const MAX_SCREENING_MESSAGE_LENGTH = 5_000;

/** What the screening prompt reads. Every field is optional: the chat route fills them from what the browser sent, the MCP tool from the stored application. */
export interface ScreeningPromptContext {
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  matchingSkills?: string[];
  missingSkills?: string[];
  generatedCVSummary?: string;
  companyResearchSummary?: string;
  hasMasterCV?: boolean;
  masterCVSummary?: string;
}

/**
 * Screening answers, written for gpt-oss. Default reasoning (medium) stays:
 * this surface writes graded answers, not conversational turns, and the
 * output contract below is parsed by the client.
 */
export function buildScreeningPrompt(context: ScreeningPromptContext): string {
  let prompt = `You write job application screening answers inside Useful Apply. You draft personalized answers from the applicant's CV and the target job description.

# Application
Job title: ${context.jobTitle || 'unknown'}
Company: ${context.company || 'unknown'}`;

  if (context.jobDescription) {
    prompt += `
Job description:
${context.jobDescription.substring(0, 8000)}`;
  }
  if (context.matchingSkills && context.matchingSkills.length > 0) {
    prompt += `
Matching skills: ${context.matchingSkills.join(', ')}`;
  }
  if (context.missingSkills && context.missingSkills.length > 0) {
    prompt += `
Skills to address carefully: ${context.missingSkills.join(', ')}`;
  }
  if (context.generatedCVSummary) {
    prompt += `
Optimized CV content:
${context.generatedCVSummary}`;
  }
  if (context.companyResearchSummary) {
    prompt += `
Company research:
${context.companyResearchSummary}`;
  }
  if (context.hasMasterCV && context.masterCVSummary) {
    prompt += `
Master CV (full career history):
${context.masterCVSummary}`;
  }

  prompt += `

# Length
ATS platforms (Workday, Greenhouse, Lever, iCIMS) cap answers at 500-1000 characters and recruiters scan each one in 6-10 seconds. Absolute maximum per answer: 150 words (~750 characters). Most answers should be far shorter.

# Answer rules
Classify each question and match the length to its type:
1. Yes/no or eligibility (work authorization, relocation, clearance): 1-5 words. Never elaborate unless asked.
2. Numeric or factual (years of experience, salary, start date): 1 sentence under 20 words.
3. Short qualitative ("Why are you interested?", "Describe your experience with X"): 50-80 words, 2-3 sentences, lead with the strongest qualifier.
4. Behavioral ("Tell me about a time..."): 100-150 words in compressed STAR: situation and task in 1 sentence, action in 2, result in 1 with a quantified outcome. The result matters most.
5. Situational ("How would you handle..."): 75-120 words, 2-3 brief steps, one similar past success from the CV.

Hard rules:
- Only use skills, experience, metrics and qualifications that exist in the CV. Never fabricate.
- Mirror job-description keywords naturally. Never force-fit.
- Dates, titles and metrics must match the optimized CV exactly.
- For missing skills: point to transferable experience or learning, never claim expertise the CV lacks.
- More than 7 questions: answer the first 7 and add "Please send the remaining questions in a follow-up message."
- Never use em dashes, en dashes or horizontal bars. Use commas, periods, colons, semicolons or parentheses.
- Never use: furthermore, moreover, leverage, pivotal, robust, delve.

# Output format
For each question, output exactly:

---ANSWER_START---
**Q: [repeat the original question exactly]**

[your answer]
---ANSWER_END---

No text before the first ---ANSWER_START--- or after the last ---ANSWER_END---. No preambles, sign-offs or commentary outside the blocks.

Answer in the language the screening questions are written in.`;

  return prompt;
}

/**
 * The one model call. Budget is well above the expected reply because gpt-oss
 * spends part of max_tokens reasoning before the answer. Returns the reply with
 * dashes cleaned, exactly what the chat route has always returned.
 */
export async function generateScreeningReply(params: {
  userId: string;
  message: string;
  history: WorkersAiChatMessage[];
  context: ScreeningPromptContext;
  route: string;
  clientRequestId?: string;
  applicationSessionId?: string;
}): Promise<string> {
  const response = await callWorkersAI({
    prompt: params.message,
    systemPrompt: buildScreeningPrompt(params.context),
    rawMessages: params.history,
    maxTokens: 8000,
    temperature: 0.4,
    generationContext: {
      requestExecutionId: crypto.randomUUID(),
      clientRequestId: params.clientRequestId,
      userId: params.userId,
      applicationSessionId: params.applicationSessionId,
      route: params.route,
      feature: 'chat',
      operation: 'screening_chat',
    },
  });
  return sanitizeDashes(response.content);
}

// ---------------------------------------------------------------------------
// Headless use (the MCP tool): the stored application is the context
// ---------------------------------------------------------------------------

/** The cap is spent on this application already. */
export class ScreeningCapReachedError extends Error {
  readonly code = 'SCREENING_CAP_REACHED' as const;
  constructor(readonly turnsUsed: number, readonly cap: number) {
    super('The screening answer limit for this application is reached');
    this.name = 'ScreeningCapReachedError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The CV as the applicant and the exports see it today, as plain text for the prompt. CV edits and
 * section rewrites change `_optimizedCVData` and leave `generated_cv.content` as first generated, so
 * the structured copy is the current one. Hidden items stay out, as they do in an export. A CV that
 * only has the generated text (older rows) falls back to that.
 */
function currentCvText(kit: Kit): string | undefined {
  const data = kit.optimizedCVData;
  if (!data) return typeof kit.cv?.content === 'string' ? kit.cv.content : undefined;
  const cv = visibleCvData(data as unknown as CVData);
  const lines: string[] = [];
  const { personal } = cv;
  lines.push([personal.fullName, personal.currentTitle].filter(Boolean).join(', '));
  if (cv.summary) lines.push(cv.summary);
  for (const job of cv.experience) {
    const dates = [job.startDate, job.current ? 'Present' : job.endDate].filter(Boolean).join(' - ');
    lines.push('', `${job.position}, ${job.company}${job.location ? `, ${job.location}` : ''}${dates ? ` (${dates})` : ''}`);
    for (const bullet of job.bullets) lines.push(`- ${bullet}`);
  }
  for (const entry of cv.education) {
    const dates = [entry.startDate, entry.endDate].filter(Boolean).join(' - ');
    lines.push('', `${[entry.degree, entry.field].filter(Boolean).join(' in ')}, ${entry.institution}${dates ? ` (${dates})` : ''}`);
    for (const highlight of entry.highlights ?? []) lines.push(`- ${highlight}`);
  }
  for (const group of cv.skills) lines.push(`${group.category}: ${group.items.join(', ')}`);
  for (const entry of cv.languages) lines.push(`${entry.language}: ${entry.proficiency}`);
  for (const entry of cv.certifications) lines.push(`${entry.name}, ${entry.issuer}${entry.date ? ` (${entry.date})` : ''}`);
  for (const project of cv.projects ?? []) {
    lines.push('', `${project.name}: ${project.description}${project.technologies?.length ? ` (${project.technologies.join(', ')})` : ''}`);
  }
  for (const section of cv.customSections ?? []) {
    lines.push('', section.title);
    for (const item of section.items) lines.push(`- ${item}`);
  }
  // The renderer prints a driver's licence as additional information when the CV has none of its own.
  const licence = data.personal.driverLicense;
  const additionalInfo = isSectionHidden(data as unknown as CVData, 'additionalInfo')
    ? undefined
    : withDrivingLicenceLine(data.additionalInfo, licence, (data as { language?: string }).language);
  if (additionalInfo?.length) {
    lines.push('');
    for (const item of additionalInfo) lines.push(`- ${item}`);
  }
  return lines.join('\n').trim() || undefined;
}

/**
 * What the browser sends with a screening request, read from the stored
 * application and the user's master CV instead: same fields, same caps.
 */
export async function loadScreeningContext(userId: string, sessionId: string): Promise<ScreeningPromptContext> {
  const row = await sessionsRepo.getSession(userId, sessionId);
  if (!row) throw new NotFoundError();
  const kit = kitFromRow(row);
  // Screening answers are kept with the tailored CV, so an application without one has nowhere to keep them.
  if (!kit.cv && !kit.optimizedCVData) {
    throw new InvalidInputError('Screening answers need this application\'s tailored CV. Generate the application kit first.');
  }
  const master = await getDocumentByType(userId, 'master_cv');
  const research = row.company_research && typeof row.company_research === 'object' ? row.company_research as Record<string, unknown> : null;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join(', ') : '');
  const companyResearchSummary = research
    ? [typeof research.description === 'string' ? research.description : '', list(research.culture), list(research.recentNews)]
        .filter(Boolean)
        .join(' | ')
        .substring(0, 500)
    : undefined;
  const cvText = currentCvText(kit);
  return {
    jobTitle: row.job_title ?? undefined,
    company: row.company ?? undefined,
    jobDescription: row.job_description?.substring(0, 8000),
    matchingSkills: row.matching_skills,
    missingSkills: row.missing_skills,
    generatedCVSummary: cvText?.substring(0, 5000),
    companyResearchSummary: companyResearchSummary || undefined,
    hasMasterCV: Boolean(master?.raw_text),
    masterCVSummary: master?.raw_text?.substring(0, 3000),
  };
}

export interface StoredScreeningAnswer {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}

/**
 * The write that adds answers to the application's Answers document (`generated_cv._screeningAnswers`),
 * the place the web app and the answers export read them, as a statement a caller commits in a batch of
 * its own (inline-operations.ts retries it against a fresh row when a concurrent save moves the
 * revision). It keeps the embedded turn count in step with the server's counter. It is not recorded in
 * edit history: an undo of a CV edit must not be able to take answers the user already copied away.
 * `guard` is ANDed into the statement.
 */
export async function buildScreeningAnswersWrite(
  userId: string,
  sessionId: string,
  items: StoredScreeningAnswer[],
  turnsUsed: number,
  guard: SQL,
  now: string,
): Promise<{ statements: SQL[]; revision: number }> {
  const row = await sessionsRepo.getSession(userId, sessionId);
  if (!row) throw new NotFoundError();
  // A row whose CV only lives in generated_artifacts has no generated_cv to extend: start from the CV document the reader already shows.
  const base = asRecord(row.generated_cv) ?? (kitFromRow(row).cv ? { ...(kitFromRow(row).cv as unknown as Record<string, unknown>) } : null);
  if (!base) throw new InvalidInputError('Screening answers need this application\'s tailored CV. Generate the application kit first.');
  const existing = Array.isArray(base._screeningAnswers) ? base._screeningAnswers : [];
  const embeddedCount = typeof base._screeningUsageCount === 'number' ? base._screeningUsageCount : 0;
  const next = {
    ...base,
    _screeningAnswers: [...existing, ...items],
    _screeningUsageCount: Math.max(embeddedCount, turnsUsed),
  };
  return {
    statements: [buildSessionUpdateStatement(userId, sessionId, { generated_cv: next }, row.revision, now, guard)],
    revision: row.revision + 1,
  };
}
