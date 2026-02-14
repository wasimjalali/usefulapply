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
STRICT SKILL MATCHING RULE (HIGHEST PRIORITY — OVERRIDES ALL OTHER MATCHING LOGIC):

A skill can ONLY be classified as "matching" if it appears EXPLICITLY and BY NAME in the applicant's Primary CV or Master CV. 

Do NOT infer skills from adjacent or related experience. Specific examples:
- "Amazon PPC Campaign Management" in CV does NOT mean "Sponsored Products", "Sponsored Brands", or "Sponsored Display" are matching. These are specific ad product names. Unless the CV literally says "Sponsored Products," list each as MISSING.
- "Amazon Seller Central management" does NOT mean "Amazon Advertising Console" is matching. These are different platforms.
- "Google SEO fundamentals" does NOT mean "SEO best practices" or "technical SEO" is matching. The specific level matters.
- "Social media marketing" does NOT mean specific platform expertise (e.g., "TikTok Shop management") is matching.
- "Supply chain from China sourcing" does NOT mean "inventory management systems" is matching.
- General experience in a domain does NOT mean specific tools, methodologies, or sub-specializations within that domain are matching.

The test: Can you point to the EXACT words in the Primary CV or Master CV that name this skill? If yes → MATCHING. If you have to INFER, ASSUME, or DERIVE it → MISSING.

When uncertain, ALWAYS classify as MISSING. It is better to understate matches than to fabricate them. The applicant can address gaps in their cover letter — but a fabricated skill match that appears in their CV will destroy credibility in an interview.

1. CROSS-LANGUAGE MATCHING: Skills expressed in different languages that refer to the same concept or domain are matches. A skill in English and its equivalent in German (or any other language) should be matched if they describe the same competency area.
2. CONCEPTUAL MATCHING: Skills that are closely related within the same professional domain count as matches. A specific tool matches a broader category it belongs to, and vice versa.
3. EXPERIENCE-BASED MATCHING: If the candidate's work experience clearly demonstrates a competency even though it is not explicitly listed as a skill, count it as a match. Years of self-employment demonstrate independence; teaching experience demonstrates communication skills; managing suppliers demonstrates coordination skills.
4. LANGUAGE PROFICIENCY: Match language requirements honestly using CEFR standards. B2 does NOT match requirements for "verhandlungssicher" or "business-fluent" (which require C1-C2). C1+ or "Fluent" CAN match "verhandlungssicher." Native speakers match native-level requirements.
5. SOFT SKILLS: Match soft skills based on demonstrated experience in the candidate's work history, not just listed keywords.
6. PARTIAL MATCHES: If the candidate has genuinely related experience in the same domain, count it as a match.
7. HONESTY: Do not inflate. If there is genuinely no connection between a required skill and anything in the candidate's profile, mark it as missing.
8. MATCHING ACCURACY: A skill is MATCHING only if the EXACT tool/technology (or a direct synonym) appears in the applicant's documents.
   NOT matches (different products/tools):
   - "Google SEO Fundamentals" ≠ "Google Analytics"
   - "Amazon Seller Central" ≠ "Amazon Advertising Console"
   - "JavaScript" ≠ "Python"
   ARE matches (same tool, different naming):
   - "Node.js" = "Node"
   - "Helium 10" = "Helium10"
   When uncertain, mark as MISSING. False negatives are far less harmful than false positives.
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

Step 1: List all MUST-HAVE requirements from the job description (typically marked as "Required", "Must Have", or stated without "nice to have"/"plus" qualifiers).

Step 2: For each must-have, mark as MET only if the applicant has the skill classified as MATCHING per the Strict Skill Matching Rule above. Do not count inferred skills.

Step 3: Calculate base score:
  base_score = (number of MET must-haves / total must-haves) x 100

Step 4: Apply adjustments (max +/-10 points total):
  +5 if applicant has 2+ relevant nice-to-haves
  +5 if applicant has directly related industry experience
  -5 if applicant is missing a PRIMARY requirement (e.g., the main programming language, the core platform, a required degree)
  -5 if the role requires experience the applicant has zero exposure to

Step 5: Apply hard caps:
  - If applicant is missing the PRIMARY programming language or technical stack → cap at 55%
  - If applicant is missing 50%+ of must-have requirements → cap at 50%
  - If applicant matches nearly all must-haves with only 1-2 tool gaps → floor at 65%
  - Never score above 85% unless applicant meets ALL must-haves

Step 6: Apply labels:
  - 80-100%: STRONG FIT (green) — matches nearly all requirements
  - 60-79%: GOOD FIT (yellow) — solid match with some gaps
  - 40-59%: FAIR FIT (yellow) — notable gaps but transferable strengths
  - Below 40%: WEAK FIT (red) — significant gaps, consider upskilling first

IMPORTANT: An honest 50% score with clear gap flagging is MORE VALUABLE to the user than an inflated 78% that leads to interview embarrassment. Our product's credibility depends on honest assessment.

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
      systemPrompt: 'You are a precise skill matching engine. Return only valid JSON. Be fair but honest — count semantic and cross-language matches, but never inflate.',
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
