/**
 * Agent V2 API Route - 3-Agent Architecture
 * 
 * Flow:
 * 1. Context Agent: Gather all information
 * 2. Writer Agent: Generate all documents
 * 
 * Streams progress updates to the client for real-time UI feedback
 */

import { NextRequest } from 'next/server';
import { 
  runJobCopilot,
  type AgentEvent,
  type MasterContext,
} from '@/lib/agents';
import { createClient } from '@/lib/supabase/server';
import { checkAndDeductCredits, formatCreditErrorResponse } from '@/lib/middleware/creditCheck';
import { setServerSupabaseClient, clearServerSupabaseClient } from '@/lib/supabase/credits';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface AgentRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
  certifications?: string;
  action: 'full_optimization' | 'analyze_only' | 'generate_cv' | 'generate_cover_letter' | 'generate_email';
  emailType?: 'application' | 'followup' | 'thankyou';
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Get authenticated user
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Authentication required' 
          })}\n\n`));
          controller.close();
          return;
        }

        // Set server supabase client for credit operations
        setServerSupabaseClient(supabase);

        const body: AgentRequest = await request.json();
        const { 
          jobDescription, 
          currentCV, 
          masterCV, 
          action,
        } = body;
        
        console.log('[API_AGENT_V2] Request received:', {
          action,
          hasJobDescription: !!jobDescription,
          hasMasterCV: !!masterCV,
        });
        
        if (!jobDescription || !currentCV) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Job description and CV are required' 
          })}\n\n`));
          controller.close();
          return;
        }

        // Check and deduct credits for full application (2 credits)
        const creditResult = await checkAndDeductCredits(user.id, 'FULL_APPLICATION');
        
        if (!creditResult.success) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            code: 'INSUFFICIENT_CREDITS',
            message: creditResult.error || 'Insufficient credits',
            details: formatCreditErrorResponse(creditResult),
          })}\n\n`));
          controller.close();
          return;
        }

        // Send credit deduction info to client
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'credits_deducted', 
          creditsUsed: 2,
          remainingCredits: creditResult.remainingCredits,
        })}\n\n`));

        // Set up event handler to stream progress
        const eventHandler = (event: AgentEvent) => {
          switch (event.type) {
            case 'step_started':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_start',
                step: event.step.id,
                index: getStepIndex(event.step.id),
                description: event.step.description,
              })}\n\n`));
              break;
              
            case 'step_completed':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_complete',
                step: event.step.id,
                index: getStepIndex(event.step.id),
              })}\n\n`));
              break;
              
            case 'step_error':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_error',
                step: event.step.id,
                index: getStepIndex(event.step.id),
                error: event.error,
              })}\n\n`));
              break;
              
            case 'progress':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                percent: event.percent,
                message: event.message,
              })}\n\n`));
              break;
              
            case 'tool_usage':
              // Forward tool usage events (e.g., company research) to frontend
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'tool_usage',
                tool: event.tool,
                output: event.output,
                display: event.display,
              })}\n\n`));
              break;
              
            case 'message':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'message',
                content: event.content,
              })}\n\n`));
              break;
          }
        };

        // Define workflow steps
        const steps = getWorkflowSteps(action);
        
        // Send workflow start
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'workflow_start', 
          steps: steps.map((s, i) => ({ 
            function: s.id, 
            description: s.description,
            index: i,
          })),
          models: {
            analysis: 'claude-haiku-4.5',
            writing: 'claude-haiku-4.5',
          },
        })}\n\n`));

        // Execute the 3-agent workflow
        let results: Record<string, unknown> = {};

        if (action === 'full_optimization') {
          const result = await runJobCopilot({
            sessionId: `session-${Date.now()}`,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
          }, eventHandler);
          
          if (result.success && result.data) {
            const ctx = result.data.context;
            
            results = {
              // Job info
              job: ctx.job,
              // Company research
              companyResearch: ctx.companyResearch,
              // Match info (no longer shown but kept for data)
              match: ctx.match,
              // Generated documents
              optimizedCV: ctx.optimizedCV,
              optimizedCVData: ctx.optimizedCVData,  // Solution B: Structured JSON
              coverLetter: ctx.coverLetter,
              applicationEmail: ctx.applicationEmail,
              // Full context for debugging
              context: ctx,
            };
          } else {
            throw new Error(result.error || 'Optimization failed');
          }
        } else {
          // For other actions, run full optimization for now
          // TODO: Implement specific actions if needed
          const result = await runJobCopilot({
            sessionId: `session-${Date.now()}`,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
          }, eventHandler);
          
          if (result.success && result.data) {
            results = { context: result.data.context };
          } else {
            throw new Error(result.error || 'Workflow failed');
          }
        }

        // Send workflow complete with final results
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'workflow_complete',
          results,
        })}\n\n`));
        
        // Clear server supabase client
        clearServerSupabaseClient();
        controller.close();
        
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'error', 
          message: error instanceof Error ? error.message : 'Workflow failed'
        })}\n\n`));
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Helper to extract original experience bullets from CV text
function extractOriginalExperience(cvText: string, company: string, title: string): string {
  // Escape special regex characters in company/title
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeCompany = escapeRegex(company);
  const safeTitle = escapeRegex(title);
  
  // Try to find the experience section for this company/title
  // Look for bullet points (•, -, *) that follow the company/title mention
  const bulletPattern = /[•\-\*]\s*([^\n•\-\*]+)/g;
  
  // Find the section containing this company
  const sectionPattern = new RegExp(
    `(?:${safeCompany}|${safeTitle})[^]*?(?=(?:^[A-Z][a-z]+\\s+(?:at|@)|^[A-Z]{2,}|^(?:Education|Skills|Languages|Certifications)|$))`,
    'im'
  );
  
  const sectionMatch = cvText.match(sectionPattern);
  if (sectionMatch) {
    const section = sectionMatch[0];
    const bullets: string[] = [];
    let match;
    
    while ((match = bulletPattern.exec(section)) !== null) {
      const bullet = match[1].trim();
      // Only include actual bullet content (not dates, locations, etc.)
      if (bullet.length > 20 && !bullet.match(/^\d{4}/) && !bullet.match(/^[A-Z][a-z]+\s+\d{4}/)) {
        bullets.push(bullet);
      }
    }
    
    if (bullets.length > 0) {
      return bullets.slice(0, 3).map(b => `• ${b}`).join('\n');
    }
  }
  
  // Fallback: look for any bullet points near the company name
  const companyIndex = cvText.toLowerCase().indexOf(company.toLowerCase());
  if (companyIndex !== -1) {
    const nearbyText = cvText.substring(companyIndex, companyIndex + 800);
    const bullets: string[] = [];
    let match;
    
    while ((match = bulletPattern.exec(nearbyText)) !== null) {
      const bullet = match[1].trim();
      if (bullet.length > 20 && !bullet.match(/^\d{4}/)) {
        bullets.push(bullet);
      }
    }
    
    if (bullets.length > 0) {
      return bullets.slice(0, 3).map(b => `• ${b}`).join('\n');
    }
  }
  
  return 'Original experience bullets not found';
}

// Helper to extract headline/title from CV
function extractOriginalHeadline(cvText: string): string {
  const lines = cvText.split('\n').map(l => l.trim()).filter(Boolean);
  // Skip the name (usually first line), look for a title/headline in first 5 lines
  for (let i = 1; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Skip contact info lines
    if (line.includes('@') || line.match(/\d{5,}/) || line.match(/^\+?\d[\d\s\-()]+$/)) continue;
    // Look for job title patterns
    if (line.length > 10 && line.length < 80 && !line.includes('http')) {
      return line;
    }
  }
  return 'No headline found in original CV';
}

// Helper to extract section content by header - uses strict header-based segmentation
function extractSectionByHeader(cvText: string, headerNames: string[], maxLength: number): string | null {
  const lines = cvText.split('\n');
  
  // Build regex pattern for headers: "## Header", "# Header", "Header:", "HEADER", etc.
  const headerPattern = headerNames.map(h => {
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `(?:^#{1,3}\\s*${escaped}|^${escaped}\\s*:|^${escaped.toUpperCase()}\\s*$)`;
  }).join('|');
  
  const headerRegex = new RegExp(headerPattern, 'im');
  
  let startIndex = -1;
  let endIndex = lines.length;
  
  // Find the header line
  for (let i = 0; i < lines.length; i++) {
    if (headerRegex.test(lines[i].trim())) {
      startIndex = i + 1; // Start from line after header
      break;
    }
  }
  
  if (startIndex === -1) return null;
  
  // Find the next header (any header pattern)
  const nextHeaderRegex = /^(?:#{1,3}\s+\w|[A-Z][A-Za-z\s]+:$|[A-Z]{2,}(?:\s+[A-Z]{2,})*$)/;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && nextHeaderRegex.test(line)) {
      endIndex = i;
      break;
    }
  }
  
  // Extract content between headers
  const content = lines.slice(startIndex, endIndex)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .substring(0, maxLength);
  
  return content || null;
}

// Helper to transform OptimizedContent to GeneratedCV format with changes
function transformToGeneratedCV(
  optimizedContent: {
    summary: string;
    headline: string;
    experience: Array<{ company: string; title: string; bullets: string[] }>;
    skills: string[];
    matchScore: number;
  },
  originalCV: string,
  requirements: { title: string; company: string }
): {
  content: string;
  optimizedTagline: string;
  changes: Array<{ section: string; original: string; updated: string; reason: string }>;
  optimizedFor: string;
} {
  const changes: Array<{ section: string; original: string; updated: string; reason: string }> = [];
  
  // Extract original summary using header-based segmentation
  // Look for explicit headers like "## Summary", "# Profile", "Summary:", etc.
  const summaryHeaders = ['summary', 'profile', 'objective', 'about me', 'professional summary', 'career summary'];
  const originalSummary = extractSectionByHeader(originalCV, summaryHeaders, 300) || 'No summary section found in original CV';
  
  // Add summary change
  if (optimizedContent.summary) {
    changes.push({
      section: 'Professional Summary',
      original: originalSummary,
      updated: optimizedContent.summary,
      reason: `Optimized to highlight relevant experience for ${requirements.title} role at ${requirements.company}`,
    });
  }
  
  // Add headline/tagline change - extract actual original headline
  if (optimizedContent.headline) {
    const originalHeadline = extractOriginalHeadline(originalCV);
    changes.push({
      section: 'Professional Headline',
      original: originalHeadline,
      updated: optimizedContent.headline,
      reason: 'Updated to match target job title and highlight key expertise',
    });
  }
  
  // Add skills change - extract using header-based segmentation
  if (optimizedContent.skills && optimizedContent.skills.length > 0) {
    const skillsHeaders = ['skills', 'competencies', 'expertise', 'technical skills', 'core competencies', 'key skills'];
    const originalSkills = extractSectionByHeader(originalCV, skillsHeaders, 200) || 'No skills section found in original CV';
    
    changes.push({
      section: 'Skills & Competencies',
      original: originalSkills,
      updated: optimizedContent.skills.join(', '),
      reason: 'Reorganized and prioritized skills to match job requirements',
    });
  }
  
  // Add experience changes - extract actual original bullets
  if (optimizedContent.experience && optimizedContent.experience.length > 0) {
    optimizedContent.experience.forEach((exp) => {
      if (exp.bullets && exp.bullets.length > 0) {
        const originalBullets = extractOriginalExperience(originalCV, exp.company, exp.title);
        changes.push({
          section: `Experience: ${exp.title} at ${exp.company}`,
          original: originalBullets,
          updated: exp.bullets.map(b => `• ${b}`).join('\n'),
          reason: 'Enhanced with quantified achievements and relevant keywords',
        });
      }
    });
  }
  
  // Build full content string
  const contentParts = [
    `# ${optimizedContent.headline || 'Professional'}`,
    '',
    '## Professional Summary',
    optimizedContent.summary,
    '',
    '## Skills',
    optimizedContent.skills?.join(', ') || '',
    '',
    '## Experience',
    ...(optimizedContent.experience?.map(exp => 
      `### ${exp.title} at ${exp.company}\n${exp.bullets?.map(b => `• ${b}`).join('\n') || ''}`
    ) || []),
  ];
  
  return {
    content: contentParts.join('\n'),
    optimizedTagline: optimizedContent.headline || '',
    changes,
    optimizedFor: requirements.title,
  };
}

// Helper to get workflow steps based on action - 3-Agent Architecture
function getWorkflowSteps(action: string): Array<{ id: string; description: string }> {
  switch (action) {
    case 'full_optimization':
      return [
        { id: 'context', description: 'Context Agent: Gathering CV, JD, and company info' },
        { id: 'writing', description: 'Writer Agent: Generating CV, cover letter, and email' },
      ];
    default:
      return [
        { id: 'context', description: 'Context Agent: Gathering information' },
        { id: 'writing', description: 'Writer Agent: Generating documents' },
      ];
  }
}

// Helper to get step index for progress tracking
function getStepIndex(stepId: string): number {
  const stepOrder = ['context', 'writing'];
  return stepOrder.indexOf(stepId);
}
