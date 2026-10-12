import type { ArmConfig } from './types';

const region = process.env.AWS_REGION || 'us-east-1';
// Same derivation as src/lib/models/anthropic.ts (BEDROCK_MODEL_ID).
const bedrockPrefix = region === 'us-east-1' ? 'us' : region.startsWith('eu') ? 'eu' : 'us';

/**
 * B arms: thinking counts toward max_tokens and the Sonnet 5.5 tokenizer uses ~30% more tokens,
 * so max_tokens = max(4000, 4 x the production value). Over 16000 the client streams.
 */
const B_SCALE = { multiplier: 4, floor: 4000 };

export const ARMS: Record<string, ArmConfig> = {
  // Arm A. Anthropic API, production request shape: MODEL_CONFIGS temperature and max_tokens,
  // same system blocks and cache_control, no thinking.
  'sonnet46-api': {
    name: 'sonnet46-api',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    promptVariant: 'production',
    dropTemperature: false,
    maxTokens: {},
    requiresFlag: '--allow-anthropic-api',
  },
  // Kept in code, unused: Bedrock is no longer used.
  'sonnet46-bedrock': {
    name: 'sonnet46-bedrock',
    provider: 'bedrock',
    modelId: `${bedrockPrefix}.anthropic.claude-sonnet-4-6`,
    promptVariant: 'production',
    dropTemperature: false,
    maxTokens: {},
    requiresFlag: null,
  },
  'sonnet55-low': {
    name: 'sonnet55-low',
    provider: 'anthropic',
    modelId: 'claude-sonnet-5-5',
    promptVariant: 'production',
    dropTemperature: true,
    maxTokens: {},
    maxTokensScale: B_SCALE,
    thinking: { type: 'adaptive' },
    effort: 'low',
    requiresFlag: '--allow-anthropic-api',
  },
  'sonnet55-medium': {
    name: 'sonnet55-medium',
    provider: 'anthropic',
    modelId: 'claude-sonnet-5-5',
    promptVariant: 'production',
    dropTemperature: true,
    maxTokens: {},
    maxTokensScale: B_SCALE,
    thinking: { type: 'adaptive' },
    effort: 'medium',
    requiresFlag: '--allow-anthropic-api',
  },
};
