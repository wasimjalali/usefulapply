/**
 * OpenAI GPT-4o mini Client
 * Handles all AI calls using GPT-4o mini for both analysis and writing tasks
 */

import OpenAI from 'openai';
import type { ModelResponse } from './types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const MODEL = 'gpt-4o-mini';

export interface OpenAICallOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Call GPT-4o mini
 */
export async function callOpenAI(options: OpenAICallOptions): Promise<ModelResponse> {
  const { prompt, systemPrompt, temperature = 0.7, maxTokens = 4096, jsonMode = false } = options;
  
  const startTime = Date.now();
  
  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode && { response_format: { type: 'json_object' } }),
    });
    
    const content = response.choices[0]?.message?.content || '';
    
    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
      model: MODEL,
      provider: 'openai',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`OpenAI API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call GPT-4o mini with streaming response
 */
export async function callOpenAIStream(
  options: OpenAICallOptions,
  onChunk: (chunk: string) => void
): Promise<ModelResponse> {
  const { prompt, systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;
  
  const startTime = Date.now();
  let fullContent = '';
  
  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    
    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        onChunk(content);
      }
    }
    
    // Estimate tokens (OpenAI streaming doesn't provide usage)
    const estimatedInputTokens = Math.ceil((systemPrompt?.length || 0 + prompt.length) / 4);
    const estimatedOutputTokens = Math.ceil(fullContent.length / 4);
    
    return {
      content: fullContent,
      usage: {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
      },
      model: MODEL,
      provider: 'openai',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('OpenAI streaming error:', error);
    throw new Error(`OpenAI streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse JSON response from GPT-4o mini (handles markdown code blocks)
 */
export function parseOpenAIJSON<T>(content: string): T {
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
    console.error('Failed to parse OpenAI JSON:', error);
    console.error('Content:', content);
    throw new Error('Failed to parse OpenAI response as JSON');
  }
}
