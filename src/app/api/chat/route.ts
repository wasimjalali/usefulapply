import { NextRequest, NextResponse } from 'next/server';
import { callModel } from '@/lib/models';

interface ChatContext {
  hasCV: boolean;
  cvSummary?: string;
  hasAnalysis: boolean;
  matchScore?: number;
  jobTitle?: string;
  company?: string;
  // Master CV and certifications
  hasMasterCV?: boolean;
  masterCVSummary?: string;
  hasCertifications?: boolean;
  certificationsCount?: number;
  certificationsList?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json() as { 
      message: string; 
      context: ChatContext 
    };

    const systemPrompt = buildSystemPrompt(context);
    
    // Use Gemini 3 Flash for chat (fast, cost-effective)
    const response = await callModel({
      task: 'general_chat',
      prompt: message,
      systemPrompt,
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
  let prompt = `You are Job Copilot, an AI assistant that helps users optimize their job applications. You're friendly, helpful, and concise.

Current user state:
- CV uploaded: ${context.hasCV ? 'Yes' : 'No'}
- Master CV uploaded: ${context.hasMasterCV ? 'Yes' : 'No'}
- Certifications uploaded: ${context.hasCertifications ? `Yes (${context.certificationsCount} documents)` : 'No'}
- Job analyzed: ${context.hasAnalysis ? 'Yes' : 'No'}`;

  if (context.hasAnalysis) {
    prompt += `
- Match score: ${context.matchScore}%
- Job title: ${context.jobTitle || 'Unknown'}
- Company: ${context.company || 'Unknown'}`;
  }

  if (context.hasMasterCV && context.masterCVSummary) {
    prompt += `

Master CV Summary (additional skills and experience bank):
${context.masterCVSummary}`;
  }

  if (context.hasCertifications && context.certificationsList) {
    prompt += `

Available Certifications (uploaded documents):
${context.certificationsList}`;
  }

  prompt += `

Your capabilities:
1. Analyze job descriptions to identify key requirements
2. Optimize CVs to match specific job postings (using Master CV content to fill gaps)
3. Generate tailored cover letters
4. Create professional application emails
5. Review and recommend relevant certifications from uploaded documents

IMPORTANT - Document Access:
- You have access to the user's primary CV, master CV, and certifications
- When optimizing, you pull additional relevant content from the Master CV
- You select the most relevant certifications for each job application
- Never say you don't have access to these documents - you DO have access

Guidelines:
- Be conversational but professional
- Give specific, actionable advice based on ALL uploaded documents
- Reference specific content from the Master CV when suggesting improvements
- Recommend specific certifications from the uploaded list when relevant
- If the user hasn't uploaded a CV, encourage them to do so first
- If they paste a job description (usually 100+ characters with job-related words), recognize it and let them know you'll analyze it
- Use markdown formatting for lists and emphasis
- Keep responses concise (2-4 paragraphs max)
- Don't make up information - only reference content from uploaded documents
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
