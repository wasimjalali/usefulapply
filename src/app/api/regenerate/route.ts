import { NextRequest, NextResponse } from 'next/server';
import { writerAgent } from '@/lib/agents/writer-agent';
import type { MasterContext } from '@/lib/agents/types';

/**
 * API endpoint for regenerating cover letter or email
 * Uses the Writer Agent from the 3-agent architecture
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, context } = body;

    if (!type || !context) {
      return NextResponse.json(
        { error: 'Missing required fields: type and context' },
        { status: 400 }
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
      return NextResponse.json({ coverLetter });
    } else if (type === 'email') {
      const email = await writerAgent.generateApplicationEmail(masterContext);
      return NextResponse.json({ email });
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
