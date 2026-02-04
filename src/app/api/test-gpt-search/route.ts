/**
 * Test endpoint for GPT-4o web search
 * GET /api/test-gpt-search?company=Google
 */

import { NextRequest, NextResponse } from 'next/server';
import { researchCompanyWithGPT, isGPTWebSearchConfigured } from '@/lib/tools/gpt-web-search';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const company = searchParams.get('company') || 'Google';
  
  console.log('[Test GPT Search] Starting test...');
  console.log('[Test GPT Search] OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
  console.log('[Test GPT Search] isGPTWebSearchConfigured():', isGPTWebSearchConfigured());
  
  try {
    console.log('[Test GPT Search] Researching company:', company);
    const companyResearch = await researchCompanyWithGPT(company);
    
    console.log('[Test GPT Search] Research result:', JSON.stringify(companyResearch, null, 2));
    
    return NextResponse.json({
      success: true,
      gptConfigured: isGPTWebSearchConfigured(),
      apiKeyPresent: !!process.env.OPENAI_API_KEY,
      companyResearch,
    });
  } catch (error) {
    console.error('[Test GPT Search] Error:', error);
    return NextResponse.json({
      success: false,
      gptConfigured: isGPTWebSearchConfigured(),
      apiKeyPresent: !!process.env.OPENAI_API_KEY,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
