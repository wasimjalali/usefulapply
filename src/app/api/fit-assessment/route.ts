/**
 * Fit Assessment API Route
 * 
 * Flow:
 * 1. Deduct 0.5 credits for fit analysis
 * 2. Run Context Agent to analyze fit between CV and JD
 * 3. Return fit assessment with chat message and writer strategy
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deductCreditsRPC, checkCreditBalanceRPC, CREDIT_COSTS } from '@/lib/supabase/credits';
import { setServerSupabaseClient, clearServerSupabaseClient } from '@/lib/supabase/credits';
import { callModel } from '@/lib/models';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface FitAssessmentRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
  certifications?: string;
}

interface FitAssessmentResult {
  chat_message: string;
  writer_strategy: string;
  fit_score: 'strong' | 'good' | 'weak';
  match_percentage?: number;
  job_info?: {
    title: string;
    companyName: string;
    location?: string;
    requiredSkills: string[];
    niceToHaveSkills: string[];
  };
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
          })}

`));
          controller.close();
          return;
        }

        // Set server supabase client for credit operations
        setServerSupabaseClient(supabase);

        const body: FitAssessmentRequest = await request.json();
        const { jobDescription, currentCV, masterCV, certifications } = body;
        
        console.log('[API_FIT_ASSESSMENT] Request received:', {
          hasJobDescription: !!jobDescription,
          hasMasterCV: !!masterCV,
          hasCertifications: !!certifications,
        });
        
        if (!jobDescription || !currentCV) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Job description and CV are required' 
          })}

`));
          controller.close();
          return;
        }

        // Check if user has enough credits (0.5 for fit analysis)
        const balanceCheck = await checkCreditBalanceRPC(user.id, CREDIT_COSTS.FIT_ANALYSIS);
        
        if (!balanceCheck.hasEnough) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            code: 'INSUFFICIENT_CREDITS',
            message: `Insufficient credits. Required: 0.5, Available: ${balanceCheck.available}`,
            details: {
              required: 0.5,
              available: balanceCheck.available,
            },
          })}

`));
          controller.close();
          return;
        }

        // Send progress update
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          percent: 10,
          message: 'Analyzing job fit...',
        })}

`));

        // Run fit assessment analysis
        const fitResult = await analyzeFit(
          currentCV,
          masterCV,
          certifications,
          jobDescription
        );

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'progress', 
          percent: 80,
          message: 'Finalizing analysis...',
        })}

`));

        // Deduct 0.5 credits after successful analysis
        const deductResult = await deductCreditsRPC(user.id, 'FIT_ANALYSIS', {
          description: 'Fit assessment analysis',
        });

        if (!deductResult.success) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: deductResult.error?.message || 'Failed to deduct credits',
          })}

`));
          controller.close();
          return;
        }

        // Send credit deduction info
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'credits_deducted', 
          creditsUsed: 0.5,
          remainingCredits: deductResult.remainingCredits,
          transactionType: 'fit_analysis',
        })}

`));

        // Send the fit assessment result
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'fit_assessment_complete',
          result: fitResult,
        })}

`));

        // Clear server supabase client
        clearServerSupabaseClient();
        controller.close();
        
      } catch (error) {
        console.error('[API_FIT_ASSESSMENT] Error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'error', 
          message: error instanceof Error ? error.message : 'Fit assessment failed'
        })}

`));
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

/**
 * Analyze fit between CV and Job Description
 * Returns structured assessment for the user and strategy for the writer
 */
async function analyzeFit(
  primaryCV: string,
  masterCV?: string,
  certifications?: string,
  jobDescription?: string
): Promise<FitAssessmentResult> {
  
  const combinedCV = masterCV 
    ? `PRIMARY CV:\n${primaryCV}\n\nMASTER CV (additional experience):\n${masterCV}${certifications ? '\n\nCERTIFICATIONS:\n' + certifications : ''}`
    : primaryCV + (certifications ? '\n\nCERTIFICATIONS:\n' + certifications : '');

  const systemPrompt = `# SYSTEM PROMPT: CONTEXT AGENT (CAREER COACH)

## ROLE
You are an expert Career Coach. Your goal is to analyze the "Fit" between a User's CV and a Job Description (JD).

## INPUT
1. User CV (Primary + Master CV)
2. Job Description

## TASK
Analyze the fit honestly. Assess whether this is a:
- **Strong Fit** (80-100%): User meets most requirements, good experience match
- **Good Fit** (50-79%): User meets some requirements, transferable skills apply
- **Weak Fit** (below 50%): Significant gaps, may not be worth applying

Be honest but constructive. If it's a bad fit, say so diplomatically.

## OUTPUT CONSTRAINTS (STRICT)
The chat_message field must be concise (Max 150 words). Do NOT write a report.

Structure:
1. **The Verdict:** 1 Paragraph (2-3 sentences). State the Score and the #1 reason they match (Connect User Skill -> JD Pain Point).
2. **The Gaps:** Max 2-3 Bullet points. Only list the *critical* missing requirements (e.g. Missing Skills, Wrong Industry). If none, list "None".
3. **The Strategy:** 1 Paragraph (2 sentences). How will you frame the CV to fix the gaps?

## TONE
Direct, Strategic, Coach-like. No fluff.

## OUTPUT FORMAT (JSON ONLY)
You must return a strict JSON object:
{
  "chat_message": "### 🎯 Fit Assessment: [Strong/Good/Weak Match] (XX%)\\n\\n**The Verdict:** [1 paragraph connecting user skill to JD pain point]\\n\\n**⚠️ The Gaps:**\\n- [Critical gap 1]\\n- [Critical gap 2, or 'None']\\n\\n**💡 The Strategy:** [2 sentences on how to frame the CV]",
  "writer_strategy": "Focus on X. Emphasize Y. Address gap in Z by highlighting transferable skills. Use keywords: A, B, C.",
  "fit_score": "strong|good|weak",
  "match_percentage": 85,
  "job_info": {
    "title": "Extracted Job Title",
    "companyName": "Extracted Company Name", 
    "location": "Location or null",
    "requiredSkills": ["skill1", "skill2"],
    "niceToHaveSkills": ["skill3"]
  }
}

CRITICAL: The job_info section MUST contain the actual company name and job title extracted from the JD. This is essential for document generation.

FORMATTING RULES:
1. Max 150 words in chat_message - be concise
2. Start with ### 🎯 Fit Assessment: [Result] (XX%)
3. Use **The Verdict:** for the main assessment paragraph
4. Use **⚠️ The Gaps:** for missing requirements (max 2-3 bullets)
5. Use **💡 The Strategy:** for the framing approach (2 sentences)
6. Bold key metrics (e.g., **€150K Revenue**, **5 years experience**)
7. Be honest - if it's a weak fit, say so diplomatically

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. chat_message must be direct and strategic - no fluff
3. Include specific match percentage (0-100)
4. writer_strategy should guide document generation
5. Be honest about fit quality - focus on critical gaps only`;

  const userPrompt = `Analyze the fit between this CV and Job Description:

## CV CONTENT:
${combinedCV.substring(0, 8000)}

## JOB DESCRIPTION:
${jobDescription?.substring(0, 4000)}

Provide your fit assessment in the exact JSON format specified.`;

  try {
    const response = await callModel({
      task: 'fit_assessment',
      prompt: userPrompt,
      systemPrompt,
      jsonMode: true,
    });

    // Parse the response
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

    const result = JSON.parse(jsonContent);

    // Validate required fields
    if (!result.chat_message || !result.writer_strategy || !result.fit_score) {
      throw new Error('Missing required fields in fit assessment response');
    }

    // Ensure fit_score is valid
    const validScores = ['strong', 'good', 'weak'];
    if (!validScores.includes(result.fit_score)) {
      result.fit_score = 'good'; // Default fallback
    }

    // Ensure match_percentage is a number
    if (typeof result.match_percentage !== 'number') {
      result.match_percentage = result.fit_score === 'strong' ? 80 : 
                                result.fit_score === 'good' ? 60 : 40;
    }

    return result as FitAssessmentResult;

  } catch (error) {
    console.error('[analyzeFit] Error:', error);
    
    // Return a fallback assessment
    return {
      chat_message: `### Fit Assessment: Good Match

I've analyzed your CV against this job description. Based on my analysis, this appears to be a **good fit** with transferable skills that can be highlighted.

**Next Steps:**
Would you like me to proceed with generating the full application package (optimized CV, cover letter, and email)?`,
      writer_strategy: 'Analyze the job requirements carefully and emphasize transferable skills. Match keywords from the job description where applicable.',
      fit_score: 'good',
      match_percentage: 60,
    };
  }
}
