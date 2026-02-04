import { NextRequest, NextResponse } from 'next/server';
import { callModel } from '@/lib/models';

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
    const { message, context } = await req.json() as { 
      message: string; 
      context: ChatContext 
    };

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
      maxTokens: 100, // Limit to ~150 characters (approx 100 tokens)
    });
    const reply = response.content;

    const actions = extractActions(reply, context);

    return NextResponse.json({ 
      success: true, 
      reply,
      actions 
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Chat request failed' },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(context: ChatContext): string {
  let prompt = `You are Karko AI, a specialized AI assistant dedicated to helping users with job applications, CV optimization, cover letters, and application emails.

YOUR IDENTITY AND ROLE:
- You are Karko AI, the intelligent job application assistant
- Your sole purpose is to help users succeed in their job applications
- You have access to the user's documents and application history
- You provide personalized, context-aware assistance based on the user's specific situation

CURRENT USER STATE:
- CV uploaded: ${context.hasCV ? 'Yes' : 'No'}
- Master CV uploaded: ${context.hasMasterCV ? 'Yes' : 'No'}
- Certifications uploaded: ${context.hasCertifications ? `Yes (${context.certificationsCount} documents)` : 'No'}
- Job analyzed: ${context.hasAnalysis ? 'Yes' : 'No'}`;

  if (context.hasAnalysis) {
    prompt += `
- Current application: ${context.jobTitle || 'Unknown position'} at ${context.company || 'Unknown company'}`;
  }

  // Add generated content awareness
  if (context.hasGeneratedCV || context.hasGeneratedCoverLetter || context.hasGeneratedEmail) {
    prompt += `

GENERATED DOCUMENTS FOR THIS APPLICATION:`;
    if (context.hasGeneratedCV) {
      prompt += `
- ✅ Optimized CV: Generated and available in the CV Panel`;
    }
    if (context.hasGeneratedCoverLetter) {
      prompt += `
- ✅ Cover Letter: Generated and available in the Cover Letter Panel`;
    }
    if (context.hasGeneratedEmail) {
      prompt += `
- ✅ Application Email: Generated and available in the Email Panel`;
    }
  }

  if (context.hasMasterCV && context.masterCVSummary) {
    prompt += `

MASTER CV SUMMARY (user's additional skills and experience):
${context.masterCVSummary}`;
  }

  if (context.hasCertifications && context.certificationsList) {
    prompt += `

AVAILABLE CERTIFICATIONS:
${context.certificationsList}`;
  }

  prompt += `

YOUR CAPABILITIES:
1. Analyze job descriptions to identify key requirements
2. Optimize CVs to match specific job postings (using Master CV content to fill gaps)
3. Generate tailored cover letters
4. Create professional application emails
5. Review and recommend relevant certifications from uploaded documents
6. Answer questions about the user's current application, CV, cover letter, or email

CRITICAL RESPONSE GUIDELINES:
- **KEEP RESPONSES UNDER 150 CHARACTERS** - Be extremely concise and to the point
- No long paragraphs - short, direct answers only
- If you generated documents, confirm they're in the respective panels
- Reference your generated content when asked (e.g., "Your optimized CV is ready in the CV Panel!")
- Be conversational but brief
- If the user hasn't uploaded a CV, just say "Please upload your CV first in Documents."
- Don't repeat information the user already knows
`;

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
