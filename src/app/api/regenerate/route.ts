import { NextRequest, NextResponse } from 'next/server';
import { unifiedWriterAgent } from '@/lib/agents/unified-writer-agent';
import { type MasterContext } from '@/lib/agents/types';
import { createClient } from '@/lib/supabase/server';
import { checkAndDeductCredits, formatCreditErrorResponse, CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import { setServerSupabaseClient, clearServerSupabaseClient } from '@/lib/supabase/credits';
import { detectLanguage } from '@/lib/utils/language-detector';

/**
 * API endpoint for regenerating cover letter or email
 * Uses the Unified Writer Agent (single agent architecture)
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

    // Set server supabase client for credit operations
    setServerSupabaseClient(supabase);

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

    // Get detected language - from context or detect from job description
    const detectedLanguage = context.detectedLanguage || 
                             detectLanguage(context.jobDescription || '');
    
    console.log('[Regenerate API] Using language:', detectedLanguage);

    // Build MasterContext from the provided data
    const masterContext: MasterContext = {
      sessionId: context.sessionId || 'regenerate-session',
      jobDescription: context.jobDescription || '',
      rawCV: context.rawCV || '',
      detectedLanguage: detectedLanguage,
      applicant: context.applicant,
      job: context.job,
      companyResearch: context.companyResearch,
      match: context.match,
    };

    if (type === 'cover-letter') {
      const { result: coverLetter, tokens } = await unifiedWriterAgent.generateCoverLetter(masterContext);
      clearServerSupabaseClient();
      return NextResponse.json({ 
        coverLetter,
        creditsDeducted: CREDIT_COSTS.COVER_LETTER_REGEN,
        remainingCredits: creditResult.remainingCredits,
        tokens,
      });
    } else if (type === 'email') {
      const { result: email, tokens } = await unifiedWriterAgent.generateApplicationEmail(masterContext);
      clearServerSupabaseClient();
      return NextResponse.json({ 
        email,
        creditsDeducted: CREDIT_COSTS.EMAIL_REGEN,
        remainingCredits: creditResult.remainingCredits,
        tokens,
      });
    } else {
      clearServerSupabaseClient();
      return NextResponse.json(
        { error: 'Invalid type. Must be "cover-letter" or "email"' },
        { status: 400 }
      );
    }
  } catch (error) {
    clearServerSupabaseClient();
    console.error('[Regenerate API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate content' },
      { status: 500 }
    );
  }
}
