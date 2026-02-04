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

// =====================================================
// TOKEN TRACKING
// Helper type for functions that return results with token usage
// =====================================================

interface WithTokens<T> {
  result: T;
  tokens: TokenUsage;
}

// =====================================================
// TYPO CORRECTIONS
// Fixes common misspellings in certifications and tools
// =====================================================

const TYPO_CORRECTIONS: Record<string, string> = {
  // Certification/Tool typos
  'semrash': 'Semrush',
  'Semrash': 'Semrush',
  'SEMrash': 'Semrush',
  'semRash': 'Semrush',
  'ahrefs': 'Ahrefs',
  'Ahrefs': 'Ahrefs',
  'hubspot': 'HubSpot',
  'Hubspot': 'HubSpot',
  'mailchimp': 'Mailchimp',
  'MailChimp': 'Mailchimp',
  'linkedin': 'LinkedIn',
  'Linkedin': 'LinkedIn',
  'youtube': 'YouTube',
  'Youtube': 'YouTube',
  'github': 'GitHub',
  'Github': 'GitHub',
  'gitlab': 'GitLab',
  'Gitlab': 'GitLab',
  'javascript': 'JavaScript',
  'Javascript': 'JavaScript',
  'typescript': 'TypeScript',
  'Typescript': 'TypeScript',
  'nodejs': 'Node.js',
  'Nodejs': 'Node.js',
  'NodeJs': 'Node.js',
  'reactjs': 'React',
  'ReactJs': 'React',
  'vuejs': 'Vue.js',
  'VueJs': 'Vue.js',
  'nextjs': 'Next.js',
  'Nextjs': 'Next.js',
  'NextJs': 'Next.js',
  'mongodb': 'MongoDB',
  'Mongodb': 'MongoDB',
  'postgresql': 'PostgreSQL',
  'Postgresql': 'PostgreSQL',
  'mysql': 'MySQL',
  'Mysql': 'MySQL',
  'wordpress': 'WordPress',
  'Wordpress': 'WordPress',
  'shopify': 'Shopify',
  'woocommerce': 'WooCommerce',
  'Woocommerce': 'WooCommerce',
  'google analytics': 'Google Analytics',
  'Google analytics': 'Google Analytics',
  'google ads': 'Google Ads',
  'Google ads': 'Google Ads',
  'facebook ads': 'Facebook Ads',
  'Facebook ads': 'Facebook Ads',
  'tiktok': 'TikTok',
  'Tiktok': 'TikTok',
  'instagram': 'Instagram',
  'powerbi': 'Power BI',
  'PowerBi': 'Power BI',
  'Powerbi': 'Power BI',
  'tableau': 'Tableau',
  'salesforce': 'Salesforce',
  'jira': 'Jira',
  'asana': 'Asana',
  'trello': 'Trello',
  'slack': 'Slack',
  'figma': 'Figma',
  'canva': 'Canva',
  'photoshop': 'Photoshop',
  'illustrator': 'Illustrator',
};

/**
 * Fix common typos in text (certifications, tools, etc.)
 */
function fixTypos(text: string): string {
  let fixed = text;
  for (const [typo, correction] of Object.entries(TYPO_CORRECTIONS)) {
    const regex = new RegExp(`\\b${typo}\\b`, 'g');
    fixed = fixed.replace(regex, correction);
  }
  return fixed;
}

// =====================================================
// ANTI-CLICHE BLACKLIST
// Phrases that make cover letters sound AI-generated
// =====================================================

export const COVER_LETTER_BLACKLIST = {
  openings: [
    "I am writing to apply",
    "I am excited to apply",
    "I am writing to express my interest",
    "I wish to apply",
    "I would like to apply",
    "I am submitting my application",
    "I am reaching out regarding",
    "I came across your job posting",
  ],
  selfDescriptions: [
    "I am a highly motivated",
    "I am a dedicated professional",
    "I am a results-driven",
    "I am a team player",
    "I am a hard worker",
    "I am passionate about",
    "I am confident that",
    "I believe I would be",
    "I am the perfect fit",
    "I am uniquely qualified",
    "I think outside the box",
    "I go the extra mile",
    "I am a self-starter",
    "I am detail-oriented",
    "dynamic professional",
    "proactive individual",
  ],
  closings: [
    "Thank you for considering my application",
    "Thank you for your time and consideration",
    "I look forward to hearing from you",
    "Please do not hesitate to contact me",
    "I would welcome the opportunity",
    "I hope to hear from you soon",
    "References available upon request",
    "Please find attached",
  ],
  fillers: [
    "In today's fast-paced",
    "In this day and age",
    "leverage my skills",
    "utilize my experience",
    "bring to the table",
    "hit the ground running",
    "synergy",
    "paradigm",
    "circle back",
    "move the needle",
  ],
  greetings: [
    "To Whom It May Concern",
    "Dear Sir or Madam",
  ]
};

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
      context.match = this.computeSkillMatch(context.applicant, context.job);

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
      systemPrompt: 'You are a job description parser. Extract comprehensive requirements. Return valid JSON only.',
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
   * AI-native matching - no RAG system needed
   */
  computeSkillMatch(
    applicant: MasterContext['applicant'],
    job: MasterContext['job']
  ): MasterContext['match'] {
    if (!applicant || !job) {
      return { score: 0, matchingSkills: [], missingSkills: [] };
    }

    // Include skills, tools, AND languages for matching
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

    const response = await callModel({
      task: 'optimize_cv',
      prompt: `You are an Expert Resume Architect & Career Strategist for a "Job Copilot" system.

=== YOUR ROLE ===
You are NOT writing a document - you are generating a DATA PAYLOAD (JSON Object) for a frontend application.
Your job is to FORMAT, ARTICULATE, and OPTIMIZE the content based on the CV and job description.

=== TARGET JOB ===
Title: ${job?.title || 'Unknown'}
Company: ${job?.companyName || 'Unknown'}
Required Skills: ${job?.requiredSkills?.join(', ') || 'N/A'}
Nice-to-Have: ${job?.niceToHaveSkills?.join(', ') || 'N/A'}
${matchContext}

=== PRIMARY CV (source of truth for personal info) ===
${rawCV}

${masterCV ? `=== MASTER CV (additional experiences/skills to draw from) ===
${masterCV}` : ''}

=== 🛡️ SANITIZATION & QUALITY CONTROL ===
1. **OCR Artifact Removal:** The user's original data may contain OCR errors or broken characters (e.g., "요", "ន", broken pipes "|", random symbols). AGGRESSIVELY STRIP these out. If a certification name looks like "Amazon Ads 요", correct it to "Amazon Ads".
2. **Language Consistency:** Write ALL content (Summary, Bullets) in ${isGerman ? 'GERMAN' : 'ENGLISH'}.
   - Exception: Do NOT translate proper nouns (e.g., "React.js", "Seller Central", company names).
3. **No Hallucinations:** Do NOT invent experiences, skills, or metrics. If a date is missing, omit it rather than guessing.

=== 📏 LENGTH & FORMAT CONSTRAINTS ===
To ensure the CV fits on 2 pages and remains readable:
1. **Work Experience:** Select ONLY the **top 3-4 roles** most relevant to this job. Group older/irrelevant roles or omit them.
2. **Bullet Points:** Write exactly **3-5 high-impact bullets** per role. No paragraphs.
3. **Skills:** Max **8-10 skills** per category. Prioritize skills mentioned in the Job Description.

=== OPTIMIZATION STRATEGY ===

1. PERSONAL INFO: Copy EXACTLY from Primary CV (name, email, phone, address, LinkedIn, GitHub)

2. HEADLINE (currentTitle): Optimize for the target job
   - Max 3-4 keywords separated by " | "
   - Example: "E-Commerce Specialist | Digital Marketing | Amazon Expert"

3. SUMMARY: 3-4 sentences with metrics from CV, keywords from job

4. EXPERIENCE: 
   - Select TOP 3-4 most relevant roles from Primary CV AND Master CV
   - Each entry needs: company, position, location, startDate, endDate, bullets (3-5 per role), technologies
   - Use action verbs, include metrics where available
   - Generate unique IDs for each entry (exp-1, exp-2, etc.)

5. SKILLS: Group into 2-4 categories with specific tool names
   - NEVER genericize tools (keep "Helium 10" not "E-Commerce Tools")
   - Preserve AI/automation skills even if not in job description
   - Max 8-10 items per category

6. EDUCATION: Copy from Primary CV exactly

7. LANGUAGES: Copy from Primary CV exactly (with proficiency levels)

8. CERTIFICATIONS: Select 4-5 most relevant, CLEAN any OCR artifacts from names

=== 🧠 "CHANGES" TAB LOGIC ===
You MUST populate the "analysis" object to explain your work to the user:
- summary: Explain your high-level strategy in 2 sentences
- key_changes: A list of 4-6 specific improvements made
- ats_compatibility: Your estimated ATS compatibility score (0-100)
- missing_keywords_added: List of keywords from the job description that you added to the CV

=== LANGUAGE ===
${isGerman ? `Generate ALL content in GERMAN. Use German date format (Januar 2025 – Gegenwart).` : 'Generate content in English.'}

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

=== CRITICAL RULES ===
1. Output ONLY valid JSON - no markdown code blocks, no text before or after
2. NEVER invent skills, experiences, or achievements not in the CVs
3. Use the EXACT dates from the original CVs
4. Generate unique IDs for experience, education, certifications (exp-1, edu-1, cert-1, etc.)
5. Bullets must be achievement-focused with action verbs
6. Skills must include SPECIFIC TOOL NAMES, not generic categories
7. ALWAYS include the "analysis" object - it powers the Changes tab
8. CLEAN all OCR artifacts from certification names and other text`,
      systemPrompt: `You are the Writer Agent for Job Copilot. Output ONLY valid JSON matching the CVData schema. No markdown, no explanation, no preamble. The frontend will render your JSON directly - if you mess up the structure, the app breaks. CRITICAL: Always include the "analysis" object with summary, key_changes, ats_compatibility, and missing_keywords_added fields.`,
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

=== CANDIDATE BACKGROUND ===
${rawCV}
${masterCV ? `

=== ADDITIONAL EXPERIENCE (from Master CV) ===
${masterCV}` : ''}

=== COVER LETTER STRUCTURE (Problem-Solution Format) ===

[Opening - hooks with achievement from CV, shows understanding of company challenge]
"After [INSERT EXACT METRIC FROM CV - e.g., revenue, followers, years experience], I've developed [SKILL RELEVANT TO JOB]. When I saw your [JOB TITLE] role, I recognized the exact challenge I've been solving: [CONNECT TO JOB REQUIREMENTS]."

[Value paragraph - specific experience matched to their needs using ONLY CV facts]
"In my role as [EXACT TITLE FROM CV], I [EXACT ACHIEVEMENT FROM CV WITH EXACT METRIC]. I also [SECOND ACHIEVEMENT FROM CV]. My experience with [TOOLS ACTUALLY LISTED IN CV] positions me to [BENEFIT TO COMPANY]."

[Confident close - specific and action-oriented]
"I'd welcome the opportunity to discuss how my [SKILL FROM CV] experience can [BENEFIT]. I'm available for a call this week or next."

=== REQUIRED HEADER FORMAT ===

The cover letter MUST start with this exact header structure:

${applicant?.name || 'Applicant Name'}
${applicant?.address || 'Address'}
${applicant?.email || 'Email'}
${applicant?.phone || 'Phone'}

${today}

Hiring Manager
${job?.companyName || 'Company'}
[Insert Company Address]

IMPORTANT: Under the company name, write exactly "[Insert Company Address]" - do NOT invent or guess a street address.

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

NEVER omit the signature. A cover letter without a signature is incomplete.

INSTRUCTIONS:
1. Use the Problem-Solution format shown in the structure
2. Include at least TWO specific metrics from the candidate's background (ONLY if they exist in the CV)
3. Keep between 250-350 words (excluding header and signature)
4. CRITICAL: Every claim, skill, tool, platform, and metric MUST exist verbatim in the CANDIDATE BACKGROUND section
5. If the job requires skills not in the CV, show TRANSFERABLE skills instead - NEVER claim missing skills

Write the complete cover letter now (including signature):`,
      systemPrompt: `You are an expert cover letter writer specializing in the US and UK job markets.

CRITICAL ANTI-HALLUCINATION RULES (READ FIRST - VIOLATION IS UNACCEPTABLE):

1. NEVER claim experience with tools, platforms, or technologies unless they are EXPLICITLY listed in the CANDIDATE BACKGROUND section. 
   - Job wants "Shopify" but CV doesn't mention it? DO NOT claim Shopify experience.
   - Job wants "Magento" but CV only has "Amazon Seller Central"? Say "e-commerce platform experience" NOT "Magento experience"

2. NEVER invent metrics, percentages, or numbers.
   - Only use EXACT numbers from the CV: "€150,000 revenue" ✓
   - Never invent: "67% increase" ✗ (unless that exact number is in the CV)

3. NEVER claim industry experience the candidate doesn't have.
   - CV shows cosmetics/laundry products? DO NOT claim "agricultural sector experience"
   - Instead: "e-commerce experience across multiple product categories"

4. If unsure whether something is in the CV, DO NOT include it.

5. Before writing any claim, ask: "Is this EXACT fact in the CANDIDATE BACKGROUND section?" If no, don't write it.

WRITING STYLE:
- Write like a confident professional, not a job applicant begging for consideration
- Use active voice and strong verbs
- Be specific and concrete - but ONLY with facts from the CV
- Sound human - slightly conversational, not robotic
- Match the company's tone (startup = casual, corporate = professional)

STRUCTURE (Problem-Solution Format):
1. Opening hook (1-2 sentences): Lead with a REAL achievement from the CV
2. Value paragraph (3-4 sentences): Connect ACTUAL experience to their needs with REAL metrics
3. Confident close (1-2 sentences): Clear call to action
4. Signature: "Best regards," followed by applicant's full name

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
- ANY claim about tools, metrics, or experience not in the CV
- NEVER invent a street address for the company - use "[Insert Company Address]" instead

OUTPUT FORMAT:
- Plain text only
- No markdown
- No bullet points
- Professional letter format
- MUST include signature block at the end`,
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
    const { applicant, job, rawCV } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[UnifiedAgent] Generating email in language:', outputLang);

    const response = await callModel({
      task: 'write_email',
      prompt: `Write a brief application email.

APPLICANT: ${applicant?.name || 'Applicant'}
JOB TITLE: ${job?.title || 'Position'}
COMPANY: ${job?.companyName || 'Company'}

TOP ACHIEVEMENT FROM CV (use the most impressive metric):
${rawCV?.slice(0, 500) || 'No CV provided'}

INSTRUCTIONS:
1. Subject line format: [Job Title] Application - [Name] - [One impressive metric or qualifier]
2. Body: Maximum 4 sentences
3. Must include one specific number/achievement from CV
4. End with availability, not "I look forward to hearing from you"
5. Start with "Hello," as the greeting (do NOT use placeholder like "[Name]")

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

GREETING RULE:
- Since we don't know the hiring manager's name, ALWAYS use: "Hello," or "Hi there,"
- NEVER output "[Name]" or "Hi [Name]," as a literal placeholder in the final email
- NEVER use "Dear Sir/Madam" or "To Whom It May Concern"

STYLE:
- Brief and direct - hiring managers scan emails in seconds
- Professional but warm - not robotic
- One clear purpose per email
- Subject line that stands out without being gimmicky

PROHIBITIONS:
- "I am writing to express my interest..."
- "Please find attached..."
- "I hope this email finds you well"
- "To Whom It May Concern"
- "I look forward to hearing from you"
- Multiple paragraphs - keep it to 3-4 sentences max
- "[Name]" or any bracketed placeholder in the output

STRUCTURE:
Subject: [Job Title] Application - [Your Name] - [One Key Qualifier]
Body: Greeting + One sentence hook + one sentence value + one sentence call to action + Signature

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
// CONVENIENCE FUNCTION
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
