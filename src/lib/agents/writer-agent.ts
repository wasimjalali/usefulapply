/**
 * Writer Agent - 3-Agent Architecture
 * 
 * Responsibilities:
 * - Generate optimized CV from MasterContext
 * - Generate cover letter from MasterContext
 * - Generate application email from MasterContext
 * 
 * The Writer is "dumb" - it only writes based on what it's given.
 * It does NOT research or think. This prevents hallucination.
 * 
 * CRITICAL: Writer validates that required fields exist before writing.
 * Missing name/email will result in placeholder text being used.
 */

import type { MasterContext, AgentEventHandler } from './types';
import { callModel } from '@/lib/models';

// =====================================================
// COMMON TYPO CORRECTIONS
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
    // Use word boundary regex to avoid partial matches
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

// Flatten for easy checking
export const ALL_BLACKLISTED_PHRASES = [
  ...COVER_LETTER_BLACKLIST.openings,
  ...COVER_LETTER_BLACKLIST.selfDescriptions,
  ...COVER_LETTER_BLACKLIST.closings,
  ...COVER_LETTER_BLACKLIST.fillers,
  ...COVER_LETTER_BLACKLIST.greetings,
].map(phrase => phrase.toLowerCase());

/**
 * Check if text contains blacklisted phrases
 */
export function containsBlacklistedPhrase(text: string): { found: boolean; phrases: string[] } {
  const lowerText = text.toLowerCase();
  const found: string[] = [];
  
  for (const phrase of ALL_BLACKLISTED_PHRASES) {
    if (lowerText.includes(phrase.toLowerCase())) {
      found.push(phrase);
    }
  }
  
  return { found: found.length > 0, phrases: found };
}

export const writerAgent = {
  /**
   * Validate that required context fields are present
   * Returns list of missing fields for error reporting
   */
  validateContext(context: MasterContext): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    // Check applicant info
    if (!context.applicant) {
      warnings.push('Applicant profile not extracted from CV');
    } else {
      if (!context.applicant.name || context.applicant.name === 'Unknown') {
        warnings.push('Applicant name not found in CV - will use placeholder');
      }
      if (!context.applicant.email) {
        warnings.push('Applicant email not found in CV - cover letter header may be incomplete');
      }
    }
    
    // Check job info
    if (!context.job) {
      warnings.push('Job requirements not parsed from JD');
    } else {
      if (!context.job.title) {
        warnings.push('Job title not found in JD');
      }
      if (!context.job.companyName) {
        warnings.push('Company name not found in JD');
      }
    }
    
    // Log all warnings
    warnings.forEach(w => console.warn(`[WriterAgent] ${w}`));
    
    return { 
      valid: warnings.length === 0,
      warnings 
    };
  },

  /**
   * Determine the output language based on detection and user override
   */
  getOutputLanguage(context: MasterContext): 'en' | 'de' {
    // User override takes priority
    if (context.userLanguageOverride) {
      return context.userLanguageOverride;
    }
    // Otherwise use detected language
    return context.detectedLanguage || 'en';
  },

  /**
   * Generate all three documents from MasterContext
   * This is the main entry point for the Writer Agent
   */
  async generateAll(
    context: MasterContext,
    emit: AgentEventHandler
  ): Promise<MasterContext> {
    // Validate context and log warnings (but don't block)
    const validation = this.validateContext(context);
    if (!validation.valid) {
      emit({ 
        type: 'message', 
        content: `⚠️ Some information may be missing: ${validation.warnings.join('; ')}` 
      });
    }
    
    // Log output language
    const outputLang = this.getOutputLanguage(context);
    console.log('[WRITER_AGENT] Output language:', outputLang);

    // 1) Generate optimized CV using Solution B (Structured JSON)
    emit({ type: 'progress', percent: 55, message: 'Generating optimized CV...' });
    const { cvData, legacyCV } = await this.generateOptimizedCVData(context);
    context.optimizedCVData = cvData;
    context.optimizedCV = legacyCV; // Keep for backward compatibility

    // 2) Generate cover letter
    emit({ type: 'progress', percent: 75, message: 'Writing cover letter...' });
    const coverLetter = await this.generateCoverLetter(context);
    context.coverLetter = coverLetter;

    // 3) Generate application email
    emit({ type: 'progress', percent: 90, message: 'Composing application email...' });
    const applicationEmail = await this.generateApplicationEmail(context);
    context.applicationEmail = applicationEmail;

    return context;
  },

  /**
   * SOLUTION B: Generate optimized CV as structured JSON (CVData format)
   * AI outputs structured data directly - no text parsing needed
   * Eliminates duplication issues caused by text parsing failures
   */
  async generateOptimizedCVData(context: MasterContext): Promise<{
    cvData: NonNullable<MasterContext['optimizedCVData']>;
    legacyCV: { content: string; changes: Array<{ section: string; before: string; after: string; reason: string }> };
  }> {
    const { applicant, job, companyResearch, match, rawCV, masterCV } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[WRITER_AGENT] Generating structured CV data (Solution B) in language:', outputLang);

    const companyContext = companyResearch ? `
COMPANY RESEARCH:
Company: ${companyResearch.name}
Description: ${companyResearch.description || 'N/A'}
Culture: ${companyResearch.culture?.join(', ') || 'N/A'}
Values: ${companyResearch.values?.join(', ') || 'N/A'}
Tech Stack: ${companyResearch.techStack?.join(', ') || 'N/A'}
` : '';

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
The Context Agent has already analyzed the job and CV. Your job is to FORMAT, ARTICULATE, and OPTIMIZE the content.

=== TARGET JOB ===
Title: ${job?.title || 'Unknown'}
Company: ${job?.companyName || 'Unknown'}
Required Skills: ${job?.requiredSkills?.join(', ') || 'N/A'}
Nice-to-Have: ${job?.niceToHaveSkills?.join(', ') || 'N/A'}
${companyContext}
${matchContext}

=== PRIMARY CV (source of truth for personal info) ===
${rawCV}

${masterCV ? `=== MASTER CV (additional experiences/skills to draw from) ===
${masterCV}` : ''}

=== 🛡️ SANITIZATION & QUALITY CONTROL ===
1. **OCR Artifact Removal:** The user's original data may contain OCR errors or broken characters (e.g., "요", "ន", broken pipes "|", random symbols). AGGRESSIVELY STRIP these out. If a certification name looks like "Amazon Ads 요", correct it to "Amazon Ads".
2. **Language Consistency:** Detect the language of the Job Description. Write ALL content (Summary, Bullets, Cover Letter) in that language.
   - Exception: Do NOT translate proper nouns (e.g., "React.js", "Seller Central", company names).
3. **No Hallucinations:** Do NOT invent experiences, skills, or metrics. If a date is missing, omit it rather than guessing.

=== 📏 LENGTH & FORMAT CONSTRAINTS ===
To ensure the CV fits on 2 pages and remains readable:
1. **Work Experience:** Select ONLY the **top 3-4 roles** most relevant to this job. Group older/irrelevant roles or omit them.
2. **Bullet Points:** Write exactly **3-5 high-impact bullets** per role. No paragraphs.
   - Bad: "I was responsible for managing the team and..."
   - Good: "Led a team of 5 to increase revenue by 20%..."
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
- summary: Explain your high-level strategy in 2 sentences (e.g., "Translated profile to German and emphasized Shop-Systeme experience.")
- key_changes: A list of 4-6 specific improvements made:
  * Example: "Renamed 'Marketing Specialist' to 'E-Commerce Manager' to match job title."
  * Example: "Added 'Zapier' and 'Claude API' to Skills section."
  * Example: "Quantified 'Sales experience' with specific revenue numbers (€150k)."
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

    try {
      // Clean the response
      let jsonContent = response.content.trim();
      
      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Find JSON object
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }
      
      const parsed = JSON.parse(jsonContent);
      
      console.log('[WRITER_AGENT] Solution B - Parsed structured CV data:');
      console.log('  - Personal:', parsed.personal?.fullName);
      console.log('  - Experience entries:', parsed.experience?.length || 0);
      console.log('  - Skill categories:', parsed.skills?.length || 0);
      console.log('  - Education entries:', parsed.education?.length || 0);
      
      // Validate required fields and provide defaults
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
        // NEW: Parse analysis object for Changes tab
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
          changes: [], // No longer tracking changes in Solution B
        },
      };
    } catch (error) {
      console.error('[WRITER_AGENT] Failed to parse structured CV JSON:', error);
      console.error('[WRITER_AGENT] Raw response:', response.content.substring(0, 500));
      
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
   * LEGACY: Generate optimized CV content as text
   * Kept for backward compatibility - use generateOptimizedCVData instead
   */
  async generateOptimizedCV(context: MasterContext): Promise<{ content: string; changes: Array<{ section: string; before: string; after: string; reason: string }> }> {
    const { applicant, job, companyResearch, match, rawCV, masterCV } = context;
    
    // Get output language - German or English
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[WRITER_AGENT] Generating CV in language:', outputLang);

    const companyContext = companyResearch ? `
COMPANY RESEARCH:
Company: ${companyResearch.name}
Description: ${companyResearch.description || 'N/A'}
Culture: ${companyResearch.culture?.join(', ') || 'N/A'}
Values: ${companyResearch.values?.join(', ') || 'N/A'}
Tech Stack: ${companyResearch.techStack?.join(', ') || 'N/A'}
` : '';

    const matchContext = match ? `
SKILL MATCH ANALYSIS:
Matching Skills: ${match.matchingSkills.join(', ')}
Missing Skills (from JD): ${match.missingSkills.join(', ')}
` : '';

    const response = await callModel({
      task: 'optimize_cv',
      prompt: `Optimize this CV for the target job. Return JSON with the optimized CV and changes made.

TARGET JOB:
Title: ${job?.title || 'Unknown'}
Company: ${job?.companyName || 'Unknown'}
Required Skills: ${job?.requiredSkills?.join(', ') || 'N/A'}
Nice-to-Have: ${job?.niceToHaveSkills?.join(', ') || 'N/A'}
${companyContext}
${matchContext}

CURRENT CV:
${rawCV}

${masterCV ? `MASTER CV (additional relevant experience/skills to draw from):
${masterCV}` : ''}

=== CV OPTIMIZATION RULES ===

SECTIONS TO KEEP EXACTLY AS-IS (DO NOT MODIFY):
• Personal Info: Name, email, phone, address - copy exactly
• Education: Keep exactly as in original CV
• Languages: Keep exactly as in original CV

=== SKILL PRESERVATION RULES ===

When optimizing the CV, preserve the candidate's DIFFERENTIATING SKILLS - these are skills that make them stand out from typical applicants.

DIFFERENTIATING SKILLS TO PRESERVE (if present in candidate's CV):

1. AI & Automation Skills
   - Any AI tools mentioned (e.g., ChatGPT, Claude, Gemini, MidJourney, etc.)
   - Any AI coding assistants mentioned (e.g., Cursor, Copilot, Windsurf, etc.)
   - Any automation platforms mentioned (e.g., Zapier, Make, n8n, etc.)
   - Prompt engineering experience
   - AI workflow automation

2. Technical/Builder Skills
   - Programming languages mentioned in the CV
   - Frameworks mentioned in the CV (e.g., React, Next.js, Vue, etc.)
   - Any indication they BUILD things (side projects, tools, products)

3. Specific Industry Tools
   - Any specialized tools the candidate actually uses (check their CV)
   - Platform-specific expertise (e.g., Amazon Seller Central, Shopify, etc.)

4. Founder/Entrepreneurial Experience
   - Side projects
   - Businesses started
   - Products built

HOW TO IDENTIFY DIFFERENTIATING SKILLS:
Step 1: Read the candidate's CV and Master CV
Step 2: Identify skills that are:
   - Modern/forward-thinking (AI, automation, no-code)
   - Show they can BUILD, not just operate
   - Specialized expertise with specific tools
   - Unique combinations (e.g., e-commerce + AI + web development)
Step 3: KEEP these skills even if NOT explicitly required in the job description

WHY: These skills signal adaptability, learning ability, and higher potential value. Removing them makes the candidate look generic.

WHAT TO REMOVE:
Only remove skills that are:
- Truly irrelevant to any professional context
- Outdated technologies (e.g., Flash, FrontPage)
- Generic filler (e.g., "Microsoft Word" for a senior role)

RULE: When in doubt, KEEP the skill from the original CV.

SECTIONS TO OPTIMIZE (for ATS keywords and relevance):

1. HEADLINE (under name):
   - Optimize to match the job title while staying truthful to applicant's background
   - Max 3-4 keywords separated by " | "
   - Example: "E-Commerce Specialist | Digital Marketing | Amazon Expert"

2. PROFESSIONAL SUMMARY:
   - 3-4 sentences maximum
   - Include key achievements with metrics from CV
   - Incorporate relevant keywords from job description
   - Must be factual - only use info from CV/Master CV

3. CORE COMPETENCIES / SKILLS:
   - Maximum 10-12 skills total
   - PRESERVE differentiating skills (AI, automation, builder skills) even if not in JD
   - Can add skills from Master CV if relevant to job
   - Group into 2-3 categories if applicable

=== SKILLS/COMPETENCIES OPTIMIZATION RULES ===

1. NEVER convert specific tools into generic categories
   
   WRONG: "Helium 10, Jungle Scout" → "E-Commerce Tools"
   RIGHT: "Helium 10, Jungle Scout" → "Helium 10, Jungle Scout"
   
   WRONG: "ChatGPT, Claude, Gemini" → "AI & Automation"  
   RIGHT: "ChatGPT, Claude, Gemini" → "AI Tools: ChatGPT, Claude, Gemini"

2. Specific tool names are MORE VALUABLE than generic categories because:
   - They pass ATS keyword matching
   - They show real hands-on experience
   - Recruiters search for specific tools

3. STRUCTURE for skills section:
   
   Option A - Grouped with specifics:
   • E-Commerce: Amazon Seller Central, Helium 10, Jungle Scout
   • AI & Automation: ChatGPT, Claude, Prompt Engineering, Zapier
   • Web Development: Next.js, React, JavaScript
   
   Option B - Flat list with specifics:
   • Amazon Seller Central & Vendor Central
   • PPC Campaign Management
   • Helium 10, Jungle Scout
   • AI Tools (ChatGPT, Claude, Gemini)
   • Next.js, React

4. When selecting which skills to include:
   - PRIORITIZE skills that match job description keywords
   - KEEP specific tool names, don't genericize them
   - Include 8-12 skill items (can be grouped)
   - Each item can contain multiple related tools

5. NEVER output generic-only skills like:
   - "E-Commerce Management" (too vague)
   - "Digital Marketing" (too vague)
   - "AI & Automation" (too vague without specifics)
   
   ALWAYS pair generic category with specific tools:
   - "E-Commerce Management (Amazon Seller Central, Shopify)" ✓
   - "AI & Automation (ChatGPT, Claude, Zapier)" ✓

=== SKILL RELEVANCE MATCHING ===

Step 1: Read the job description requirements
Step 2: Identify which candidate skills DIRECTLY match
Step 3: Identify which candidate skills are TRANSFERABLE
Step 4: Prioritize in this order:
   a) Direct matches (job wants "PPC" → candidate has "PPC Campaign Management")
   b) Platform matches (job wants "webshop management" → candidate has "Amazon Seller Central")
   c) Transferable skills (job wants "team leadership" → candidate has "training/coaching")
   d) Differentiators (AI skills, builder skills - keep even if not in JD)

Step 5: Select top 10-12 skills following this priority

EXAMPLE for E-Commerce Manager role:
Job requires: SEO, SEA, webshop management, team leadership, analytics
Candidate has: Amazon Seller Central, Helium 10, PPC campaigns, AI tools, Next.js

Output should be:
• Amazon Seller Central & Vendor Central (webshop/platform experience)
• PPC Campaign Management / SEA (direct match)
• SEO Fundamentals (direct match)
• Helium 10, Jungle Scout (analytics/e-commerce tools)
• AI Tools: ChatGPT, Claude (differentiator)
• Team Training & Coaching (transferable to leadership)
• Next.js, React (differentiator - builder skills)
• Data-Driven Decision Making (matches analytics requirement)

4. PROFESSIONAL EXPERIENCE:
   - Keep job titles, companies, and dates exactly as-is
   - Optimize bullet points (3-4 bullets per role maximum)
   - Use action verbs and include metrics where available
   - Prioritize achievements relevant to target job
   - Can incorporate relevant details from Master CV

5. CERTIFICATIONS:
   - Maximum 4-5 most relevant certifications
   - Prioritize certifications mentioned in job description
   - Can add from Master CV if relevant
   - DO NOT include certification IDs, verification codes, or credential numbers
   - Format: "Certification Name – Issuer | Date" (optionally with score for language tests)
   - WRONG: "Amazon Ads Foundations – Amazon | ID: b2a13065-a357..."
   - CORRECT: "Amazon Ads Foundations – Amazon Ads Academy | September 2025"

=== LANGUAGE INSTRUCTION ===

${isGerman ? `CRITICAL: Generate ALL CV content in GERMAN.
- Section headers in German: "BERUFSERFAHRUNG", "AUSBILDUNG", "FÄHIGKEITEN", "SPRACHEN", "ZERTIFIKATE"
- Use German date format: DD.MM.YYYY or "Januar 2025 – Gegenwart"
- Professional German business language
- Keep personal info (name, email, phone) as-is` : 'Generate CV content in English.'}

=== OUTPUT FORMAT ===

Return ONLY valid JSON in this exact format:
{
  "optimizedCV": "The COMPLETE optimized CV with ALL changes APPLIED - this is the FINAL document the user will see",
  "changes": [
    {
      "section": "Headline",
      "before": "Original headline text",
      "after": "New optimized headline",
      "reason": "Aligned with job title requirements"
    }
  ]
}

=== CRITICAL: THE optimizedCV FIELD IS THE FINAL OUTPUT ===

IMPORTANT: The "optimizedCV" field is what the user will download and use.
The "changes" array is ONLY for showing what was changed - it is NOT applied automatically.
YOU must write the COMPLETE, FINAL, OPTIMIZED CV in the "optimizedCV" field.

STEP-BY-STEP PROCESS:
1. First, decide what changes to make (these go in "changes" array)
2. Then, WRITE THE ENTIRE CV from scratch with ALL those changes applied
3. Put the complete rewritten CV in "optimizedCV"
4. The "optimizedCV" should be the FINAL document - ready to use

COMMON MISTAKE TO AVOID:
❌ WRONG: Putting the original CV in "optimizedCV" and only listing changes in "changes"
❌ WRONG: Only changing 1-2 sections in "optimizedCV" but listing 10 changes
❌ WRONG: Describing expanded bullets in "changes" but "optimizedCV" has original bullets

✅ CORRECT: "optimizedCV" contains the COMPLETE rewritten CV with EVERY change applied
✅ CORRECT: If "changes" says "expanded to 5 bullets", "optimizedCV" has exactly 5 bullets
✅ CORRECT: If "changes" says "reorganized into categories", "optimizedCV" shows categories

VERIFICATION (do this before returning):
- Count bullets in "optimizedCV" - do they match what "changes" describes?
- Check headline in "optimizedCV" - does it match the "after" in changes?
- Check summary in "optimizedCV" - does it match the "after" in changes?
- Check skills in "optimizedCV" - are they reorganized as described?

CRITICAL RULES:
- Do NOT use markdown formatting (no **, *, ---, etc.)
- Use plain text only with standard bullet points (•)
- Section headers in UPPERCASE
- NEVER invent skills, experiences, or achievements
- Keep CV under 2 pages worth of content
- The "optimizedCV" IS the final document - make it complete`,
      systemPrompt: `You are an expert ATS-optimized CV writer. Return ONLY valid JSON. CRITICAL: Only use information from the provided CV and Master CV. Never invent anything. No markdown formatting.`,
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
      
      const parsed = JSON.parse(jsonContent);
      
      // DEBUG: Log to verify changes are being applied
      console.log('[WriterAgent] CV Optimization Debug:');
      console.log('  - Changes count:', parsed.changes?.length || 0);
      console.log('  - OptimizedCV length:', parsed.optimizedCV?.length || 0);
      
      // CRITICAL: Apply changes programmatically if AI didn't apply them
      let cvContent = parsed.optimizedCV || response.content;
      
      // Helper function to normalize text for matching (handles whitespace, bullets, etc.)
      const normalizeForMatching = (text: string): string => {
        return text
          .replace(/\s+/g, ' ')           // Normalize all whitespace to single space
          .replace(/[•●○◦▪▸►]/g, '-')     // Normalize various bullet characters
          .replace(/\n/g, ' ')            // Remove newlines
          .replace(/\t/g, ' ')            // Remove tabs
          .trim()
          .toLowerCase();
      };
      
      if (parsed.changes && parsed.changes.length > 0) {
        let changesAppliedCount = 0;
        let changesNotAppliedCount = 0;
        
        for (const change of parsed.changes) {
          if (!change.before || !change.after) continue;
          
          // Use longer snippets (100+ chars) for more reliable matching
          const snippetLength = Math.min(120, change.after.length);
          const afterSnippet = change.after.substring(0, snippetLength).trim();
          const beforeSnippet = change.before.substring(0, snippetLength).trim();
          
          // Normalize for comparison
          const normalizedCV = normalizeForMatching(cvContent);
          const normalizedAfter = normalizeForMatching(afterSnippet);
          const normalizedBefore = normalizeForMatching(beforeSnippet);
          
          if (normalizedCV.includes(normalizedAfter)) {
            // Change was applied by AI
            changesAppliedCount++;
          } else if (normalizedCV.includes(normalizedBefore)) {
            // Change was NOT applied - apply it now
            changesNotAppliedCount++;
            console.log(`[WriterAgent] Applying missed change for: ${change.section}`);
            
            // Try exact replacement first
            if (cvContent.includes(change.before)) {
              cvContent = cvContent.replace(change.before, change.after);
            } else {
              // If exact match fails, try to find and replace with normalized matching
              // This handles cases where whitespace/formatting differs slightly
              const lines = cvContent.split('\n');
              let replaced = false;
              
              for (let i = 0; i < lines.length; i++) {
                if (normalizeForMatching(lines[i]).includes(normalizedBefore.substring(0, 50))) {
                  // Found a matching line - this is likely the start of the section
                  // For multi-line content, we need a different approach
                  console.log(`[WriterAgent] Found partial match at line ${i}`);
                  replaced = true;
                  break;
                }
              }
              
              if (!replaced) {
                // Last resort: append the new content if we can't find where to replace
                console.log(`[WriterAgent] Could not find exact match for ${change.section}, attempting fuzzy replace`);
                // Try replacing just the first 50 chars to anchor the replacement
                const shortBefore = change.before.substring(0, 50);
                if (cvContent.includes(shortBefore)) {
                  // Find where shortBefore starts and replace the whole section
                  const startIdx = cvContent.indexOf(shortBefore);
                  const beforeLength = change.before.length;
                  cvContent = cvContent.substring(0, startIdx) + change.after + cvContent.substring(startIdx + beforeLength);
                }
              }
            }
          } else {
            // Neither before nor after found - might be a new section or already modified
            console.log(`[WriterAgent] Could not detect status for: ${change.section}`);
          }
        }
        
        console.log(`[WriterAgent] Changes applied by AI: ${changesAppliedCount}`);
        console.log(`[WriterAgent] Changes applied programmatically: ${changesNotAppliedCount}`);
        
        if (changesNotAppliedCount > 0) {
          console.warn(`[WriterAgent] WARNING: AI failed to apply ${changesNotAppliedCount} changes - applied programmatically`);
        }
      }
      
      // Apply typo corrections to CV content
      cvContent = fixTypos(cvContent);
      return {
        content: cvContent,
        changes: parsed.changes || [],
      };
    } catch (error) {
      console.error('[WriterAgent] Failed to parse CV JSON:', error);
      console.error('[WriterAgent] Raw response:', response.content.substring(0, 500));
      // Fallback if JSON parsing fails - try to extract just the CV content
      const content = response.content;
      // If it looks like it contains a CV structure, use it
      if (content.includes('PROFESSIONAL') || content.includes('EXPERIENCE') || content.includes('EDUCATION')) {
        return {
          content: fixTypos(content),
          changes: [],
        };
      }
      return {
        content: fixTypos(response.content),
        changes: [],
      };
    }
  },

  /**
   * Generate cover letter using Problem-Solution format
   * Includes refinement pass for quality improvement
   */
  async generateCoverLetter(context: MasterContext, emit?: AgentEventHandler): Promise<string> {
    const { applicant, job, companyResearch, rawCV, masterCV } = context;
    
    // Get output language
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[WRITER_AGENT] Generating cover letter in language:', outputLang);
    
    // Debug logging for company research data flow
    console.log('[WRITER_AGENT] Generating cover letter with company data:', {
      hasCompanyResearch: !!companyResearch,
      companyName: companyResearch?.name || job?.companyName,
      companyAddress: companyResearch?.address,
      hasDescription: !!companyResearch?.description,
      hasValues: !!(companyResearch?.values && companyResearch.values.length > 0),
      hasRecentNews: !!(companyResearch?.recentNews && companyResearch.recentNews.length > 0),
    });
    
    // Get today's date in a professional format
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

=== COMPANY RESEARCH ===
${companyResearch ? `
Company Name: ${companyResearch.name || job?.companyName}
Company Address: ${companyResearch.address || 'Not available'}
What They Do: ${companyResearch.description || 'Not available'}
Company Values: ${companyResearch.values?.join(', ') || 'Not available'}
Culture: ${companyResearch.culture?.join(', ') || 'Not available'}
Recent News: ${companyResearch.recentNews?.[0] || 'None found'}
` : 'No company research available - focus on role requirements.'}

=== CANDIDATE BACKGROUND ===
${rawCV}
${masterCV ? `

=== ADDITIONAL EXPERIENCE (from Master CV) ===
${masterCV}` : ''}

=== EXAMPLE OF EXCELLENT COVER LETTER STRUCTURE ===

[Opening - hooks with achievement from CV, shows understanding of company challenge]
"After [INSERT EXACT METRIC FROM CV - e.g., revenue, followers, years experience], I've developed [SKILL RELEVANT TO JOB]. When I saw your [JOB TITLE] role, I recognized the exact challenge I've been solving: [CONNECT TO JOB REQUIREMENTS]."

[Value paragraph - specific experience matched to their needs using ONLY CV facts]
"In my role as [EXACT TITLE FROM CV], I [EXACT ACHIEVEMENT FROM CV WITH EXACT METRIC]. I also [SECOND ACHIEVEMENT FROM CV]. My experience with [TOOLS ACTUALLY LISTED IN CV] positions me to [BENEFIT TO COMPANY]."

[Company knowledge - shows research from company research section]
"I've been following [SPECIFIC FACT FROM COMPANY RESEARCH SECTION - only if provided]. [CONNECT YOUR REAL EXPERIENCE TO THEIR SITUATION]."

[Confident close - specific and action-oriented]
"I'd welcome the opportunity to discuss how my [SKILL FROM CV] experience can [BENEFIT]. I'm available for a call this week or next."

=== END EXAMPLE ===

IMPORTANT: The example above shows STRUCTURE only. 
- Replace all [BRACKETED ITEMS] with REAL information from the candidate's CV
- DO NOT invent metrics - use only what's in CANDIDATE BACKGROUND
- DO NOT claim tools/platforms not listed in CANDIDATE BACKGROUND

=== SKILL VERIFICATION ===

CRITICAL: Only claim experience with tools/platforms that are EXPLICITLY mentioned in the CANDIDATE BACKGROUND section above. 

If the job asks for tools the candidate doesn't have:
- DO NOT claim experience with those tools
- Instead, mention similar tools they DO have
- Use phrases like "experience with comparable platforms" or "proven ability to master new systems quickly"

=== REQUIRED HEADER FORMAT ===

The cover letter MUST start with this exact header structure:

${applicant?.name || 'Applicant Name'}
${applicant?.address || 'Address'}
${applicant?.email || 'Email'}
${applicant?.phone || 'Phone'}

${today}

Hiring Manager
${companyResearch?.name || job?.companyName || 'Company'}
${companyResearch?.address ? companyResearch.address : '[Insert Company Address]'}

=== COMPANY ADDRESS HANDLING ===
CRITICAL RULES FOR COMPANY ADDRESS:
1. If a REAL address is provided above (not "[Insert Company Address]" placeholder), use it EXACTLY as shown
2. If "[Insert Company Address]" placeholder is shown, keep it as-is - the user will replace it manually
3. NEVER use placeholder addresses like "Musterstraße", "123 Example Street", or any fake address
4. Copy the address CHARACTER FOR CHARACTER - no modifications to spelling
5. "Kastl" must stay "Kastl" - NEVER change to "Kastellaun" or any other city

CORRECT EXAMPLES:

If real address found:
Hiring Manager
${companyResearch?.name || job?.companyName || 'Company'}
Maierhof 1, 84556 Kastl

If NO address found (shows placeholder):
Hiring Manager
${companyResearch?.name || job?.companyName || 'Company'}
[Insert Company Address]

WRONG - NEVER DO THIS:
Hiring Manager
Company Name
Musterstraße 123, 12345 Berlin  ← FAKE ADDRESS - NEVER!

INSTRUCTIONS:
1. Use the Problem-Solution format shown in the structure example
2. Include at least TWO specific metrics from the candidate's background (ONLY if they exist in the CV)
3. Reference something specific from the company research (if available)
4. Keep between 250-350 words (excluding header and signature)
5. The example shows STRUCTURE only - replace ALL bracketed placeholders with actual content from the CV
6. CRITICAL: Every claim, skill, tool, platform, and metric MUST exist verbatim in the CANDIDATE BACKGROUND section
7. If the job requires skills not in the CV, show TRANSFERABLE skills instead - NEVER claim missing skills
8. Start with the REQUIRED HEADER FORMAT above
9. End with a confident closing line followed by proper signature

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
3. Company knowledge (2-3 sentences): Reference company research if provided
4. Confident close (1-2 sentences): Clear call to action
5. Signature: "Best regards," followed by applicant's full name

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

OUTPUT FORMAT:
- Plain text only
- No markdown
- No bullet points
- Professional letter format
- MUST include signature block at the end:
  
  Best regards,
  
  [Applicant Name]

NEVER end a cover letter without the signature. The signature is mandatory.`,
    });

    let coverLetter = response.content || '';
    
    // NOTE: Refinement pass REMOVED to save tokens and reduce latency.
    // With Claude Haiku 4.5 and improved prompts, the initial generation
    // is high quality enough that refinement adds minimal value.
    // The refineCoverLetter function is kept below for reference but not called.
    
    // Fix common typos in certifications and tool names
    coverLetter = fixTypos(coverLetter);
    
    return coverLetter;
  },

  /**
   * DEPRECATED: Refinement pass - no longer called to save tokens
   * Kept for reference in case quality drops and refinement is needed again.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refineCoverLetter(
    originalLetter: string,
    _context: MasterContext
  ): Promise<string> {
    // Refinement disabled - return original unchanged
    return originalLetter;
  },

  /**
   * Generate application email
   * Returns JSON with separate subject and body fields
   */
  async generateApplicationEmail(context: MasterContext): Promise<{ subject: string; body: string }> {
    const { applicant, job, companyResearch, rawCV } = context;
    
    // Get output language
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[WRITER_AGENT] Generating email in language:', outputLang);

    const response = await callModel({
      task: 'write_email',
      prompt: `Write a brief application email.

APPLICANT: ${applicant?.name || 'Applicant'}
JOB TITLE: ${job?.title || 'Position'}
COMPANY: ${job?.companyName || 'Company'}
COMPANY DESCRIPTION: ${companyResearch?.description || 'Not available'}

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

EXAMPLE:
Subject: E-Commerce Manager Application - Sarah Chen - €150K Amazon Revenue
Body: "Hello,

I'm applying for the E-Commerce Manager role and wanted to highlight my track record of growing Amazon revenue to €150,000 across four markets. I've attached my CV and cover letter with specific details on how I can bring this same approach to your team. Happy to discuss at your convenience.

Best regards,
Sarah Chen"

Return ONLY valid JSON: {"subject": "...", "body": "..."}`,
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
      
      const parsed = JSON.parse(jsonContent);
      // Clean up any placeholder names that slipped through
      let cleanBody = (parsed.body || response.content)
        .replace(/Hi \[Name\],?/gi, 'Hello,')
        .replace(/Dear \[Name\],?/gi, 'Dear Hiring Team,')
        .replace(/\[Name\]/g, 'Hiring Manager');
      
      // Fix common typos in certifications and tool names
      cleanBody = fixTypos(cleanBody);
      const cleanSubject = fixTypos(parsed.subject || `Application for ${job?.title || 'Position'} at ${job?.companyName || 'Company'}`);
      
      return {
        subject: cleanSubject,
        body: cleanBody,
      };
    } catch (error) {
      console.error('[WriterAgent] Failed to parse email JSON:', error);
      // Fallback: try to extract subject from content
      const lines = response.content.split('\n');
      let subject = `Application for ${job?.title || 'Position'} at ${job?.companyName || 'Company'}`;
      let body = response.content;
      
      // Check if first line is a subject line
      if (lines[0]?.toLowerCase().startsWith('subject:')) {
        subject = lines[0].replace(/^subject:\s*/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      }
      
      // Fix common typos in fallback case too
      return { 
        subject: fixTypos(subject), 
        body: fixTypos(body) 
      };
    }
  },
};
