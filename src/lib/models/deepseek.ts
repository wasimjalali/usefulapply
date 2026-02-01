/**
 * DeepSeek API Integration
 * Uses OpenAI-compatible API format
 * Model: DeepSeek-V3.2 (deepseek-chat for non-thinking mode)
 */

import OpenAI from 'openai';

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com',
});

export interface DeepSeekOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface DeepSeekResponse {
  content: string;
  model: string;
  provider: 'deepseek';
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
}

/**
 * Call DeepSeek API (non-streaming)
 */
export async function callDeepSeek(options: DeepSeekOptions): Promise<DeepSeekResponse> {
  const {
    prompt,
    systemPrompt = 'You are a helpful assistant.',
    temperature = 0.7,
    maxTokens = 4096,
    jsonMode = false,
  } = options;

  const startTime = Date.now();

  try {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    const response = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode && { response_format: { type: 'json_object' } }),
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';

    return {
      content,
      model: 'deepseek-chat',
      provider: 'deepseek',
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error(`[DeepSeek] API call failed after ${latencyMs}ms:`, error);
    throw new Error(`DeepSeek API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call DeepSeek API with streaming
 */
export async function callDeepSeekStream(
  options: DeepSeekOptions,
  onChunk: (chunk: string) => void
): Promise<DeepSeekResponse> {
  const {
    prompt,
    systemPrompt = 'You are a helpful assistant.',
    temperature = 0.7,
    maxTokens = 4096,
  } = options;

  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    const stream = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
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
      
      // Capture usage from final chunk if available
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens || 0;
        outputTokens = chunk.usage.completion_tokens || 0;
      }
    }

    const latencyMs = Date.now() - startTime;

    // Estimate tokens if not provided
    if (inputTokens === 0) {
      inputTokens = Math.ceil((systemPrompt.length + prompt.length) / 4);
    }
    if (outputTokens === 0) {
      outputTokens = Math.ceil(fullContent.length / 4);
    }

    return {
      content: fullContent,
      model: 'deepseek-chat',
      provider: 'deepseek',
      usage: {
        inputTokens,
        outputTokens,
      },
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error(`[DeepSeek] Stream failed after ${latencyMs}ms:`, error);
    throw new Error(`DeepSeek stream failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse JSON from DeepSeek response
 */
export function parseDeepSeekJSON<T>(content: string): T {
  // Remove markdown code blocks if present
  let jsonStr = content.trim();
  
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  
  return JSON.parse(jsonStr.trim()) as T;
}

/**
 * Check if DeepSeek API is configured
 */
export function isDeepSeekConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}
