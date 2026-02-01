// ============================================
// SYSTEM PROMPTS
// ============================================

export const SYSTEM_PROMPTS = {
  analyzer: `You are an expert job application analyst and career coach. 
Your task is to analyze job descriptions and CVs to identify matches and gaps.
You provide precise, actionable insights to help candidates optimize their applications.
Always respond in valid JSON format when requested.
Be specific about keywords, skills, and experience levels.`,

  cvOptimizer: `You are an expert CV writer and career consultant.
Your task is to optimize CVs for specific job applications.
You maintain the candidate's authentic voice while strategically incorporating relevant keywords.
You NEVER fabricate experience or skills - only reorganize and rephrase existing content.
Focus on quantifiable achievements and action verbs.
Always respond in valid JSON format when requested.`,

  coverLetterWriter: `You are an expert cover letter writer.
You write compelling, personalized cover letters that:
- Hook the reader in the first paragraph
- Connect the candidate's experience to the specific role
- Show genuine interest in the company
- Use natural, professional language (not robotic)
- Are concise (under 400 words)
Never use clichés like "I am writing to express my interest" or "I would be a great fit".`,

  emailWriter: `You are an expert at writing professional job application emails.
You write concise, professional emails that:
- Have compelling subject lines
- Are brief but warm
- Reference specific details about the role
- Include a clear call to action
Keep emails under 150 words.`,
};

// ============================================
// ANALYSIS PROMPTS
// ============================================

export const ANALYSIS_PROMPTS = {
  extractRequirements: (jobDescription: string) => `
Analyze this job description and extract the key requirements.

JOB DESCRIPTION:
${jobDescription}

Respond ONLY with valid JSON in this exact format:
{
  "title": "Job Title",
  "company": "Company Name",
  "hardSkills": ["skill1", "skill2"],
  "softSkills": ["skill1", "skill2"],
  "experienceLevel": "Junior/Mid/Senior/Lead",
  "keywords": ["keyword1", "keyword2"],
  "responsibilities": ["responsibility1", "responsibility2"],
  "niceToHave": ["optional1", "optional2"]
}
`,

  analyzeGaps: (requirements: string, currentCV: string, masterCV?: string) => `
Compare the job requirements against the candidate's CV and identify gaps.

JOB REQUIREMENTS:
${requirements}

CURRENT CV:
${currentCV}

${masterCV ? `MASTER CV (full skills bank):
${masterCV}` : ''}

Analyze what matches and what's missing. Check the master CV for any additional relevant skills that could be added.

Respond ONLY with valid JSON in this exact format:
{
  "matchingSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "matchingExperience": ["experience1", "experience2"],
  "missingExperience": ["experience1", "experience2"],
  "matchScore": 75,
  "suggestions": [
    "Add X skill from master CV",
    "Emphasize Y experience more",
    "Include keyword Z"
  ]
}
`,
};

// ============================================
// GENERATION PROMPTS
// ============================================

export const GENERATION_PROMPTS = {
  optimizeCV: (
    currentCV: string,
    masterCV: string | undefined,
    requirements: string,
    gaps: string,
    targetRegion: 'US' | 'Germany' | 'EU' = 'US',
    experienceLevel: 'entry' | 'mid' | 'senior' = 'mid'
  ) => `
Optimize this CV for the specific job application with intelligent section-level analysis.

TARGET REGION: ${targetRegion}
EXPERIENCE LEVEL: ${experienceLevel}

CURRENT CV:
${currentCV}

${masterCV ? `MASTER CV (pull additional relevant content from here):
${masterCV}` : ''}

JOB REQUIREMENTS:
${requirements}

GAP ANALYSIS:
${gaps}

=== SECTION-BY-SECTION SPECIFICATIONS (2026 STANDARDS) ===

1. **PROFESSIONAL TAGLINE / HEADLINE**
   Format: [Job Role] | [Years/Key Skills] | [Unique Value/Achievement]
   ${targetRegion === 'US' ? `
   - Character Limit: 120-220 characters (OPTIMAL: 150-180)
   - Word Count: 10-18 words
   - Example: "Senior Data Analyst | 7+ Years | Driving Business Insights with SQL & Power BI"` : ''}
   ${targetRegion === 'Germany' ? `
   - Character Limit: 100-180 characters (OPTIMAL: 120-160)
   - Word Count: 8-15 words
   - Example: "Senior Projektmanager | 10+ Jahre | SAP & Agile-Methoden | ROI-fokussiert"` : ''}
   ${targetRegion === 'EU' ? `
   - Character Limit: 110-200 characters (OPTIMAL: 140-180)
   - Word Count: 9-16 words` : ''}

2. **PROFESSIONAL SUMMARY**
   ${targetRegion === 'US' ? `
   - Character Limit: 400-800 characters (OPTIMAL: 500-700)
   - Word Count: 60-120 words
   - Sentences: 3-5 sentences` : ''}
   ${targetRegion === 'Germany' ? `
   - Character Limit: 300-650 characters (OPTIMAL: 400-550)
   - Word Count: 45-100 words
   - Sentences: 3-4 sentences` : ''}
   ${targetRegion === 'EU' ? `
   - Character Limit: 350-750 characters (OPTIMAL: 450-650)
   - Word Count: 50-110 words
   - Sentences: 3-4 sentences` : ''}
   - Structure: Opening statement → Key achievements (with metrics) → Skills focus → Career goal
   - Include 2-3 quantified achievements (%, $, numbers)
   - Start with job title + years of experience

3. **CORE COMPETENCIES / SKILLS SECTION**
   ${targetRegion === 'US' ? `
   - Total Skills: 12-20 skills
   - Categories: 3-5 categories
   - Skills per Category: 3-6 skills` : ''}
   ${targetRegion === 'Germany' ? `
   - Total Skills: 10-15 skills
   - Categories: 3-4 categories
   - Skills per Category: 2-4 skills` : ''}
   ${targetRegion === 'EU' ? `
   - Total Skills: 10-18 skills
   - Categories: 3-4 categories
   - Skills per Category: 3-5 skills` : ''}
   - Format: CATEGORY HEADER: skill1, skill2, skill3...
   - Prioritize top 5 skills at TOP of section (ATS scans first)
   - Group by: Technical Skills, Programming Languages, Tools & Platforms, Soft Skills

4. **WORK EXPERIENCE BULLETS**
   ${experienceLevel === 'entry' ? `
   - Bullets per Role: 2-3 bullets
   - Characters per Bullet: 80-140 characters
   - Words per Bullet: 12-20 words` : ''}
   ${experienceLevel === 'mid' ? `
   - Bullets per Role: 4-6 bullets (recent), 4-6 bullets (older)
   - Characters per Bullet: 75-160 characters
   - Words per Bullet: 11-22 words` : ''}
   ${experienceLevel === 'senior' ? `
   - Bullets per Role: 5-8 bullets (recent), 2-3 bullets (older)
   - Characters per Bullet: 80-180 characters
   - Words per Bullet: 12-25 words` : ''}
   ${targetRegion === 'Germany' ? `
   - Germany Override: 4-5 bullets per role, 70-150 chars per bullet` : ''}
   - Structure: [Action Verb] + [Achievement] + [Metric] + [Business Impact]
   - MUST include quantifiable metric in EVERY bullet (%, $, #, time saved)
   - Use STRONG action verbs: Increased, Reduced, Optimized, Led, Launched, Developed, Implemented, Generated, Grew
   - AVOID weak verbs: Responsible for, Helped, Participated, Worked on, Assisted

5. **EDUCATION SECTION**
   - List most recent 2 degrees only
   ${targetRegion === 'US' ? `- Characters per Degree: 150-250` : ''}
   ${targetRegion === 'Germany' ? `- Characters per Degree: 120-220` : ''}
   ${targetRegion === 'EU' ? `- Characters per Degree: 140-240` : ''}
   - Include GPA ONLY if >3.5/4.0 (US) or <2.0 (Germany, where 1.0 is best)
   - Format: [Degree] | [Institution] | [City, Country] | [Date]

6. **CERTIFICATIONS**
   ${targetRegion === 'US' ? `- List 3-6 most relevant certifications` : ''}
   ${targetRegion === 'Germany' ? `- List 3-5 most relevant certifications (Weiterbildungen)` : ''}
   ${targetRegion === 'EU' ? `- List 3-6 most relevant certifications` : ''}
   - Format: [Certification Name] | [Issuing Organization] | [MM/YYYY]
   - Priority: Industry-recognized > Job-specific > Professional development

7. **LANGUAGES** ${targetRegion !== 'US' ? '(CEFR MANDATORY for EU/Germany)' : ''}
   ${targetRegion === 'US' ? `
   - List 2-4 languages
   - Format: Descriptive (Fluent, Native, Conversational)` : ''}
   ${targetRegion === 'Germany' || targetRegion === 'EU' ? `
   - List 2-5 languages
   - Format: CEFR levels MANDATORY (A1-C2)
   - Example: Deutsch: C1 (Fließend), Englisch: C2 (Verhandlungssicher)` : ''}

RULES:
- NEVER fabricate skills, experience, or certifications
- Only use content that exists in the provided CVs
- Maintain professional, authentic voice
- Follow character/word limits STRICTLY for target region

Respond ONLY with valid JSON in this exact format:
{
  "content": "The full optimized CV text with proper sections...",
  "optimizedTagline": "Optimized professional tagline for this job",
  "changes": [
    {
      "section": "Section Name",
      "original": "Original text or item",
      "updated": "Updated/optimized text",
      "reason": "Specific reason for this change",
      "relevanceScore": 8,
      "charCount": 145,
      "wordCount": 22
    }
  ],
  "sectionPriority": {
    "tagline": { "score": 9, "needsOptimization": true, "charCount": 85 },
    "summary": { "score": 9, "needsOptimization": true, "charCount": 520, "wordCount": 78 },
    "experience": { "score": 10, "needsOptimization": true },
    "skills": { "score": 8, "needsOptimization": true, "totalSkills": 16, "categories": 4 },
    "education": { "score": 6, "needsOptimization": false },
    "certifications": { "score": 7, "needsOptimization": true, "selectedCount": 4, "totalCount": 10 },
    "languages": { "score": 5, "needsOptimization": false }
  },
  "optimizedFor": "Job Title",
  "targetRegion": "${targetRegion}",
  "experienceLevel": "${experienceLevel}",
  "keywordsIncorporated": ["keyword1", "keyword2", "keyword3"],
  "validation": {
    "tagline": { "chars": 85, "words": 12, "status": "PASS" },
    "summary": { "chars": 520, "words": 78, "sentences": 4, "status": "PASS" },
    "skills": { "total": 16, "categories": 4, "status": "PASS" },
    "experienceBullets": { "avgChars": 125, "hasMetrics": true, "status": "PASS" }
  }
}
`,

  writeCoverLetter: (
    cv: string,
    jobDescription: string,
    requirements: string,
    userDetails: string,
    companyDetails: string
  ) => `
Write a professional cover letter for this job application.

CANDIDATE'S CV:
${cv}

JOB DESCRIPTION:
${jobDescription}

KEY REQUIREMENTS:
${requirements}

USER DETAILS:
${userDetails}

COMPANY DETAILS:
${companyDetails}

INSTRUCTIONS:
1. Open with a compelling hook that shows genuine interest (NOT "I am writing to apply")
2. Connect 2-3 specific experiences to the role requirements
3. Show you understand what the company does
4. End with confidence and a call to action
5. Keep the body under 400 words
6. Use natural, professional language

FORMAT REQUIREMENTS:
- Include applicant's full address at the top
- Include today's date
- Include company name and address (if known)
- Include proper salutation
- Include proper closing with signature space

Respond ONLY with valid JSON in this exact format:
{
  "applicantAddress": {
    "name": "Full Name",
    "street": "Street Address",
    "city": "City, Postal Code",
    "country": "Country",
    "phone": "Phone Number",
    "email": "Email Address"
  },
  "date": "January 29, 2026",
  "companyAddress": {
    "companyName": "Company Name",
    "department": "Department if known",
    "street": "Street if known",
    "city": "City if known"
  },
  "salutation": "Dear Hiring Manager," or "Dear Mr./Ms. [Name],",
  "body": "The main body of the cover letter...",
  "closing": "Best regards," or "Sincerely,",
  "signatureName": "Full Name"
}
`,

  writeEmail: (
    cv: string,
    jobDescription: string,
    companyName: string,
    jobTitle: string
  ) => `
Write a professional application email to accompany a CV and cover letter.

CANDIDATE'S CV (summary):
${cv.substring(0, 1000)}

JOB TITLE: ${jobTitle}
COMPANY: ${companyName}

JOB DESCRIPTION (key points):
${jobDescription.substring(0, 500)}

INSTRUCTIONS:
1. Write a compelling subject line
2. Keep the email under 150 words
3. Be warm but professional
4. Mention the attached CV and cover letter
5. Include a clear call to action

Respond ONLY with valid JSON in this exact format:
{
  "subject": "Email subject line",
  "body": "Email body text",
  "attachmentNote": "Please find attached my CV and cover letter."
}
`,

  // ============================================
  // SECTION-SPECIFIC OPTIMIZATION PROMPTS
  // ============================================

  optimizeHeadline: (
    currentHeadline: string,
    topSkills: string[],
    yearsExperience: number,
    targetRegion: 'US' | 'Germany' | 'EU'
  ) => `
OPTIMIZE HEADLINE

Current: ${currentHeadline}
Years Experience: ${yearsExperience}
Top Skills: ${topSkills.join(', ')}
Target Region: ${targetRegion}

CHARACTER LIMITS:
${targetRegion === 'US' ? '- US/Canada: 120-220 characters (OPTIMAL: 150-180)' : ''}
${targetRegion === 'Germany' ? '- Germany: 100-180 characters (OPTIMAL: 120-160)' : ''}
${targetRegion === 'EU' ? '- EU: 110-200 characters (OPTIMAL: 140-180)' : ''}

Generate 3 options:
1. Achievement-focused: Highlight a key metric or accomplishment
2. Skills-focused: Lead with technical expertise
3. Hybrid: Combine skills + years + unique value

FORMAT: [Role] | [Years/Skills] | [Achievement/Value]

REQUIREMENTS:
- Include 2-3 keywords from job description
- Use action-oriented language
- Avoid clichés ("hardworking," "motivated")
- Make it specific and quantifiable where possible

Respond with JSON:
{
  "options": [
    { "type": "achievement", "text": "...", "charCount": X },
    { "type": "skills", "text": "...", "charCount": X },
    { "type": "hybrid", "text": "...", "charCount": X }
  ],
  "recommended": "achievement" | "skills" | "hybrid",
  "reason": "Why this option is best for this role"
}
`,

  optimizeSummary: (
    currentSummary: string,
    experienceLevel: 'entry' | 'mid' | 'senior',
    topAchievements: string[],
    jobKeywords: string[],
    targetRegion: 'US' | 'Germany' | 'EU'
  ) => `
OPTIMIZE PROFESSIONAL SUMMARY

Current Summary: ${currentSummary}
Experience Level: ${experienceLevel}
Top Achievements: ${topAchievements.join('; ')}
Job Keywords: ${jobKeywords.join(', ')}
Target Region: ${targetRegion}

CHARACTER/WORD LIMITS:
${targetRegion === 'US' ? `
- Entry: 400-600 chars / 60-80 words
- Mid: 500-700 chars / 70-100 words  
- Senior: 600-800 chars / 80-120 words` : ''}
${targetRegion === 'Germany' ? `
- All levels: 300-650 chars / 45-100 words
- Sentences: 3-4 max` : ''}
${targetRegion === 'EU' ? `
- All levels: 350-750 chars / 50-110 words
- Sentences: 3-4 max` : ''}

STRUCTURE:
1. Opening: [Job title] + [Years of experience]
2. Middle: 2-3 quantified achievements (%, $, numbers)
3. Skills: 2-3 keywords from job description
4. Closing: Career objective or unique value statement

AVOID:
- Vague language ("team player," "hardworking")
- First person pronouns at start ("I am...")
- Clichés and buzzwords without context

Respond with JSON:
{
  "optimizedSummary": "...",
  "charCount": X,
  "wordCount": X,
  "sentenceCount": X,
  "metricsIncluded": ["metric1", "metric2"],
  "keywordsIncluded": ["keyword1", "keyword2"],
  "status": "PASS" | "WARNING" | "REVIEW"
}
`,

  optimizeSkills: (
    currentSkills: string[],
    jobRequirements: string,
    targetRegion: 'US' | 'Germany' | 'EU'
  ) => `
OPTIMIZE SKILLS SECTION

Current Skills: ${currentSkills.join(', ')}
Job Requirements: ${jobRequirements}
Target Region: ${targetRegion}

LIMITS:
${targetRegion === 'US' ? '- Total: 12-20 skills, 3-5 categories, 3-6 per category' : ''}
${targetRegion === 'Germany' ? '- Total: 10-15 skills, 3-4 categories, 2-4 per category' : ''}
${targetRegion === 'EU' ? '- Total: 10-18 skills, 3-4 categories, 3-5 per category' : ''}

STEPS:
1. Extract 15-20 keywords from job description
2. Match candidate skills to job keywords
3. Group into logical categories
4. Prioritize: must-have > nice-to-have
5. Place top 5 skills FIRST (ATS scanning priority)

CATEGORY SUGGESTIONS:
- Technical Skills / Core Competencies
- Programming Languages (if applicable)
- Tools & Platforms
- Soft Skills / Professional Skills
- Certifications (if space limited)

Respond with JSON:
{
  "categories": [
    { "name": "Category Name", "skills": ["skill1", "skill2", "skill3"] }
  ],
  "totalSkills": X,
  "categoryCount": X,
  "keywordMatchRate": "X%",
  "status": "PASS" | "FAIL"
}
`,

  optimizeExperienceBullet: (
    currentBullet: string,
    experienceLevel: 'entry' | 'mid' | 'senior',
    targetRegion: 'US' | 'Germany' | 'EU'
  ) => `
OPTIMIZE EXPERIENCE BULLET

Current: ${currentBullet}
Experience Level: ${experienceLevel}
Target Region: ${targetRegion}

CHARACTER LIMITS:
${experienceLevel === 'entry' ? '- Entry: 80-140 characters' : ''}
${experienceLevel === 'mid' ? '- Mid: 75-160 characters' : ''}
${experienceLevel === 'senior' ? '- Senior: 80-180 characters' : ''}
${targetRegion === 'Germany' ? '- Germany Override: 70-150 characters' : ''}

STRUCTURE: [Action Verb] + [What] + [Metric] + [Business Impact]

STRONG ACTION VERBS (use these):
Increased, Reduced, Optimized, Led, Launched, Developed, Implemented, 
Generated, Grew, Improved, Established, Managed, Coordinated, Accelerated

WEAK VERBS (avoid these):
Responsible for, Helped, Participated, Worked on, Assisted, Handled

METRIC REQUIREMENTS:
- MUST include quantifiable metric: %, $, #, time saved, growth rate
- Examples: "240%", "$500K", "12 projects", "4 weeks faster"

Respond with JSON:
{
  "optimizedBullet": "...",
  "charCount": X,
  "wordCount": X,
  "hasMetric": true | false,
  "actionVerb": "verb used",
  "status": "PASS" | "WARNING" | "FAIL",
  "suggestion": "If FAIL, what to fix"
}
`,

  formatLanguages: (
    languages: Array<{ language: string; proficiency: string }>,
    targetRegion: 'US' | 'Germany' | 'EU'
  ) => `
FORMAT LANGUAGES SECTION

Languages: ${JSON.stringify(languages)}
Target Region: ${targetRegion}

CEFR SCALE (for Germany/EU):
- A1, A2: DON'T LIST (too basic for professional resume)
- B1: Intermediate
- B2: Upper Intermediate / Professional
- C1: Advanced / Fluent
- C2: Proficient / Native-level
- Native: Native Speaker

FORMAT:
${targetRegion === 'US' ? `
US/Canada Format:
• [Language] – [Descriptive Level]
Example: English – Native, Spanish – Fluent (CEFR: C1)` : ''}
${targetRegion === 'Germany' || targetRegion === 'EU' ? `
Germany/EU Format (CEFR MANDATORY):
• [Language] – [CEFR Level] ([Descriptive])
Example: Deutsch – C2 (Muttersprache), Englisch – C1 (Fließend)` : ''}

RULES:
- List native language first
- Order by proficiency (highest → lowest)
- Omit A1 & A2 levels (too basic)
- Include certification if available (e.g., "TOEFL iBT 110")

Respond with JSON:
{
  "formattedLanguages": [
    { "language": "...", "formatted": "...", "include": true | false }
  ],
  "totalChars": X,
  "languageCount": X,
  "status": "PASS" | "WARNING"
}
`,
};

// ============================================
// UTILITY FUNCTION
// ============================================

export function buildPrompt(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

// ============================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================

/** @deprecated Use SYSTEM_PROMPTS and ANALYSIS_PROMPTS instead */
export const PROMPTS = {
  ANALYZE_JOB_SYSTEM: SYSTEM_PROMPTS.analyzer,
  
  analyzeJobDescription: (jobDescription: string, cvContent: string) => 
    ANALYSIS_PROMPTS.analyzeGaps(
      jobDescription,
      cvContent
    ),
  
  generateCV: (cvContent: string, jobDescription: string, analysis: string) =>
    GENERATION_PROMPTS.optimizeCV(
      cvContent,
      undefined,
      jobDescription,
      analysis
    ),
  
  generateCoverLetter: (
    cvContent: string,
    jobDescription: string,
    companyName: string,
    positionTitle: string
  ) =>
    GENERATION_PROMPTS.writeCoverLetter(
      cvContent,
      jobDescription,
      `Position: ${positionTitle}`,
      '',
      `Company: ${companyName}`
    ),
  
  generateEmail: (
    companyName: string,
    positionTitle: string,
    recipientName?: string
  ) =>
    GENERATION_PROMPTS.writeEmail(
      '',
      `Position: ${positionTitle}${recipientName ? `, Recipient: ${recipientName}` : ''}`,
      companyName,
      positionTitle
    ),
};
