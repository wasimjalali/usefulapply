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

    // 1) Generate optimized CV
    emit({ type: 'progress', percent: 55, message: 'Generating optimized CV...' });
    const optimizedCV = await this.generateOptimizedCV(context);
    context.optimizedCV = optimizedCV;

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
   * Generate optimized CV content
   * Returns both the optimized CV and a list of changes made
   */
  async generateOptimizedCV(context: MasterContext): Promise<{ content: string; changes: Array<{ section: string; before: string; after: string; reason: string }> }> {
    const { applicant, job, companyResearch, match, rawCV, masterCV } = context;

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

=== OUTPUT FORMAT ===

Return ONLY valid JSON in this exact format:
{
  "optimizedCV": "The complete optimized CV as plain text...",
  "changes": [
    {
      "section": "Headline",
      "before": "Original headline text",
      "after": "New optimized headline",
      "reason": "Aligned with job title requirements"
    },
    {
      "section": "Professional Summary",
      "before": "Original summary...",
      "after": "New summary...",
      "reason": "Added relevant keywords and metrics"
    }
  ]
}

CRITICAL RULES:
- Do NOT use markdown formatting (no **, *, ---, etc.)
- Use plain text only with standard bullet points (•)
- Section headers in UPPERCASE
- NEVER invent skills, experiences, or achievements
- Keep CV under 2 pages worth of content
- Only include changes that were actually made`,
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
      return {
        content: parsed.optimizedCV || response.content,
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
          content: content,
          changes: [],
        };
      }
      return {
        content: response.content,
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
${companyResearch?.address || '[OMIT IF UNCERTAIN]'}

=== COMPANY ADDRESS VERIFICATION ===
CRITICAL: The company address MUST be copied EXACTLY as provided in the COMPANY RESEARCH section.
- Copy the address CHARACTER FOR CHARACTER - no modifications
- DO NOT "correct" spelling of city names
- DO NOT interpret or expand abbreviations
- "Kastl" must stay "Kastl" - NEVER change to "Kastellaun" or any other city
- "84556 Kastl" must stay exactly "84556 Kastl"
- If Company Address shows "Not available" or is empty, OMIT the address line entirely
- When in doubt, use ONLY: "Hiring Manager\\n${companyResearch?.name || job?.companyName || 'Company'}" without any address
- NEVER guess, invent, or "improve" address details

CORRECT EXAMPLE (if address is "Maierhof 1, 84556 Kastl"):
Hiring Manager
Fliegl Agro-Center GmbH
Maierhof 1, 84556 Kastl

WRONG EXAMPLE (AI modified the city):
Hiring Manager  
Fliegl Agro-Center GmbH
Kastellaun, Rheinland  ← WRONG! This is a different city!

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
    
    // Refinement pass for quality improvement
    if (coverLetter && coverLetter.length > 100 && emit) {
      emit({ type: 'progress', percent: 80, message: 'Polishing cover letter...' });
      coverLetter = await this.refineCoverLetter(coverLetter, context);
    }
    
    // Fix common typos in certifications and tool names
    coverLetter = fixTypos(coverLetter);
    
    return coverLetter;
  },

  /**
   * Refinement pass - reviews and improves cover letter quality
   * Uses same model with "critical editor" persona
   */
  async refineCoverLetter(
    originalLetter: string,
    context: MasterContext
  ): Promise<string> {
    const { applicant, job, companyResearch, rawCV, masterCV } = context;

    const response = await callModel({
      task: 'refine_cover_letter',
      prompt: `You are a critical editor reviewing a cover letter. Your job is to improve it, not praise it.

=== ORIGINAL COVER LETTER ===
${originalLetter}

=== CANDIDATE'S ACTUAL CV (for verification) ===
${rawCV}
${masterCV ? `\n\nADDITIONAL EXPERIENCE:\n${masterCV}` : ''}

=== CONTEXT ===
Applicant: ${applicant?.name}
Target Role: ${job?.title} at ${job?.companyName}
Company Research Available: ${companyResearch ? 'Yes' : 'No'}

=== EDITING CHECKLIST ===

1. HALLUCINATION CHECK (MOST IMPORTANT - DO THIS FIRST):
   - Does the letter claim any tools/platforms not in the candidate's CV?
   - If yes: REMOVE those claims or replace with tools actually in the CV
   - Does the letter contain any percentages or metrics not in the CV?
   - If yes: REMOVE those metrics or replace with actual metrics from CV
   - Does the letter claim industry experience the candidate doesn't have?
   - If yes: REMOVE or generalize ("e-commerce experience" not "agricultural sector experience")
   - Common hallucinations to check: Shopify, Magento, AWS, specific percentages like "67%", dollar amounts
   - If the letter claims experience the CV doesn't show, REWRITE using only CV content

2. OPENING CHECK:
   - Does it start with a cliche like "I am writing to apply" or "I am excited"?
   - If yes: Rewrite to lead with an achievement or insight
   
3. SPECIFICITY CHECK:
   - Are there at least 2 specific metrics/numbers?
   - If no: Add metrics ONLY if they exist in the CV - NEVER invent metrics
   
4. COMPANY KNOWLEDGE CHECK:
   - Does it mention something specific about the company?
   - If no and research is available: Add a specific reference
   
5. CLOSING CHECK:
   - Does it end with "Thank you for considering" or "I look forward to hearing"?
   - If yes: Rewrite with a confident, specific call to action
   
6. TONE CHECK:
   - Does any sentence sound robotic or AI-generated?
   - If yes: Rewrite in more natural language
   
7. LENGTH CHECK:
   - Is it between 250-350 words?
   - If too long: Cut filler. If too short: Add specific value from CV only.

=== BLACKLISTED PHRASES TO REMOVE ===
- "I am writing to apply/express interest"
- "I am excited/passionate about"
- "I believe I would be a great fit"
- "Thank you for considering my application"
- "I look forward to hearing from you"
- "Please find attached"
- Any "I am a [adjective] professional"

=== OUTPUT INSTRUCTIONS ===
Return ONLY the improved cover letter. No explanations, no "Here's the improved version", no markdown. Just the plain text letter.

If the original is already excellent (rare), return it unchanged.`,
      systemPrompt: 'You are a ruthless editor focused on ACCURACY and quality. Your #1 priority is removing any claims not in the CV. Cut cliches without mercy. Add specificity where vague, but NEVER invent facts. Return only the improved letter.',
    });

    return response.content || originalLetter;
  },

  /**
   * Generate application email
   * Returns JSON with separate subject and body fields
   */
  async generateApplicationEmail(context: MasterContext): Promise<{ subject: string; body: string }> {
    const { applicant, job, companyResearch, rawCV } = context;

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
