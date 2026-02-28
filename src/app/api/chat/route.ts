import { NextRequest, NextResponse } from 'next/server';
import { callModel } from '@/lib/models';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';

// Input/output limits
const MAX_MESSAGE_LENGTH = 2_000;
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

    // Input length validation
    if (message && message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message is too long (${message.length} chars). Maximum: ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // Chat message limit per session (count user messages in history)
    const userMessageCount = context.chatHistory?.filter(m => m.role === 'user').length ?? 0;
    if (userMessageCount >= MAX_CHAT_MESSAGES_PER_SESSION) {
      return NextResponse.json(
        { error: 'Chat message limit reached for this application. Start a new application to continue chatting.', code: 'CHAT_LIMIT_REACHED' },
        { status: 429 }
      );
    }

    const systemPrompt = buildSystemPrompt(context);
    
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
    
    // Use Claude for chat with strict token limit for concise responses
    const response = await callModel({
      task: 'general_chat',
      prompt: message,
      systemPrompt,
      conversationHistory,
      // maxTokens now controlled by MODEL_CONFIGS (150 tokens for Sonnet)
    });
    const reply = response.content;

    const actions = extractActions(reply, context);

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
