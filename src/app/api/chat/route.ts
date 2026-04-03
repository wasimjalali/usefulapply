import { NextRequest, NextResponse } from 'next/server';
import { callModel } from '@/lib/models';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';

// Input/output limits
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_SCREENING_MESSAGE_LENGTH = 5_000;
const MAX_CHAT_MESSAGES_PER_SESSION = 10;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatContext {
  hasCV: boolean;
  cvSummary?: string;
  hasAnalysis: boolean;
  jobTitle?: string;
  company?: string;
  // Master CV and certifications
  hasMasterCV?: boolean;
  masterCVSummary?: string;
  hasCertifications?: boolean;
  certificationsCount?: number;
  certificationsList?: string;
  // Chat history for context
  chatHistory?: ChatMessage[];
  // Generated content awareness
  hasGeneratedCV?: boolean;
  hasGeneratedCoverLetter?: boolean;
  hasGeneratedEmail?: boolean;
  // Screening question mode
  mode?: 'screening_answers';
  jobDescription?: string;
  matchingSkills?: string[];
  missingSkills?: string[];
  generatedCVSummary?: string;
  companyResearchSummary?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    const rateLimitResult = checkRateLimit(`chat:${clientIP}`, RATE_LIMITS['chat']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    // Authentication: require logged-in user for chat (costs API money)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to use chat.' },
        { status: 401 }
      );
    }

    const { message, context } = await req.json() as {
      message: string;
      context: ChatContext
    };

    const isScreeningMode = context.mode === 'screening_answers';
    const maxMessageLength = isScreeningMode ? MAX_SCREENING_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH;

    // Input length validation
    if (message && message.length > maxMessageLength) {
      return NextResponse.json(
        { error: `Message is too long (${message.length} chars). Maximum: ${maxMessageLength} characters.` },
        { status: 400 }
      );
    }

    // Plan gate: screening answers require Max or Pro plan
    if (isScreeningMode) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single() as { data: { subscription_tier: string } | null };

      const tier = profile?.subscription_tier;
      if (tier !== 'max' && tier !== 'pro') {
        return NextResponse.json(
          { error: 'Screening question answers are available on the Max plan.' },
          { status: 403 }
        );
      }
    }

    // Chat message limit per session (count user messages in history)
    const userMessageCount = context.chatHistory?.filter(m => m.role === 'user').length ?? 0;
    if (userMessageCount >= MAX_CHAT_MESSAGES_PER_SESSION) {
      return NextResponse.json(
        { error: 'Chat message limit reached for this application. Start a new application to continue chatting.', code: 'CHAT_LIMIT_REACHED' },
        { status: 429 }
      );
    }

    const systemPrompt = isScreeningMode
      ? buildScreeningPrompt(context)
      : buildSystemPrompt(context);

    // Build conversation history for the model
    const conversationHistory = context.chatHistory?.slice(-10).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })) || [];

    // Add current message
    conversationHistory.push({
      role: 'user',
      content: message,
    });

    // Use Claude for chat — screening mode gets higher token budget
    const response = await callModel({
      task: 'general_chat',
      prompt: message,
      systemPrompt,
      conversationHistory,
      ...(isScreeningMode && { maxTokens: 3000, temperature: 0.5 }),
    });
    const reply = response.content;

    const actions = isScreeningMode ? [] : extractActions(reply, context);

    return NextResponse.json({ 
      success: true, 
      reply,
      actions 
    });
  } catch (error) {
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/chat',
      method: 'POST',
    });
    await posthog.flush();
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Chat request failed' },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(context: ChatContext): string {
  let prompt = `<identity>
You are Karko AI, an intelligent job application assistant. You help users optimize their CVs, write cover letters, create application emails, and navigate the job application process. You are friendly, professional, and concise.
</identity>

<current_user_state>
CV uploaded: ${context.hasCV ? 'Yes' : 'No'}
Master CV uploaded: ${context.hasMasterCV ? 'Yes' : 'No'}
Certifications uploaded: ${context.hasCertifications ? `Yes (${context.certificationsCount} documents)` : 'No'}
Job analyzed: ${context.hasAnalysis ? 'Yes' : 'No'}`;

  if (context.hasAnalysis) {
    prompt += `
Current application: ${context.jobTitle || 'Unknown position'} at ${context.company || 'Unknown company'}`;
  }

  if (context.hasGeneratedCV || context.hasGeneratedCoverLetter || context.hasGeneratedEmail) {
    prompt += `
Generated documents:`;
    if (context.hasGeneratedCV) prompt += ` CV (in CV Panel)`;
    if (context.hasGeneratedCoverLetter) prompt += ` | Cover Letter (in Cover Letter Panel)`;
    if (context.hasGeneratedEmail) prompt += ` | Email (in Email Panel)`;
  }

  prompt += `
</current_user_state>`;

  if (context.hasMasterCV && context.masterCVSummary) {
    prompt += `

<master_cv_summary>
${context.masterCVSummary}
</master_cv_summary>`;
  }

  if (context.hasCertifications && context.certificationsList) {
    prompt += `

<certifications>
${context.certificationsList}
</certifications>`;
  }

  prompt += `

<response_rules>
1. BREVITY: Under 2-3 sentences. Short, direct, and helpful. If a question requires slightly more detail to be genuinely useful, use up to 3 sentences. Never sacrifice helpfulness for arbitrary brevity.
2. CONTEXT AWARENESS: Use the current_user_state to give relevant answers. If documents have been generated, tell the user where to find them (e.g., "Your CV is ready in the CV Panel"). If no CV is uploaded, guide them to upload one first.
3. SCOPE: Only discuss job applications, CVs, cover letters, emails, career advice, and the application process. If asked about unrelated topics, politely redirect: "I specialize in job applications — how can I help with yours?"
4. TONE: Warm, professional, and encouraging. Sound like a helpful career coach, not a robot. Use the user's name if available.
5. ACCURACY: Only reference skills, experience, and qualifications that exist in the user's uploaded documents. Do not make assumptions about the user's background.
6. LANGUAGE: Respond in the same language the user writes in. If they write in German, respond in German. If in English, respond in English.
7. GUIDANCE: When the user needs to take a next step, be specific about what to do (e.g., "Paste a job description to start" rather than vague instructions).
8. NO REPETITION: Do not repeat information the user already knows or that was just stated.
</response_rules>`;

  return prompt;
}

function buildScreeningPrompt(context: ChatContext): string {
  let prompt = `<identity>
You are Karko AI, an expert at answering job application screening questions. You draft personalized, compelling answers based on the applicant's CV and the target job description.
</identity>

<application_context>
Job Title: ${context.jobTitle || 'Unknown position'}
Company: ${context.company || 'Unknown company'}`;

  if (context.jobDescription) {
    prompt += `
Job Description:
${context.jobDescription.substring(0, 3000)}`;
  }

  if (context.matchingSkills && context.matchingSkills.length > 0) {
    prompt += `
Matching Skills: ${context.matchingSkills.join(', ')}`;
  }

  if (context.missingSkills && context.missingSkills.length > 0) {
    prompt += `
Skills to Address Carefully: ${context.missingSkills.join(', ')}`;
  }

  if (context.generatedCVSummary) {
    prompt += `
Optimized CV Content:
${context.generatedCVSummary}`;
  }

  if (context.companyResearchSummary) {
    prompt += `
Company Research:
${context.companyResearchSummary}`;
  }

  if (context.hasMasterCV && context.masterCVSummary) {
    prompt += `
Master CV (full career history):
${context.masterCVSummary}`;
  }

  prompt += `
</application_context>

<answer_guidelines>
Identify each question's type and match your response length accordingly:

1. YES/NO or ELIGIBILITY questions (work authorization, willingness to relocate, clearance, etc.):
   - Answer in 1-5 words. Direct answer only. No elaboration unless the question explicitly asks for it.

2. NUMERIC or FACTUAL questions (years of experience, salary expectations, proficiency ratings):
   - 5-20 words. State the number, then one sentence of context if helpful.

3. SHORT-ANSWER QUALITATIVE questions ("Why are you interested?", "Describe your experience with X"):
   - 50-150 words. 2-3 focused sentences connecting the applicant's background to the specific role.
   - Mirror keywords from the job description naturally.

4. BEHAVIORAL questions ("Tell me about a time when..."):
   - 150-250 words using STAR format:
     - Situation: 1 sentence setting the scene
     - Task: 1 sentence on the specific responsibility
     - Action: 2-3 sentences detailing what the applicant did (use "I", not "we")
     - Result: 1-2 sentences with quantified outcome
   - Weight ~70% of words on Action and Result.

5. SITUATIONAL or HYPOTHETICAL questions ("How would you handle..."):
   - 100-200 words. Outline the approach in 2-3 structured steps, tie back to a similar past success from the CV.

Key rules:
- ONLY reference skills, experience, metrics, and qualifications that exist in the CV. Never fabricate.
- Mirror keywords from the job description naturally in the answers.
- Use specific, concrete examples over broad generalities. One detailed example beats three vague ones.
- Quantify achievements wherever the CV provides numbers (percentages, dollar amounts, time saved).
- Stay consistent with the optimized CV content — dates, titles, and claims must match.
- For missing skills: frame as transferable experience or eagerness to learn. Never claim expertise the applicant doesn't have.
- Maximum ~250 words per individual answer. Recruiters scan screening answers quickly.
- If there are more than 7 questions, answer the first 7 and add a note: "Please send the remaining questions in a follow-up message."
</answer_guidelines>

<output_format>
For each question, output exactly this format:

---ANSWER_START---
**Q: [repeat the original question exactly]**

[your answer]
---ANSWER_END---

Do not add any text before the first ---ANSWER_START--- or after the last ---ANSWER_END---.
</output_format>

<language>
Respond in the same language the screening questions are written in. If the questions are in German, answer in German. If in English, answer in English.
</language>`;

  return prompt;
}

function extractActions(reply: string, context: ChatContext): Array<{label: string; action: string; icon: string}> {
  const actions: Array<{label: string; action: string; icon: string}> = [];
  const lowerReply = reply.toLowerCase();

  if (!context.hasCV && (lowerReply.includes('upload') || lowerReply.includes('cv'))) {
    actions.push({
      label: 'Upload CV',
      action: 'navigate-documents',
      icon: 'cv'
    });
  }

  if (context.hasAnalysis) {
    // Check if reply mentions any of the generated content
    const mentionsCV = lowerReply.includes('cv') || lowerReply.includes('optimiz') || lowerReply.includes('resume');
    const mentionsCoverLetter = lowerReply.includes('cover letter');
    const mentionsEmail = lowerReply.includes('email');
    
    // If the reply mentions any generated content, show all three actions
    // This ensures users always have access to all their generated documents
    if (mentionsCV || mentionsCoverLetter || mentionsEmail) {
      actions.push({
        label: 'View CV',
        action: 'view-cv',
        icon: 'cv'
      });
      actions.push({
        label: 'View Cover Letter',
        action: 'view-cover-letter',
        icon: 'cover-letter'
      });
      actions.push({
        label: 'View Email',
        action: 'view-email',
        icon: 'email'
      });
    }
    
    // Always show "Start New Application" when there's an existing analysis
    // This allows users to easily start a new job application
    actions.push({
      label: 'Start New Application',
      action: 'start-new-application',
      icon: 'new'
    });
  }

  return actions;
}
