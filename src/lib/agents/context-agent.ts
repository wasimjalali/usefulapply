/**
 * Context Agent - CV Analysis + JD Analysis
 * 
 * Responsibilities:
 * 1. Load applicant documents from storage (RAG source)
 * 2. Extract applicant profile from CV documents
 * 3. Parse job description for requirements
 * 4. Compute skill match analysis
 * 
 * Note: Web search for company research has been removed.
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
      
      // Step 3: Detect language from job description
      const detectedLang = this.detectLanguage(context.jobDescription);
      context.detectedLanguage = detectedLang;
      console.log('[CONTEXT_AGENT] Detected language:', detectedLang);
      
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
    
    // Try to extract address - look for patterns like street names, cities, postal codes
    let address: string | undefined;
    
    // Look for common address patterns in first 10 lines
    for (let i = 1; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];
      // Skip email/phone lines
      if (line.includes('@') || /^[\d\s\+\-\(\)]+$/.test(line)) continue;
      // Look for street indicators (str, street, rue, etc.) or city/postal patterns
      if (/\b(str|street|st\.?|rue|avenue|ave|road|rd|weg|straße|platz|gasse)\b/i.test(line) ||
          /\b\d{4,5}\s+[a-zA-Z\s]+/.test(line)) {
        address = line;
        break;
      }
    }
    
    return {
      name,
      email: emailMatch?.[0] || '',
      phone: phoneMatch?.[0] || undefined,
      address,
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
   * Build minimal context without expensive AI calls
   * Used when writerStrategy is already provided from fit assessment
   */
  async buildMinimalContext(
    context: MasterContext,
    emit: AgentEventHandler
  ): Promise<MasterContext> {
    console.log('[CONTEXT_AGENT] Building minimal context (bypass mode)...');
    
    try {
      // Step 0: Load documents from localStorage if not provided
      if (!context.rawCV) {
        emit({ type: 'progress', percent: 5, message: 'Loading documents from storage...' });
        const docs = await loadApplicantDocuments(context.sessionId);
        if (docs.primaryCV) {
          context.rawCV = docs.primaryCV;
        }
        if (docs.masterCV) {
          context.masterCV = docs.masterCV;
        }
        if (docs.certifications && docs.certifications.length > 0) {
          const certText = '\n\nCERTIFICATIONS:\n' + docs.certifications.join('\n');
          context.masterCV = (context.masterCV || '') + certText;
        }
      }

      if (!context.rawCV) {
        throw new Error('No CV content available. Please upload a CV first.');
      }

      // Step 1: Extract applicant profile using BASIC extraction (no AI call)
      emit({ type: 'progress', percent: 20, message: 'Loading applicant profile...' });
      const applicant = this.extractBasicProfile(context.rawCV);
      
      // If masterCV exists, try to extract additional info (still basic, no AI)
      if (context.masterCV) {
        const masterProfile = this.extractBasicProfile(context.masterCV);
        // Merge skills and experiences
        if (applicant && masterProfile) {
          applicant.skills = [...new Set([...(applicant.skills || []), ...(masterProfile.skills || [])])];
          applicant.tools = [...new Set([...(applicant.tools || []), ...(masterProfile.tools || [])])];
          applicant.experiences = [...(applicant.experiences || []), ...(masterProfile.experiences || [])];
        }
      }
      
      context.applicant = applicant;

      // Step 2: Parse job description using BASIC extraction (no AI call)
      // BUT if job info was already provided from fit assessment, use that
      emit({ type: 'progress', percent: 50, message: 'Loading job requirements...' });
      
      let job: MasterContext['job'];
      if (context.job?.title && context.job?.companyName) {
        // Use job info from fit assessment
        job = context.job;
        console.log('[CONTEXT_AGENT] Using pre-parsed job info from fit assessment:', {
          title: job.title,
          companyName: job.companyName,
        });
      } else {
        // Extract from JD using basic extraction
        job = this.extractBasicJobInfo(context.jobDescription);
        context.job = job;
        
        console.log('[CONTEXT_AGENT] Extracted job info:', {
          title: job?.title,
          companyName: job?.companyName,
          hasRequiredSkills: job?.requiredSkills?.length > 0,
        });
      }

      // Step 3: Detect language
      context.detectedLanguage = this.detectLanguage(context.jobDescription);

      // Step 4: Compute match analysis (lightweight, no AI)
      emit({ type: 'progress', percent: 80, message: 'Computing skill match...' });
      const match = this.computeMatch(applicant, job);
      context.match = match;

      emit({ type: 'progress', percent: 95, message: 'Context loaded' });
      
      console.log('[CONTEXT_AGENT] Minimal context built (bypass mode):', {
        hasApplicant: !!context.applicant,
        hasJob: !!context.job,
        matchScore: context.match?.score,
        usingSavedStrategy: !!context.writerStrategy,
      });
      
      return context;
      
    } catch (error) {
      console.error('[ContextAgent] Error building minimal context:', error);
      throw error;
    }
  },

  /**
   * Fallback: Extract basic job info without AI
   */
  extractBasicJobInfo(jobDescription: string): MasterContext['job'] {
    const lines = jobDescription.split('\n').map(l => l.trim()).filter(Boolean);
    
    // Try to extract title from first line or common patterns
    let title = 'Unknown Position';
    let companyName = 'Unknown Company';
    
    // First non-empty line is often the title
    if (lines.length > 0 && lines[0].length < 100) {
      title = lines[0].replace(/^#+\s*/, '');
    }
    
    // Try multiple patterns to find company name
    const companyPatterns = [
      // "at Company Name" or "@ Company Name"
      /(?:at|@|bei)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:\s+(?:is|we|has|sucht|suchten|bietet|\.|-|\n|$))/i,
      // "Company Name is hiring"
      /^([A-Z][A-Za-z0-9\s&.-]+?)(?:\s+(?:is|are|sucht|suchten|bietet))/im,
      // "Join Company Name" or "Work at Company Name"
      /(?:join|work|arbeiten|anstellung)\s+(?:at|bei)?\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:\s|$|\n)/i,
      // Company name followed by "GmbH", "AG", "Inc", "Ltd", etc.
      /([A-Z][A-Za-z0-9\s&.-]+?\s+(?:GmbH|AG|Inc\.?|Ltd\.?|LLC|Corp\.?|Company|Co\.))/i,
    ];
    
    for (const pattern of companyPatterns) {
      const match = jobDescription.match(pattern);
      if (match && match[1]) {
        companyName = match[1].trim();
        // Clean up common suffixes that might be captured
        companyName = companyName.replace(/\s+(?:is|are|sucht|bietet|\.|-)$/i, '').trim();
        if (companyName && companyName.length > 2) {
          break;
        }
      }
    }
    
    // If still unknown, try to find any capitalized word that might be a company
    if (companyName === 'Unknown Company') {
      // Look for patterns like "Uber", "Amazon" in the first few lines
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i];
        // Skip the title line
        if (line === title) continue;
        // Look for a standalone capitalized word or company-like pattern
        const wordMatch = line.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\b/);
        if (wordMatch && wordMatch[1].length > 2 && !wordMatch[1].match(/^(We|Our|The|This|These|Those|Your|Job|Role|Position|Title)$/i)) {
          companyName = wordMatch[1];
          break;
        }
      }
    }
    
    // Extract skills by looking for common keywords
    const skillKeywords = [
      'python', 'javascript', 'typescript', 'react', 'node', 'sql', 'aws', 
      'docker', 'kubernetes', 'git', 'agile', 'scrum', 'leadership',
      'communication', 'management', 'analysis', 'design', 'marketing'
    ];
    const requiredSkills: string[] = [];
    const descLower = jobDescription.toLowerCase();
    
    for (const skill of skillKeywords) {
      if (descLower.includes(skill)) {
        requiredSkills.push(skill);
      }
    }

    return {
      title,
      companyName,
      requiredSkills,
      niceToHaveSkills: [],
      responsibilities: [],
    };
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
