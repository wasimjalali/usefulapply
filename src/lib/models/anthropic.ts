/**
 * Anthropic Claude Client
 * Handles all calls to Claude Haiku 4.5 for fast, cost-effective AI tasks
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ModelResponse, ConversationMessage, CacheableContentBlock } from './types';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface AnthropicCallOptions {
  prompt: string;
  systemPrompt?: string;
  /** Structured system blocks with cache_control for prompt caching */
  systemBlocks?: CacheableContentBlock[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  conversationHistory?: ConversationMessage[];
}

/**
 * Call Claude Haiku 4.5 for all AI tasks
 */
export async function callAnthropic(options: AnthropicCallOptions): Promise<ModelResponse> {
  const { prompt, systemPrompt, systemBlocks, temperature = 0.7, maxTokens = 4096, jsonMode = false, conversationHistory } = options;
  
  const startTime = Date.now();
  
  // Build system parameter: use structured blocks (with cache_control) if provided, else plain string
  let systemParam: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined;
  
  if (systemBlocks && systemBlocks.length > 0) {
    // Structured system blocks with cache_control support
    const blocks = [...systemBlocks];
    if (jsonMode) {
      blocks.push({
        type: 'text',
        text: 'IMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.',
      });
    }
    systemParam = blocks;
  } else if (systemPrompt) {
    let finalSystemPrompt = systemPrompt;
    if (jsonMode) {
      finalSystemPrompt += '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';
    }
    systemParam = finalSystemPrompt;
  }
  
  // Build messages array with conversation history if provided
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  } else {
    messages.push({ role: 'user', content: prompt });
  }
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      temperature,
      ...(systemParam && { system: systemParam }),
      messages,
    });
    
    // Extract text content
    const textContent = response.content.find(block => block.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';
    
    // Extract cache metrics from usage (if available)
    const usage = response.usage as unknown as Record<string, number>;
    
    const cacheCreation = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    if (cacheCreation > 0 || cacheRead > 0) {
      console.log(`[Anthropic Cache] write=${cacheCreation} read=${cacheRead} input=${usage.input_tokens} output=${usage.output_tokens}`);
    }
    
    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationInputTokens: cacheCreation || undefined,
        cacheReadInputTokens: cacheRead || undefined,
      },
      model: 'claude-haiku-4-5',
      provider: 'anthropic',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw new Error(`Anthropic API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call Claude with streaming response
 */
export async function callAnthropicStream(
  options: AnthropicCallOptions,
  onChunk: (chunk: string) => void
): Promise<ModelResponse> {
  const { prompt, systemPrompt, temperature = 0.7, maxTokens = 4096, jsonMode = false } = options;
  
  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;
  
  // For JSON mode, enhance the system prompt
  let finalSystemPrompt = systemPrompt || '';
  if (jsonMode) {
    const jsonInstruction = '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';
    finalSystemPrompt = finalSystemPrompt + jsonInstruction;
  }
  
  try {
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      temperature,
      ...(finalSystemPrompt && { system: finalSystemPrompt }),
      messages: [
        { role: 'user', content: prompt }
      ],
    });
    
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullContent += text;
        onChunk(text);
      }
      
      if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens;
      }
      
      if (event.type === 'message_start' && event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }
    
    return {
      content: fullContent,
      usage: {
        inputTokens,
        outputTokens,
      },
      model: 'claude-haiku-4-5',
      provider: 'anthropic',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Anthropic streaming error:', error);
    throw new Error(`Anthropic streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse JSON response from Claude (handles markdown code blocks)
 */
export function parseAnthropicJSON<T>(content: string): T {
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
    console.error('Failed to parse Anthropic JSON:', error);
    console.error('Content:', content);
    throw new Error('Failed to parse Anthropic response as JSON');
  }
}
