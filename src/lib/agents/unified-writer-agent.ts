/**
 * Karko AI - Unified Agent Architecture
 * 
 * Karko AI is the single intelligent agent that handles:
 * - Context Building: CV parsing, JD parsing, language detection, skill matching
 * - Document Generation: Optimized CV, cover letter, email generation
 * 
 * STREAMLINED FEATURES:
 * - No company research needed (relies on job description context)
 * - AI-native skill matching (no external RAG system)
 * 
 * Karko AI Workflow:
 * 1. Parse CV and extract applicant profile
 * 2. Analyze job description requirements
 * 3. Detect language (EN/DE)
 * 4. Match skills and identify gaps
 * 5. Optimize CV for the position
 * 6. Compose tailored cover letter
 * 7. Generate application email
 */

import type { MasterContext, AgentEventHandler, AgentResult, TokenUsage } from './types';
import { callModel } from '@/lib/models';
import { loadApplicantDocuments } from '@/lib/storage/applicantStore';
import { fixTypos } from '@/lib/config/typo-corrections';
import { COVER_LETTER_BLACKLIST } from '@/lib/config/cover-letter-blacklist';

// Re-export for backward compatibility
export { COVER_LETTER_BLACKLIST };

// =====================================================
// TOKEN TRACKING
// Helper type for functions that return results with token usage
// =====================================================

interface WithTokens<T> {
  result: T;
  tokens: TokenUsage;
}

// =====================================================
// ORCHESTRATION RESULT TYPE
// =====================================================

export interface OrchestrationResult {
  context: MasterContext;
  totalLatencyMs: number;
}

export interface UnifiedAgentInput {
  sessionId: string;
  jobDescription: string;
  primaryCV: string;
  masterCV?: string;
}

// =====================================================
// UNIFIED WRITER AGENT
// =====================================================

export const unifiedWriterAgent = {
  /**
   * Main entry point - runs the complete workflow
   * Sequential execution: Context Building → Document Generation
   */
  async run(
    input: UnifiedAgentInput,
    emit: AgentEventHandler
  ): Promise<AgentResult<OrchestrationResult>> {
    const startTime = Date.now();
    
    // Initialize MasterContext
    let context: MasterContext = {
      sessionId: input.sessionId,
      jobDescription: input.jobDescription,
      rawCV: input.primaryCV,
      masterCV: input.masterCV,
    };

    try {
      // ============================================
      // PHASE 1: ANALYSIS & MATCHING
      // ============================================
      emit({ type: 'step_started', step: { id: 'analysis', description: 'Karko AI: Parsing CV and analyzing job requirements' } });
      
      // Step 0: Load documents from storage if not provided
      if (!context.rawCV) {
        emit({ type: 'progress', percent: 5, message: 'Loading documents from storage...' });
        const docs = await loadApplicantDocuments(context.sessionId);
        if (docs.primaryCV) {
          context.rawCV = docs.primaryCV;
          console.log('[KarkoAI] Loaded primaryCV from storage');
        }
        if (docs.masterCV) {
          context.masterCV = docs.masterCV;
          console.log('[KarkoAI] Loaded masterCV from storage');
        }
        if (docs.certifications && docs.certifications.length > 0) {
          const certText = '\n\nCERTIFICATIONS:\n' + docs.certifications.join('\n');
          context.masterCV = (context.masterCV || '') + certText;
        }
      }

      // Validate CV content
      if (!context.rawCV) {
        throw new Error('No CV content available. Please upload a CV first.');
      }

      // Step 1+2: Extract applicant profile and parse JD in parallel — they're independent
      emit({ type: 'progress', percent: 10, message: 'Analyzing CV and job description...' });
      const [applicantResult, jobResult, metricsResult] = await Promise.all([
        this.extractApplicantProfile(context.rawCV, context.masterCV),
        this.parseJobDescription(context.jobDescription),
        this.extractVerifiedMetrics(context.rawCV, context.masterCV),
      ]);
      context.applicant = applicantResult.result;
      context.job = jobResult.result;
      context.verifiedMetrics = metricsResult.result;
      context.detectedLanguage = this.detectLanguage(context.jobDescription);
      console.log('[KarkoAI] Detected language:', context.detectedLanguage);
      console.log('[KarkoAI] Verified metrics count:', context.verifiedMetrics?.length || 0);
      
      // Log warnings for missing critical fields
      if (!context.applicant?.name || context.applicant.name === 'Unknown') {
        console.warn('[KarkoAI] WARNING: Could not extract applicant name from CV');
      }
      if (!context.applicant?.email) {
        console.warn('[KarkoAI] WARNING: Could not extract applicant email from CV');
      }

      emit({ type: 'step_completed', step: { id: 'analysis', description: 'CV parsed and job analyzed' }, tokens: applicantResult.tokens });

      // Step 3: Compute skill match (depends on both applicant + job from above)
      emit({ type: 'step_started', step: { id: 'matching', description: 'Karko AI: Matching skills and identifying gaps' } });
      emit({ type: 'progress', percent: 35, message: 'Analyzing skill match...' });
      context.match = await this.computeSkillMatch(context.applicant, context.job, context.masterCV);

      emit({ type: 'step_completed', step: { id: 'matching', description: 'Skills matched' }, tokens: jobResult.tokens });

      // ============================================
      // PHASE 2: DOCUMENT GENERATION
      // ============================================
      
      // Step 5: Generate optimized CV
      emit({ type: 'step_started', step: { id: 'cv_generation', description: 'Karko AI: Optimizing CV for the position' } });
      emit({ type: 'progress', percent: 45, message: 'Generating optimized CV...' });
      const { cvData, legacyCV, tokens: cvTokens } = await this.generateOptimizedCVData(context);
      context.optimizedCVData = cvData;
      context.optimizedCV = legacyCV;
      emit({ type: 'step_completed', step: { id: 'cv_generation', description: 'CV optimized' }, tokens: cvTokens });

      // Step 6: Generate cover letter
      emit({ type: 'step_started', step: { id: 'cover_letter', description: 'Karko AI: Composing tailored cover letter' } });
      emit({ type: 'progress', percent: 70, message: 'Writing cover letter...' });
      const coverLetterResult = await this.generateCoverLetter(context);
      context.coverLetter = coverLetterResult.result;
      emit({ type: 'step_completed', step: { id: 'cover_letter', description: 'Cover letter ready' }, tokens: coverLetterResult.tokens });

      // Step 7: Generate application email + follow-up (combined as one visible step)
      emit({ type: 'step_started', step: { id: 'email', description: 'Karko AI: Generating email + follow-up' } });
      emit({ type: 'progress', percent: 85, message: 'Composing application email...' });
      const emailResult = await this.generateApplicationEmail(context);
      context.applicationEmail = emailResult.result;

      emit({ type: 'progress', percent: 93, message: 'Composing follow-up email...' });
      const followUpResult = await this.generateFollowUpEmail(context);
      context.followUpEmail = followUpResult.result;
      emit({ type: 'step_completed', step: { id: 'email', description: 'Email + follow-up ready' }, tokens: emailResult.tokens });
      
      emit({ type: 'progress', percent: 100, message: 'Complete!' });

      return {
        success: true,
        data: {
          context,
          totalLatencyMs: Date.now() - startTime,
        },
        latencyMs: Date.now() - startTime,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent execution failed';
      console.error('[KarkoAI] Error:', errorMessage);
      emit({ type: 'step_error', step: { id: 'karko_ai' }, error: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };
    }
  },

  // =====================================================
  // CONTEXT BUILDING FUNCTIONS
  // =====================================================

  /**
   * Extract structured applicant profile from CV text
   * Uses LLM with strict JSON schema - only extracts what's in the document
   */
  async extractApplicantProfile(
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
      return { result: this.extractBasicProfile(primaryCV), tokens };
    }
  },

  /**
   * Fallback: Extract basic profile using regex
   */
  extractBasicProfile(cvText: string): MasterContext['applicant'] {
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
  },

  /**
   * Parse job description to extract structured requirements
   */
  async parseJobDescription(jobDescription: string): Promise<WithTokens<MasterContext['job']>> {
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
  },

  /**
   * Detect the language of the job description
   * Returns 'de' for German, 'en' for English (default)
   */
  detectLanguage(text: string): string {
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
  },

  /**
   * Compute skill match between applicant and job requirements
   * Uses LLM-based semantic matching for cross-language and conceptual matching
   * Falls back to string matching if LLM call fails
   */
  async computeSkillMatch(
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
      return this.computeSkillMatchFallback(applicant, job);
    }
  },

  /**
   * Fallback string-based skill matching (used if LLM matching fails)
   */
  computeSkillMatchFallback(
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
  },

  /**
   * Extract all quantified metrics from the applicant's source CVs.
   * Returns a list of verified metrics that can be used in generated documents.
   * Any number NOT in this list is considered fabricated.
   */
  async extractVerifiedMetrics(
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
  },

  // =====================================================
  // FIT ANALYSIS FUNCTIONS
  // =====================================================

  /**
   * Run fit analysis only (Phase 1 + assessment)
   * Returns the MasterContext with fit analysis populated (for context reuse)
   */
  async runFitAnalysis(
    input: UnifiedAgentInput,
    emit: AgentEventHandler
  ): Promise<AgentResult<OrchestrationResult>> {
    const startTime = Date.now();
    
    let context: MasterContext = {
      sessionId: input.sessionId,
      jobDescription: input.jobDescription,
      rawCV: input.primaryCV,
      masterCV: input.masterCV,
    };

    try {
      // Step 1: Extract applicant profile
      emit({ type: 'step_started', step: { id: 'analysis', description: 'Karko AI: Parsing CV and analyzing job requirements' } });
      emit({ type: 'progress', percent: 10, message: 'Extracting applicant profile from CV...' });
      
      if (!context.rawCV) {
        const docs = await loadApplicantDocuments(context.sessionId);
        if (docs.primaryCV) context.rawCV = docs.primaryCV;
        if (docs.masterCV) context.masterCV = docs.masterCV;
        if (docs.certifications && docs.certifications.length > 0) {
          const certText = '\n\nCERTIFICATIONS:\n' + docs.certifications.join('\n');
          context.masterCV = (context.masterCV || '') + certText;
        }
      }

      if (!context.rawCV) {
        throw new Error('No CV content available. Please upload a CV first.');
      }

      // Run applicant extraction, JD parsing, and metrics extraction in parallel — they're independent
      const [applicantResult, jobResult, metricsResult] = await Promise.all([
        this.extractApplicantProfile(context.rawCV, context.masterCV),
        this.parseJobDescription(context.jobDescription),
        this.extractVerifiedMetrics(context.rawCV, context.masterCV),
      ]);
      context.applicant = applicantResult.result;
      context.job = jobResult.result;
      context.verifiedMetrics = metricsResult.result;
      context.detectedLanguage = this.detectLanguage(context.jobDescription);
      emit({ type: 'step_completed', step: { id: 'analysis', description: 'CV parsed and job analyzed' }, tokens: applicantResult.tokens });

      // Step 2: Skill matching (depends on both applicant + job from above)
      emit({ type: 'step_started', step: { id: 'matching', description: 'Karko AI: Matching skills and identifying gaps' } });
      
      emit({ type: 'progress', percent: 50, message: 'Analyzing skill match...' });
      context.match = await this.computeSkillMatch(context.applicant, context.job, context.masterCV);
      emit({ type: 'step_completed', step: { id: 'matching', description: 'Skills matched' }, tokens: jobResult.tokens });

      // Step 3: Generate fit assessment
      emit({ type: 'step_started', step: { id: 'fit_assessment', description: 'Karko AI: Assessing job fit' } });
      emit({ type: 'progress', percent: 70, message: 'Generating fit assessment...' });
      const fitResult = await this.generateFitAssessment(context);
      context.fitAnalysis = fitResult.result;
      emit({ type: 'step_completed', step: { id: 'fit_assessment', description: 'Fit assessment complete' }, tokens: fitResult.tokens });

      emit({ type: 'progress', percent: 100, message: 'Fit analysis complete!' });

      return {
        success: true,
        data: {
          context,
          totalLatencyMs: Date.now() - startTime,
        },
        latencyMs: Date.now() - startTime,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Fit analysis failed';
      console.error('[KarkoAI] Fit analysis error:', errorMessage);
      emit({ type: 'step_error', step: { id: 'karko_ai' }, error: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };
    }
  },

  /**
   * Run full generation with pre-built context (Phase 2 only)
   * Skips Phase 1 (CV parsing, JD parsing, skill matching) - reuses cached context
   */
  async runWithContext(
    context: MasterContext,
    emit: AgentEventHandler
  ): Promise<AgentResult<OrchestrationResult>> {
    const startTime = Date.now();

    try {
      // Phase 2 only: Document Generation (context already has applicant, job, match)
      
      // Step 1: Generate optimized CV
      emit({ type: 'step_started', step: { id: 'cv_generation', description: 'Karko AI: Optimizing CV for the position' } });
      emit({ type: 'progress', percent: 15, message: 'Generating optimized CV...' });
      const { cvData, legacyCV, tokens: cvTokens } = await this.generateOptimizedCVData(context);
      context.optimizedCVData = cvData;
      context.optimizedCV = legacyCV;
      emit({ type: 'step_completed', step: { id: 'cv_generation', description: 'CV optimized' }, tokens: cvTokens });

      // Step 2: Generate cover letter
      emit({ type: 'step_started', step: { id: 'cover_letter', description: 'Karko AI: Composing tailored cover letter' } });
      emit({ type: 'progress', percent: 50, message: 'Writing cover letter...' });
      const coverLetterResult = await this.generateCoverLetter(context);
      context.coverLetter = coverLetterResult.result;
      emit({ type: 'step_completed', step: { id: 'cover_letter', description: 'Cover letter ready' }, tokens: coverLetterResult.tokens });

      // Step 3: Generate application email + follow-up (combined as one visible step)
      emit({ type: 'step_started', step: { id: 'email', description: 'Karko AI: Generating email + follow-up' } });
      emit({ type: 'progress', percent: 75, message: 'Composing application email...' });
      const emailResult = await this.generateApplicationEmail(context);
      context.applicationEmail = emailResult.result;

      emit({ type: 'progress', percent: 90, message: 'Composing follow-up email...' });
      const followUpResult = await this.generateFollowUpEmail(context);
      context.followUpEmail = followUpResult.result;
      emit({ type: 'step_completed', step: { id: 'email', description: 'Email + follow-up ready' }, tokens: emailResult.tokens });
      
      emit({ type: 'progress', percent: 100, message: 'Complete!' });

      return {
        success: true,
        data: {
          context,
          totalLatencyMs: Date.now() - startTime,
        },
        latencyMs: Date.now() - startTime,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';
      console.error('[KarkoAI] Generation with context error:', errorMessage);
      emit({ type: 'step_error', step: { id: 'karko_ai' }, error: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };
    }
  },

  /**
   * Generate a fit assessment paragraph using LLM
   * Classifies the fit as strong/good/weak and writes a concise assessment
   */
  async generateFitAssessment(context: MasterContext): Promise<WithTokens<NonNullable<MasterContext['fitAnalysis']>>> {
    const { applicant, job, match } = context;
    
    const fitLevel: 'strong' | 'good' | 'weak' = 
      (match?.score ?? 0) >= 80 ? 'strong' :
      (match?.score ?? 0) >= 40 ? 'good' : 'weak';

    // Build experience summary with years and relevance
    const experienceSummary = applicant?.experiences?.map(e => {
      const duration = e.startDate && e.endDate ? `${e.startDate}–${e.endDate}` : '';
      return `${e.title} at ${e.company}${duration ? ` (${duration})` : ''}`;
    }).join('; ') || 'Not specified';

    const response = await callModel({
      task: 'fit_assessment',
      prompt: `You are conducting a professional Job Fit Assessment for a candidate applying to a specific role. Evaluate the candidate using the industry-standard Job Fit Scoring framework across these 5 dimensions, then write a concise assessment.

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
${context.masterCV ? `
=== MASTER CV (comprehensive skills & experience inventory) ===
${context.masterCV}

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

Return ONLY the structured assessment. Nothing else.`,
      systemPrompt: `You are Karko AI, a senior talent acquisition specialist and career coach.

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
</assessment_guidelines>`,
    });

    const tokens: TokenUsage = {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
    };

    return {
      result: {
        fitLevel,
        score: match?.score ?? 0,
        assessment: response.content.trim(),
        matchingSkills: match?.matchingSkills || [],
        missingSkills: match?.missingSkills || [],
      },
      tokens,
    };
  },

  // =====================================================
  // DOCUMENT GENERATION FUNCTIONS
  // =====================================================

  /**
   * Determine the output language based on detection and user override
   */
  getOutputLanguage(context: MasterContext): string {
    if (context.userLanguageOverride) {
      return context.userLanguageOverride;
    }
    return context.detectedLanguage || 'en';
  },

  /**
   * Generate optimized CV as structured JSON (CVData format)
   * AI outputs structured data directly - no text parsing needed
   */
  async generateOptimizedCVData(context: MasterContext): Promise<{
    cvData: NonNullable<MasterContext['optimizedCVData']>;
    legacyCV: { content: string; changes: Array<{ section: string; before: string; after: string; reason: string }> };
    tokens: TokenUsage;
  }> {
    const { applicant, job, match, rawCV, masterCV } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[UnifiedAgent] Generating structured CV data in language:', outputLang);

    const verifiedSkillList = match ? `
=== VERIFIED SKILL LIST (BINDING — DO NOT OVERRIDE) ===

The following skills have been verified as PRESENT in the applicant's documents AND matching the job description. You may use these skills freely in the CV — reposition them, rephrase them, make them prominent:

VERIFIED MATCHING SKILLS:
${match.matchingSkills.length > 0 ? match.matchingSkills.join(', ') : '(No matching skills found — generate CV using applicant\'s actual skills without JD keyword optimization)'}

The following skills are REQUIRED by the job but NOT FOUND in any applicant document. You must NOT include these in the CV, the Professional Summary, or the Skills section:

VERIFIED MISSING SKILLS (DO NOT ADD TO CV):
${match.missingSkills.length > 0 ? match.missingSkills.join(', ') : '(No missing skills identified)'}

This list was generated by a separate verification system. You cannot override it.
If a skill appears in VERIFIED MISSING, it MUST NOT appear anywhere in the CV output.
If you believe a skill should be matching but it's listed as missing, that's acceptable —
the separate system may have missed a semantic match, but you still cannot add it to the CV.
The conservative approach (leaving it out) is always correct.

CV-FIT ASSESSMENT BINDING (REINFORCEMENT):
Cross-check EVERY skill, tool, and platform name in your generated CV against the VERIFIED MISSING list above. If a term appears in the MISSING list, it MUST NOT appear in the CV — not in experience bullets, not in skills sections, not in the professional summary. This includes specific variations and sub-types (e.g., if "Sponsored Products" is MISSING, do not write "Sponsored Products strategies", "Sponsored Products campaigns", or any phrase containing "Sponsored Products" in any bullet). Perform this check as a final validation step before outputting.
` : '';

    const verifiedMetricsList = context.verifiedMetrics && context.verifiedMetrics.length > 0 ? `
=== VERIFIED METRICS LIST (BINDING — DO NOT OVERRIDE) ===

The following metrics have been extracted from the applicant's Primary CV and Master CV by a separate verification system. These are the ONLY numbers, percentages, counts, and durations you may use in the CV output.

VERIFIED METRICS (you may use these):
${context.verifiedMetrics.map((m, i) => `${i + 1}. ${m}`).join('\n')}

BINDING CONSTRAINT:
- Any number that does NOT appear in the list above is FABRICATED and must NOT be used.
- If you want to describe an activity that has no verified metric, describe it WITHOUT a number.
- This list was generated by a separate extraction system. You cannot override it.
- Before writing ANY bullet containing a number, check it against this list. If the number is not here, remove it.
- A strong bullet without a metric is ALWAYS better than a bullet with an unverified number.
` : '';

    // ---- PROMPT CACHING: Static instructions go into cacheable system blocks ----
    // The CV optimization rules + JSON schema are ~3,000+ tokens of static content
    // that is identical across every call. By placing them in system blocks with
    // cache_control, Sonnet 4.5 can cache this prefix (min 1,024 tokens for Sonnet).
    // Cache reads cost 10% of base input price = ~90% savings on these tokens.
    const cvOptimizationSystemBlocks = [
      {
        type: 'text' as const,
        text: `You are the Writer Agent for Job Copilot - an Expert Resume Architect & Career Strategist.

=== YOUR ROLE ===
You are NOT writing a document - you are generating a DATA PAYLOAD (JSON Object) for a frontend application.
Your job is to FORMAT, ARTICULATE, and OPTIMIZE the content based on the CV and job description.
Output ONLY valid JSON matching the CVData schema. No markdown, no explanation, no preamble.
The frontend will render your JSON directly - if you mess up the structure, the app breaks.
CRITICAL: Always include the "analysis" object with summary, key_changes, ats_compatibility, and missing_keywords_added fields.

<quality_standard>
Generate a CV that reads naturally and professionally — as if written by a skilled human career coach, not an AI tool. Every bullet point should demonstrate impact with specific, quantified achievements ONLY when those exact numbers exist in the Primary CV or Master CV. If no number exists for an activity, write a strong action-oriented bullet WITHOUT a number. A bullet without metrics is ALWAYS better than a bullet with a fabricated metric. Use strong action verbs and varied sentence structures. The CV should tell a coherent professional story that connects the candidate's experience to the target role. Go beyond basic keyword insertion — craft language that would impress a hiring manager reading their 50th application of the day.

This quality standard is critical because our users' careers depend on the output. A mediocre CV wastes the user's time and damages our product reputation.
</quality_standard>

<anti_hallucination_rules>
WHY THIS MATTERS: Recruiters and hiring managers verify CV claims in interviews. A single fabricated skill or inflated metric destroys the candidate's credibility and our product's reputation. These rules protect every user.

RULE 1 — SOURCE VERIFICATION:
Every skill, tool, platform, certification, metric, and experience you include MUST be traceable to a specific statement in EITHER the Primary CV or the Master CV. Before writing any claim, verify: "Does this exact fact appear in the provided source documents?" If you cannot find it, do not include it. When the job description requires a skill the candidate lacks, highlight genuinely related transferable skills from the source documents instead of adding the missing skill.

RULE 2 — METRIC ACCURACY:
Use only exact numbers, percentages, and counts that appear in the source CVs. If a CV states a duration like "2+ years of experience," preserve that exact phrasing. Do not extrapolate counts (e.g., number of clients, students, or projects) unless that specific number is stated in a source document.

RULE 3 — LANGUAGE PROFICIENCY ACCURACY:
Reproduce language levels exactly as stated in the source CVs. Do not upgrade or relabel proficiency levels to match job description requirements. This is critical for the German job market where HR professionals follow strict CEFR conventions:
- Muttersprache = Native speaker
- Verhandlungssicher = C1-C2 (business-fluent, able to negotiate contracts)
- Fließend = B2-C1 (fluent conversational)
- Gute Kenntnisse = B1-B2 (good working knowledge)
- Grundkenntnisse = A1-A2 (basic)
A B2 certificate must be presented as B2 — labeling it as "verhandlungssicher" is factually incorrect and will be caught by any German HR professional. Only label a language as "verhandlungssicher" if the source CV documents C1 level or higher.

RULE 4 — SKILL ACCURACY (HIGHEST PRIORITY — OVERRIDES ATS OPTIMIZATION):

This rule has HIGHER priority than ATS optimization. If there is ANY conflict between
improving ATS score and maintaining skill accuracy, skill accuracy WINS.

You may ONLY include a skill, tool, or technology in the CV if:
1. It is EXPLICITLY listed by name in the Primary CV OR Master CV
2. It is DIRECTLY used in a described project (e.g., "Technology Stack: Next.js" → can list Next.js)

You may NEVER include a skill if:
- It is only IMPLIED by adjacent skills ("Amazon Seller Central" does NOT imply "Amazon Advertising Console")
- It is required by the JD but absent from the applicant's documents
- Adding it would improve the ATS score (ATS score is secondary to accuracy)
- It is industry-standard but the applicant hasn't listed it ("knows Node.js" does NOT imply "knows Python")

CONCRETE EXAMPLES OF VIOLATIONS:
- Master CV: "Google SEO Fundamentals" → Adding "Google Analytics" = FORBIDDEN (different product)
- Master CV: "Amazon Seller Central" → Adding "Amazon Advertising Console" = FORBIDDEN (different tool)
- Master CV: "Node.js, Next.js" → Adding "Python" = FORBIDDEN (different language)
- Master CV: "Listing Optimization" → Adding "A/B Testing" = FORBIDDEN (different methodology)
- Master CV: "Supabase" → Adding "FastAPI" = FORBIDDEN (different technology)

IF A JD KEYWORD HAS NO MATCH IN THE APPLICANT'S DOCUMENTS:
→ Do NOT add it to the CV
→ Do NOT add it to missing_keywords_added
→ The fit assessment already flagged it as a gap
→ Accept a lower ATS compatibility score — honesty is the product's value proposition

RULE 4b — QUANTIFIED CLAIMS RULE:

Every number, percentage, metric, or quantity in the CV output MUST be directly traceable to the applicant's Primary CV or Master CV. Examples:

ALLOWED (number exists in Primary CV or Master CV):
- "€150,000 revenue" (Master CV: "€150,000 total revenue")
- "30,000+ followers" (Master CV: "30,000+ followers")
- "92% reduction" (Master CV: "92% reduction")
- "2+ years of training" (Master CV: "2+ years of training")
- "4 markets" (Master CV: "Germany, Austria, Belgium/Switzerland, USA")

NOT ALLOWED (fabricated, inferred, or sourced from the JD):
- Any number that does not appear in the Primary CV or Master CV (e.g., invented listing counts, client counts, or percentage improvements)
- "100+ trainees" (source says "2+ years of training" — do NOT convert time to headcount)
- "50+ clients" (no client count in source documents)
- "15% conversion rate improvement" (no conversion metrics in source)
- "$200K pipeline" (no pipeline metrics in source)
- "350+ product listings" (number from JD, NOT from applicant's CV — FORBIDDEN)
- "500+ SKUs managed" (number from JD context — FORBIDDEN even if activity is real)

THE FABRICATION TEST: Before writing ANY number in a bullet, search the Primary CV and Master CV for that exact number. If you cannot find it, DELETE the number and describe the activity without it.

WHEN NO NUMBER EXISTS — WRITE A STRONG BULLET WITHOUT ONE:
If the applicant performed a real activity but no metric exists for it, describe the activity with a strong action verb and specific context. A bullet without a metric is ALWAYS better than a bullet with a fabricated one.

PATTERN — how to convert a numbered bullet to a numberless one:
- WITH fabricated number: "Managed [X]+ client accounts across multiple regions"
- WITHOUT number (CORRECT): "Managed client accounts across multiple regions, coordinating delivery and support"
- WITH fabricated number: "Optimized [X]+ product listings using keyword research"
- WITHOUT number (CORRECT): "Optimized product listings using data-driven keyword research and competitive analysis"
- WITH fabricated number: "Increased conversion rates by [X]%"
- WITHOUT number (CORRECT): "Improved conversion rates through systematic A/B testing and listing optimization"

The pattern: remove the fake number, add specific context about HOW or WHERE instead.

If the source says a duration (e.g., "2+ years"), use the duration. Do NOT estimate, round, or convert to a different unit. The applicant will be asked to verify every number in an interview.

RULE 4d — JOB DESCRIPTION NUMBERS ARE FORBIDDEN IN CV CONTENT:
Numbers, quantities, and metrics that appear in the job description but NOT in the applicant's source CVs must NEVER be used in the CV output. The JD describes the EMPLOYER's context, not the APPLICANT's achievements. Even if the applicant performed a similar activity, you cannot attach the employer's scale to it.
- JD says "manage 350+ SKUs" → you CANNOT write "managed 350+ product listings" unless "350" appears in the applicant's CV
- JD says "$5M budget" → you CANNOT write "managed $5M budgets" unless that number is in the CV
- JD says "team of 20" → you CANNOT write "led team of 20" unless the CV states it
The ONLY source for numbers in CV bullets is the Primary CV and Master CV. No exceptions.

RULE 4c — EXPERIENCE BULLET ACCURACY:
Each bullet in the experience section must describe something the applicant ACTUALLY DID, as documented in their source CVs. Do not create hypothetical capabilities or inferred activities. If the source says "managed advertising budgets," write about managing advertising budgets — do not upgrade this to "developed reporting frameworks" or "built analytical dashboards."

Before writing ANY bullet with a number or metric, perform this check:
1. Find the exact number in the Primary CV or Master CV
2. If the number only appears in the Job Description — DO NOT USE IT
3. If no number exists for an activity, describe the activity WITHOUT a number
Describing real work without a fabricated metric is ALWAYS better than attaching an impressive but fake number.

RULE 5 — SKILL CATEGORIZATION:
Categorize each skill based on its actual technical function, not based on which job description category it would best fit into. A database tool belongs under "Database/Backend," a web framework belongs under "Web Development," an analytics platform belongs under "Analytics," etc.

RULE 6 — OCR CLEANUP:
Strip OCR artifacts, broken characters, or encoding errors from certification names and other text while preserving the correct content.

RULE 7 — LANGUAGE CONSISTENCY:
Write all content in the language specified in the user prompt. Exception: preserve proper nouns (tool names, company names, product names) in their original form.
</anti_hallucination_rules>

=== 📏 LENGTH & FORMAT CONSTRAINTS ===
To ensure the CV fits on 2 pages and remains readable:

=== EXPERIENCE SELECTION RULES (CRITICAL) ===
1. **Quantity Limit:** Select ONLY the top 3-4 roles from the Master CV and Primary CV combined.
2. **Selection Criteria:** Prioritize roles that:
   - Match the target Job Title or industry.
   - Have the most recent dates (2020-Present preferred).
   - Demonstrate skills explicitly listed in the Job Description.
3. **Bullet Point Limit (Strict):**
   - **Most Recent/Relevant Role:** Exactly 4 strong, accurate bullets.
   - **Second Role:** Exactly 3-4 bullets.
   - **Older Roles (3rd/4th):** Exactly 3 bullets each.
   - **Total Bullets:** NEVER exceed 15 total bullets across the entire CV.
4. **Omission Policy:** 
   - If a role is >10 years old, DO NOT include it unless it's the only work history available.
   - If a role is completely irrelevant (e.g., "Waiter" for "E-Commerce Manager"), DROP it completely.
5. **Skills:** MAXIMUM **5 categories** (strictly enforced, Languages is separate). MAXIMUM **5 skills** per category (strictly enforced). Prioritize skills mentioned in the Job Description.

=== OPTIMIZATION STRATEGY ===

1. PERSONAL INFO: Copy EXACTLY from Primary CV (name, email, phone, address, LinkedIn, GitHub)

2. HEADLINE (currentTitle): Optimize for the target job
   - Max 3-4 keywords separated by " | "
   - Example: "E-Commerce Specialist | Digital Marketing | Amazon Expert"

3. SUMMARY: 3-4 sentences with metrics from CV, keywords from job

4. EXPERIENCE (STRICT LIMITS): 
   - Select TOP 3-4 most relevant roles ONLY (no more!)
   - Most recent role: EXACTLY 4 bullets
   - Older roles: EXACTLY 3 bullets each
   - TOTAL bullets across entire CV: MAX 15
   - Drop roles >10 years old or completely irrelevant
   - Each entry needs: company, position, location, startDate, endDate, bullets, technologies
   - Use action verbs, include metrics where available
   - Generate unique IDs for each entry (exp-1, exp-2, etc.)

5. SKILLS: Group into MAX 5 categories with specific tool names (Languages is 6th, handled separately)
   - NEVER genericize tools (keep "Helium 10" not "E-Commerce Tools")
   - Preserve AI/automation skills even if not in job description
   - Max 5 items per category (strictly enforced)

6. EDUCATION: Copy from Primary CV exactly. Use the standard CV education format.

   EDUCATION FIELD MAPPING (MANDATORY — follow this for EVERY education entry):

   Each education entry has these fields. Map them CORRECTLY:
   - "institution": The NAME of the school, university, academy, or bootcamp. This is WHERE the person studied.
   - "degree": The QUALIFICATION or credential earned. This is WHAT they earned.
   - "field": The subject area or major (optional). Only include if explicitly stated and not already implied by the degree name.
   - "startDate": When they started (optional). Format: "YYYY" or "Month YYYY".
   - "endDate": When they finished or expect to finish. Format: "YYYY" or "Month YYYY" or "Present"/"ongoing" if currently enrolled.
   - "location": City/country of the institution (optional).
   - "grade": GPA or grade if notable (optional).

   EXAMPLES OF CORRECT FIELD MAPPING:

   University degree:
   - institution: "Technical University of Munich"
   - degree: "Bachelor of Science"
   - field: "Computer Science"
   - endDate: "2023"

   Bootcamp / Academy (6-12 month programs):
   - institution: "Masterschool"
   - degree: "Full-Stack Web Development Certificate"
   - field: (omit — the degree name already describes the field)
   - endDate: "ongoing" or "Present" or "2025"

   High School / Abitur:
   - institution: "Nazoo Ana High School"
   - degree: "General University Entrance Qualification (Abitur Equivalent)"
   - field: (omit — redundant with degree name)
   - location: "Kabul"
   - endDate: "2020"
   - grade: "92.43%"

   Online Certificate / Course:
   - institution: "Google (via Coursera)"
   - degree: "Google Data Analytics Professional Certificate"
   - field: (omit)
   - endDate: "2024"

   COMMON MISTAKES TO AVOID:
   - Do NOT put the institution name in the "degree" field
   - Do NOT put the degree/qualification in the "institution" field
   - Do NOT combine date, location, or status into the institution or degree strings (e.g., "Nazoo Ana High School, Kabul | 2020" is WRONG — separate into institution, location, and endDate fields)
   - Do NOT combine "ongoing" or "Present" into the degree string (e.g., "Masterschool | ongoing" is WRONG — put "Masterschool" in institution and "ongoing" in endDate)
   - Do NOT leave degree empty or use placeholder text — always identify the qualification

   EDUCATION FORMATTING (MANDATORY — NO EXCEPTIONS):

   REMOVE these phrases from ALL education entries:
   - "in Allgemeinbildung" — ALWAYS DELETE THIS
   - "in General Education" — ALWAYS DELETE THIS
   These are redundant with "Allgemeine Hochschulreife" / "General University Entrance Qualification"

   CORRECT:
   - German: degree: "Allgemeine Hochschulreife (Abitur-Äquivalent)", grade: "92,43%"
   - English: degree: "General University Entrance Qualification (Abitur Equivalent)", grade: "92.43%"

   WRONG (never output these):
   - "...in Allgemeinbildung" ← DELETE "in Allgemeinbildung"
   - "...in General Education" ← DELETE "in General Education"

   If the source CV contains these phrases, REMOVE them during optimization.
   - Do NOT add "in [field]" if the degree name already implies the field (e.g., "Allgemeine Hochschulreife" already means general education)

7. LANGUAGES: Copy from Primary CV exactly (with proficiency levels)

8. CERTIFICATIONS: Select 4-5 most relevant, CLEAN any OCR artifacts from names

=== 🧠 "CHANGES" TAB LOGIC ===
You MUST populate the "analysis" object to explain your work to the user:
- summary: Explain your high-level strategy in 2 sentences
- key_changes: A list of 4-6 specific improvements made
- ats_compatibility: Your estimated ATS compatibility score (0-100)
- missing_keywords_added: List of EXISTING applicant skills that you repositioned or rephrased to better match ATS keywords from the JD. Only include skills the applicant ALREADY HAD in their Primary CV or Master CV. This is a report of what you REPOSITIONED, not what you INVENTED.

=== OUTPUT FORMAT (STRICT JSON) ===

Return ONLY this JSON structure - no markdown, no preamble, no explanation:

{
  "personal": {
    "fullName": "string",
    "email": "string",
    "phone": "string (optional)",
    "currentTitle": "string - the optimized headline",
    "address": "string (optional)",
    "city": "string (optional)",
    "country": "string (optional)",
    "linkedIn": "string (optional)",
    "website": "string (optional)",
    "github": "string (optional)",
    "driverLicense": "string (optional) - e.g., 'Class B' or 'Klasse B'. Include if present in Primary CV or Master CV. Omit if not applicable."
  },
  "summary": "string - 3-4 sentences",
  "experience": [
    {
      "id": "exp-1",
      "company": "string",
      "position": "string",
      "location": "string (optional)",
      "startDate": "string (e.g., 'January 2024' or 'Januar 2024')",
      "endDate": "string or null if current",
      "current": true/false,
      "bullets": ["achievement 1", "achievement 2", "achievement 3"],
      "technologies": ["Tool1", "Tool2"]
    }
  ],
  "education": [
    {
      "id": "edu-1",
      "institution": "string — WHERE they studied (school/university/academy name ONLY, no dates or status)",
      "degree": "string — WHAT they earned (qualification/credential name, never the institution name)",
      "field": "string (optional) — major/subject, omit if degree name already implies it",
      "location": "string (optional) — city/country of institution",
      "startDate": "string (optional) — e.g., '2018' or 'September 2018'",
      "endDate": "string (optional) — e.g., '2020' or 'Present' or 'ongoing'",
      "grade": "string (optional) — GPA or grade percentage",
      "highlights": ["string"] (optional)
    }
  ],
  "skills": [
    {
      "category": "Category Name (e.g., 'E-Commerce & Marketplaces')",
      "items": ["Specific Tool 1", "Specific Tool 2"]
    }
  ],
  "languages": [
    {
      "language": "string",
      "proficiency": "string (e.g., 'Native', 'C1', 'B2')"
    }
  ],
  "certifications": [
    {
      "id": "cert-1",
      "name": "string (CLEAN - no OCR artifacts)",
      "issuer": "string",
      "date": "string (optional)"
    }
  ],
  "sectionHeaders": {
    "summary": "ATS-compliant section header for Summary in the output language",
    "skills": "ATS-compliant section header for Skills in the output language",
    "experience": "ATS-compliant section header for Experience in the output language",
    "education": "ATS-compliant section header for Education in the output language",
    "certifications": "ATS-compliant section header for Certifications in the output language",
    "languages": "ATS-compliant section header for Languages in the output language",
    "contact": "ATS-compliant section header for Contact in the output language",
    "additionalInfo": "ATS-compliant section header for Additional Info in the output language"
  },
  "localizedStrings": {
    "present": "'Present' in the output language (e.g., 'Heute', 'Présent')",
    "gradePrefix": "Grade label in the output language (e.g., 'GPA:', 'Note:')",
    "degreeConnector": "Connector word between degree and field (e.g., 'in', 'en')"
  },
  "analysis": {
    "summary": "2-sentence strategy summary",
    "key_changes": ["Change 1", "Change 2", "Change 3", "Change 4"],
    "ats_compatibility": 85,
    "missing_keywords_added": ["keyword1", "keyword2"]
  }
}

=== ATS OPTIMIZATION (2026 STANDARDS) ===

FOUNDATIONAL PRINCIPLE — ACCURACY OVER ATS SCORE:
ATS optimization means making the applicant's REAL skills more visible to automated systems.
It does NOT mean adding skills the applicant doesn't have.
A CV with 70% ATS compatibility and zero fabricated skills is ALWAYS better than
a CV with 95% ATS compatibility that includes skills the applicant will fail to demonstrate in an interview.

1. SECTION HEADERS: Use ONLY standard ATS-recognized headers:
   - "Professional Summary" or "Summary" or "Profil"
   - "Professional Experience" or "Work Experience" or "Berufserfahrung"
   - "Education" or "Ausbildung"
   - "Skills" or "Core Competencies" or "Fähigkeiten"
   - "Certifications" or "Zertifikate"
   - "Languages" or "Sprachen"
   NEVER use creative headers like "What I Bring", "My Journey"

SECTION HEADERS RULE:
Generate ATS-compliant section headers in the output language. Use the STANDARD,
CONVENTIONAL section names that ATS systems in the target market recognize.
Do NOT use creative or unconventional headers.

2. KEYWORD REPOSITIONING (NOT INJECTION):
   - Scan the JD for required skills and keywords
   - Check if the applicant HAS those skills (in Primary CV or Master CV)
   - If YES: Reposition that skill to be more prominent — move to Skills section header, use exact JD phrasing
   - If NO: Do NOT add the skill. Leave it out. The fit assessment already flagged it as a gap.
   - Include both acronyms AND full forms for skills the applicant HAS: "SEO (Search Engine Optimization)"

3. BULLET FORMAT (Action → Impact):
   - Every bullet MUST start with a strong action verb
   - Include metrics/numbers ONLY if that exact number exists in the Primary CV or Master CV
   - If no metric exists for an activity, write a compelling bullet WITHOUT a number — do NOT invent one. Describe the scope, tools used, or business context instead.
   - Most bullets will NOT have numbers — that is normal and expected. Only a few key achievements will have verified metrics.
   - No action verb used more than twice across ALL bullets
   - Bullets must describe things the applicant ACTUALLY DID (from Primary CV or Master CV)

4. SKILLS SECTION ORDERING:
   - List skills that MATCH the JD first (but only skills the applicant actually has)
   - Then list additional relevant skills from the applicant's background
   - Match EXACT terminology from job posting WHERE the applicant has the equivalent skill
   - Example: If JD says "project management" and Master CV shows project management experience → use "Project Management"
   - Example: If JD says "Kubernetes" and neither CV mentions it → DO NOT ADD IT

5. WHAT "OPTIMIZATION" MEANS:
   - Rephrasing existing skills to match JD terminology (e.g., "managed teams" → "Project Management")
   - Reordering sections to put most relevant experience first
   - Adding metrics from Master CV that Primary CV omitted
   - Using exact JD phrases for skills the applicant demonstrably has
   
   WHAT "OPTIMIZATION" DOES NOT MEAN:
   - Adding skills not found in any applicant document
   - Claiming proficiency in tools never mentioned
   - Inventing experience or achievements
   - Inferring skills from adjacent knowledge (e.g., "knows Node.js" ≠ "knows Python")

=== DUAL-CV SOURCE RULES (CRITICAL) ===
You have TWO sources of truth for the applicant:
1. PRIMARY CV: The applicant's current/main resume - use for personal info, current role, dates
2. MASTER CV: A comprehensive inventory of ALL skills, experiences, certifications, and achievements
   - The Master CV may contain 5-10x more content than the Primary CV
   - ALWAYS mine the Master CV for additional relevant experiences, metrics, and skills
   - If the JD requires a skill found in the Master CV but not the Primary CV, INCLUDE it
   - Use Master CV achievements/metrics to strengthen bullet points
   - The Master CV is the applicant's COMPLETE professional history

SOURCING PRIORITY:
- Personal info: PRIMARY CV (name, email, phone, address)
- Experience selection: BOTH CVs - pick the most relevant roles from either source
- Skills/tools: BOTH CVs - combine and deduplicate
- Metrics/achievements: BOTH CVs - use the most impressive relevant numbers
- Certifications: BOTH CVs - select most relevant to the JD
- Education: PRIMARY CV first, supplement from Master CV if needed

=== DATA PRESERVATION RULES ===
The following fields from the original CV or Master CV must ALWAYS be preserved in the optimized CV, regardless of job description relevance:
1. Driver's License — include in the "driverLicense" field of the personal object
2. Languages — always include ALL languages with their exact proficiency levels
3. Work Authorization status — if mentioned in Master CV or Primary CV
4. Location — always include current city
These fields cost zero space in terms of relevance but can be disqualifying if missing.

DRIVER'S LICENSE (MANDATORY — USE THE JSON FIELD):
If the Primary CV or Master CV mentions a driver's license, you MUST populate the "driverLicense" field:
- English CV: "Class B"
- German CV: "Klasse B"
If no driver's license is mentioned in any source document, omit the field entirely.
Do NOT put the driver's license only in the analysis/changes section — it MUST be in personal.driverLicense.

=== PUNCTUATION IN CV CONTENT ===
Do NOT use em-dashes (—) or en-dashes (–) in any CV content: not in experience bullets, not in the professional summary, not in skill categories, not anywhere. Use commas, semicolons, colons, or periods instead. Hyphens (-) are allowed only in compound words, job titles, and date ranges. Dashes are a telltale sign of AI-generated content.

=== OUTPUT COMPLETENESS ===
Your CV output must be a COMPLETE, standalone document ending after the last section (Certifications, Languages, or similar). Do NOT append any raw text from the original CV. Nothing follows the last section.

=== CRITICAL RULES ===
1. Output ONLY valid JSON - no markdown code blocks, no text before or after
2. NEVER invent skills, experiences, or achievements not in EITHER the Primary CV or Master CV
3. Use the EXACT dates from the original CVs
4. Generate unique IDs for experience, education, certifications (exp-1, edu-1, cert-1, etc.)
5. Bullets must be achievement-focused with action verbs (CAR method)
6. Skills must include SPECIFIC TOOL NAMES, not generic categories
7. ALWAYS include the "analysis" object - it powers the Changes tab
8. CLEAN all OCR artifacts from certification names and other text
9. Every skill, metric, and claim MUST be traceable to either the Primary CV or Master CV
10. PRESERVE driver's license, languages, work authorization, and location — never silently drop these`,
        cache_control: { type: 'ephemeral' as const },
      },
    ];

    const response = await callModel({
      task: 'optimize_cv',
      prompt: `=== TARGET JOB ===
Title: ${job?.title || 'Unknown'}
Company: ${job?.companyName || 'Unknown'}
Required Skills: ${job?.requiredSkills?.join(', ') || 'N/A'}
Nice-to-Have: ${job?.niceToHaveSkills?.join(', ') || 'N/A'}
${verifiedSkillList}
${verifiedMetricsList}
=== PRIMARY CV (source of truth for personal info) ===
${rawCV}

${masterCV ? `=== MASTER CV (additional experiences/skills to draw from) ===
${masterCV}` : ''}

=== LANGUAGE ===
LANGUAGE RULE:
- Detect the language of the job description
- Generate ALL content (summary, bullets, skills, section headers, localized strings) in that SAME language
- Section headers MUST use standard ATS-recognized names in the output language (not creative alternatives)
- If language is unclear or mixed, default to English
- For German: use formal conventions (dates as MM/YYYY, "Heute" for present)
- For English: use market-appropriate conventions based on location (US Letter vs A4 implied by market)
- Include sectionHeaders and localizedStrings objects in your JSON output

Generate the optimized CV JSON now.`,
      systemBlocks: cvOptimizationSystemBlocks,
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
      
      // Extract only the first complete JSON object (handle AI adding extra text after)
      let braceCount = 0;
      let jsonStart = -1;
      let jsonEnd = -1;
      
      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i];
        if (char === '{') {
          if (braceCount === 0) jsonStart = i;
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && jsonStart !== -1) {
            jsonEnd = i + 1;
            break; // Found complete JSON object
          }
        }
      }
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonContent = jsonContent.substring(jsonStart, jsonEnd);
        console.log('[UnifiedAgent] Extracted JSON from position', jsonStart, 'to', jsonEnd);
      } else {
        // Fallback to regex if brace counting fails
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
      }
      
      const parsed = JSON.parse(jsonContent);
      
      console.log('[UnifiedAgent] Parsed structured CV data:');
      console.log('  - Personal:', parsed.personal?.fullName);
      console.log('  - Experience entries:', parsed.experience?.length || 0);
      console.log('  - Skill categories:', parsed.skills?.length || 0);
      console.log('  - Driver License:', parsed.personal?.driverLicense ?? parsed.personal?.driver_license ?? 'not present');
      console.log('  - sectionHeaders:', parsed.sectionHeaders ? JSON.stringify(parsed.sectionHeaders) : 'NOT PRESENT');
      console.log('  - localizedStrings:', parsed.localizedStrings ? JSON.stringify(parsed.localizedStrings) : 'NOT PRESENT');
      
      // Validate and provide defaults
      const cvData: NonNullable<MasterContext['optimizedCVData']> = {
        personal: {
          fullName: parsed.personal?.fullName || applicant?.name || 'Unknown',
          email: parsed.personal?.email || applicant?.email || '',
          phone: parsed.personal?.phone,
          currentTitle: parsed.personal?.currentTitle,
          address: parsed.personal?.address,
          city: parsed.personal?.city,
          country: parsed.personal?.country,
          linkedIn: parsed.personal?.linkedIn,
          website: parsed.personal?.website,
          github: parsed.personal?.github,
          driverLicense: parsed.personal?.driverLicense ?? parsed.personal?.driver_license ?? undefined,
        },
        summary: parsed.summary || '',
        experience: (parsed.experience || []).map((exp: Record<string, unknown>, idx: number) => ({
          id: exp.id as string || `exp-${idx + 1}`,
          company: exp.company as string || '',
          position: exp.position as string || '',
          location: exp.location as string | undefined,
          startDate: exp.startDate as string || '',
          endDate: exp.endDate as string | undefined,
          current: exp.current as boolean || false,
          bullets: (exp.bullets as string[]) || [],
          technologies: (exp.technologies as string[]) || undefined,
        })),
        education: (parsed.education || []).map((edu: Record<string, unknown>, idx: number) => ({
          id: edu.id as string || `edu-${idx + 1}`,
          institution: edu.institution as string || '',
          degree: edu.degree as string || '',
          field: edu.field as string | undefined,
          location: edu.location as string | undefined,
          startDate: edu.startDate as string | undefined,
          endDate: edu.endDate as string | undefined,
          grade: edu.grade as string | undefined,
          highlights: edu.highlights as string[] | undefined,
        })),
        skills: (parsed.skills || []).map((skill: Record<string, unknown>) => ({
          category: skill.category as string || '',
          items: (skill.items as string[]) || [],
        })),
        languages: (parsed.languages || []).map((lang: Record<string, unknown>) => ({
          language: lang.language as string || '',
          proficiency: lang.proficiency as string || '',
        })),
        certifications: (parsed.certifications || []).map((cert: Record<string, unknown>, idx: number) => ({
          id: cert.id as string || `cert-${idx + 1}`,
          name: cert.name as string || '',
          issuer: cert.issuer as string || '',
          date: cert.date as string | undefined,
        })),
        analysis: parsed.analysis ? {
          summary: parsed.analysis.summary as string || '',
          key_changes: (parsed.analysis.key_changes as string[]) || [],
          ats_compatibility: (parsed.analysis.ats_compatibility as number) || 0,
          missing_keywords_added: (parsed.analysis.missing_keywords_added as string[]) || [],
        } : undefined,
        sectionHeaders: parsed.sectionHeaders || undefined,
        localizedStrings: parsed.localizedStrings || undefined,
      };
      
      // Generate legacy text format for backward compatibility
      const legacyContent = this.cvDataToText(cvData, isGerman);
      
      return {
        cvData,
        legacyCV: {
          content: fixTypos(legacyContent),
          changes: [],
        },
        tokens,
      };
    } catch (error) {
      console.error('[UnifiedAgent] Failed to parse structured CV JSON:', error);
      
      // Fallback: return empty structure with original applicant data
      const fallbackData: NonNullable<MasterContext['optimizedCVData']> = {
        personal: {
          fullName: applicant?.name || 'Unknown',
          email: applicant?.email || '',
          phone: applicant?.phone,
          currentTitle: applicant?.headline,
          address: applicant?.address,
        },
        summary: '',
        experience: [],
        education: [],
        skills: [],
        languages: [],
        certifications: [],
      };
      
      return {
        cvData: fallbackData,
        legacyCV: {
          content: rawCV,
          changes: [],
        },
        tokens,
      };
    }
  },

  /**
   * Convert CVData to plain text format (for backward compatibility)
   */
  cvDataToText(cvData: NonNullable<MasterContext['optimizedCVData']>, isGerman: boolean): string {
    const lines: string[] = [];
    
    // Personal info
    lines.push(cvData.personal.fullName);
    if (cvData.personal.currentTitle) lines.push(cvData.personal.currentTitle);
    const contactParts = [
      cvData.personal.email,
      cvData.personal.phone,
      cvData.personal.city,
      cvData.personal.linkedIn,
    ].filter(Boolean);
    if (contactParts.length) lines.push(contactParts.join(' | '));
    lines.push('');
    
    // Summary
    if (cvData.summary) {
      lines.push(isGerman ? 'PROFIL' : 'PROFESSIONAL SUMMARY');
      lines.push(cvData.summary);
      lines.push('');
    }
    
    // Skills
    if (cvData.skills.length) {
      lines.push(isGerman ? 'FÄHIGKEITEN' : 'CORE COMPETENCIES');
      for (const skill of cvData.skills) {
        if (skill.category) {
          lines.push(`${skill.category}: ${skill.items.join(', ')}`);
        } else {
          lines.push(skill.items.join(', '));
        }
      }
      lines.push('');
    }
    
    // Experience
    if (cvData.experience.length) {
      lines.push(isGerman ? 'BERUFSERFAHRUNG' : 'PROFESSIONAL EXPERIENCE');
      for (const exp of cvData.experience) {
        const datePart = exp.current 
          ? `${exp.startDate} – ${isGerman ? 'Gegenwart' : 'Present'}`
          : `${exp.startDate} – ${exp.endDate || ''}`;
        lines.push(`${exp.position} | ${exp.company} | ${datePart}`);
        if (exp.location) lines.push(exp.location);
        for (const bullet of exp.bullets) {
          lines.push(`• ${bullet}`);
        }
        lines.push('');
      }
    }
    
    // Education
    if (cvData.education.length) {
      lines.push(isGerman ? 'AUSBILDUNG' : 'EDUCATION');
      for (const edu of cvData.education) {
        lines.push(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`);
        lines.push(`${edu.institution}${edu.endDate ? ` | ${edu.endDate}` : ''}`);
        lines.push('');
      }
    }
    
    // Languages
    if (cvData.languages.length) {
      lines.push(isGerman ? 'SPRACHEN' : 'LANGUAGES');
      for (const lang of cvData.languages) {
        lines.push(`${lang.language}: ${lang.proficiency}`);
      }
      lines.push('');
    }
    
    // Certifications
    if (cvData.certifications.length) {
      lines.push(isGerman ? 'ZERTIFIKATE' : 'CERTIFICATIONS');
      for (const cert of cvData.certifications) {
        lines.push(`${cert.name} – ${cert.issuer}${cert.date ? ` | ${cert.date}` : ''}`);
      }
    }

    // Additional Info (driver's license, etc.)
    if (cvData.personal.driverLicense) {
      lines.push('');
      lines.push(isGerman ? 'WEITERE INFORMATIONEN' : 'ADDITIONAL INFORMATION');
      lines.push(isGerman ? `Führerschein: ${cvData.personal.driverLicense}` : `Driver's License: ${cvData.personal.driverLicense}`);
    }
    
    return lines.join('\n');
  },

  /**
   * Generate cover letter using Problem-Solution format
   */
  async generateCoverLetter(context: MasterContext): Promise<WithTokens<string>> {
    const { applicant, job, match, rawCV, masterCV } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[UnifiedAgent] Generating cover letter in language:', outputLang);
    
    // Get today's date
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // ---- PROMPT CACHING: Static cover letter rules into cacheable system blocks ----
    // The anti-hallucination rules, writing style, prohibitions, and structure template
    // are identical across every cover letter call. Combined ~1,500+ tokens.
    const coverLetterSystemBlocks = [
      {
        type: 'text' as const,
        text: `You are an expert cover letter writer specializing in the US and UK job markets.

<writing_quality>
Write with exceptional quality. The cover letter must sound authentically human — warm, confident, and specific. Use natural sentence flow with varied rhythm. Avoid formulaic structures that signal AI generation. Every sentence should earn its place by either demonstrating value or building genuine connection with the reader.

The opening line must immediately hook the reader with a specific, impressive achievement or insight — never a generic statement. The voice should feel like a real person who is genuinely excited about this specific opportunity, not a template applied to any job.

Write as if this is the ONE application the candidate is sending today and they've spent 30 minutes crafting it by hand.
</writing_quality>

<anti_hallucination_rules>
WHY THIS MATTERS: Cover letters are read by hiring managers who will verify claims in interviews. A single fabricated skill or inflated qualification destroys the candidate's credibility. These rules protect every user regardless of their industry, language, or experience level.

RULE 1 — SOURCE VERIFICATION:
Only reference tools, platforms, technologies, and experiences that are explicitly stated in EITHER the Primary CV or the Master CV. When the job description requires a skill the candidate lacks, describe genuinely related transferable experience from the source documents using broader terminology (e.g., "platform management experience" instead of claiming a specific platform not in the CV).

RULE 2 — METRIC ACCURACY:
Use only exact numbers and metrics that appear in the source CVs. Do not invent percentages, counts, or growth figures. If a number is not in the source documents, do not include it.

RULE 3 — INDUSTRY ACCURACY:
Only claim experience in industries and product categories documented in the source CVs. Use broader accurate descriptions when the candidate's specific experience differs from the target industry.

RULE 4 — LANGUAGE PROFICIENCY:
Reproduce language levels exactly as stated in the source CVs. Do not upgrade proficiency levels to match job requirements. For the German market, follow strict CEFR conventions:
- Muttersprache = Native
- Verhandlungssicher = C1-C2 only (business-fluent, able to negotiate)
- Fließend = B2-C1
- Gute Kenntnisse = B1-B2
A B2 certificate is B2 — never label it as verhandlungssicher. Only use verhandlungssicher if the source CV documents C1 or higher.

RULE 5 — VERIFICATION CHECK:
Before writing any claim, verify: "Does this exact fact appear in the provided source documents?" If uncertain, omit it.
</anti_hallucination_rules>

COMPETITIVE ADVANTAGE — LANGUAGE SKILLS:
If the job description mentions a language as "advantage", "preferred", "plus", or "beneficial", AND the applicant has that language at B2 level or higher (documented in their CV), the cover letter SHOULD mention this language advantage explicitly. This is a competitive differentiator worth highlighting, e.g., "My German language skills (B2) align well with your preference for candidates with German proficiency."

COVER LETTER SKILL ACCURACY (HIGHEST PRIORITY):

The cover letter must NEVER claim experience with skills, tools, or technologies not documented in the Primary CV or Master CV. This overrides all other instructions.

FORBIDDEN: "I've executed A/B testing" (if not in Master CV)
FORBIDDEN: "Proficient in Python" (if not in Master CV)
FORBIDDEN: "Experience with [tool]" (if not in Master CV)

Sell what the applicant HAS. Never fabricate what they DON'T have.
If the JD requires a skill the applicant lacks, emphasize transferable skills and learning ability instead.

WRITING STYLE:
- Write like a confident professional, not a job applicant begging for consideration
- Use active voice and strong verbs
- Be specific and concrete - but ONLY with facts from the Primary CV and Master CV
- Sound human - slightly conversational, not robotic

=== WRITING TONE — MARKET-SPECIFIC RULES ===

PRIMARY MARKET (US/UK/CANADA — English JDs):
- Confident but not arrogant. "I bring X" not "I believe I could possibly contribute X"
- Direct and concise. American/British recruiters value brevity
- Achievement-led. Open with your strongest quantified result
- No filler phrases: "I am writing to express my interest" — BANNED
- No excessive formality: "I would be honored" — BANNED
- No AI-isms: "leverage", "synergy", "passionate about", "excited to" — BANNED
- Natural vocabulary: Write like a confident professional, not a corporate template
- Problem-Solution format: What challenge did you face → What did you do → What was the result

SECONDARY MARKET (EU/GERMAN — German JDs):
- More formal than US/UK — "Sehr geehrte Damen und Herren" is appropriate
- Still achievement-led — German recruiters also value quantified results
- Use professional German business vocabulary — avoid colloquialisms
- Include "Bewerbungsunterlagen" (application documents) references
- Address company-specific details from the Stellenanzeige (job posting)
- Structure: Opening with achievement → Skills match → Company connection → Closing with availability
- Maintain the Sie-form throughout (formal address)

LANGUAGE DETECTION:
- Job description in English → Write all documents in English with US/UK tone
- Job description in German → Write all documents in German with formal business tone
- Job description in other EU language → Default to English unless user specifies otherwise

=== 2026 COVER LETTER STANDARDS ===

1. BREVITY (CRITICAL): Maximum 250 words in the body (excluding header/signature).
   - Each paragraph: 2-3 sentences MAX
   - Total: 3 paragraphs only (opening hook, value, close)
   - 66% of recruiters prefer half a page or less - respect their time

2. COMPANY CHALLENGE DETECTION: Mine the job description for pain points.
   - Look for verbs: "improve", "develop", "build", "scale", "optimize", "transform", "grow", "lead"
   - These reveal problems the company is trying to solve
   - Reference the inferred challenge in your opening paragraph
   - Example: JD says "scale our e-commerce operations" → opening addresses scaling challenges

3. KEYWORD MIRRORING: Include 3-5 EXACT phrases from the job description in the cover letter body.
   - This helps ATS matching AND shows the recruiter you read the posting
   - Integrate naturally, never stuff keywords awkwardly
   - Example: JD says "cross-functional collaboration" → use that exact phrase

4. TONE MATCHING:
   - JD uses "you'll", "we're", casual language → write conversationally
   - JD uses "the ideal candidate", "responsibilities include" → write formally
   - Match the energy and formality level of the job posting

5. DUAL-CV SOURCING (CRITICAL):
   - Draw achievements and metrics from BOTH the Primary CV AND Master CV
   - The Master CV is a comprehensive inventory - mine it for the BEST metrics
   - If the Primary CV lacks a relevant achievement but the Master CV has one, USE IT
   - Every claim must exist in at least one of the two CV sources

STRUCTURE (Problem-Solution Format):
1. Opening hook (1-2 sentences): Lead with a REAL achievement from the CV + reference a company challenge inferred from the JD
2. Value paragraph (2-3 sentences): Connect ACTUAL experience to their needs with REAL metrics from EITHER CV
3. Confident close (1-2 sentences): Clear, specific call to action
4. Signature: "Best regards," followed by applicant's full name

=== LOCATION INTELLIGENCE ===

Before generating the cover letter, check:
1. Applicant's current location (from CV/Master CV)
2. Job location (from JD)
3. Master CV relocation preferences - read the EXACT text

RELOCATION RULES:
- If Master CV specifies relocation to specific cities/regions → ONLY mention relocation to those places
- Example: "Ready to relocate to major German cities" → can mention Munich, Berlin, Hamburg - CANNOT mention New York, Toronto, London
- If job is fully remote → Do NOT mention relocation
- If Master CV has no relocation statement → Do NOT mention relocation

INTERNATIONAL RELOCATION RULE:
If the job is on-site or hybrid AND in a different country from the applicant's current location, AND the Master CV contains a relocation statement that covers the job's country or region, the cover letter MUST include a brief, confident statement about relocation readiness. Do not ignore the geographic gap — address it proactively.

Examples:
- US role, applicant in Germany, Master CV says "open to international relocation": "I'm currently based in Germany and ready to relocate to [city] to join your team."
- UK role, applicant in Germany, Master CV covers UK: "I'm prepared to relocate to the UK and can start within [timeframe]."

Do NOT mention relocation for:
- Fully remote roles
- Roles in the same country as the applicant
- Roles in countries NOT covered by the Master CV relocation statement

NEVER fabricate relocation willingness beyond what the Master CV explicitly states.

=== COMPANY CONTEXT EXTRACTION ===
Since web search is not available, extract ALL company context from the job description:
- Company name
- Industry/sector
- Products or services mentioned
- Company values or culture signals
- Team size or structure hints
- Any unique selling points mentioned

USE this extracted context in the cover letter:
- Reference at least ONE specific company detail in the opening or closing paragraph
- Connect the applicant's experience to the company's specific industry/products
- Do NOT use generic phrases like "your company" or "your team" without specifics

The job description is the richest source of company information available. Use it fully.

ABSOLUTE PROHIBITIONS:
- "I am writing to apply for..." or "I am excited to apply for..."
- "I believe I would be a great fit..."
- "Thank you for considering my application..."
- "To Whom It May Concern"
- "I am confident that..."
- "I would be a valuable asset..."
- "References available upon request"
- "I look forward to hearing from you"
- ANY claim about tools, metrics, or experience not in EITHER the Primary CV or Master CV
- NEVER invent a street address for the company - use "[Company Address — verify before sending]" instead
- Paragraphs longer than 3 sentences
- Generic filler phrases that add no value

<tone_calibration>
WARMTH: Write with genuine warmth and personality. Be human, not robotic.
CONFIDENCE: Project quiet confidence — state achievements factually without begging or over-selling.
SPECIFICITY: Every claim must reference a specific achievement, number, or experience from the CV data.
NATURAL FLOW: Vary sentence length. Mix short punchy sentences with longer descriptive ones. Read it aloud in your head — if it sounds mechanical, rewrite it.
</tone_calibration>

PUNCTUATION RULE — NO EM-DASHES:

NEVER use em-dashes (—) or en-dashes (–) in the cover letter. They are a strong AI writing tell.

Replace with natural punctuation:
- Parenthetical aside → use commas or parentheses
  WRONG: "meiner Plattformen — Kursfind AI und Karko AI — habe ich"
  RIGHT: "meiner Plattformen (Kursfind AI und Karko AI) habe ich"

- Explanatory clause → use a colon or period
  WRONG: "Listing-Optimierung — was mir tiefe Kenntnisse vermittelt hat"
  RIGHT: "Listing-Optimierung, was mir tiefe Kenntnisse vermittelt hat"

- Dramatic pause → use a period and start a new sentence
  WRONG: "I built two AI products — and both are in production"
  RIGHT: "I built two AI products. Both are in production."

This applies to BOTH English and German cover letters. Zero em-dashes in the final output.

OUTPUT FORMAT:
- Plain text only
- No markdown
- No bullet points
- Professional letter format
- MUST include signature block at the end

=== COVER LETTER STRUCTURE (Problem-Solution Format) ===

[Opening - hooks with achievement from CV, shows understanding of company challenge]
"After [INSERT EXACT METRIC FROM PRIMARY CV OR MASTER CV], I've developed [SKILL RELEVANT TO JOB]. When I saw your [JOB TITLE] role, I recognized the exact challenge I've been solving: [INFER CHALLENGE FROM JD VERBS]."

[Value paragraph - specific experience matched to their needs using ONLY CV facts]
"In my role as [EXACT TITLE FROM CV], I [EXACT ACHIEVEMENT WITH EXACT METRIC FROM EITHER CV]. My experience with [TOOLS ACTUALLY LISTED IN EITHER CV] positions me to [BENEFIT TO COMPANY]."

[Confident close - specific and action-oriented]
"I'd welcome the opportunity to discuss how my [SKILL FROM CV] experience can [BENEFIT]. I'm available for a call this week or next."

INSTRUCTIONS:
1. Use the Problem-Solution format shown in the structure
2. Include at least TWO specific metrics from the candidate's background (from EITHER Primary CV or Master CV)
3. Keep UNDER 250 words in the body (excluding header and signature) - brevity is critical
4. CRITICAL: Every claim, skill, tool, platform, and metric MUST exist in EITHER the Primary CV or Master CV
5. If the job requires skills not in either CV, show TRANSFERABLE skills instead - NEVER claim missing skills
6. Include 3-5 exact keyword phrases from the job description
7. NEVER omit the signature. A cover letter without a signature is incomplete.`,
        cache_control: { type: 'ephemeral' as const },
      },
    ];

    const response = await callModel({
      task: 'write_cover_letter',
      prompt: `Write a cover letter using the Problem-Solution format.

=== APPLICANT INFO ===
Name: ${applicant?.name || 'Applicant'}
Email: ${applicant?.email || ''}
Phone: ${applicant?.phone || ''}
Address: ${applicant?.address || ''}
Date: ${today}

=== TARGET POSITION ===
Job Title: ${job?.title || 'Position'}
Company: ${job?.companyName || 'Company'}
Location: ${job?.location || 'Not specified'}
Key Requirements: ${job?.requiredSkills?.join(', ') || 'Not specified'}
Nice-to-Have: ${job?.niceToHaveSkills?.join(', ') || 'Not specified'}

=== PRIMARY CV (main resume) ===
${rawCV}
${masterCV ? `

=== MASTER CV (comprehensive skills & experience inventory - mine this for best metrics) ===
${masterCV}` : ''}

${match && match.missingSkills.length > 0 ? `=== VERIFIED SKILL CONSTRAINT ===

The following skills are verified as MISSING from the applicant's background.
Do NOT claim experience with any of these in the cover letter:

SKILLS YOU MUST NOT CLAIM:
${match.missingSkills.join(', ')}

Instead of claiming missing skills, emphasize:
- Transferable skills from the applicant's actual background
- Builder mindset and learning ability
- Relevant projects that demonstrate adjacent competency
- Concrete achievements with real metrics

EXAMPLE (for a role where Python is MISSING):
WRONG: "I've built applications using Python and LangChain"
RIGHT: "I've built two production AI applications using Node.js, Next.js, and LLM APIs — demonstrating the engineering fundamentals that transfer directly to Python-based AI development"
` : ''}
=== RELOCATION CONSTRAINT (BINDING) ===
Job location: ${job?.location || 'Not specified'}
${masterCV && /relocat/i.test(masterCV) ? `Master CV relocation statement found. The applicant's relocation preferences are ONLY what is written in the Master CV above. If the job location (${job?.location || 'unknown'}) is NOT explicitly covered by the Master CV's relocation statement, do NOT mention relocation willingness at all.` : `No relocation statement found in Master CV. Do NOT mention relocation willingness in the cover letter.`}
NEVER fabricate relocation willingness to any city or country not explicitly listed in the Master CV.

=== FULL JOB DESCRIPTION (use for keyword mirroring and challenge detection) ===
${context.jobDescription}

=== REQUIRED HEADER FORMAT ===

The cover letter MUST start with this exact header structure:

${applicant?.name || 'Applicant Name'}
${applicant?.address || 'Address'}
${applicant?.email || 'Email'}
${applicant?.phone || 'Phone'}

${today}

Hiring Manager
${job?.companyName || 'Company'}
[Company Address — verify before sending]

IMPORTANT: Under the company name, write exactly "[Company Address — verify before sending]" - do NOT invent or guess a street address.

=== LANGUAGE INSTRUCTION ===
${isGerman ? `CRITICAL: Write the ENTIRE cover letter in GERMAN.
- Use formal German "Sie" form
- German business letter format
- Closing: "Mit freundlichen Grüßen," instead of "Best regards,"
- German date format: "3. Februar 2026"
- Keep name and contact details as-is` : 'Write the cover letter in English.'}

REQUIRED SIGNATURE FORMAT:
The cover letter MUST end with exactly this format:

[Your closing sentence about availability/next steps]

Best regards,

${applicant?.name || 'Applicant Name'}

Write the complete cover letter now (including signature):`,
      systemBlocks: coverLetterSystemBlocks,
    });

    const tokens: TokenUsage = {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
    };

    let coverLetter = response.content || '';
    coverLetter = fixTypos(coverLetter);
    
    return { result: coverLetter, tokens };
  },

  /**
   * Generate application email
   * Returns JSON with separate subject and body fields
   */
  async generateApplicationEmail(context: MasterContext): Promise<WithTokens<{ subject: string; body: string }>> {
    const { applicant, job, match, rawCV, masterCV } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[UnifiedAgent] Generating email in language:', outputLang);

    // Build JD-relevant context for the email
    const matchingSkillsList = match?.matchingSkills?.slice(0, 8).join(', ') || 'Not specified';
    const topResponsibilities = job?.responsibilities?.slice(0, 3).join('; ') || 'Not specified';
    const topRequirements = job?.requiredSkills?.slice(0, 5).join(', ') || 'Not specified';

    const response = await callModel({
      task: 'write_email',
      prompt: `Write a brief application email that highlights the candidate's RELEVANT qualifications for this specific role.

APPLICANT: ${applicant?.name || 'Applicant'}
JOB TITLE: ${job?.title || 'Position'}
COMPANY: ${job?.companyName || 'Company'}

=== JOB-RELEVANT CONTEXT (use this to tailor the email) ===
TOP JD REQUIREMENTS: ${topRequirements}
KEY RESPONSIBILITIES: ${topResponsibilities}
CANDIDATE'S MATCHING SKILLS FOR THIS ROLE: ${matchingSkillsList}
FIT SCORE (INTERNAL CONTEXT ONLY — do NOT include this in the email): ${match?.score ?? 0}%

=== PRIMARY CV (main resume — ONLY source for claims) ===
${rawCV || 'No CV provided'}
${masterCV ? `
=== MASTER CV (comprehensive experience inventory — ONLY other source for claims) ===
${masterCV}` : ''}
${context.verifiedMetrics && context.verifiedMetrics.length > 0 ? `
=== VERIFIED METRICS (use ONLY these numbers — do not invent any others) ===
${context.verifiedMetrics.join('\n')}` : ''}
${match && match.missingSkills.length > 0 ? `
=== VERIFIED SKILL CONSTRAINT (BINDING — highest priority) ===

The following skills are verified as MISSING from the applicant's background.
Do NOT claim experience with any of these in the email:

SKILLS YOU MUST NOT CLAIM:
${match.missingSkills.join(', ')}

Instead of claiming missing skills, emphasize:
- Transferable skills from the applicant's actual background
- Relevant achievements with real metrics from either CV
- Adjacent competencies that demonstrate capability` : ''}

INSTRUCTIONS:
1. Subject line: MAXIMUM 60 characters total. Format below.
2. Body: Maximum 4 sentences (excluding greeting and signature)
3. Must include one specific number/achievement from EITHER the Primary CV or Master CV
4. MUST include an attachment reference sentence (see rules below)
5. End with specific availability, not "I look forward to hearing from you"
6. Start with "Hello," as the greeting (do NOT use placeholder like "[Name]")
7. Include one exact keyword from the job description in the body
8. NEVER mention the fit score, match percentage, or any numeric score in the email — this is internal data for context only

EMAIL SUBJECT LINE RULES:
- English: "Application: [Job Title] — [Your Name]" (max 60 chars)
- German: "Bewerbung als [Job Title] — [Your Name]" (max 60 chars)
- NEVER add extra descriptors, skill keywords, or metrics in the subject
- The subject line is for identification, not selling

SUBJECT LINE LENGTH — STRICT ENFORCEMENT:
Maximum: 60 characters. No exceptions.
If job title is too long:
1. Use only the PRIMARY title (before any "/" or "—" separator in the JD title)
2. Drop secondary titles or specializations
3. "Junior Webentwickler / E-Commerce" → use "Junior Webentwickler" only
After composing the subject line, COUNT characters. If over 60, shorten the job title portion.

ATTACHMENT REFERENCE (REQUIRED — never skip):
- English: Include "Please find my CV and cover letter attached." or "I've attached my CV and cover letter for your review."
- German: Include "Anbei finden Sie meinen Lebenslauf und mein Anschreiben." or "Meine vollständigen Bewerbungsunterlagen finden Sie im Anhang."
- Place the attachment reference BEFORE the availability/closing sentence

=== LANGUAGE INSTRUCTION ===
${isGerman ? `CRITICAL: Write the ENTIRE email in GERMAN.
- Greeting: "Guten Tag," or "Sehr geehrte Damen und Herren,"
- Closing: "Mit freundlichen Grüßen,"
- Subject line in German format: "Bewerbung als [Job Title] - [Name]"
- Professional German business email style` : 'Write the email in English.'}

PUNCTUATION: Never use em-dashes (—) or en-dashes (–). Use commas, periods, colons, or parentheses instead.

EMAIL SIGNATURE REQUIREMENT:
The email MUST end with a professional signature:

Best regards,
${applicant?.name || 'Applicant Name'}

NEVER send an email without a signature. The signature must be on separate lines.

Return ONLY valid JSON: {"subject": "...", "body": "..."}`,
      systemPrompt: `You are an expert at professional email communication for job applications.

<anti_hallucination_rules>
WHY THIS MATTERS: Application emails are often the first impression. A single fabricated skill or inflated claim destroys credibility when verified in interviews. These rules protect the candidate.

RULE 1 — SOURCE VERIFICATION:
Only reference tools, platforms, technologies, and experiences that are explicitly stated in EITHER the Primary CV or the Master CV. When the job description requires a skill the candidate lacks, describe genuinely related transferable experience from the source documents using broader terminology (e.g., "marketplace operations experience" instead of claiming a specific platform not in the CV).

RULE 2 — METRIC ACCURACY:
Use only exact numbers and metrics that appear in the source CVs. Do not invent percentages, revenue figures, counts, or growth numbers. If a number is not in the source documents, do not include it.

RULE 3 — INDUSTRY & COMPANY ACCURACY:
Only claim experience at companies and in industries documented in the source CVs. Do NOT attribute experience at one company to a different company. Do NOT claim the candidate worked at or managed operations for a company unless that exact company name appears in their CV experience section.

RULE 4 — LANGUAGE PROFICIENCY:
Reproduce language levels exactly as stated in the source CVs. Do not upgrade proficiency levels to match job requirements. B2 stays B2 — never label it as verhandlungssicher.

RULE 5 — VERIFICATION CHECK:
Before writing any claim, verify: "Does this exact fact appear in the provided source documents?" If uncertain, omit it.
</anti_hallucination_rules>

EMAIL SKILL ACCURACY (HIGHEST PRIORITY):
The email must NEVER claim experience with skills, tools, or technologies not documented in the Primary CV or Master CV. This overrides all other instructions. Sell what the applicant HAS. Never fabricate what they DON'T have.

GREETING RULE:
- Since we don't know the hiring manager's name, ALWAYS use: "Hello," or "Hi there,"
- NEVER output "[Name]" or "Hi [Name]," as a literal placeholder in the final email
- NEVER use "Dear Sir/Madam" or "To Whom It May Concern"

STYLE: Brief, direct, and genuinely warm. The email should feel like it was written by a real person in 2 minutes — not generated by AI. Use natural phrasing. One strong opening hook, one clear value statement, one professional close. The tone should make the recipient want to open the attached CV immediately.

JOB-RELEVANCE PRIORITY (CRITICAL):
- The email MUST connect the candidate's experience to THIS SPECIFIC JOB's requirements
- Lead with a metric/achievement that relates to the JD's top requirements or responsibilities
- Reference at least one MATCHING SKILL from the provided list in the body
- Do NOT write a generic "I have X years of experience" email — tie every claim to a JD requirement
- The reader should immediately see WHY this candidate fits THIS role

DUAL-CV SOURCING:
- You have TWO sources: Primary CV and Master CV
- Use the MOST impressive metric from EITHER source that is RELEVANT to the JD
- The Master CV is a comprehensive inventory - mine it for the best JD-relevant achievement
- Every claim must exist in at least one CV source

EMAIL SUBJECT LINE FORMAT (STRICT):
- English: "Application: [Job Title] — [Your Name]" (max 60 chars total)
- German: "Bewerbung als [Job Title] — [Your Name]" (max 60 chars total)
- NEVER add extra descriptors, skill keywords, or metrics in the subject

ATTACHMENT REFERENCE (MANDATORY):
- English: "Please find my CV and cover letter attached." or similar
- German: "Anbei finden Sie meinen Lebenslauf und mein Anschreiben." or similar
- Place BEFORE the closing/availability sentence
- NEVER skip the attachment reference

PROHIBITIONS:
- "I am writing to express my interest..."
- "I hope this email finds you well"
- "To Whom It May Concern"
- "I look forward to hearing from you"
- More than 4 sentences in the body (excluding greeting/signature)
- "[Name]" or any bracketed placeholder in the output
- Claiming skills not in either CV source
- Extra descriptors or keywords in subject line
- Mentioning fit score, match percentage, or any internal assessment score in the email

STRUCTURE:
Subject: "Application: [Job Title] — [Your Name]" (max 60 chars)
Body: Greeting + One sentence hook with metric + one sentence value + attachment reference + availability/call to action + Signature

SIGNATURE REQUIREMENT:
- EVERY email MUST end with a signature
- Format: "Best regards,\\n[Applicant Name]"
- The signature must be on separate lines from the body text
- NEVER omit the signature

Return ONLY valid JSON: {"subject": "...", "body": "..."}`,
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
      
      const parsed = JSON.parse(jsonContent);
      
      // Clean up any placeholder names
      let cleanBody = (parsed.body || response.content)
        .replace(/Hi \[Name\],?/gi, 'Hello,')
        .replace(/Dear \[Name\],?/gi, 'Dear Hiring Team,')
        .replace(/\[Name\]/g, 'Hiring Manager');
      
      cleanBody = fixTypos(cleanBody);
      const cleanSubject = fixTypos(parsed.subject || `Application for ${job?.title || 'Position'} at ${job?.companyName || 'Company'}`);
      
      return {
        result: {
          subject: cleanSubject,
          body: cleanBody,
        },
        tokens,
      };
    } catch (error) {
      console.error('[UnifiedAgent] Failed to parse email JSON:', error);
      
      const lines = response.content.split('\n');
      let subject = `Application for ${job?.title || 'Position'} at ${job?.companyName || 'Company'}`;
      let body = response.content;
      
      if (lines[0]?.toLowerCase().startsWith('subject:')) {
        subject = lines[0].replace(/^subject:\s*/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      }
      
      return { 
        result: {
          subject: fixTypos(subject), 
          body: fixTypos(body),
        },
        tokens,
      };
    }
  },

  /**
   * Generate follow-up email to send 5-7 days after the primary application email
   * Uses a DIFFERENT achievement than the primary email for the value hook
   */
  async generateFollowUpEmail(context: MasterContext): Promise<WithTokens<{ subject: string; body: string; recommendedDelay: number }>> {
    const { applicant, job, match, applicationEmail } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    const market = isGerman ? 'German' : 'US/UK';
    const recommendedDelay = isGerman ? 7 : 5;
    
    console.log('[UnifiedAgent] Generating follow-up email in language:', outputLang);

    // Get a DIFFERENT achievement than what the primary email used
    // Primary email uses matchingSkills[0], so we use [1] or [2]
    const matchingSkills = match?.matchingSkills || [];
    const topAchievement = matchingSkills.length > 1 
      ? matchingSkills[1] 
      : matchingSkills.length > 0 
        ? matchingSkills[0] 
        : 'relevant professional experience';

    // Build company context from JD
    const companyContext = [
      job?.companyName ? `Company: ${job.companyName}` : '',
      job?.responsibilities?.slice(0, 3).join('; ') || '',
      job?.requiredSkills?.slice(0, 5).join(', ') || '',
    ].filter(Boolean).join('\n');

    const response = await callModel({
      task: 'write_follow_up_email',
      prompt: `Generate a follow-up email for a job application.

<context>
<primary_email_subject>${applicationEmail?.subject || ''}</primary_email_subject>
<primary_email_body>${applicationEmail?.body || ''}</primary_email_body>
<job_title>${job?.title || 'Position'}</job_title>
<company_name>${job?.companyName || 'Company'}</company_name>
<company_context>${companyContext}</company_context>
<applicant_name>${applicant?.name || 'Applicant'}</applicant_name>
<key_achievement>${topAchievement}</key_achievement>
<detected_language>${outputLang}</detected_language>
<market>${market}</market>
</context>

<instructions>
Generate a follow-up email with subject line and body.

SUBJECT LINE RULES:
- English format: "Following Up: [Role Title] Application — [Full Name]"
- German format: "Nachfrage: [Stellentitel] Bewerbung — [Full Name]"
- Must be 60 characters or fewer
- Must include the role title and applicant name

BODY RULES (4 elements, 60-80 words max):
1. Opening: Brief reference to original application with approximate timeframe ("last week")
2. Reaffirm interest: One sentence referencing something SPECIFIC about the company from the JD, a product, mission, growth metric, or team detail. NOT generic praise.
3. New value hook: Connect ONE specific achievement or skill from the applicant's profile to a SPECIFIC company need from the JD. This must be DIFFERENT from what was highlighted in the primary email.
4. Soft CTA: "I would welcome the chance to discuss..." or equivalent. One sentence only.

TONE RULES:
- Match the detected language (English or German)
- US market: Direct, confident
- UK market: Polite, measured
- German market: Formal Sie-form throughout, "Sehr geehrte Damen und Herren" or addressed to specific person if known
- Professional but warm, not stiff, not casual
- Confident, not desperate
- NO em-dashes anywhere in the text
- NO "just checking in", "I know you're busy", "I haven't heard back"
- NO re-attachment references, they already have the documents

ANTI-HALLUCINATION RULES (BINDING):

RULE 1 — SOURCE VERIFICATION:
The key_achievement, company_context, and primary_email are your ONLY sources of factual claims. Do NOT reference tools, platforms, technologies, or experiences not present in these sources.

RULE 2 — METRIC ACCURACY:
Do NOT invent percentages, revenue figures, counts, or growth numbers. If a specific number is not in the provided sources, do not include one.

RULE 3 — COMPANY ACCURACY:
Only reference company details (products, services, mission, culture) that appear in the company_context. Do NOT fabricate company facts or attribute the candidate's experience at one company to a different company.

RULE 4 — SKILL CONSTRAINT:
Do NOT claim the candidate has skills or experience not mentioned in the key_achievement or primary_email. The follow-up must highlight a DIFFERENT strength but it must still be a REAL one from the sources.

RULE 5 — VERIFICATION CHECK:
Before writing any claim, verify: "Does this exact fact appear in the provided sources?" If uncertain, omit it. If company_context is sparse, keep the company reference general but accurate to the JD.

OUTPUT FORMAT:
Respond with ONLY valid JSON:
{
  "subject": "...",
  "body": "...",
  "recommendedDelay": ${recommendedDelay}
}

The body should include greeting, paragraphs, and sign-off.
Set recommendedDelay to ${recommendedDelay}.
</instructions>`,
      systemPrompt: `You are the follow-up email writer for Karko AI. You generate a brief, professional follow-up email that the applicant will send ${recommendedDelay} business days after their initial application.

CRITICAL RULES:
- The follow-up must highlight a DIFFERENT strength than the primary email
- Keep the body under 80 words (excluding greeting and sign-off)
- Be specific about the company (reference something from the JD)
- Sound human and confident, not desperate or generic
- NO em-dashes
- ${isGerman ? 'Write entirely in German with formal Sie-form. Closing: "Mit freundlichen Grüßen,"' : 'Write in English.'}

Return ONLY valid JSON. No explanation or preamble.`,
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
      
      const parsed = JSON.parse(jsonContent);
      
      let cleanBody = fixTypos(parsed.body || '');
      const cleanSubject = fixTypos(parsed.subject || `Following Up: ${job?.title || 'Position'} — ${applicant?.name || 'Applicant'}`);
      
      // Clean up any placeholder names
      cleanBody = cleanBody
        .replace(/Hi \[Name\],?/gi, 'Hello,')
        .replace(/Dear \[Name\],?/gi, 'Dear Hiring Team,')
        .replace(/\[Name\]/g, 'Hiring Manager');
      
      return {
        result: {
          subject: cleanSubject,
          body: cleanBody,
          recommendedDelay: parsed.recommendedDelay || recommendedDelay,
        },
        tokens,
      };
    } catch (error) {
      console.error('[UnifiedAgent] Failed to parse follow-up email JSON:', error);
      
      // Fallback: construct a basic follow-up
      const fallbackSubject = isGerman 
        ? `Nachfrage: ${job?.title || 'Position'} Bewerbung — ${applicant?.name || 'Bewerber'}`
        : `Following Up: ${job?.title || 'Position'} Application — ${applicant?.name || 'Applicant'}`;
      
      return {
        result: {
          subject: fixTypos(fallbackSubject),
          body: fixTypos(response.content),
          recommendedDelay,
        },
        tokens,
      };
    }
  },
};

// =====================================================
// CONVENIENCE FUNCTIONS
// =====================================================

/**
 * Main entry point - runs the unified agent workflow
 */
export async function runJobCopilot(
  input: UnifiedAgentInput,
  emit: AgentEventHandler
): Promise<AgentResult<OrchestrationResult>> {
  return unifiedWriterAgent.run(input, emit);
}

/**
 * Run fit analysis only (Phase 1 + assessment)
 */
export async function runFitAnalysis(
  input: UnifiedAgentInput,
  emit: AgentEventHandler
): Promise<AgentResult<OrchestrationResult>> {
  return unifiedWriterAgent.runFitAnalysis(input, emit);
}

/**
 * Run full generation with pre-built context (Phase 2 only)
 */
export async function runWithContext(
  context: MasterContext,
  emit: AgentEventHandler
): Promise<AgentResult<OrchestrationResult>> {
  return unifiedWriterAgent.runWithContext(context, emit);
}
