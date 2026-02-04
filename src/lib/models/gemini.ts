/**
 * Google Gemini Client
 * Handles all calls to Gemini 3 Flash for analysis tasks
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ModelResponse } from './types';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// Get the Gemini 3 Flash model (latest fast model with thinking capabilities)
// Using 'minimal' thinking level for fast analysis tasks
const geminiModel = genAI.getGenerativeModel({ 
  model: 'gemini-3-flash-preview',
});

export interface GeminiCallOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

/**
 * Call Gemini model for analysis tasks
 */
export async function callGemini(options: GeminiCallOptions): Promise<ModelResponse> {
  const { prompt, systemPrompt, temperature = 0.3, maxTokens = 4096, jsonMode = false } = options;
  
  const startTime = Date.now();
  
  try {
    // Build the content parts
    const parts: { text: string }[] = [];
    
    if (systemPrompt) {
      parts.push({ text: `System Instructions:\n${systemPrompt}\n\n` });
    }
    
    parts.push({ text: prompt });
    
    // Configure generation
    const generationConfig = {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonMode && { responseMimeType: 'application/json' }),
    };
    
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig,
    });
    
    const response = result.response;
    const text = response.text();
    
    // Get usage metadata if available
    const usageMetadata = response.usageMetadata;
    
    return {
      content: text,
      usage: {
        inputTokens: usageMetadata?.promptTokenCount || 0,
        outputTokens: usageMetadata?.candidatesTokenCount || 0,
      },
      model: 'gemini-3-flash-preview',
      provider: 'google',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Gemini API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call Gemini with streaming response
 */
export async function callGeminiStream(
  options: GeminiCallOptions,
  onChunk: (chunk: string) => void
): Promise<ModelResponse> {
  const { prompt, systemPrompt, temperature = 0.3, maxTokens = 4096 } = options;
  
  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;
  
  try {
    const parts: { text: string }[] = [];
    
    if (systemPrompt) {
      parts.push({ text: `System Instructions:\n${systemPrompt}\n\n` });
    }
    
    parts.push({ text: prompt });
    
    const result = await geminiModel.generateContentStream({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    });
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullContent += chunkText;
      onChunk(chunkText);
      
      // Update token counts from final chunk
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount || 0;
        outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
      }
    }
    
    return {
      content: fullContent,
      usage: {
        inputTokens,
        outputTokens,
      },
      model: 'gemini-3-flash-preview',
      provider: 'google',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Gemini streaming error:', error);
    throw new Error(`Gemini streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse JSON response from Gemini (handles markdown code blocks)
 */
export function parseGeminiJSON<T>(content: string): T {
  let jsonString = content.trim();
  
  // Remove markdown code blocks if present
  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse Gemini JSON:', error);
    console.error('Content:', content);
    throw new Error('Failed to parse Gemini response as JSON');
  }
}
