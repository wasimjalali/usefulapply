/**
 * Anthropic Claude Client
 * Handles all calls to Claude Haiku 4.5 for fast, cost-effective AI tasks
 */

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type { ModelResponse, ConversationMessage, CacheableContentBlock } from './types';

// Determine whether to use Bedrock or direct Anthropic API
const HAS_BEARER_TOKEN = !!process.env.AWS_BEARER_TOKEN_BEDROCK;
const HAS_TRADITIONAL_KEYS = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const USE_BEDROCK = HAS_BEARER_TOKEN || HAS_TRADITIONAL_KEYS;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Bedrock model ID for Claude Haiku 4.5
const BEDROCK_MODEL_ID = `${AWS_REGION === 'us-east-1' ? 'us' : AWS_REGION.startsWith('eu') ? 'eu' : 'us'}.anthropic.claude-haiku-4-5-20251001-v1:0`;
const DIRECT_MODEL_ID = 'claude-haiku-4-5';

// Initialize the appropriate client
const anthropic = USE_BEDROCK
  ? HAS_BEARER_TOKEN
    ? null // Will use custom fetch for bearer token
    : new AnthropicBedrock({
        // Traditional key authentication
        awsAccessKey: process.env.AWS_ACCESS_KEY_ID!,
        awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY!,
        ...(process.env.AWS_SESSION_TOKEN && { awsSessionToken: process.env.AWS_SESSION_TOKEN }),
        awsRegion: AWS_REGION,
      })
  : new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

// Custom Bedrock client for bearer token authentication
class BedrockBearerTokenClient {
  private bearerToken: string;
  private region: string;
  private baseUrl: string;

  constructor(bearerToken: string, region: string) {
    this.bearerToken = bearerToken;
    this.region = region;
    this.baseUrl = `https://bedrock-runtime.${region}.amazonaws.com`;
  }

  async create(params: {
    model: string;
    max_tokens: number;
    temperature?: number;
    system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const url = `${this.baseUrl}/model/${params.model}/converse`;
    
    // Convert Anthropic format to Bedrock format
    const bedrockMessages = params.messages.map(msg => ({
      role: msg.role,
      content: [{ text: msg.content }]
    }));

    const payload: any = {
      modelId: params.model,
      messages: bedrockMessages,
      inferenceConfig: {
        maxTokens: params.max_tokens,
        temperature: params.temperature,
      }
    };

    // Add system prompt if provided
    if (params.system) {
      if (typeof params.system === 'string') {
        payload.system = [{ text: params.system }];
      } else {
        payload.system = params.system.map(block => ({ text: block.text }));
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.bearerToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bedrock API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Convert Bedrock response back to Anthropic format
    return {
      content: [{ type: 'text' as const, text: data.output?.message?.content?.[0]?.text || '' }],
      usage: {
        input_tokens: data.usage?.inputTokens || 0,
        output_tokens: data.usage?.outputTokens || 0,
      }
    };
  }
}

const MODEL_ID = USE_BEDROCK ? BEDROCK_MODEL_ID : DIRECT_MODEL_ID;

if (USE_BEDROCK) {
  if (HAS_BEARER_TOKEN) {
    console.log(`[Anthropic] Using Amazon Bedrock provider with Bearer Token (region: ${AWS_REGION}, model: ${MODEL_ID})`);
  } else {
    console.log(`[Anthropic] Using Amazon Bedrock provider with traditional keys (region: ${AWS_REGION}, model: ${MODEL_ID})`);
  }
} else {
  console.log('[Anthropic] Using direct Anthropic API');
}

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
    let response;
    
    if (HAS_BEARER_TOKEN) {
      // Use custom bearer token client
      const bearerClient = new BedrockBearerTokenClient(
        process.env.AWS_BEARER_TOKEN_BEDROCK!,
        AWS_REGION
      );
      response = await bearerClient.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages,
      });
    } else {
      // Use Anthropic SDK (either Bedrock with traditional keys or direct Anthropic)
      response = await (anthropic as Anthropic).messages.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages,
      });
    }
    
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
      model: MODEL_ID,
      provider: USE_BEDROCK ? 'bedrock' : 'anthropic',
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
    let stream;
    
    if (HAS_BEARER_TOKEN) {
      // For now, use non-streaming for bearer token (can implement streaming later if needed)
      const bearerClient = new BedrockBearerTokenClient(
        process.env.AWS_BEARER_TOKEN_BEDROCK!,
        AWS_REGION
      );
      const response = await bearerClient.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(finalSystemPrompt && { system: finalSystemPrompt }),
        messages: [
          { role: 'user', content: prompt }
        ],
      });
      
      // Simulate streaming for consistency
      fullContent = response.content[0]?.text || '';
      inputTokens = response.usage?.input_tokens || 0;
      outputTokens = response.usage?.output_tokens || 0;
      
      return {
        content: fullContent,
        usage: {
          inputTokens,
          outputTokens,
        },
        model: MODEL_ID,
        provider: USE_BEDROCK ? 'bedrock' : 'anthropic',
        latencyMs: Date.now() - startTime,
      };
    } else {
      // Use Anthropic SDK streaming
      stream = (anthropic as Anthropic).messages.stream({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(finalSystemPrompt && { system: finalSystemPrompt }),
        messages: [
          { role: 'user', content: prompt }
        ],
      });
    }
    
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
      model: MODEL_ID,
      provider: USE_BEDROCK ? 'bedrock' : 'anthropic',
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
