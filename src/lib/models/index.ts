/**
 * Model Abstraction Layer
 * Unified interface for calling different AI models based on task type
 * All tasks now use Claude Haiku 4.5 for fast, cost-effective AI
 */

import { callGemini, callGeminiStream, parseGeminiJSON } from './gemini';
import { callAnthropic, callAnthropicStream, parseAnthropicJSON } from './anthropic';
import { callOpenAI, callOpenAIStream, parseOpenAIJSON } from './openai';
import { callDeepSeek, callDeepSeekStream, isDeepSeekConfigured } from './deepseek';
import { 
  type TaskType, 
  type ModelResponse, 
  type ModelCallOptions,
  getModelConfig,
  isPremiumTask 
} from './types';

export * from './types';
export { parseGeminiJSON, parseAnthropicJSON, parseOpenAIJSON };

/**
 * Check if an error is a rate limit or quota error that should trigger fallback
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('too many requests') ||
      message.includes('exceeded')
    );
  }
  return false;
}

/**
 * Main function to call the appropriate model based on task type
 * All tasks now use GPT-4o mini
 * Falls back to DeepSeek if OpenAI hits rate limits
 */
export async function callModel(options: ModelCallOptions): Promise<ModelResponse> {
  const { task, prompt, systemPrompt, temperature, maxTokens, jsonMode } = options;
  
  const config = getModelConfig(task);
  
  // Override config with provided options
  const finalTemp = temperature ?? config.temperature;
  const finalMaxTokens = maxTokens ?? config.maxTokens;
  
  if (config.provider === 'openai') {
    try {
      return await callOpenAI({
        prompt,
        systemPrompt,
        temperature: finalTemp,
        maxTokens: finalMaxTokens,
        jsonMode,
      });
    } catch (error) {
      // Fallback to DeepSeek on rate limit errors
      if (isRateLimitError(error) && isDeepSeekConfigured()) {
        console.log('[Model] OpenAI rate limited, falling back to DeepSeek...');
        const deepseekResponse = await callDeepSeek({
          prompt,
          systemPrompt,
          temperature: finalTemp,
          maxTokens: finalMaxTokens,
          jsonMode,
        });
        return {
          content: deepseekResponse.content,
          model: deepseekResponse.model,
          provider: 'deepseek',
          usage: deepseekResponse.usage,
          latencyMs: deepseekResponse.latencyMs,
        };
      }
      throw error;
    }
  } else if (config.provider === 'google') {
    try {
      return await callGemini({
        prompt,
        systemPrompt,
        temperature: finalTemp,
        maxTokens: finalMaxTokens,
        jsonMode,
      });
    } catch (error) {
      if (isRateLimitError(error) && isDeepSeekConfigured()) {
        console.log('[Model] Gemini rate limited, falling back to DeepSeek...');
        const deepseekResponse = await callDeepSeek({
          prompt,
          systemPrompt,
          temperature: finalTemp,
          maxTokens: finalMaxTokens,
          jsonMode,
        });
        return {
          content: deepseekResponse.content,
          model: deepseekResponse.model,
          provider: 'deepseek',
          usage: deepseekResponse.usage,
          latencyMs: deepseekResponse.latencyMs,
        };
      }
      throw error;
    }
  } else if (config.provider === 'anthropic') {
    return callAnthropic({
      prompt,
      systemPrompt,
      temperature: finalTemp,
      maxTokens: finalMaxTokens,
    });
  }
  
  throw new Error(`Unsupported provider: ${config.provider}`);
}

/**
 * Call model with streaming response
 * Falls back to DeepSeek if OpenAI hits rate limits
 */
export async function callModelStream(
  options: ModelCallOptions,
  onChunk: (chunk: string) => void
): Promise<ModelResponse> {
  const { task, prompt, systemPrompt, temperature, maxTokens } = options;
  
  const config = getModelConfig(task);
  
  const finalTemp = temperature ?? config.temperature;
  const finalMaxTokens = maxTokens ?? config.maxTokens;
  
  if (config.provider === 'openai') {
    try {
      return await callOpenAIStream(
        {
          prompt,
          systemPrompt,
          temperature: finalTemp,
          maxTokens: finalMaxTokens,
        },
        onChunk
      );
    } catch (error) {
      if (isRateLimitError(error) && isDeepSeekConfigured()) {
        console.log('[Model] OpenAI rate limited, falling back to DeepSeek stream...');
        const deepseekResponse = await callDeepSeekStream(
          {
            prompt,
            systemPrompt,
            temperature: finalTemp,
            maxTokens: finalMaxTokens,
          },
          onChunk
        );
        return {
          content: deepseekResponse.content,
          model: deepseekResponse.model,
          provider: 'deepseek',
          usage: deepseekResponse.usage,
          latencyMs: deepseekResponse.latencyMs,
        };
      }
      throw error;
    }
  } else if (config.provider === 'google') {
    try {
      return await callGeminiStream(
        {
          prompt,
          systemPrompt,
          temperature: finalTemp,
          maxTokens: finalMaxTokens,
        },
        onChunk
      );
    } catch (error) {
      if (isRateLimitError(error) && isDeepSeekConfigured()) {
        console.log('[Model] Gemini rate limited, falling back to DeepSeek stream...');
        const deepseekResponse = await callDeepSeekStream(
          {
            prompt,
            systemPrompt,
            temperature: finalTemp,
            maxTokens: finalMaxTokens,
          },
          onChunk
        );
        return {
          content: deepseekResponse.content,
          model: deepseekResponse.model,
          provider: 'deepseek',
          usage: deepseekResponse.usage,
          latencyMs: deepseekResponse.latencyMs,
        };
      }
      throw error;
    }
  } else if (config.provider === 'anthropic') {
    return callAnthropicStream(
      {
        prompt,
        systemPrompt,
        temperature: finalTemp,
        maxTokens: finalMaxTokens,
      },
      onChunk
    );
  }
  
  throw new Error(`Unsupported provider: ${config.provider}`);
}

/**
 * Parse JSON from model response (handles both providers)
 */
export function parseModelJSON<T>(content: string): T {
  // Both parsers handle markdown code blocks the same way
  return parseGeminiJSON<T>(content);
}

/**
 * Get estimated cost for a model call (in USD)
 */
export function estimateCost(task: TaskType, inputTokens: number, outputTokens: number, provider?: string): number {
  const config = getModelConfig(task);
  const actualProvider = provider || config.provider;
  
  if (actualProvider === 'openai') {
    // GPT-4o mini pricing
    const inputCost = (inputTokens / 1_000_000) * 0.15;
    const outputCost = (outputTokens / 1_000_000) * 0.60;
    return inputCost + outputCost;
  } else if (actualProvider === 'google') {
    // Gemini pricing (fallback)
    const inputCost = (inputTokens / 1_000_000) * 0.10;
    const outputCost = (outputTokens / 1_000_000) * 0.40;
    return inputCost + outputCost;
  } else if (actualProvider === 'anthropic') {
    // Claude Haiku 4.5 pricing: $1/$5 per million tokens
    const inputCost = (inputTokens / 1_000_000) * 1.00;
    const outputCost = (outputTokens / 1_000_000) * 5.00;
    return inputCost + outputCost;
  } else if (actualProvider === 'deepseek') {
    // DeepSeek V3.2 pricing (cache miss rates)
    const inputCost = (inputTokens / 1_000_000) * 0.28;
    const outputCost = (outputTokens / 1_000_000) * 0.42;
    return inputCost + outputCost;
  }
  
  return 0;
}

/**
 * Log model usage for monitoring
 */
export function logModelUsage(
  task: TaskType,
  response: ModelResponse,
  context?: string
): void {
  const cost = estimateCost(task, response.usage.inputTokens, response.usage.outputTokens);
  
  console.log(`[Model] ${task} | ${response.provider}/${response.model} | ` +
    `${response.usage.inputTokens}in/${response.usage.outputTokens}out | ` +
    `${response.latencyMs}ms | $${cost.toFixed(4)} | ${context || ''}`);
}

// Re-export for convenience
export { isPremiumTask, getModelConfig };
