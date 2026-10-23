/**
 * Model Abstraction Layer
 * Claude Sonnet 5.5 for the kit tasks (anthropic.ts), Claude Haiku 5.5 for the other sites (haiku.ts), both on
 * the Anthropic API with Claude in Amazon Bedrock as the failover (providers.ts).
 */

import { callAnthropic, ACTIVE_MODEL_ID } from './anthropic';
import { type ModelResponse, type ModelCallOptions, getModelConfig } from './types';

export * from './types';
export { ACTIVE_MODEL_ID };

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
