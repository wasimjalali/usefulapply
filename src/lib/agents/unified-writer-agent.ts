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
import {
  extractApplicantProfile,
  extractBasicProfile,
  parseJobDescription,
  detectLanguage,
  computeSkillMatch,
  extractVerifiedMetrics,
  type WithTokens,
} from './context-builder';
import { buildCVOptimizationSystemBlocks, buildCVOptimizationUserPrompt, buildVerifiedSkillList, buildVerifiedMetricsList } from './prompts/cv-prompt';
import { buildCoverLetterSystemBlocks, buildCoverLetterUserPrompt } from './prompts/cover-letter-prompt';
import { buildApplicationEmailUserPrompt, buildApplicationEmailSystemPrompt, buildFollowUpEmailUserPrompt, buildFollowUpEmailSystemPrompt } from './prompts/email-prompts';
import { buildFitAssessmentPrompt, buildFitAssessmentSystemPrompt, computeFitLevel } from './prompts/fit-assessment-prompt';

// Re-export for backward compatibility
export { COVER_LETTER_BLACKLIST };

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
  // CONTEXT BUILDING FUNCTIONS (delegated to context-builder.ts)
  // =====================================================

  extractApplicantProfile,
  extractBasicProfile,
  parseJobDescription,
  detectLanguage,
  computeSkillMatch,
  extractVerifiedMetrics,

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
    
    const fitLevel = computeFitLevel(match?.score ?? 0);

    const response = await callModel({
      task: 'fit_assessment',
      prompt: buildFitAssessmentPrompt({ applicant, job, match, masterCV: context.masterCV }),
      systemPrompt: buildFitAssessmentSystemPrompt(),
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
    const { applicant, rawCV } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[UnifiedAgent] Generating structured CV data in language:', outputLang);

    // ---- PROMPT CACHING: Static instructions go into cacheable system blocks ----
    const cvOptimizationSystemBlocks = buildCVOptimizationSystemBlocks();

    const response = await callModel({
      task: 'optimize_cv',
      prompt: buildCVOptimizationUserPrompt(context),
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
    const outputLang = this.getOutputLanguage(context);
    
    console.log('[UnifiedAgent] Generating cover letter in language:', outputLang);

    // ---- PROMPT CACHING: Static cover letter rules into cacheable system blocks ----
    const coverLetterSystemBlocks = buildCoverLetterSystemBlocks();

    const response = await callModel({
      task: 'write_cover_letter',
      prompt: buildCoverLetterUserPrompt(context),
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
    const { job } = context;
    
    const outputLang = this.getOutputLanguage(context);
    
    console.log('[UnifiedAgent] Generating email in language:', outputLang);

    const response = await callModel({
      task: 'write_email',
      prompt: buildApplicationEmailUserPrompt(context),
      systemPrompt: buildApplicationEmailSystemPrompt(context),
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
    const { applicant, job } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    const recommendedDelay = isGerman ? 7 : 5;
    
    console.log('[UnifiedAgent] Generating follow-up email in language:', outputLang);

    const response = await callModel({
      task: 'write_follow_up_email',
      prompt: buildFollowUpEmailUserPrompt(context),
      systemPrompt: buildFollowUpEmailSystemPrompt(context),
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

// REMOVED_OLD_CODE_MARKER — the old inline prompts for cover letter, email, and follow-up
// have been extracted to src/lib/agents/prompts/

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

// END OF FILE — old inline code removed, now in:
// - src/lib/agents/context-builder.ts
// - src/lib/agents/prompts/cv-prompt.ts
// - src/lib/agents/prompts/cover-letter-prompt.ts
// - src/lib/agents/prompts/email-prompts.ts
// - src/lib/agents/prompts/fit-assessment-prompt.ts
