/**
 * Context Builder — Phase 1 functions for Karko AI
 * 
 * Extracted from unified-writer-agent.ts for modularity.
 * Contains all context-building functions:
 * - extractApplicantProfile (CV parsing)
 * - parseJobDescription (JD parsing)
 * - detectLanguage (EN/DE detection)
 * - computeSkillMatch (LLM-based semantic matching)
 * - extractVerifiedMetrics (anti-hallucination binding)
 */

import type { MasterContext, TokenUsage } from './types';
import { callModel } from '@/lib/models';

// =====================================================
// TOKEN TRACKING
// Helper type for functions that return results with token usage
// =====================================================

export interface WithTokens<T> {
  result: T;
  tokens: TokenUsage;
}

// =====================================================
// CONTEXT BUILDING FUNCTIONS
// =====================================================

/**
 * Extract structured applicant profile from CV text
 * Uses LLM with strict JSON schema - only extracts what's in the document
 */
export async function extractApplicantProfile(
  primaryCV: string,
  masterCV?: string
): Promise<WithTokens<MasterContext['applicant']>> {
  const combinedCV = masterCV 
    ? `PRIMARY CV:\n${primaryCV}\n\nMASTER CV (additional experience):\n${masterCV}`
    : primaryCV;

  const response = await callModel({
    task: 'extract_applicant',
    prompt: `Extract the applicant's complete profile from the provided CV documents. You may have TWO sources: a Primary CV and a Master CV. Extract and MERGE information from BOTH sources.

${combinedCV}

EXTRACTION RULES:
- Personal info (name, email, phone, address): Use PRIMARY CV as the source of truth
- Skills, tools, experiences, certifications: COMBINE from BOTH CVs, deduplicate
- The Master CV is a comprehensive inventory - it may contain many more skills and experiences than the Primary CV
- Extract ALL skills and tools from BOTH sources - do not leave any out

Return a JSON object with this exact structure:
{
  "name": "Full name of the applicant",
  "email": "Email address",
  "phone": "Phone number or null if not found",
  "address": "Location/address or null if not found",
  "headline": "Professional headline/title or null",
  "skills": ["list", "of", "ALL", "technical", "skills", "from", "BOTH", "CVs"],
  "tools": ["list", "of", "ALL", "tools", "and", "technologies", "from", "BOTH", "CVs"],
  "languages": ["spoken", "languages"],
  "experiences": [
    {
      "company": "Company name",
      "title": "Job title",
      "startDate": "Start date or null",
      "endDate": "End date or 'Present'",
      "bullets": ["achievement 1", "achievement 2"]
    }
  ],
  "certifications": ["list", "of", "ALL", "certifications", "from", "BOTH", "CVs"]
}

CRITICAL: Only extract information that EXISTS in either the Primary CV or Master CV. Do not invent or assume anything. But DO extract from BOTH sources.`,
    systemPrompt: `You are a precise CV parser that extracts factual information from provided documents.

<extraction_rules>
Extract and merge information from ALL provided CV documents (Primary CV and Master CV if available). Deduplicate entries that appear in both sources. Only extract facts that are explicitly stated — do not infer, assume, or fabricate any information. If a field is not present in any source document, return null for that field. Preserve exact numbers, dates, and proficiency levels as stated in the source documents.
</extraction_rules>

Return valid JSON only. No explanation or preamble.`,
    jsonMode: true,
  });

  const tokens: TokenUsage = {
    input: response.usage.inputTokens,
    output: response.usage.outputTokens,
  };

  try {
    let jsonContent = response.content.trim();
    
    // Remove markdown code blocks if present
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }
    
    return { result: JSON.parse(jsonContent), tokens };
  } catch (error) {
    console.error('[UnifiedAgent] Failed to parse applicant profile:', error);
    return { result: extractBasicProfile(primaryCV), tokens };
  }
}

/**
 * Fallback: Extract basic profile using regex
 */
export function extractBasicProfile(cvText: string): MasterContext['applicant'] {
  const lines = cvText.split('\n').map(l => l.trim()).filter(Boolean);
  const name = lines[0]?.replace(/^#+\s*/, '') || 'Unknown';
  
  const emailMatch = cvText.match(/[\w.-]+@[\w.-]+\.\w+/);
  const phoneMatch = cvText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  
  return {
    name,
    email: emailMatch?.[0] || '',
    phone: phoneMatch?.[0] || undefined,
    skills: [],
    tools: [],
    languages: [],
    experiences: [],
    certifications: [],
  };
}

/**
 * Parse job description to extract structured requirements
 */
export async function parseJobDescription(jobDescription: string): Promise<WithTokens<MasterContext['job']>> {
  const response = await callModel({
    task: 'parse_job',
    prompt: `Parse this job description and extract all requirements.

JOB DESCRIPTION:
${jobDescription}

Return a JSON object with this exact structure:
{
  "title": "Job title",
  "companyName": "Company name",
  "location": "Location or null",
  "workType": "Remote/Hybrid/On-site or null",
  "requiredSkills": ["must-have", "skills"],
  "niceToHaveSkills": ["preferred", "skills"],
  "responsibilities": ["key", "responsibilities"],
  "startDate": "Required start date if mentioned, or null",
  "expectedSalary": "Salary range if mentioned, or null"
}

Extract ALL skills mentioned, including technical skills, soft skills, tools, and frameworks.`,
    systemPrompt: `You are a job description parser that extracts structured requirements from job postings in any language.

<parsing_rules>
Extract ALL skills, requirements, and qualifications mentioned in the job description — including technical skills, soft skills, tools, frameworks, language requirements, and certifications. Preserve the original language of skill names as they appear in the job description. If the JD is in German, extract skills in German. If in English, extract in English. Distinguish between must-have requirements and nice-to-have preferences. Extract the company name, job title, location, and work type if mentioned. If a field is not present in the job description, return null for that field.
</parsing_rules>

Return valid JSON only. No explanation or preamble.`,
    jsonMode: true,
  });

  const tokens: TokenUsage = {
    input: response.usage.inputTokens,
    output: response.usage.outputTokens,
  };

  try {
    let jsonContent = response.content.trim();
    
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }
    
    return { result: JSON.parse(jsonContent), tokens };
  } catch (error) {
    console.error('[UnifiedAgent] Failed to parse job description:', error);
    return {
      result: {
        title: 'Unknown Position',
        companyName: 'Unknown Company',
        requiredSkills: [],
        niceToHaveSkills: [],
        responsibilities: [],
      },
      tokens,
    };
  }
}

/**
 * Detect the language of the job description
 * Returns 'de' for German, 'en' for English (default)
 */
export function detectLanguage(text: string): string {
  const germanIndicators = [
    /\b(und|oder|für|mit|bei|auf|aus|nach|zur|zum|von|dem|den|des|der|die|das|ein|eine|einer|eines|wir|Sie|Ihre|Ihr|uns|werden|haben|sein|kann|können|sind|wird|wurde|werden|müssen|sollen|dürfen|möchten|Anforderungen|Aufgaben|Verantwortung|Erfahrung|Kenntnisse|Qualifikationen|Bewerbung|Stellenanzeige|Arbeitgeber|Mitarbeiter|Unternehmen|GmbH|AG)\b/gi,
    /\b(Berufserfahrung|Ausbildung|Studium|Abschluss|Vollzeit|Teilzeit|unbefristet|befristet|Gehalt|Vergütung|Arbeitszeit|Homeoffice|flexibel)\b/gi,
  ];
  
  let germanMatches = 0;
  for (const pattern of germanIndicators) {
    const matches = text.match(pattern);
    if (matches) {
      germanMatches += matches.length;
    }
  }
  
  // Threshold: at least 10 German words
  if (germanMatches >= 10) {
    return 'de';
  }
  
  return 'en';
}

/**
 * Compute skill match between applicant and job requirements
 * Uses LLM-based semantic matching for cross-language and conceptual matching
 * Falls back to string matching if LLM call fails
 */
export async function computeSkillMatch(
  applicant: MasterContext['applicant'],
  job: MasterContext['job'],
  masterCVText?: string
): Promise<MasterContext['match']> {
  if (!applicant || !job) {
    return { score: 0, matchingSkills: [], missingSkills: [] };
  }

  const toStr = (s: unknown): string => (typeof s === 'string' ? s : String(s ?? '')).trim();
  
  const applicantSkillsList = [
    ...(applicant.skills || []).map(toStr),
    ...(applicant.tools || []).map(toStr),
    ...(applicant.languages || []).map(toStr),
  ].filter(Boolean);

  const requiredSkills = (job.requiredSkills || []).map(toStr).filter(Boolean);
  
  if (requiredSkills.length === 0) {
    return { score: 0, matchingSkills: [], missingSkills: [] };
  }

  // Also include experience context for semantic matching
  const experienceContext = applicant.experiences?.map(e => 
    `${e.title} at ${e.company}: ${e.bullets?.slice(0, 2).join('; ') || ''}`
  ).join('\n') || '';

  try {
    const response = await callModel({
      task: 'skill_matching',
      prompt: `You are an expert recruiter performing a skill match analysis. Compare the candidate's skills and experience against the job requirements. Use SEMANTIC matching — skills don't need to be exact string matches.

<matching_rules>
SKILL MATCHING HIERARCHY — Apply in this order:

**TIER 1: EXPLICIT SKILL MATCH (Highest Confidence)**
A skill is explicitly matching if the EXACT skill name, tool, or technology (or a direct synonym) appears in the applicant's Primary CV or Master CV.

Examples of EXPLICIT matches:
- "Python" in JD, "Python" in CV → MATCH
- "Node.js" in JD, "Node" in CV → MATCH (synonym)
- "Salesforce" in JD, "Salesforce CRM" in CV → MATCH (same tool, fuller name)
- "German (C1)" in JD, "German (C1)" in CV → MATCH

Examples of NOT explicit matches (different tools/products):
- "Google Analytics" in JD, only "Google SEO" in CV → NOT a match (different Google products)
- "Amazon Advertising Console" in JD, only "Amazon Seller Central" in CV → NOT a match (different platforms)
- "Sponsored Products" in JD, only "Amazon PPC" in CV → NOT a match (PPC is broader than specific ad types)
- "TypeScript" in JD, only "JavaScript" in CV → NOT a match (different languages)

**TIER 2: SEMANTIC SKILL MATCH (Medium Confidence)**
A skill is semantically matching if:
- Cross-language equivalent: "Project Management" (EN) = "Projektmanagement" (DE)
- Broader category contains specific: "React" in CV matches "Frontend frameworks" in JD
- Specific tool within category: "PostgreSQL" in CV matches "SQL databases" in JD
- Related technologies in same ecosystem: "AWS Lambda" in CV provides evidence for "AWS cloud services" in JD

**TIER 3: EXPERIENCE-BASED MATCH (Lower Confidence — Use Sparingly)**
Only count as matching if the candidate's work history provides CLEAR, REPEATED evidence:
- 5+ years self-employment demonstrates "Independent work" or "Entrepreneurship"
- Teaching role demonstrates "Communication skills" or "Public speaking"
- Led a team of 10 demonstrates "Team leadership" or "People management"
- Managed international suppliers demonstrates "Cross-cultural communication"

**MATCHING DECISION TREE:**
1. Is the exact skill/tool name in the CV? → YES = Tier 1 MATCH
2. If no, is it a semantic equivalent or broader/narrower match? → YES = Tier 2 MATCH
3. If no, does their work experience provide clear repeated evidence? → YES = Tier 3 MATCH
4. If no → MISSING

**LANGUAGE PROFICIENCY MATCHING:**
- B2 matches: "B2", "upper intermediate", "professional working proficiency"
- B2 does NOT match: "C1", "fluent", "verhandlungssicher" (negotiation-level), "business fluent"
- C1+ matches: "C1", "C2", "fluent", "verhandlungssicher", "business fluent"
- Native matches: "Native", "Muttersprache", "mother tongue"

**HONESTY PRINCIPLE:**
When uncertain between two tiers, choose the LOWER tier (more conservative). It's better to slightly undercount than to overstate. The applicant can bridge gaps in their cover letter.
</matching_rules>

=== CANDIDATE SKILLS (from extracted profile) ===
${applicantSkillsList.join(', ')}

=== CANDIDATE EXPERIENCE ===
${experienceContext}
${masterCVText ? `
=== MASTER CV RAW TEXT (comprehensive skills inventory — treat as authoritative) ===
${masterCVText}

IMPORTANT: A skill listed in EITHER the extracted profile OR the Master CV raw text counts as a candidate skill.
The Master CV is the complete skills inventory. If a skill appears in the Master CV but not the extracted profile, it is still a real skill the candidate has.
` : ''}
=== JOB REQUIRED SKILLS ===
${requiredSkills.map((s, i) => `${i + 1}. ${s}`).join('\n')}

=== FIT SCORE CALCULATION METHOD (FOLLOW THIS EXACTLY) ===

**STEP 1: Calculate Must-Have Match Rate**
Identify all MUST-HAVE requirements (marked as "Required", "Essential", "Must Have", or listed without "nice to have"/"preferred"/"plus" qualifiers).

For each must-have, classify as:
- MET (Tier 1: explicit match in CV)
- PARTIAL (Tier 2: semantic match OR Tier 3: experience-based evidence)
- MISSING (no match in any tier)

Base Score Formula:
base_score = [(MET × 1.0) + (PARTIAL × 0.6)] / total_must_haves × 100

Example: 10 must-haves, 6 MET, 2 PARTIAL, 2 MISSING
base_score = [(6 × 1.0) + (2 × 0.6)] / 10 × 100 = 72%

**STEP 2: Apply Nice-to-Have Bonus (up to +10 points)**
For each nice-to-have skill the applicant HAS:
- +2 points per matched nice-to-have (maximum +10 points total)
- This rewards competitive differentiation without over-inflating the score

Example: 3 nice-to-haves matched → +6 points

**STEP 3: Apply Experience & Transferable Skills Adjustments (up to ±10 points)**
Positive adjustments:
- +5 points: Directly relevant industry experience (2+ years in same domain)
- +3 points: Strong transferable skills in adjacent domain (e.g., React dev applying for Vue role)
- +3 points: Higher seniority level than required (Senior applying for Mid-level)

Negative adjustments:
- -8 points: Missing THE PRIMARY requirement (e.g., main programming language for dev role, core certification for specialized role)
- -5 points: Missing a CRITICAL requirement (e.g., required security clearance, mandatory license)
- -7 points: Zero relevant experience in the domain (e.g., retail background applying for ML engineer)
- -3 points: Significantly lower seniority than required (Junior applying for Lead role)

Maximum total adjustments in Step 3: -10 to +10 points

**STEP 4: Apply Smart Caps & Floors**
- If missing 70%+ of must-haves → cap at 50% (too many critical gaps)
- If missing PRIMARY requirement BUT has strong Tier 2 matches in same domain → floor at 60% (transferable potential)
- If matches 90%+ of must-haves + 3+ nice-to-haves → allow up to 95%
- Never exceed 95% unless applicant meets ALL must-haves + majority of nice-to-haves (reserve 96-100% for unicorn candidates)

**STEP 5: Apply Industry-Aligned Labels**
- 85-100%: STRONG FIT — Highly competitive, excellent match
- 70-84%: GOOD FIT — Solid match with minor gaps, worth applying
- 55-69%: FAIR FIT — Notable gaps but transferable strengths, apply with preparation
- Below 55%: WEAK FIT — Significant gaps, upskilling recommended before applying

**CALIBRATION PRINCIPLE:**
A 70% score should mean the candidate is genuinely competitive for the role. Our scoring is optimized to match industry ATS standards where 70%+ typically advances to human review. Be fair but realistic — neither overly conservative nor overly generous.

=== COMPETITIVE ADVANTAGE DETECTION ===

If the job description mentions a language as "advantage", "preferred", "plus", "beneficial", or "significant advantage", AND the applicant has that language at B2 level or higher, classify it as a MATCHING skill and flag it prominently in the matching list. This is a competitive differentiator that many candidates will lack. Similarly, if a nice-to-have skill is something the applicant demonstrably has, include it in matching to reflect the competitive edge.

=== GAP DETECTION RULES ===

1. List EVERY specific tool, technology, framework, methodology, or qualification from the JD that is NOT explicitly documented in the applicant's source CVs.

2. Do NOT collapse multiple items into categories. Each tool is its own gap:
   WRONG: "CMS-Systeme (WordPress, Shopify oder ähnliche)" — this is ONE entry hiding THREE gaps
   RIGHT: "WordPress", "Shopify", "WooCommerce" — three separate entries

3. Do NOT collapse ad types, frameworks, or tools under umbrella terms:
   WRONG: "ML/AI frameworks" — this hides multiple gaps
   RIGHT: "PyTorch", "TensorFlow", "LangChain", "LlamaIndex" — four separate entries

4. Include gaps from BOTH required AND nice-to-have sections. The user needs to see the complete picture.

5. For German JDs, list gaps in the language they appear in the JD (e.g., "Technische SEO-Optimierung" not "Technical SEO").

6. Aim for completeness over brevity. A thorough gap list helps the user prepare for interviews and decide whether to upskill before applying.

=== OUTPUT FORMAT (strict JSON) ===
Return ONLY this JSON:
{
  "matching": ["skill1", "skill2"],
  "missing": ["skill3", "skill4"],
  "score": 35
}

Where:
- "matching" = required skills the candidate HAS (exact name from the job requirements list). Only include skills that pass the Strict Skill Matching Rule.
- "missing" = ALL required AND nice-to-have skills the candidate LACKS. List EVERY individual tool/technology separately — never collapse into categories.
- "score" = fit percentage calculated using the FIT SCORE CALCULATION METHOD above (not a simple ratio)

Return ONLY valid JSON, no explanation.`,
      systemPrompt: 'You are an expert ATS-calibrated skill matching engine. Return only valid JSON. Use the tier-based matching hierarchy: explicit matches first, semantic matches second, experience-based evidence third. Be fair and realistic — follow industry standards where 70%+ indicates genuine competitiveness. Never inflate scores, but also avoid excessive conservatism that undervalues transferable skills.',
      jsonMode: true,
    });

    let jsonContent = response.content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
    }
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonContent = jsonMatch[0];

    const parsed = JSON.parse(jsonContent);
    
    const matchingSkills = Array.isArray(parsed.matching) ? parsed.matching.map(toStr).filter(Boolean) : [];
    const missingSkills = Array.isArray(parsed.missing) ? parsed.missing.map(toStr).filter(Boolean) : [];
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 
      (requiredSkills.length > 0 ? Math.round((matchingSkills.length / requiredSkills.length) * 100) : 0);

    console.log(`[KarkoAI] LLM skill match: ${score}% (${matchingSkills.length} matching, ${missingSkills.length} missing)`);
    return { score, matchingSkills, missingSkills };

  } catch (error) {
    console.error('[KarkoAI] LLM skill matching failed, falling back to string matching:', error);
    return computeSkillMatchFallback(applicant, job);
  }
}

/**
 * Fallback string-based skill matching (used if LLM matching fails)
 */
export function computeSkillMatchFallback(
  applicant: MasterContext['applicant'],
  job: MasterContext['job']
): MasterContext['match'] {
  if (!applicant || !job) {
    return { score: 0, matchingSkills: [], missingSkills: [] };
  }

  const toStr = (s: unknown): string => (typeof s === 'string' ? s : String(s ?? '')).toLowerCase().trim();
  const applicantSkills = new Set([
    ...(applicant.skills || []).map(toStr),
    ...(applicant.tools || []).map(toStr),
    ...(applicant.languages || []).map(toStr),
  ].filter(Boolean));

  const requiredSkills = (job.requiredSkills || []).map(s => (typeof s === 'string' ? s : String(s ?? '')).trim()).filter(Boolean);
  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const skill of requiredSkills) {
    const skillLower = skill.toLowerCase();
    const hasSkill = [...applicantSkills].some(
      s => s.includes(skillLower) || skillLower.includes(s)
    );
    if (hasSkill) {
      matchingSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  const score = requiredSkills.length > 0
    ? Math.round((matchingSkills.length / requiredSkills.length) * 100)
    : 0;

  return { score, matchingSkills, missingSkills };
}

/**
 * Extract all quantified metrics from the applicant's source CVs.
 * Returns a list of verified metrics that can be used in generated documents.
 * Any number NOT in this list is considered fabricated.
 */
export async function extractVerifiedMetrics(
  primaryCV: string,
  masterCV?: string
): Promise<WithTokens<string[]>> {
  const combinedCV = masterCV
    ? `PRIMARY CV:\n${primaryCV}\n\nMASTER CV:\n${masterCV}`
    : primaryCV;

  const response = await callModel({
    task: 'extract_metrics',
    prompt: `Extract EVERY quantified metric, number, percentage, count, and duration from the provided CV documents. Include the number AND its context so it can be verified later.

${combinedCV}

EXTRACTION RULES:
- Extract the EXACT number as it appears in the source (e.g., "$50,000", "25%", "3 years", "12 clients")
- Include the context phrase (e.g., "$50,000 revenue", "25% growth", "3 years experience")
- Extract from BOTH Primary CV and Master CV
- Include durations (e.g., "3 years", "6 months")
- Include counts (e.g., "5 markets", "2 products", "10 team members")
- Include scores (e.g., "95%", "3.8 GPA", "85/100")
- Include monetary amounts (e.g., "$120,000", "€50,000+", "£30,000")
- Do NOT infer, calculate, or derive any numbers. Only extract what is explicitly written.
- If a number appears in both CVs, include it only once.

Return a JSON array of strings. Each string is one metric with its context.
Example: ["$120,000 annual revenue", "5 international markets", "25% year-over-year growth", "3.8 GPA"]

Return ONLY the JSON array. No explanation.`,
    systemPrompt: 'You are a precise data extraction tool. Extract only explicitly stated numbers and metrics from the provided documents. Never infer, calculate, or fabricate. Return a JSON array of strings.',
    jsonMode: true,
  });

  const tokens: TokenUsage = {
    input: response.usage.inputTokens,
    output: response.usage.outputTokens,
  };

  try {
    let jsonContent = response.content.trim();

    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonContent);

    if (Array.isArray(parsed)) {
      const metrics = parsed.map((m: unknown) => String(m).trim()).filter(Boolean);
      console.log(`[KarkoAI] Extracted ${metrics.length} verified metrics from source CVs`);
      return { result: metrics, tokens };
    }

    console.warn('[KarkoAI] Metric extraction returned non-array, defaulting to empty');
    return { result: [], tokens };
  } catch (error) {
    console.error('[KarkoAI] Failed to parse verified metrics:', error);
    return { result: [], tokens };
  }
}
