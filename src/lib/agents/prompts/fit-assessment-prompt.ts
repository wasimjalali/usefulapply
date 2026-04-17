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

  const fitLevel: 'strong' | 'good' | 'fair' | 'weak' = 
    (match?.score ?? 0) >= 85 ? 'strong' :
    (match?.score ?? 0) >= 70 ? 'good' :
    (match?.score ?? 0) >= 55 ? 'fair' : 'weak';

  // Build experience summary with years and relevance
  const experienceSummary = applicant?.experiences?.map(e => {
    const duration = e.startDate && e.endDate ? `${e.startDate}–${e.endDate}` : '';
    return `${e.title} at ${e.company}${duration ? ` (${duration})` : ''}`;
  }).join('; ') || 'Not specified';

  return `You are conducting a professional Job Fit Assessment for a candidate applying to a specific role. Your assessment must be calibrated to industry standards where 70%+ indicates genuine competitiveness and 85%+ indicates strong candidacy.

=== EVALUATION FRAMEWORK (Industry-Standard Weighting) ===

**1. MUST-HAVE SKILLS MATCH (Weight: 40%)**
- What percentage of required technical/hard skills does the candidate possess?
- Are critical must-haves missing, or just nice-to-haves?
- Quality of matches: Explicit skills > Semantic matches > Experience-based evidence

**2. EXPERIENCE RELEVANCE (Weight: 30%)**
- Years of directly relevant experience in the domain
- Seniority alignment (Junior/Mid/Senior/Lead)
- Industry-specific context and knowledge

**3. NICE-TO-HAVE SKILLS & COMPETITIVE EDGE (Weight: 15%)**
- How many preferred/nice-to-have qualifications does the candidate have?
- Standout differentiators that give them an edge over typical applicants
- Additional certifications, languages, or specialized skills

**4. TRANSFERABLE VALUE & ADAPTABILITY (Weight: 10%)**
- Can existing skills in adjacent domains bridge gaps?
- Career trajectory showing ability to learn and adapt
- Related frameworks, methodologies, or tech stacks

**5. ROLE READINESS (Weight: 5%)**
- Day-one performance potential for core responsibilities
- Estimated ramp-up time needed

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
Computed Fit Level: ${fitLevel.toUpperCase()} FIT

Fit Level Definitions (Industry-Aligned):
- STRONG FIT (85-100%): Highly competitive, excellent match for the role
- GOOD FIT (70-84%): Solid match with minor gaps, genuinely competitive
- FAIR FIT (55-69%): Notable gaps but worth applying with preparation
- WEAK FIT (<55%): Significant gaps, upskilling recommended first

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
If the job description mentions a language as "advantage", "preferred", "plus", or "beneficial", AND the applicant has that language at B2 level or higher, highlight it as a KEY STRENGTH in the Strengths section (not just in matching skills). Name the specific language and level from the CV and call it out as a competitive differentiator for this role.
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

const FIT_ASSESSMENT_SYSTEM_TEXT = `You are Karko AI, a senior talent acquisition specialist and career coach with expertise in ATS-calibrated candidate assessment.

<assessment_guidelines>
You evaluate job fit using industry-standard methodology calibrated to real-world hiring outcomes:
- 85%+ = Highly competitive candidate, excellent match
- 70-84% = Genuinely competitive, solid match (industry standard for advancement)
- 55-69% = Fair match with gaps, worth applying with preparation
- <55% = Significant gaps, upskilling recommended

**Core Principles:**

1. **INDUSTRY CALIBRATION**: Your assessments align with ATS and recruiter standards. A 70% score means genuinely competitive, not "barely acceptable." Be fair and realistic — neither overly harsh nor artificially generous.

2. **BALANCED HONESTY**: State gaps clearly but also recognize transferable value. Missing one specific tool in a tech stack ≠ unqualified. Acknowledge when adjacent skills or domain experience bridge gaps.

3. **MUST-HAVE vs NICE-TO-HAVE CLARITY**: Missing must-haves impacts core competitiveness. Missing nice-to-haves only impacts competitive edge. Make this distinction clear in your assessment.

4. **SPECIFICITY**: Reference actual skill names, tools, technologies, and experience from the data. Avoid vague statements like "you have relevant experience" — name the specific experience.

5. **ACTIONABILITY**: Your recommendation should give concrete next steps: what to emphasize in the cover letter, which gaps to address, or whether to apply now vs. after upskilling.

6. **BREVITY**: Total output under 150 words. Each bullet under 12 words. Users scan this in 5 seconds.

7. **PRECISION**: Use exact numbers from the computed match data. Don't round or approximate.

8. **ENCOURAGING REALISM**: Like a mentor who tells the truth respectfully. Honest about gaps, but supportive about strengths and next steps.
</assessment_guidelines>`;

/**
 * Build the fit assessment system prompt as cacheable blocks.
 * The content is fully static — identical for every user and every job.
 */
export function buildFitAssessmentSystemBlocks(): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> {
  return [
    {
      type: 'text',
      text: FIT_ASSESSMENT_SYSTEM_TEXT,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

/**
 * Build the fit assessment system prompt (plain string — kept for backward compat)
 * @deprecated Use buildFitAssessmentSystemBlocks() for prompt caching
 */
export function buildFitAssessmentSystemPrompt(): string {
  return FIT_ASSESSMENT_SYSTEM_TEXT;
}

/**
 * Compute the fit level from a score (Industry-aligned thresholds)
 * 85%+ = Strong (highly competitive)
 * 70-84% = Good (solid match, genuinely competitive)
 * 55-69% = Fair (notable gaps but worth applying)
 * <55% = Weak (significant gaps, upskilling recommended)
 */
export function computeFitLevel(score: number): 'strong' | 'good' | 'fair' | 'weak' {
  if (score >= 85) return 'strong';
  if (score >= 70) return 'good';
  if (score >= 55) return 'fair';
  return 'weak';
}
