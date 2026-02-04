/**
 * Context Agent - Research + RAG + JD Analysis
 * 
 * Responsibilities:
 * 1. Load applicant documents from localStorage/IndexedDB (RAG source)
 * 2. Extract applicant profile from CV documents (RAG-style)
 * 3. Parse job description for requirements
 * 4. Run company research (Tavily/GPT search)
 * 5. Compute skill match analysis
 * 
 * This agent is the "information funnel" - it gathers all data needed by the Writer.
 */

import type { MasterContext, AgentEventHandler } from './types';
import { callModel } from '@/lib/models';
import { loadApplicantDocuments } from '@/lib/storage/applicantStore';

export const contextAgent = {
  /**
   * Build the complete context from raw inputs
   * This is the main entry point for the Context Agent
   */
  async buildContext(
    context: MasterContext,
    emit: AgentEventHandler
  ): Promise<MasterContext> {
    const startTime = Date.now();
    console.log('[CONTEXT_AGENT] Starting context building...');
    
    try {
      // Step 0: Load documents from localStorage if not provided
      // This enables RAG-style retrieval from the Documents page
      if (!context.rawCV) {
        emit({ type: 'progress', percent: 5, message: 'Loading documents from storage...' });
        const docs = await loadApplicantDocuments(context.sessionId);
        if (docs.primaryCV) {
          context.rawCV = docs.primaryCV;
          console.log('[ContextAgent] Loaded primaryCV from storage');
        }
        if (docs.masterCV) {
          context.masterCV = docs.masterCV;
          console.log('[ContextAgent] Loaded masterCV from storage');
        }
        // Concatenate certifications into masterCV if available
        if (docs.certifications && docs.certifications.length > 0) {
          const certText = '\n\nCERTIFICATIONS:\n' + docs.certifications.join('\n');
          context.masterCV = (context.masterCV || '') + certText;
        }
      }

      // Validate we have CV content
      if (!context.rawCV) {
        throw new Error('No CV content available. Please upload a CV first.');
      }

      // Step 1: Extract applicant profile from CV
      emit({ type: 'progress', percent: 10, message: 'Extracting applicant profile from CV...' });
      const applicant = await this.extractApplicantProfile(context.rawCV, context.masterCV);
      
      // Validate critical applicant fields - mark missing as null for Writer to detect
      if (applicant) {
        if (!applicant.name || applicant.name === 'Unknown') {
          console.warn('[ContextAgent] WARNING: Could not extract applicant name from CV');
          // Keep as-is but log warning - Writer will handle
        }
        if (!applicant.email) {
          console.warn('[ContextAgent] WARNING: Could not extract applicant email from CV');
          // Keep as-is but log warning - Writer will handle
        }
      }
      
      context.applicant = applicant;
      
      // Step 2: Parse job description
      emit({ type: 'progress', percent: 30, message: 'Parsing job description...' });
      const job = await this.parseJobDescription(context.jobDescription);
      context.job = job;
      
      // Step 2.5: Detect language from job description
      const detectedLang = this.detectLanguage(context.jobDescription);
      context.detectedLanguage = detectedLang;
      console.log('[CONTEXT_AGENT] Detected language:', detectedLang);
      
      // Step 3: Company research (parallel with other tasks if possible)
      if (job?.companyName) {
        console.log('[WEB_SEARCH] Step 1: Triggering company research for:', job.companyName);
        emit({ type: 'progress', percent: 50, message: `Researching ${job.companyName}...` });
        const companyResearch = await this.doCompanyResearch(job.companyName);
        context.companyResearch = companyResearch;
        
        console.log('[CONTEXT_AGENT] Company research result:', {
          hasResearch: !!companyResearch,
          hasAddress: !!companyResearch?.address,
          address: companyResearch?.address,
          description: companyResearch?.description?.substring(0, 100),
        });
        
        // Emit tool_usage event for frontend visibility
        if (companyResearch) {
          emit({
            type: 'tool_usage',
            tool: 'company_research',
            output: companyResearch,
            display: true,
          });
        }
      } else {
        console.log('[WEB_SEARCH] Skipping company research - no company name found in job description');
      }
      
      // Step 4: Compute match analysis
      emit({ type: 'progress', percent: 70, message: 'Computing skill match...' });
      const match = this.computeMatch(applicant, job);
      context.match = match;
      
      emit({ type: 'progress', percent: 80, message: 'Context building complete' });
      
      console.log(`[ContextAgent] Built context in ${Date.now() - startTime}ms`);
      console.log('[CONTEXT_AGENT] Final context summary:', {
        hasApplicant: !!context.applicant,
        applicantName: context.applicant?.name,
        hasJob: !!context.job,
        jobTitle: context.job?.title,
        companyName: context.job?.companyName,
        hasCompanyResearch: !!context.companyResearch,
        companyAddress: context.companyResearch?.address,
        matchScore: context.match?.score,
      });
      return context;
      
    } catch (error) {
      console.error('[ContextAgent] Error building context:', error);
      throw error;
    }
  },

  /**
   * Extract structured applicant profile from CV text
   * Uses LLM with strict JSON schema - only extracts what's in the document
   */
  async extractApplicantProfile(
    primaryCV: string,
    masterCV?: string
  ): Promise<MasterContext['applicant']> {
    const combinedCV = masterCV 
      ? `PRIMARY CV:\n${primaryCV}\n\nMASTER CV (additional experience):\n${masterCV}`
      : primaryCV;

    const response = await callModel({
      task: 'extract_applicant',
      prompt: `Extract the applicant's profile from this CV. Only include information that is explicitly stated in the document.

CV CONTENT:
${combinedCV}

Return a JSON object with this exact structure:
{
  "name": "Full name of the applicant",
  "email": "Email address",
  "phone": "Phone number or null if not found",
  "address": "Location/address or null if not found",
  "headline": "Professional headline/title or null",
  "skills": ["list", "of", "technical", "skills"],
  "tools": ["list", "of", "tools", "and", "technologies"],
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
  "certifications": ["list", "of", "certifications"]
}

CRITICAL: Only extract information that EXISTS in the CV. Do not invent or assume anything.`,
      systemPrompt: 'You are a precise CV parser. Extract only factual information present in the document. Return valid JSON only.',
      jsonMode: true,
    });

    try {
      // Clean the response - Claude may wrap JSON in markdown code blocks
      let jsonContent = response.content.trim();
      
      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to find JSON object in the response
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }
      
      return JSON.parse(jsonContent);
    } catch (error) {
      console.error('[ContextAgent] Failed to parse applicant profile:', error);
      // Return minimal profile from basic extraction
      return this.extractBasicProfile(primaryCV);
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
  async parseJobDescription(jobDescription: string): Promise<MasterContext['job']> {
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
      systemPrompt: 'You are a job description parser. Extract comprehensive requirements. Return valid JSON only.',
      jsonMode: true,
    });

    try {
      // Clean the response - Claude may wrap JSON in markdown code blocks
      let jsonContent = response.content.trim();
      
      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to find JSON object in the response
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }
      
      return JSON.parse(jsonContent);
    } catch (error) {
      console.error('[ContextAgent] Failed to parse job description:', error);
      // Return minimal job info
      return {
        title: 'Unknown Position',
        companyName: 'Unknown Company',
        requiredSkills: [],
        niceToHaveSkills: [],
        responsibilities: [],
      };
    }
  },

  /**
   * Research company - web search removed
   * Returns undefined as company research is no longer performed
   */
  async doCompanyResearch(companyName: string): Promise<MasterContext['companyResearch'] | undefined> {
    console.log('[ContextAgent] Company research via web search disabled');
    return undefined;
  },

  /**
   * Detect the language of the job description
   * Returns 'de' for German, 'en' for English (default)
   */
  detectLanguage(text: string): 'en' | 'de' {
    // German indicators - common German words that rarely appear in English job descriptions
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
    
    // If we find significant German indicators, it's German
    // Threshold: at least 10 German words in the text
    if (germanMatches >= 10) {
      return 'de';
    }
    
    return 'en';
  },

  /**
   * Compute skill match between applicant and job requirements
   * Includes skills, tools, AND languages for comprehensive matching
   */
  computeMatch(
    applicant: MasterContext['applicant'],
    job: MasterContext['job']
  ): MasterContext['match'] {
    if (!applicant || !job) {
      return { score: 0, matchingSkills: [], missingSkills: [] };
    }

    // Include skills, tools, AND languages for matching
    // This helps match "German (B2)" against "German language" requirements
    const applicantSkills = new Set([
      ...(applicant.skills || []).map(s => s.toLowerCase().trim()),
      ...(applicant.tools || []).map(s => s.toLowerCase().trim()),
      ...(applicant.languages || []).map(s => s.toLowerCase().trim()),
    ]);

    const requiredSkills = (job.requiredSkills || []).map(s => s.trim());
    const matchingSkills: string[] = [];
    const missingSkills: string[] = [];

    for (const skill of requiredSkills) {
      const skillLower = skill.toLowerCase();
      // Check if any applicant skill contains or is contained by the required skill
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
};
