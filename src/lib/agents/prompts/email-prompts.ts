/**
 * Email Prompt Builders — Primary Application Email + Follow-Up Email
 * 
 * Extracted from unified-writer-agent.ts for modularity.
 * Contains prompt builders for both email types.
 */

import type { MasterContext } from '../types';

// =====================================================
// PRIMARY APPLICATION EMAIL
// =====================================================

/**
 * Build the primary application email user prompt
 */
export function buildApplicationEmailUserPrompt(context: MasterContext): string {
  const { applicant, job, match, rawCV, masterCV } = context;

  const outputLang = context.userLanguageOverride || context.detectedLanguage || 'en';
  const isGerman = outputLang === 'de';

  // Build JD-relevant context for the email
  const matchingSkillsList = match?.matchingSkills?.slice(0, 8).join(', ') || 'Not specified';
  const topResponsibilities = job?.responsibilities?.slice(0, 3).join('; ') || 'Not specified';
  const topRequirements = job?.requiredSkills?.slice(0, 5).join(', ') || 'Not specified';

  return `Write a brief application email that highlights the candidate's RELEVANT qualifications for this specific role.

APPLICANT: ${applicant?.name || 'Applicant'}
JOB TITLE: ${job?.title || 'Position'}
COMPANY: ${job?.companyName || 'Company'}

=== JOB-RELEVANT CONTEXT (use this to tailor the email) ===
TOP JD REQUIREMENTS: ${topRequirements}
KEY RESPONSIBILITIES: ${topResponsibilities}
CANDIDATE'S MATCHING SKILLS FOR THIS ROLE: ${matchingSkillsList}
FIT SCORE (INTERNAL CONTEXT ONLY — do NOT include this in the email): ${match?.score ?? 0}%

=== PRIMARY CV (main resume — ONLY source for claims) ===
${rawCV || 'No CV provided'}
${masterCV ? `
=== MASTER CV (comprehensive experience inventory — ONLY other source for claims) ===
${masterCV}` : ''}
${context.verifiedMetrics && context.verifiedMetrics.length > 0 ? `
=== VERIFIED METRICS (use ONLY these numbers — do not invent any others) ===
${context.verifiedMetrics.join('\n')}` : ''}
${match && match.missingSkills.length > 0 ? `
=== VERIFIED SKILL CONSTRAINT (BINDING — highest priority) ===

The following skills are verified as MISSING from the applicant's background.
Do NOT claim experience with any of these in the email:

SKILLS YOU MUST NOT CLAIM:
${match.missingSkills.join(', ')}

Instead of claiming missing skills, emphasize:
- Transferable skills from the applicant's actual background
- Relevant achievements with real metrics from either CV
- Adjacent competencies that demonstrate capability` : ''}

INSTRUCTIONS:
1. Subject line: MAXIMUM 60 characters total. Format below.
2. Body: Maximum 4 sentences (excluding greeting and signature)
3. Must include one specific number/achievement from EITHER the Primary CV or Master CV
4. MUST include an attachment reference sentence (see rules below)
5. End with specific availability, not "I look forward to hearing from you"
6. Start with "Hello," as the greeting (do NOT use placeholder like "[Name]")
7. Include one exact keyword from the job description in the body
8. NEVER mention the fit score, match percentage, or any numeric score in the email — this is internal data for context only

EMAIL SUBJECT LINE RULES:
- English: "Application: [Job Title], [Your Name]" (max 60 chars)
- German: "Bewerbung als [Job Title], [Your Name]" (max 60 chars)
- NEVER add extra descriptors, skill keywords, or metrics in the subject
- The subject line is for identification, not selling

SUBJECT LINE LENGTH — STRICT ENFORCEMENT:
Maximum: 60 characters. No exceptions.
If job title is too long:
1. Use only the PRIMARY title (before any "/" or "—" separator in the JD title)
2. Drop secondary titles or specializations
3. "Junior Webentwickler / E-Commerce" → use "Junior Webentwickler" only
After composing the subject line, COUNT characters. If over 60, shorten the job title portion.

ATTACHMENT REFERENCE (REQUIRED — never skip):
- Include a sentence referencing the attached CV and cover letter, written naturally in the email's language
- Vary the phrasing — do not use the same attachment sentence across different emails
- Place the attachment reference BEFORE the availability/closing sentence

=== LANGUAGE INSTRUCTION ===
${isGerman ? `CRITICAL: Write the ENTIRE email in GERMAN.
- Greeting: If the JD names a contact person, address them directly. Otherwise use a standard formal German greeting
- Closing: Use a professional German closing appropriate to the formality of the JD
- Subject line in German format
- Professional German business email style` : 'Write the email in English.'}

PUNCTUATION (HARD RULE): Never use em-dashes (—), en-dashes (–), or horizontal bars (―). Use commas, periods, colons, semicolons, or parentheses instead. Never use AI-tell phrases: "furthermore", "moreover", "leverage", "pivotal", "robust", "delve", "navigate the landscape".

EMAIL SIGNATURE REQUIREMENT:
The email MUST end with a professional closing and the applicant's full name on a separate line.
Applicant name for signature: ${applicant?.name || 'Applicant Name'}
Choose a closing appropriate to the language and tone of the JD. NEVER send an email without a signature.

Return ONLY valid JSON: {"subject": "...", "body": "..."}`;
}

const APPLICATION_EMAIL_SYSTEM_TEXT = `You are an expert at professional email communication for job applications.

<anti_hallucination_rules>
WHY THIS MATTERS: Application emails are often the first impression. A single fabricated skill or inflated claim destroys credibility when verified in interviews. These rules protect the candidate.

RULE 1 — SOURCE VERIFICATION:
Only reference tools, platforms, technologies, and experiences that are explicitly stated in EITHER the Primary CV or the Master CV. When the job description requires a skill the candidate lacks, describe genuinely related transferable experience from the source documents using broader terminology (e.g., "marketplace operations experience" instead of claiming a specific platform not in the CV).

RULE 2 — METRIC ACCURACY:
Use only exact numbers and metrics that appear in the source CVs. Do not invent percentages, revenue figures, counts, or growth numbers. If a number is not in the source documents, do not include it.

RULE 3 — INDUSTRY & COMPANY ACCURACY:
Only claim experience at companies and in industries documented in the source CVs. Do NOT attribute experience at one company to a different company. Do NOT claim the candidate worked at or managed operations for a company unless that exact company name appears in their CV experience section.

RULE 4 — LANGUAGE PROFICIENCY:
Reproduce language levels exactly as stated in the source CVs. Do not upgrade proficiency levels to match job requirements. B2 stays B2 — never label it as verhandlungssicher.

RULE 5 — VERIFICATION CHECK:
Before writing any claim, verify: "Does this exact fact appear in the provided source documents?" If uncertain, omit it.
</anti_hallucination_rules>

EMAIL SKILL ACCURACY (HIGHEST PRIORITY):
The email must NEVER claim experience with skills, tools, or technologies not documented in the Primary CV or Master CV. This overrides all other instructions. Sell what the applicant HAS. Never fabricate what they DON'T have.

GREETING RULE:
- If the job description names a specific hiring manager or contact person, address them by name
- If no name is available, use a professional but warm greeting appropriate to the language and market
- NEVER output "[Name]" or "Hi [Name]," as a literal placeholder in the final email
- NEVER use "Dear Sir/Madam" or "To Whom It May Concern"

STYLE: Brief, direct, and genuinely warm. The email should feel like it was written by a real person in 2 minutes — not generated by AI. Use natural phrasing. One strong opening hook, one clear value statement, one professional close. The tone should make the recipient want to open the attached CV immediately.

JOB-RELEVANCE PRIORITY (CRITICAL):
- The email MUST connect the candidate's experience to THIS SPECIFIC JOB's requirements
- Lead with a metric/achievement that relates to the JD's top requirements or responsibilities
- Reference at least one MATCHING SKILL from the provided list in the body
- Do NOT write a generic "I have X years of experience" email — tie every claim to a JD requirement
- The reader should immediately see WHY this candidate fits THIS role

DUAL-CV SOURCING:
- You have TWO sources: Primary CV and Master CV
- Use the MOST impressive metric from EITHER source that is RELEVANT to the JD
- The Master CV is a comprehensive inventory - mine it for the best JD-relevant achievement
- Every claim must exist in at least one CV source

EMAIL SUBJECT LINE FORMAT (STRICT):
- English: "Application: [Job Title], [Your Name]" (max 60 chars total)
- German: "Bewerbung als [Job Title], [Your Name]" (max 60 chars total)
- NEVER add extra descriptors, skill keywords, or metrics in the subject

ATTACHMENT REFERENCE (MANDATORY):
- Include a sentence referencing the attached CV and cover letter, written naturally in the email's language
- Vary the phrasing — do not use the same wording across emails
- Place BEFORE the closing/availability sentence
- NEVER skip the attachment reference

FORMATTING — HARD RULES (NON-NEGOTIABLE):

This is non-negotiable. Violation produces low-quality output that signals AI generation and causes the email to be ignored.

BANNED PUNCTUATION:
- Em-dashes (—), en-dashes (–), horizontal bars (―, ‒) — NEVER anywhere in the email
- Use commas, periods, colons, semicolons, or parentheses instead

WRONG: "Led product — shipped v2 in Q1" → RIGHT: "Led product; shipped v2 in Q1." or "Led product and shipped v2 in Q1."
WRONG: "Experience with Python, TypeScript — both production-grade" → RIGHT: "Experience with production-grade Python and TypeScript."

BANNED AI-TELL PHRASES — never write these anywhere in the email:
- "however", "furthermore", "moreover" (as sentence starters or filler transitions)
- "it is important to note", "it is worth noting"
- "delve", "delving", "dive deep"
- "in today's fast-paced world", "in the realm of", "navigate the landscape"
- "leverage" (when not a specific tech term)
- "tapestry", "robust" (overused), "pivotal", "synergy", "passionate about"
- "spearheaded" (overused), "orchestrated" (overused), "revolutionized"

Hyphens (-) are allowed in compound words, job titles, and date ranges only.

PROHIBITIONS:
- "I am writing to express my interest..."
- "I hope this email finds you well"
- "To Whom It May Concern"
- "I look forward to hearing from you"
- More than 4 sentences in the body (excluding greeting/signature)
- "[Name]" or any bracketed placeholder in the output
- Claiming skills not in either CV source
- Extra descriptors or keywords in subject line
- Mentioning fit score, match percentage, or any internal assessment score in the email

STRUCTURE:
Subject: "Application: [Job Title], [Your Name]" (max 60 chars)
Body: Greeting + One sentence hook with metric + one sentence value + attachment reference + availability/call to action + Signature

SIGNATURE REQUIREMENT:
- EVERY email MUST end with a signature
- Use a professional closing appropriate to the language and JD tone, followed by the applicant's full name on a new line
- The signature must be on separate lines from the body text
- NEVER omit the signature

Return ONLY valid JSON: {"subject": "...", "body": "..."}`;

/**
 * Build the primary application email system prompt as cacheable blocks.
 * Fully static — no dynamic content. Language and name come from the user prompt.
 */
export function buildApplicationEmailSystemBlocks(): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> {
  return [
    {
      type: 'text',
      text: APPLICATION_EMAIL_SYSTEM_TEXT,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

/**
 * Build the primary application email system prompt (plain string — kept for backward compat)
 * @deprecated Use buildApplicationEmailSystemBlocks() for prompt caching
 */
export function buildApplicationEmailSystemPrompt(_context: MasterContext): string {
  return APPLICATION_EMAIL_SYSTEM_TEXT;
}

// =====================================================
// FOLLOW-UP EMAIL
// =====================================================

/**
 * Build the follow-up email user prompt
 */
export function buildFollowUpEmailUserPrompt(context: MasterContext): string {
  const { applicant, job, match, applicationEmail } = context;

  const outputLang = context.userLanguageOverride || context.detectedLanguage || 'en';
  const isGerman = outputLang === 'de';
  const market = isGerman ? 'German' : 'US/UK';
  const recommendedDelay = isGerman ? 7 : 5;

  // Get a DIFFERENT achievement than what the primary email used
  // Primary email uses matchingSkills[0], so we use [1] or [2]
  const matchingSkills = match?.matchingSkills || [];
  const topAchievement = matchingSkills.length > 1 
    ? matchingSkills[1] 
    : matchingSkills.length > 0 
      ? matchingSkills[0] 
      : 'relevant professional experience';

  // Build company context from JD
  const companyContext = [
    job?.companyName ? `Company: ${job.companyName}` : '',
    job?.responsibilities?.slice(0, 3).join('; ') || '',
    job?.requiredSkills?.slice(0, 5).join(', ') || '',
  ].filter(Boolean).join('\n');

  return `Generate a follow-up email for a job application.

<context>
<primary_email_subject>${applicationEmail?.subject || ''}</primary_email_subject>
<primary_email_body>${applicationEmail?.body || ''}</primary_email_body>
<job_title>${job?.title || 'Position'}</job_title>
<company_name>${job?.companyName || 'Company'}</company_name>
<company_context>${companyContext}</company_context>
<applicant_name>${applicant?.name || 'Applicant'}</applicant_name>
<key_achievement>${topAchievement}</key_achievement>
<detected_language>${outputLang}</detected_language>
<market>${market}</market>
</context>

<instructions>
Generate a follow-up email with subject line and body.

SUBJECT LINE RULES:
- English format: "Following Up: [Role Title] Application, [Full Name]"
- German format: "Nachfrage: [Stellentitel] Bewerbung, [Full Name]"
- Must be 60 characters or fewer
- Must include the role title and applicant name

BODY RULES (4 elements, 60-80 words max):
1. Opening: Brief reference to original application with approximate timeframe ("last week")
2. Reaffirm interest: One sentence referencing something SPECIFIC about the company from the JD, a product, mission, growth metric, or team detail. NOT generic praise.
3. New value hook: Connect ONE specific achievement or skill from the applicant's profile to a SPECIFIC company need from the JD. This must be DIFFERENT from what was highlighted in the primary email.
4. Soft CTA: "I would welcome the chance to discuss..." or equivalent. One sentence only.

TONE RULES:
- Match the detected language (English or German)
- US market: Direct, confident
- UK market: Polite, measured
- German market: Formal Sie-form throughout. Address a specific person by name if known from the JD; otherwise use a standard formal German greeting
- Professional but warm, not stiff, not casual
- Confident, not desperate
- NO em-dashes (—), en-dashes (–), or horizontal bars (―) anywhere. Use commas, periods, semicolons, or parentheses instead.
- NO AI-tell phrases: "furthermore", "moreover", "leverage", "pivotal", "robust", "delve", "navigate the landscape", "tapestry", "spearheaded", "orchestrated"
- NO "just checking in", "I know you're busy", "I haven't heard back"
- NO re-attachment references, they already have the documents

ANTI-HALLUCINATION RULES (BINDING):

RULE 1 — SOURCE VERIFICATION:
The key_achievement, company_context, and primary_email are your ONLY sources of factual claims. Do NOT reference tools, platforms, technologies, or experiences not present in these sources.

RULE 2 — METRIC ACCURACY:
Do NOT invent percentages, revenue figures, counts, or growth numbers. If a specific number is not in the provided sources, do not include one.

RULE 3 — COMPANY ACCURACY:
Only reference company details (products, services, mission, culture) that appear in the company_context. Do NOT fabricate company facts or attribute the candidate's experience at one company to a different company.

RULE 4 — SKILL CONSTRAINT:
Do NOT claim the candidate has skills or experience not mentioned in the key_achievement or primary_email. The follow-up must highlight a DIFFERENT strength but it must still be a REAL one from the sources.

RULE 5 — VERIFICATION CHECK:
Before writing any claim, verify: "Does this exact fact appear in the provided sources?" If uncertain, omit it. If company_context is sparse, keep the company reference general but accurate to the JD.

OUTPUT FORMAT:
Respond with ONLY valid JSON:
{
  "subject": "...",
  "body": "...",
  "recommendedDelay": ${recommendedDelay}
}

The body should include greeting, paragraphs, and sign-off.
Set recommendedDelay to ${recommendedDelay}.
</instructions>`;
}

/**
 * Static follow-up email system text. No per-request variation so Anthropic
 * prompt caching can reuse the same prefix across calls. Language-specific
 * guidance and the recommended delay are carried by the user prompt
 * (<detected_language>, <market>, recommendedDelay).
 */
const FOLLOW_UP_EMAIL_SYSTEM_TEXT = `You are the follow-up email writer for Karko AI. You generate a brief, professional follow-up email that the applicant will send several business days after their initial application. The exact business-day delay is supplied in the user prompt; do not hard-code it in your output.

FORMATTING (HARD RULES, NON-NEGOTIABLE):
Violation produces low-quality output that signals AI generation.

BANNED PUNCTUATION:
- Em-dashes, en-dashes, horizontal bars: NEVER anywhere in the email
- Use commas, periods, colons, semicolons, or parentheses instead
WRONG: "Led product, shipped v2" with an em-dash, RIGHT: "Led product; shipped v2."

BANNED AI-TELL PHRASES (never write these):
- "however", "furthermore", "moreover" (as sentence starters or transitions)
- "it is important to note", "it is worth noting"
- "delve", "delving", "dive deep"
- "in today's fast-paced world", "in the realm of", "navigate the landscape"
- "leverage" (when not a specific tech term), "tapestry", "robust", "pivotal", "synergy"
- "spearheaded" (overused), "orchestrated" (overused), "revolutionized"

CRITICAL RULES:
- The follow-up must highlight a DIFFERENT strength than the primary email
- Keep the body under 80 words (excluding greeting and sign-off)
- Be specific about the company (reference something from the JD)
- Sound human and confident, not desperate or generic
- Match the language specified in <detected_language>. If German, write entirely in German with formal Sie-form and a professional German closing appropriate to the JD tone. Otherwise write in English.

Return ONLY valid JSON. No explanation or preamble.`;

/**
 * Build the follow-up email system prompt as cacheable blocks.
 * Fully static so the prompt-cache prefix stays stable.
 */
export function buildFollowUpEmailSystemBlocks(): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> {
  return [
    {
      type: 'text',
      text: FOLLOW_UP_EMAIL_SYSTEM_TEXT,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

/**
 * Build the follow-up email system prompt (plain string, kept for backward compat).
 * @deprecated Use buildFollowUpEmailSystemBlocks() for prompt caching.
 */
export function buildFollowUpEmailSystemPrompt(_context: MasterContext): string {
  return FOLLOW_UP_EMAIL_SYSTEM_TEXT;
}
