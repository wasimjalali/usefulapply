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
   * Generate cover letter
   */
  async generateCoverLetter(context: MasterContext): Promise<string> {
    const { applicant, job, companyResearch, rawCV } = context;
    
    // Get today's date in a professional format
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const response = await callModel({
      task: 'write_cover_letter',
      prompt: `Write a professional cover letter.

TODAY'S DATE: ${today}

APPLICANT:
Name: ${applicant?.name || 'Applicant'}
Email: ${applicant?.email || ''}
Phone: ${applicant?.phone || ''}
Address: ${applicant?.address || ''}

TARGET JOB:
Title: ${job?.title || 'Position'}
Company: ${job?.companyName || 'Company'}
${job?.location ? `Location: ${job.location}` : ''}
${job?.startDate ? `Start Date: ${job.startDate}` : ''}
${job?.expectedSalary ? `Salary Range: ${job.expectedSalary}` : ''}
Key Requirements: ${job?.requiredSkills?.slice(0, 5).join(', ') || 'N/A'}

${companyResearch ? `COMPANY RESEARCH:
Company: ${companyResearch.name}
Address: ${companyResearch.address || 'N/A'}
Description: ${companyResearch.description || 'N/A'}
Values: ${companyResearch.values?.join(', ') || 'N/A'}
Culture: ${companyResearch.culture?.join(', ') || 'N/A'}
Recent News: ${companyResearch.recentNews?.[0] || 'N/A'}` : ''}

CANDIDATE BACKGROUND (from CV):
${rawCV}

Write a cover letter that:
1. Has proper header with applicant contact info
2. Includes the date (${today})
3. Addresses the company (include address if available)
4. Opens with a compelling hook about the specific role
5. Highlights 2-3 achievements with metrics FROM THE CV
6. Shows knowledge of the company (use research if provided)
7. Mentions start date/salary expectations if provided
8. Ends with a clear call to action
9. Signs off with the applicant's name

IMPORTANT FORMATTING:
- Do NOT use markdown formatting (no ** or * for bold/italic)
- Use plain text only
- Names should be written normally without any special formatting

Format: Professional business letter, 250-350 words.`,
      systemPrompt: 'You are an expert cover letter writer. Create personalized, compelling cover letters. Only reference achievements that exist in the provided CV. NEVER use markdown formatting like ** or * - use plain text only.',
    });

    return response.content;
  },

  /**
   * Generate application email
   * Returns JSON with separate subject and body fields
   */
  async generateApplicationEmail(context: MasterContext): Promise<{ subject: string; body: string }> {
    const { applicant, job, companyResearch } = context;

    const response = await callModel({
      task: 'write_email',
      prompt: `Write a professional job application email.

APPLICANT:
Name: ${applicant?.name || 'Applicant'}
Email: ${applicant?.email || ''}

JOB:
Title: ${job?.title || 'Position'}
Company: ${job?.companyName || 'Company'}
${companyResearch?.description ? `About: ${companyResearch.description}` : ''}

Write a brief application email (100-150 words).

IMPORTANT: Return your response as JSON with this exact format:
{
  "subject": "Application for [Job Title] at [Company]",
  "body": "Dear Hiring Team,\\n\\n[email body without subject line]\\n\\nBest regards,\\n[Name]"
}

The body should NOT include "Subject:" - only the email content starting with the greeting.`,
      systemPrompt: 'You are an expert at professional email communication. Return ONLY valid JSON with subject and body fields. No markdown, no extra text.',
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
