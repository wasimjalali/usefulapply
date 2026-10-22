/**
 * Model Abstraction Layer
 * Claude Sonnet 5.5 for the kit tasks (anthropic.ts), Claude Haiku 5.5 for the other sites (haiku.ts), both on
 * the Anthropic API with Claude in Amazon Bedrock as the failover (providers.ts).
 */

import { callAnthropic, callAnthropicStream, parseAnthropicJSON, ACTIVE_MODEL_ID, ACTIVE_MODEL_PRICING } from './anthropic';
import { 
  type TaskType, 
  type ModelResponse, 
  type ModelCallOptions,
  getModelConfig,
  isPremiumTask 
} from './types';

export * from './types';
export { parseAnthropicJSON, ACTIVE_MODEL_ID, ACTIVE_MODEL_PRICING };
export type { ModelPricing } from './anthropic';
export { HAIKU_55_PRICING, haiku55CostUsd, haiku55PricingFor, sonnet55CostUsd } from './anthropic';
export {
  callHaiku,
  buildHaikuRequest,
  HAIKU_MODEL_ID,
  InputBudgetError,
  type HaikuCallOptions,
  type HaikuEffort,
  type HaikuResponse,
  type HaikuSite,
  type HaikuToolDefinition,
} from './haiku';
export { HAIKU_EFFORTS, HAIKU_SITE_EFFORT, resolveHaikuEffort } from './haiku-effort';
export {
  CHARS_PER_TOKEN,
  COUNT_TOKENS_ABOVE,
  INPUT_HARD_LIMIT,
  INPUT_REFUSE_ABOVE,
  estimateInputTokens,
  estimateTokens,
  projectNextInputTokens,
} from './token-budget';

/**
 * Main function to call Claude (model resolved at runtime in anthropic.ts)
 */
export async function callModel(options: ModelCallOptions): Promise<ModelResponse> {
  const { task, prompt, promptBlocks, systemPrompt, systemPromptCacheTtl, systemBlocks, maxTokens, jsonMode, conversationHistory, generationContext, site } = options;
  
  const config = getModelConfig(task);
  
  const finalMaxTokens = maxTokens ?? config.maxTokens;
  
  return callAnthropic({
    prompt,
    promptBlocks,
    systemPrompt,
    systemPromptCacheTtl,
    systemBlocks,
    maxTokens: finalMaxTokens,
    jsonMode,
    conversationHistory,
    site: site ?? task,
    generationContext: generationContext
      ? { ...generationContext, operation: task }
      : {
          requestExecutionId: crypto.randomUUID(),
          route: 'unattributed',
          feature: 'unattributed',
          operation: task,
        },
  });
}

/**
 * Call Claude (model resolved at runtime in anthropic.ts) with streaming response
 */
export async function callModelStream(
  options: ModelCallOptions,
  onChunk: (chunk: string) => void
): Promise<ModelResponse> {
  const { task, prompt, promptBlocks, systemPrompt, systemPromptCacheTtl, systemBlocks, maxTokens, jsonMode, generationContext, site } = options;
  
  const config = getModelConfig(task);
  
  const finalMaxTokens = maxTokens ?? config.maxTokens;
  
  return callAnthropicStream(
    {
      prompt,
      promptBlocks,
      systemPrompt,
      systemPromptCacheTtl,
      systemBlocks,
      maxTokens: finalMaxTokens,
      jsonMode,
      site: site ?? task,
      generationContext: generationContext
        ? { ...generationContext, operation: task }
        : {
            requestExecutionId: crypto.randomUUID(),
            route: 'unattributed',
            feature: 'unattributed',
            operation: task,
          },
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
 * Get estimated cost for a model call (in USD), at the active model's list price
 * (Sonnet 5.5: $2/M input, $10/M output; 5-minute cache writes 1.25x input, 1-hour writes 2x, cache reads 0.05x input)
 */
export function estimateCost(
  task: TaskType,
  inputTokens: number,
  outputTokens: number,
  cache: { writeTokens?: number; write1hTokens?: number; readTokens?: number } = {},
): number {
  const p = ACTIVE_MODEL_PRICING;
  const write1h = cache.write1hTokens ?? 0;
  // writeTokens is the total; the 1-hour part of it is priced at the 1-hour rate.
  const write5m = Math.max(0, (cache.writeTokens ?? 0) - write1h);
  return (inputTokens * p.inputPerM
    + outputTokens * p.outputPerM
    + write5m * p.cacheWritePerM
    + write1h * (p.cacheWrite1hPerM ?? 2 * p.inputPerM)
    + (cache.readTokens ?? 0) * p.cacheReadPerM) / 1_000_000;
}

/**
 * Log model usage for monitoring
 */
export function logModelUsage(
  task: TaskType,
  response: ModelResponse,
  context?: string
): void {
  const cost = estimateCost(task, response.usage.inputTokens, response.usage.outputTokens, {
    writeTokens: response.usage.cacheCreationInputTokens,
    write1hTokens: response.usage.cacheCreation1hInputTokens,
    readTokens: response.usage.cacheReadInputTokens,
  });
  
  console.log(`[Model] ${task} | ${response.provider}/${response.model} | ` +
    `${response.usage.inputTokens}in/${response.usage.outputTokens}out | ` +
    `${response.latencyMs}ms | $${cost.toFixed(4)} | ${context || ''}`);
}

// Re-export for convenience
export { isPremiumTask, getModelConfig };
