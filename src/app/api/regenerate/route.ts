import { NextRequest, NextResponse } from 'next/server';
import { writerAgent } from '@/lib/agents/writer-agent';
import type { MasterContext } from '@/lib/agents/types';
import { createClient } from '@/lib/supabase/server';
import { checkAndDeductCredits, formatCreditErrorResponse } from '@/lib/middleware/creditCheck';

/**
 * API endpoint for regenerating cover letter or email
 * Uses the Writer Agent from the 3-agent architecture
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, context } = body;

    if (!type || !context) {
      return NextResponse.json(
        { error: 'Missing required fields: type and context' },
        { status: 400 }
      );
    }

    // Determine credit action based on type
    const creditAction = type === 'cover-letter' ? 'COVER_LETTER_REGEN' : 'EMAIL_REGEN';
    
    // Check and deduct credits (1 credit for regeneration)
    const creditResult = await checkAndDeductCredits(user.id, creditAction);
    
    if (!creditResult.success) {
      return NextResponse.json(
        { 
          error: creditResult.error || 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          details: formatCreditErrorResponse(creditResult),
        },
        { status: 402 }
      );
    }

    // Build MasterContext from the provided data
    const masterContext: MasterContext = {
      sessionId: context.sessionId || 'regenerate-session',
      jobDescription: context.jobDescription || '',
      rawCV: context.rawCV || '',
      applicant: context.applicant,
      job: context.job,
      companyResearch: context.companyResearch,
      match: context.match,
    };

    if (type === 'cover-letter') {
      const coverLetter = await writerAgent.generateCoverLetter(masterContext);
      return NextResponse.json({ 
        coverLetter,
        creditsDeducted: 1,
        remainingCredits: creditResult.remainingCredits,
      });
    } else if (type === 'email') {
      const email = await writerAgent.generateApplicationEmail(masterContext);
      return NextResponse.json({ 
        email,
        creditsDeducted: 1,
        remainingCredits: creditResult.remainingCredits,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid type. Must be "cover-letter" or "email"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[Regenerate API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate content' },
      { status: 500 }
    );
  }
}
