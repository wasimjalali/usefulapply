/**
 * Fit Assessment Prompt Builder
 * 
 * Extracted from unified-writer-agent.ts for modularity.
 * Builds the prompt and system prompt for the fit assessment LLM call.
 */

import type { MasterContext } from '../types';

export interface FitAssessmentPromptInput {
  applicant: MasterContext['applicant'];
  job: MasterContext['job'];
  match: MasterContext['match'];
  masterCV?: string;
}

/**
 * Build the fit assessment user prompt
 */
export function buildFitAssessmentPrompt(input: FitAssessmentPromptInput): string {
  const { applicant, job, match, masterCV } = input;

  const fitLevel: 'strong' | 'good' | 'weak' = 
    (match?.score ?? 0) >= 80 ? 'strong' :
    (match?.score ?? 0) >= 40 ? 'good' : 'weak';

  // Build experience summary with years and relevance
  const experienceSummary = applicant?.experiences?.map(e => {
    const duration = e.startDate && e.endDate ? `${e.startDate}–${e.endDate}` : '';
    return `${e.title} at ${e.company}${duration ? ` (${duration})` : ''}`;
  }).join('; ') || 'Not specified';

  return `You are conducting a professional Job Fit Assessment for a candidate applying to a specific role. Evaluate the candidate using the industry-standard Job Fit Scoring framework across these 5 dimensions, then write a concise assessment.

=== EVALUATION FRAMEWORK ===
1. SKILLS & COMPETENCY MATCH (Weight: 40%)
   - How many required technical/hard skills does the candidate possess?
   - Are there critical must-have skills missing vs. nice-to-have gaps?
   
2. EXPERIENCE RELEVANCE (Weight: 25%)
   - Does the candidate's work history demonstrate relevant domain experience?
   - Are their past roles at a comparable seniority level?
   - Do they have industry-specific experience?

3. TRANSFERABLE VALUE (Weight: 15%)
   - Can existing skills bridge any gaps? (e.g., similar frameworks, adjacent technologies)
   - Does their career trajectory show ability to learn and adapt?

4. ROLE READINESS (Weight: 10%)
   - Could the candidate perform the core responsibilities on day one?
   - How much ramp-up time would be needed?

5. COMPETITIVE POSITIONING (Weight: 10%)
   - How would this candidate likely compare to the typical applicant pool?
   - Are there standout qualifications that differentiate them?

=== CANDIDATE PROFILE ===
Name: ${applicant?.name || 'Candidate'}
Skills: ${applicant?.skills?.map(s => String(s)).join(', ') || 'Not specified'}
Tools: ${applicant?.tools?.map(s => String(s)).join(', ') || 'Not specified'}
Experience: ${experienceSummary}
Certifications: ${applicant?.certifications?.map(s => String(s)).join(', ') || 'None listed'}
${masterCV ? `
=== MASTER CV (comprehensive skills & experience inventory) ===
${masterCV}

FIT ASSESSMENT DATA SOURCES:
Assess the candidate against ALL available documents:
1. Primary CV - the uploaded resume
2. Master CV - the comprehensive skills and experience inventory (shown above)

A skill in EITHER document is a candidate skill. Only mark as MISSING if absent from BOTH.
` : ''}
=== JOB REQUIREMENTS ===
Title: ${job?.title || 'Position'}
Company: ${job?.companyName || 'Company'}
Required Skills: ${job?.requiredSkills?.map(s => String(s)).join(', ') || 'Not specified'}
Nice-to-Have Skills: ${job?.niceToHaveSkills?.map(s => String(s)).join(', ') || 'Not specified'}
Responsibilities: ${job?.responsibilities?.slice(0, 5).map(s => String(s)).join('; ') || 'Not specified'}

=== COMPUTED SKILL MATCH ===
Match Score: ${match?.score ?? 0}%
Matching Skills: ${match?.matchingSkills?.join(', ') || 'None identified'}
Missing Skills: ${match?.missingSkills?.join(', ') || 'None identified'}
Assessed Fit Level: ${fitLevel.toUpperCase()} FIT

<output_format>
You MUST output in this exact markdown structure with BLANK LINES between each section. Do NOT deviate:

[One sentence: verdict with fit level — max 150 characters]

**Strengths:**
- [12 words max per bullet — reference specific skills/achievements]
- [12 words max per bullet]
- [12 words max per bullet if strong fit; 2 bullets if weak/good fit]

**Gaps:**
- [12 words max per bullet — name specific missing skills/qualifications]
- [12 words max per bullet]
- [12 words max per bullet if many gaps; 2 bullets if few gaps]

**Recommendation:** [One actionable sentence of strategic career advice — max 200 characters]
</output_format>

<section_limits>
HARD CHARACTER LIMITS PER SECTION:
- Verdict line: max 150 characters
- Strengths section: max 250 characters total (including header)
- Gaps section: max 250 characters total (including header)
- Recommendation: max 200 characters
- TOTAL: max 150 words. Count your words. If over 150, cut immediately.
Each section MUST be separated by a blank line for clear visual readability.
</section_limits>

<competitive_advantage_rule>
If the job description mentions a language as "advantage", "preferred", "plus", or "beneficial", AND the applicant has that language at B2 level or higher, highlight it as a KEY STRENGTH in the Strengths section (not just in matching skills). This is a competitive differentiator that should be called out explicitly, e.g., "German B2 is a competitive edge for this role."
</competitive_advantage_rule>

<strict_rules>
- Address the candidate directly using "you" and "your"
- Reference actual skill names from the match data
- Each bullet: maximum 12 words. Cut ruthlessly.
- 2-3 strength bullets. 2-3 gap bullets. Exactly 1 recommendation sentence.
- Do NOT start with "Based on" or "Overall"
- Do NOT add explanations or qualifiers to bullets — be direct
- BLANK LINE between every section — this is critical for readability
</strict_rules>

Return ONLY the structured assessment. Nothing else.`;
}

/**
 * Build the fit assessment system prompt
 */
export function buildFitAssessmentSystemPrompt(): string {
  return `You are Karko AI, a senior talent acquisition specialist and career coach.

<assessment_guidelines>
You evaluate job fit using the industry-standard 5-dimension framework: Skills & Competency Match, Experience Relevance, Transferable Value, Role Readiness, and Competitive Positioning.

Your assessments follow these principles:
1. HONESTY: Never sugarcoat weak fits. If the candidate lacks critical skills, say so clearly. If the fit is weak, state it directly.
2. CONSTRUCTIVENESS: Always identify genuine strengths and transferable value, even in weak fits. Every candidate has something to offer.
3. SPECIFICITY: Reference actual skill names, tools, and experience from the provided data. Never use vague statements like "you have relevant experience."
4. ACTIONABILITY: Your recommendation should give the candidate a concrete strategy for their application.
5. BREVITY: This is critical. The total output MUST be under 150 words. Each bullet must be under 12 words. Cut ruthlessly — short and punchy beats thorough and long. Users scan this in 5 seconds.
6. PRECISION: Use exactly the numbers and percentages from the computed skill match data. Do not round or approximate.
7. LANGUAGE: Write in a direct, coaching tone. Address the candidate as "you". Be honest but encouraging — like a mentor who respects the candidate enough to tell the truth.
</assessment_guidelines>`;
}

/**
 * Compute the fit level from a score
 */
export function computeFitLevel(score: number): 'strong' | 'good' | 'weak' {
  if (score >= 80) return 'strong';
  if (score >= 40) return 'good';
  return 'weak';
}
