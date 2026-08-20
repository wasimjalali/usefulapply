import { NextRequest, NextResponse } from 'next/server';
import { callWorkersAI } from '@/lib/models/workers-ai';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { getProfile } from '@/db/repos/profiles';
import { claimScreeningTurn, releaseScreeningTurn } from '@/db/repos/sessions';
import { SCREENING_TURN_CAP } from '@/lib/screening-answers';

// Input/output limits
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_SCREENING_MESSAGE_LENGTH = 5_000;
const MAX_CHAT_MESSAGES_PER_SESSION = 10;

// The application id has to be a real D1 row id. A client session carries a
// `session-<timestamp>` id until it syncs, and a cap that accepts anything is
// not a cap.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  sessionId?: string;
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
    const rateLimitResult = await checkRateLimit(`chat:${clientIP}`, RATE_LIMITS['chat']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    // Authentication: require logged-in user for chat (costs API money)
    const user = await getCurrentUser(req);
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

    // Plan gate: screening answers require a paid plan (Plus or Max)
    let screeningSessionId: string | null = null;
    let screeningTurnsUsed = 0;
    if (isScreeningMode) {
      const profile = await getProfile(user.id);
      const tier = profile?.subscription_tier;
      if (tier !== 'plus' && tier !== 'max') {
        return NextResponse.json(
          { error: 'Screening question answers are available on Plus and Max.' },
          { status: 403 }
        );
      }

      // The cap is per application and is spent below, not by the client. The
      // count the client keeps rides inside generated_cv, which the client
      // writes wholesale, so it can only ever be a display number.
      const sessionId = context.sessionId;
      if (!sessionId || !UUID_RE.test(sessionId)) {
        return NextResponse.json(
          { error: 'This application has not saved yet. Try the question again in a moment.', code: 'SCREENING_SESSION_REQUIRED' },
          { status: 409 }
        );
      }
      screeningSessionId = sessionId;
    }

    // Chat message limit per session (count user messages in history)
    const userMessageCount = context.chatHistory?.filter(m => m.role === 'user').length ?? 0;
    if (userMessageCount >= MAX_CHAT_MESSAGES_PER_SESSION) {
      return NextResponse.json(
        { error: 'Chat message limit reached for this application. Start a new application to continue chatting.', code: 'CHAT_LIMIT_REACHED' },
        { status: 429 }
      );
    }

    // The turn is claimed last, after every gate that can refuse the request.
    // Claiming earlier would spend a turn on a request that never reaches the
    // model, and the chat limit above does exactly that.
    if (screeningSessionId) {
      const claim = await claimScreeningTurn(user.id, screeningSessionId, SCREENING_TURN_CAP);
      if (!claim.ok) {
        if (claim.reason === 'not_found') {
          return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }
        return NextResponse.json(
          {
            error: `That's the ${SCREENING_TURN_CAP} screening answers for this application.`,
            code: 'SCREENING_CAP_REACHED',
            screeningTurnsUsed: claim.turnsUsed,
            screeningTurnCap: SCREENING_TURN_CAP,
          },
          { status: 429 }
        );
      }
      screeningTurnsUsed = claim.turnsUsed;
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

    // gpt-oss-120b on Workers AI. Budgets are several times the expected reply
    // because the reasoning pass spends part of max_tokens before the answer;
    // an exhausted budget throws and surfaces as a chat failure.
    let response;
    try {
      response = await callWorkersAI({
        prompt: message,
        systemPrompt,
        conversationHistory,
        generationContext: {
          requestExecutionId: crypto.randomUUID(),
          userId: user.id,
          route: '/api/chat',
          feature: 'chat',
          operation: isScreeningMode ? 'screening_chat' : 'general_chat',
        },
        ...(isScreeningMode
          ? { maxTokens: 8000, temperature: 0.4 }
          : { maxTokens: 4000, temperature: 0.7 }),
      });
    } catch (modelError) {
      // The turn was claimed before the call, so a failure here has to hand it
      // back. Only this path releases: a client that gives up mid-call still
      // pays for the turn it started.
      if (screeningSessionId) await releaseScreeningTurn(user.id, screeningSessionId, screeningTurnsUsed);
      throw modelError;
    }
    const reply = response.content;

    const actions = isScreeningMode ? [] : extractActions(reply, context);

    return NextResponse.json({
      success: true,
      reply,
      actions,
      ...(isScreeningMode && { screeningTurnsUsed, screeningTurnCap: SCREENING_TURN_CAP }),
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
You are Useful Apply, an intelligent job application assistant. You help users optimize their CVs, write cover letters, create application emails, and navigate the job application process. You are friendly, professional, and concise.
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
3. SCOPE: Only discuss job applications, CVs, cover letters, emails, career advice, and the application process. If asked about unrelated topics, politely redirect: "I specialize in job applications. How can I help with yours?"
4. TONE: Warm, professional, and encouraging. Sound like a helpful career coach, not a robot. Use the user's name if available.
5. ACCURACY: Only reference skills, experience, and qualifications that exist in the user's uploaded documents. Do not make assumptions about the user's background.
6. LANGUAGE: Respond in the same language the user writes in. If they write in German, respond in German. If in English, respond in English.
7. GUIDANCE: When the user needs to take a next step, be specific about what to do (e.g., "Paste a job description to start" rather than vague instructions).
8. NO REPETITION: Do not repeat information the user already knows or that was just stated.
PUNCTUATION (HARD RULE): Never use em-dashes (—), en-dashes (–), or horizontal bars (―). Use commas, periods, colons, semicolons, or parentheses instead. Never use AI-tell phrases: "furthermore", "moreover", "leverage", "pivotal", "robust", "delve", "navigate the landscape".
</response_rules>`;

  return prompt;
}

function buildScreeningPrompt(context: ChatContext): string {
  let prompt = `<identity>
You are Useful Apply, an expert at answering job application screening questions. You draft personalized, compelling answers based on the applicant's CV and the target job description.
</identity>

<application_context>
Job Title: ${context.jobTitle || 'Unknown position'}
Company: ${context.company || 'Unknown company'}`;

  if (context.jobDescription) {
    prompt += `
Job Description:
${context.jobDescription.substring(0, 8000)}`;
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

<length_constraints>
ATS platforms (Workday, Greenhouse, Lever, iCIMS) enforce strict character limits on screening answers, typically 500-1000 characters per field. Recruiters spend 6-10 seconds scanning each answer. Every answer you write must fit within these real-world constraints.

Absolute maximum per answer: 150 words (~750 characters). Most answers should be significantly shorter. If an answer exceeds 150 words, it is too long. Cut it down.
</length_constraints>

<answer_guidelines>
Classify each question and match your response length to its type:

1. YES/NO or ELIGIBILITY (work authorization, willingness to relocate, security clearance):
   - 1-5 words. Direct answer only. Never elaborate unless explicitly asked.

2. NUMERIC or FACTUAL (years of experience, salary expectations, ratings, start date):
   - 1 sentence, under 20 words. State the number or fact, add brief context only if it strengthens the answer.

3. SHORT-ANSWER QUALITATIVE ("Why are you interested?", "Describe your experience with X"):
   - 50-80 words. 2-3 concise sentences that connect the applicant's specific background to the role. Lead with the strongest qualifier.

4. BEHAVIORAL ("Tell me about a time when..."):
   - 100-150 words maximum. Use compressed STAR format:
     - Situation + Task: 1 sentence combined
     - Action: 2 sentences max. Focus on what the applicant specifically did
     - Result: 1 sentence with a quantified outcome
   - Prioritize the Result. Recruiters care most about measurable impact.

5. SITUATIONAL or HYPOTHETICAL ("How would you handle..."):
   - 75-120 words. State the approach in 2-3 brief steps. Reference one similar past success from the CV to demonstrate credibility.

Key rules:
- ONLY reference skills, experience, metrics, and qualifications that exist in the CV. Never fabricate claims or experience.
- Mirror keywords from the job description naturally. Do not force-fit or overload keywords.
- One specific, quantified example is worth more than three vague claims.
- Stay consistent with the optimized CV content: dates, titles, and metrics must match exactly.
- For skills the applicant lacks: briefly acknowledge transferable experience or learning trajectory. Never claim expertise that does not exist in the CV.
- If there are more than 7 questions, answer the first 7 and add a note: "Please send the remaining questions in a follow-up message."
PUNCTUATION (HARD RULE): Never use em-dashes (—), en-dashes (–), or horizontal bars (―). Use commas, periods, colons, semicolons, or parentheses instead. Never use AI-tell phrases: "furthermore", "moreover", "leverage", "pivotal", "robust", "delve", "navigate the landscape".
</answer_guidelines>

<output_format>
For each question, output exactly this format:

---ANSWER_START---
**Q: [repeat the original question exactly]**

[your answer]
---ANSWER_END---

Do not add any text before the first ---ANSWER_START--- or after the last ---ANSWER_END---. Do not add preambles, sign-offs, or commentary outside the answer blocks.
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
