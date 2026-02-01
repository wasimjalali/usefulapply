/**
 * Test endpoint for Tavily web search
 * GET /api/test-tavily?company=Google
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchWeb, researchCompany, isTavilyConfigured } from '@/lib/tools/tavily';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const company = searchParams.get('company') || 'Google';
  
  console.log('[Test Tavily] Starting test...');
  console.log('[Test Tavily] TAVILY_API_KEY present:', !!process.env.TAVILY_API_KEY);
  console.log('[Test Tavily] isTavilyConfigured():', isTavilyConfigured());
  
  try {
    // Test 1: Simple search
    console.log('[Test Tavily] Test 1: Simple search...');
    const searchResult = await searchWeb({
      query: `${company} company headquarters address`,
      maxResults: 3,
    });
    
    console.log('[Test Tavily] Search result:', JSON.stringify(searchResult, null, 2));
    
    // Test 2: Full company research
    console.log('[Test Tavily] Test 2: Company research...');
    const companyResearch = await researchCompany(company);
    
    console.log('[Test Tavily] Company research result:', JSON.stringify(companyResearch, null, 2));
    
    return NextResponse.json({
      success: true,
      tavilyConfigured: isTavilyConfigured(),
      apiKeyPresent: !!process.env.TAVILY_API_KEY,
      searchResult,
      companyResearch,
    });
  } catch (error) {
    console.error('[Test Tavily] Error:', error);
    return NextResponse.json({
      success: false,
      tavilyConfigured: isTavilyConfigured(),
      apiKeyPresent: !!process.env.TAVILY_API_KEY,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
