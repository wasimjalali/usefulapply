/**
 * Model Abstraction Layer
 * Primary: Claude Sonnet 4.5 | Fallback: Claude Haiku 4.5 (toggle via USE_FALLBACK_MODEL env var)
 */

import { callAnthropic, callAnthropicStream, parseAnthropicJSON } from './anthropic';
import { 
  type TaskType, 
  type ModelResponse, 
  type ModelCallOptions,
  getModelConfig,
  isPremiumTask 
} from './types';

export * from './types';
export { parseAnthropicJSON };

/**
 * Main function to call Claude Sonnet 4.5 (or Haiku 4.5 fallback)
 */
export async function callModel(options: ModelCallOptions): Promise<ModelResponse> {
  const { task, prompt, systemPrompt, systemBlocks, temperature, maxTokens, jsonMode, conversationHistory } = options;
  
  const config = getModelConfig(task);
  
  const finalTemp = temperature ?? config.temperature;
  const finalMaxTokens = maxTokens ?? config.maxTokens;
  
  return callAnthropic({
    prompt,
    systemPrompt,
    systemBlocks,
    temperature: finalTemp,
    maxTokens: finalMaxTokens,
    jsonMode,
    conversationHistory,
  });
}

/**
 * Call Claude Sonnet 4.5 (or Haiku 4.5 fallback) with streaming response
 */
export async function callModelStream(
  options: ModelCallOptions,
  onChunk: (chunk: string) => void
): Promise<ModelResponse> {
  const { task, prompt, systemPrompt, temperature, maxTokens } = options;
  
  const config = getModelConfig(task);
  
  const finalTemp = temperature ?? config.temperature;
  const finalMaxTokens = maxTokens ?? config.maxTokens;
  
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

/**
 * Parse JSON from model response (handles markdown code blocks)
 */
export function parseModelJSON<T>(content: string): T {
  return parseAnthropicJSON<T>(content);
}

/**
 * Get estimated cost for a model call (in USD)
 * Sonnet 4.5 pricing: $3/M input, $15/M output
 * Haiku 4.5 pricing: $1/M input, $5/M output
 */
export function estimateCost(task: TaskType, inputTokens: number, outputTokens: number): number {
  const isFallback = process.env.USE_FALLBACK_MODEL === 'true';
  const inputCost = (inputTokens / 1_000_000) * (isFallback ? 1.00 : 3.00);
  const outputCost = (outputTokens / 1_000_000) * (isFallback ? 5.00 : 15.00);
  return inputCost + outputCost;
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
