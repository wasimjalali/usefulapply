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

      // Step 1: Extract applicant profile from CV
      emit({ type: 'progress', percent: 10, message: 'Extracting applicant profile from CV...' });
      const applicantResult = await this.extractApplicantProfile(context.rawCV, context.masterCV);
      context.applicant = applicantResult.result;
      
      // Log warnings for missing critical fields
      if (!context.applicant?.name || context.applicant.name === 'Unknown') {
        console.warn('[KarkoAI] WARNING: Could not extract applicant name from CV');
      }
      if (!context.applicant?.email) {
        console.warn('[KarkoAI] WARNING: Could not extract applicant email from CV');
      }

      emit({ type: 'step_completed', step: { id: 'analysis', description: 'CV parsed successfully' }, tokens: applicantResult.tokens });

      // Step 2: Parse job description
      emit({ type: 'step_started', step: { id: 'matching', description: 'Karko AI: Matching skills and identifying gaps' } });
      emit({ type: 'progress', percent: 25, message: 'Parsing job description...' });
      const jobResult = await this.parseJobDescription(context.jobDescription);
      context.job = jobResult.result;

      // Step 3: Detect language
      context.detectedLanguage = this.detectLanguage(context.jobDescription);
      console.log('[KarkoAI] Detected language:', context.detectedLanguage);

      // Step 4: Compute skill match (AI-based, no RAG)
      emit({ type: 'progress', percent: 35, message: 'Analyzing skill match...' });
      context.match = await this.computeSkillMatch(context.applicant, context.job);

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

      // Step 7: Generate application email
      emit({ type: 'step_started', step: { id: 'email', description: 'Karko AI: Generating application email' } });
      emit({ type: 'progress', percent: 90, message: 'Composing application email...' });
      const emailResult = await this.generateApplicationEmail(context);
      context.applicationEmail = emailResult.result;
      emit({ type: 'step_completed', step: { id: 'email', description: 'Email ready' }, tokens: emailResult.tokens });
      
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
  detectLanguage(text: string): 'en' | 'de' {
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
    job: MasterContext['job']
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
1. CROSS-LANGUAGE MATCHING: Skills expressed in different languages that refer to the same concept or domain are matches. A skill in English and its equivalent in German (or any other language) should be matched if they describe the same competency area.
2. CONCEPTUAL MATCHING: Skills that are closely related within the same professional domain count as matches. A specific tool matches a broader category it belongs to, and vice versa.
3. EXPERIENCE-BASED MATCHING: If the candidate's work experience clearly demonstrates a competency even though it is not explicitly listed as a skill, count it as a match. Years of self-employment demonstrate independence; teaching experience demonstrates communication skills; managing suppliers demonstrates coordination skills.
4. LANGUAGE PROFICIENCY: Match language requirements honestly using CEFR standards. B2 does NOT match requirements for "verhandlungssicher" or "business-fluent" (which require C1-C2). C1+ or "Fluent" CAN match "verhandlungssicher." Native speakers match native-level requirements.
5. SOFT SKILLS: Match soft skills based on demonstrated experience in the candidate's work history, not just listed keywords.
6. PARTIAL MATCHES: If the candidate has genuinely related experience in the same domain, count it as a match.
7. HONESTY: Do not inflate. If there is genuinely no connection between a required skill and anything in the candidate's profile, mark it as missing.
</matching_rules>

=== CANDIDATE SKILLS ===
${applicantSkillsList.join(', ')}

=== CANDIDATE EXPERIENCE ===
${experienceContext}

=== JOB REQUIRED SKILLS ===
${requiredSkills.map((s, i) => `${i + 1}. ${s}`).join('\n')}

=== OUTPUT FORMAT (strict JSON) ===
Return ONLY this JSON:
{
  "matching": ["skill1", "skill2"],
  "missing": ["skill3", "skill4"],
  "score": 35
}

Where:
- "matching" = required skills the candidate HAS (exact name from the job requirements list)
- "missing" = required skills the candidate LACKS
- "score" = percentage (0-100) of required skills matched

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

      const applicantResult = await this.extractApplicantProfile(context.rawCV, context.masterCV);
      context.applicant = applicantResult.result;
      emit({ type: 'step_completed', step: { id: 'analysis', description: 'CV parsed successfully' }, tokens: applicantResult.tokens });

      // Step 2: Parse job description + skill match
      emit({ type: 'step_started', step: { id: 'matching', description: 'Karko AI: Matching skills and identifying gaps' } });
      emit({ type: 'progress', percent: 30, message: 'Parsing job description...' });
      const jobResult = await this.parseJobDescription(context.jobDescription);
      context.job = jobResult.result;

      context.detectedLanguage = this.detectLanguage(context.jobDescription);
      
      emit({ type: 'progress', percent: 50, message: 'Analyzing skill match...' });
      context.match = await this.computeSkillMatch(context.applicant, context.job);
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

      // Step 3: Generate application email
      emit({ type: 'step_started', step: { id: 'email', description: 'Karko AI: Generating application email' } });
      emit({ type: 'progress', percent: 80, message: 'Composing application email...' });
      const emailResult = await this.generateApplicationEmail(context);
      context.applicationEmail = emailResult.result;
      emit({ type: 'step_completed', step: { id: 'email', description: 'Email ready' }, tokens: emailResult.tokens });
      
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
      (match?.score ?? 0) >= 70 ? 'strong' :
      (match?.score ?? 0) >= 45 ? 'good' : 'weak';

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
You MUST output in this exact markdown structure. Do NOT deviate:

[One short sentence: verdict with job title, company, and fit level]

**Strengths:**
- [10 words max per bullet]
- [10 words max per bullet]

**Gaps:**
- [10 words max per bullet]
- [10 words max per bullet]

**Recommendation:** [One short sentence of strategic advice]
</output_format>

<strict_rules>
- HARD LIMIT: 100 words total. Count your words. If over 100, cut immediately.
- Address the candidate directly using "you" and "your"
- Reference actual skill names from the match data
- Each bullet: maximum 10 words. Cut ruthlessly.
- Exactly 2 strength bullets. Exactly 2 gap bullets. Exactly 1 recommendation sentence.
- Do NOT start with "Based on" or "Overall"
- Do NOT add explanations or qualifiers to bullets — be direct
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
5. BREVITY: This is critical. The total output MUST be under 100 words. Each bullet must be under 10 words. Cut ruthlessly — short and punchy beats thorough and long. Users scan this in 5 seconds.
</assessment_guidelines>`,
      maxTokens: 300,
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
  getOutputLanguage(context: MasterContext): 'en' | 'de' {
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

    const matchContext = match ? `
SKILL MATCH ANALYSIS:
Matching Skills: ${match.matchingSkills.join(', ')}
Missing Skills (from JD): ${match.missingSkills.join(', ')}
` : '';

    // ---- PROMPT CACHING: Static instructions go into cacheable system blocks ----
    // The CV optimization rules + JSON schema are ~3,000+ tokens of static content
    // that is identical across every call. By placing them in system blocks with
    // cache_control, Haiku 4.5 can cache this prefix (min 2,048 tokens for Haiku).
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

RULE 4 — SKILL INFERENCE (STRICT):
You may ONLY add skills to the CV that are:
1. Explicitly listed in the original CV or Master CV, OR
2. Directly demonstrated by a project or achievement described in the CV/Master CV
You may NOT add skills that are:
- Inferred from adjacent or similar skills (e.g., do NOT add "Google Analytics" just because the CV lists "SEO" and "Keyword Research")
- Common in the industry but not evidenced by the applicant
- Required by the job description but not present in the applicant's background
If a required skill is missing, flag it in the fit assessment as a GAP, not in the CV as a claimed skill.

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
   - **Most Recent/Relevant Role:** Exactly 4 high-impact bullets.
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

6. EDUCATION: Copy from Primary CV exactly
   - For non-German qualifications mapped to German equivalents: use the recognized equivalent name + grade, NO redundant descriptors
   - CORRECT: "Allgemeine Hochschulreife (Abitur-Äquivalent) | Note: 92,43%"
   - INCORRECT: "Allgemeine Hochschulreife (Abitur-Äquivalent) in Allgemeinbildung"
   - For US/UK market: "High School Diploma GPA: 92.43%"
   - Do NOT add "in [field]" if the degree name already implies the field (e.g., "Allgemeine Hochschulreife" already means general education)

7. LANGUAGES: Copy from Primary CV exactly (with proficiency levels)

8. CERTIFICATIONS: Select 4-5 most relevant, CLEAN any OCR artifacts from names

=== 🧠 "CHANGES" TAB LOGIC ===
You MUST populate the "analysis" object to explain your work to the user:
- summary: Explain your high-level strategy in 2 sentences
- key_changes: A list of 4-6 specific improvements made
- ats_compatibility: Your estimated ATS compatibility score (0-100)
- missing_keywords_added: List of keywords from the job description that you added to the CV

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
    "github": "string (optional)"
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
      "institution": "string",
      "degree": "string",
      "field": "string (optional)",
      "location": "string (optional)",
      "startDate": "string (optional)",
      "endDate": "string (optional)",
      "grade": "string (optional)",
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
  "analysis": {
    "summary": "2-sentence strategy summary",
    "key_changes": ["Change 1", "Change 2", "Change 3", "Change 4"],
    "ats_compatibility": 85,
    "missing_keywords_added": ["keyword1", "keyword2"]
  }
}

=== ATS OPTIMIZATION (2026 STANDARDS) ===
1. SECTION HEADERS: Use ONLY these standard ATS-recognized headers:
   - "Professional Summary" or "Summary" (or German equivalent)
   - "Professional Experience" or "Work Experience"
   - "Education"
   - "Skills" or "Core Competencies"
   - "Certifications"
   - "Languages"
   NEVER use creative headers like "What I Bring", "My Journey", or "Areas of Expertise"

2. KEYWORD MIRRORING: Use EXACT phrases from the job description, not synonyms.
   - JD says "project management" → write "project management" (NOT "managing projects")
   - JD says "data analysis" → write "data analysis" (NOT "analyzing data")
   - Include both acronyms AND full forms: "SEO (Search Engine Optimization)"
   - Place JD keywords in Skills section FIRST, then in bullet points

3. BULLET FORMAT (CAR Method - Challenge → Action → Result):
   - "Reduced customer churn by 15% by implementing automated retention workflows"
   - Every bullet MUST start with a strong action verb
   - Every bullet SHOULD include at least one metric/number if available in the CV
   - No action verb used more than twice across ALL bullets in the entire CV
   - HIGH-IMPACT VERBS: Achieved, Accelerated, Delivered, Generated, Implemented, Launched, Optimized, Reduced, Scaled, Streamlined, Transformed

4. SKILLS SECTION: List JD keywords FIRST, then additional relevant skills
   - Match EXACT terminology from job posting
   - Include tool versions where relevant (e.g., "Python 3.x", "React 18")
   - Both hard skills AND relevant soft skills from JD

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
1. Driver's License — include in personal info section (e.g., in the address line or a footer note)
2. Languages — always include ALL languages with their exact proficiency levels
3. Work Authorization status — if mentioned in Master CV or Primary CV
4. Location — always include current city
These fields cost zero space in terms of relevance but can be disqualifying if missing.

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
${matchContext}

=== PRIMARY CV (source of truth for personal info) ===
${rawCV}

${masterCV ? `=== MASTER CV (additional experiences/skills to draw from) ===
${masterCV}` : ''}

=== LANGUAGE ===
${isGerman ? `Generate ALL content in GERMAN. Use German date format (Januar 2025 – Gegenwart).` : 'Generate content in English.'}

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
    
    return lines.join('\n');
  },

  /**
   * Generate cover letter using Problem-Solution format
   */
  async generateCoverLetter(context: MasterContext): Promise<WithTokens<string>> {
    const { applicant, job, rawCV, masterCV } = context;
    
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
1. Where is the applicant located? (from CV/Master CV)
2. Where is the job located? (from job description)
3. Is relocation or hybrid/remote mentioned? (from job description)
4. Does the Master CV mention relocation readiness?

IF the applicant and job are in different cities AND the job requires on-site presence:
- Check if Master CV mentions relocation willingness
- If YES: Add one sentence in the closing paragraph:
  English: "I am open to relocating to [city] and available to discuss logistics."
  German: "Ich bin bereit, nach [Stadt] umzuziehen und stehe für ein Gespräch zur Verfügung."
- If NO: Do not fabricate relocation willingness. Instead, omit any location reference and let the user decide.

IF the job is fully remote or doesn't mention location requirements:
- Do not mention location or relocation

NEVER ignore a location mismatch. Addressing it proactively shows professionalism. Ignoring it looks careless.

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
- Em-dashes (—) - use regular dashes (-) instead
- ANY claim about tools, metrics, or experience not in EITHER the Primary CV or Master CV
- NEVER invent a street address for the company - use "[Company Address — verify before sending]" instead
- Paragraphs longer than 3 sentences
- Generic filler phrases that add no value

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
    const { applicant, job, rawCV, masterCV } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[UnifiedAgent] Generating email in language:', outputLang);

    const response = await callModel({
      task: 'write_email',
      prompt: `Write a brief application email.

APPLICANT: ${applicant?.name || 'Applicant'}
JOB TITLE: ${job?.title || 'Position'}
COMPANY: ${job?.companyName || 'Company'}
KEY JD REQUIREMENT: ${job?.requiredSkills?.[0] || 'Not specified'}

TOP ACHIEVEMENTS FROM CVs (use the most impressive metric from EITHER source):

PRIMARY CV HIGHLIGHTS:
${rawCV?.slice(0, 500) || 'No CV provided'}
${masterCV ? `
MASTER CV HIGHLIGHTS (comprehensive experience inventory):
${masterCV.slice(0, 500)}` : ''}

INSTRUCTIONS:
1. Subject line: MAXIMUM 60 characters total. Format below.
2. Body: Maximum 4 sentences (excluding greeting and signature)
3. Must include one specific number/achievement from EITHER the Primary CV or Master CV
4. MUST include an attachment reference sentence (see rules below)
5. End with specific availability, not "I look forward to hearing from you"
6. Start with "Hello," as the greeting (do NOT use placeholder like "[Name]")
7. Include one exact keyword from the job description in the body

EMAIL SUBJECT LINE RULES:
- English: "Application: [Job Title] — [Your Name]" (max 60 chars)
- German: "Bewerbung als [Job Title] — [Your Name]" (max 60 chars)
- NEVER add extra descriptors, skill keywords, or metrics in the subject
- The subject line is for identification, not selling

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

EMAIL SIGNATURE REQUIREMENT:
The email MUST end with a professional signature:

Best regards,
${applicant?.name || 'Applicant Name'}

NEVER send an email without a signature. The signature must be on separate lines.

Return ONLY valid JSON: {"subject": "...", "body": "..."}`,
      systemPrompt: `You are an expert at professional email communication for job applications.

<anti_hallucination_rules>
Only reference skills, tools, metrics, and experience that appear in the provided source CVs. Do not invent numbers or claims. Reproduce language proficiency levels exactly as stated — do not upgrade levels to match job requirements (e.g., B2 stays B2, only C1+ qualifies as verhandlungssicher in the German market). Every claim must be traceable to at least one source document.
</anti_hallucination_rules>

GREETING RULE:
- Since we don't know the hiring manager's name, ALWAYS use: "Hello," or "Hi there,"
- NEVER output "[Name]" or "Hi [Name]," as a literal placeholder in the final email
- NEVER use "Dear Sir/Madam" or "To Whom It May Concern"

STYLE:
- Brief and direct - hiring managers scan emails in seconds
- Professional but warm - not robotic
- One clear purpose per email
- Subject line for identification only - no selling

DUAL-CV SOURCING:
- You have TWO sources: Primary CV and Master CV
- Use the MOST impressive metric from EITHER source
- The Master CV is a comprehensive inventory - mine it for the best achievement
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
