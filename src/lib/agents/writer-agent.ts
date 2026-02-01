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
   - Maximum 8-10 skills total
   - Prioritize skills that match job requirements
   - Can add skills from Master CV if relevant to job
   - Group into 2-3 categories if applicable

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
      const parsed = JSON.parse(response.content);
      return {
        content: parsed.optimizedCV || response.content,
        changes: parsed.changes || [],
      };
    } catch {
      // Fallback if JSON parsing fails
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
    const { applicant, job, companyResearch, rawCV } = context;
    
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
What They Do: ${companyResearch.description || 'Not available'}
Company Values: ${companyResearch.values?.join(', ') || 'Not available'}
Culture: ${companyResearch.culture?.join(', ') || 'Not available'}
Recent News: ${companyResearch.recentNews?.[0] || 'None found'}
` : 'No company research available - focus on role requirements.'}

=== CANDIDATE BACKGROUND ===
${rawCV}

=== EXAMPLE OF EXCELLENT COVER LETTER ===
[Opening - hooks with achievement, shows understanding of company challenge]
"After leading Amazon marketplace operations that generated 150K in revenue across four markets, I've developed a keen eye for identifying underperforming product listings and transforming them into top sellers. When I saw your E-Commerce Manager role, I recognized the exact challenge I've been solving for the past three years."

[Value paragraph - specific experience matched to their needs]
"At my previous company, I inherited a stagnant Amazon presence with declining sales. Within six months, I restructured the PPC strategy, optimized 200+ listings for the A9 algorithm, and built an automated inventory system that cut stockouts by 40%. The result: a 67% increase in revenue and expansion into two new markets. I'm looking to bring this same systematic approach to your team."

[Company knowledge - shows research]
"I've been following your expansion into the agricultural equipment space, and I'm particularly impressed by your recent sustainability initiative. My experience optimizing supply chains for seasonal products aligns well with the unique inventory challenges in this sector."

[Confident close - specific and action-oriented]
"I'd welcome the opportunity to discuss how my marketplace optimization experience can accelerate your e-commerce growth. I'm available for a call this week or next at your convenience."
=== END EXAMPLE ===

INSTRUCTIONS:
1. Use the Problem-Solution format shown in the example
2. Include at least TWO specific metrics from the candidate's background
3. Reference something specific from the company research (if available)
4. Keep between 250-350 words
5. Do NOT copy the example - adapt it to this specific candidate and role
6. Verify every claim exists in the CV - never invent achievements
7. Include proper header with applicant contact info and date

Write the complete cover letter now:`,
      systemPrompt: `You are an expert cover letter writer specializing in the US and UK job markets.

WRITING STYLE:
- Write like a confident professional, not a job applicant begging for consideration
- Use active voice and strong verbs
- Be specific and concrete - never vague
- Sound human - slightly conversational, not robotic
- Match the company's tone (startup = casual, corporate = professional)

STRUCTURE (Problem-Solution Format - highest performing in 2025):
1. Opening hook (1-2 sentences): Immediately show you understand their challenge or mention a specific achievement relevant to the role
2. Value paragraph (3-4 sentences): Connect YOUR specific experience to THEIR specific needs with metrics
3. Company knowledge (2-3 sentences): Reference something specific about the company - recent news, values, or products
4. Confident close (1-2 sentences): Clear call to action without desperation

TONE CALIBRATION:
- Startup/Tech: Casual, enthusiastic, show personality
- Corporate/Enterprise: Professional, measured, formal
- Creative industry: Show creativity in writing style
- Default to professional-casual if unsure

ABSOLUTE PROHIBITIONS - NEVER USE THESE:
- "I am writing to apply for..." or "I am excited to apply for..."
- "I believe I would be a great fit..."
- "Thank you for considering my application..."
- "To Whom It May Concern"
- "I am confident that..."
- "I would be a valuable asset..."
- "I am a [adjective] professional..."
- "References available upon request"
- "Please find attached..."
- "I look forward to hearing from you"
- Any phrase containing "passionate" without specific evidence
- Em-dashes - use regular dashes instead

WHAT TO DO INSTEAD:
- Instead of "I am excited to apply": Lead with an achievement or insight
- Instead of "great fit": Show the fit through specific examples
- Instead of "valuable asset": Demonstrate value with metrics
- Instead of generic close: "I'd welcome the chance to discuss how my [specific skill] can help [specific company goal]."

OUTPUT: Plain text only. No markdown. No bullet points. Professional letter format.`,
    });

    let coverLetter = response.content || '';
    
    // Refinement pass for quality improvement
    if (coverLetter && coverLetter.length > 100 && emit) {
      emit({ type: 'progress', percent: 80, message: 'Polishing cover letter...' });
      coverLetter = await this.refineCoverLetter(coverLetter, context);
    }
    
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
    const { applicant, job, companyResearch } = context;

    const response = await callModel({
      task: 'refine_cover_letter',
      prompt: `You are a critical editor reviewing a cover letter. Your job is to improve it, not praise it.

=== ORIGINAL COVER LETTER ===
${originalLetter}

=== CONTEXT ===
Applicant: ${applicant?.name}
Target Role: ${job?.title} at ${job?.companyName}
Company Research Available: ${companyResearch ? 'Yes' : 'No'}

=== EDITING CHECKLIST ===

1. OPENING CHECK:
   - Does it start with a cliche like "I am writing to apply" or "I am excited"?
   - If yes: Rewrite to lead with an achievement or insight
   
2. SPECIFICITY CHECK:
   - Are there at least 2 specific metrics/numbers?
   - If no: Add metrics from the context if available
   
3. COMPANY KNOWLEDGE CHECK:
   - Does it mention something specific about the company?
   - If no and research is available: Add a specific reference
   
4. CLOSING CHECK:
   - Does it end with "Thank you for considering" or "I look forward to hearing"?
   - If yes: Rewrite with a confident, specific call to action
   
5. TONE CHECK:
   - Does any sentence sound robotic or AI-generated?
   - If yes: Rewrite in more natural language
   
6. LENGTH CHECK:
   - Is it between 250-350 words?
   - If too long: Cut filler. If too short: Add specific value.

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
      systemPrompt: 'You are a ruthless editor. Your job is to make this cover letter sound human, specific, and compelling. Cut cliches without mercy. Add specificity where vague. Return only the improved letter.',
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

Return ONLY valid JSON: {"subject": "...", "body": "..."}`,
      systemPrompt: `You are an expert at professional email communication for job applications.

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

STRUCTURE:
Subject: [Job Title] Application - [Your Name] - [One Key Qualifier]
Body: One sentence hook + one sentence value + one sentence call to action

EXAMPLE:
Subject: E-Commerce Manager Application - Sarah Chen - 150K Amazon Revenue
Body: "Hi [Name], I'm applying for the E-Commerce Manager role and wanted to highlight my track record of growing Amazon revenue by 67% across four markets. I've attached my CV and cover letter with specific details on how I can bring this same approach to [Company]. Happy to discuss at your convenience."

Return ONLY valid JSON: {"subject": "...", "body": "..."}`,
      jsonMode: true,
    });

    try {
      const parsed = JSON.parse(response.content);
      return {
        subject: parsed.subject || `Application for ${job?.title || 'Position'} at ${job?.companyName || 'Company'}`,
        body: parsed.body || response.content,
      };
    } catch {
      // Fallback: try to extract subject from content
      const lines = response.content.split('\n');
      let subject = `Application for ${job?.title || 'Position'} at ${job?.companyName || 'Company'}`;
      let body = response.content;
      
      // Check if first line is a subject line
      if (lines[0]?.toLowerCase().startsWith('subject:')) {
        subject = lines[0].replace(/^subject:\s*/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      }
      
      return { subject, body };
    }
  },
};
