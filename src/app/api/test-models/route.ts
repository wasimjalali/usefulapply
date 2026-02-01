/**
 * API Route: Test Models
 * Tests all AI model connections (Gemini, Anthropic, Tavily)
 */

import { NextRequest, NextResponse } from 'next/server';
import { callModel, logModelUsage } from '@/lib/models';
import { searchWeb, isTavilyConfigured } from '@/lib/tools/tavily';

export async function GET(request: NextRequest) {
  const results: {
    gemini: { success: boolean; message: string; latencyMs?: number };
    anthropic: { success: boolean; message: string; latencyMs?: number };
    tavily: { success: boolean; message: string; latencyMs?: number };
  } = {
    gemini: { success: false, message: 'Not tested' },
    anthropic: { success: false, message: 'Not tested' },
    tavily: { success: false, message: 'Not tested' },
  };

  // Test Gemini (Google AI)
  try {
    const geminiResponse = await callModel({
      task: 'general_chat',
      prompt: 'Say "Gemini connection successful" in exactly those words.',
      temperature: 0.1,
      maxTokens: 50,
    });
    
    results.gemini = {
      success: true,
      message: geminiResponse.content.trim(),
      latencyMs: geminiResponse.latencyMs,
    };
    
    logModelUsage('general_chat', geminiResponse, 'API test');
  } catch (error) {
    results.gemini = {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Test Anthropic (Claude)
  try {
    const anthropicResponse = await callModel({
      task: 'write_summary',
      prompt: 'Say "Claude connection successful" in exactly those words.',
      temperature: 0.1,
      maxTokens: 50,
    });
    
    results.anthropic = {
      success: true,
      message: anthropicResponse.content.trim(),
      latencyMs: anthropicResponse.latencyMs,
    };
    
    logModelUsage('write_summary', anthropicResponse, 'API test');
  } catch (error) {
    results.anthropic = {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Test Tavily
  if (isTavilyConfigured()) {
    try {
      const startTime = Date.now();
      const tavilyResponse = await searchWeb({
        query: 'What is the current date?',
        maxResults: 1,
        searchDepth: 'basic',
      });
      
      results.tavily = {
        success: true,
        message: `Found ${tavilyResponse.results.length} results. Answer: ${tavilyResponse.answer?.substring(0, 100) || 'N/A'}`,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      results.tavily = {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  } else {
    results.tavily = {
      success: false,
      message: 'TAVILY_API_KEY not configured',
    };
  }

  // Overall status
  const allSuccess = results.gemini.success && results.anthropic.success && results.tavily.success;

  return NextResponse.json({
    status: allSuccess ? 'all_connected' : 'partial_failure',
    timestamp: new Date().toISOString(),
    results,
    summary: {
      gemini: results.gemini.success ? '✅' : '❌',
      anthropic: results.anthropic.success ? '✅' : '❌',
      tavily: results.tavily.success ? '✅' : '❌',
    },
  });
}
