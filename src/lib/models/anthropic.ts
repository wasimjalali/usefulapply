/**
 * Anthropic Claude Client
 * Primary: Claude Sonnet 4.6 — frontier performance, improved coding, instruction following, agents
 * Previous: Claude Sonnet 4.5 — toggle via USE_PREVIOUS_MODEL=true env var
 * Fallback: Claude Haiku 4.5 — faster, cheaper, toggle via USE_FALLBACK_MODEL env var
 */

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type { ModelResponse, ConversationMessage, CacheableContentBlock } from './types';

// Determine whether to use Bedrock or direct Anthropic API
const HAS_BEARER_TOKEN = !!process.env.AWS_BEARER_TOKEN_BEDROCK;
const HAS_TRADITIONAL_KEYS = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const USE_BEDROCK = HAS_BEARER_TOKEN || HAS_TRADITIONAL_KEYS;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Primary model: Claude Sonnet 4.6 — frontier performance, improved coding, agents, instruction following
const BEDROCK_MODEL_ID = `${AWS_REGION === 'us-east-1' ? 'us' : AWS_REGION.startsWith('eu') ? 'eu' : 'us'}.anthropic.claude-sonnet-4-6`;
const DIRECT_MODEL_ID = 'claude-sonnet-4-6';

// Previous model: Claude Sonnet 4.5 — kept as fallback, toggle via USE_PREVIOUS_MODEL=true
const BEDROCK_PREVIOUS_MODEL_ID = `${AWS_REGION === 'us-east-1' ? 'us' : AWS_REGION.startsWith('eu') ? 'eu' : 'us'}.anthropic.claude-sonnet-4-5-20250929-v1:0`;
const DIRECT_PREVIOUS_MODEL_ID = 'claude-sonnet-4-5-20250929';

// Cost fallback: Claude Haiku 4.5 — faster, cheaper, toggle via USE_FALLBACK_MODEL=true
const BEDROCK_FALLBACK_MODEL_ID = `${AWS_REGION === 'us-east-1' ? 'us' : AWS_REGION.startsWith('eu') ? 'eu' : 'us'}.anthropic.claude-haiku-4-5-20251001-v1:0`;
const DIRECT_FALLBACK_MODEL_ID = 'claude-haiku-4-5';

// Toggle: Set USE_PREVIOUS_MODEL=true to roll back to Sonnet 4.5
const USE_PREVIOUS = process.env.USE_PREVIOUS_MODEL === 'true';
// Toggle: Set USE_FALLBACK_MODEL=true to switch to Haiku 4.5 (cheapest)
const USE_FALLBACK = process.env.USE_FALLBACK_MODEL === 'true';

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

    // Converse API: modelId goes in URL path only, NOT in the request body
    const payload: any = {
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

    // Retry with exponential backoff for transient errors (503, 429, 500)
    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        console.log(`[Bedrock] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
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

      const errorText = await response.text();
      lastError = new Error(`Bedrock API error: ${response.status} ${errorText}`);

      // Only retry on transient errors
      if (![500, 503, 429].includes(response.status)) {
        throw lastError;
      }
      console.warn(`[Bedrock] Transient error ${response.status}, will retry...`);
    }

    throw lastError!;
  }
}

// Cached bearer token client — reused across calls to avoid recreating per invocation
let cachedBearerClient: BedrockBearerTokenClient | null = null;
function getBearerTokenClient(): BedrockBearerTokenClient {
  if (!cachedBearerClient) {
    cachedBearerClient = new BedrockBearerTokenClient(
      process.env.AWS_BEARER_TOKEN_BEDROCK!,
      process.env.AWS_BEDROCK_ENDPOINT_URL || AWS_REGION
    );
  }
  return cachedBearerClient;
}

// Export the active model IDs (used by the rest of the codebase)
// Priority: USE_FALLBACK_MODEL (Haiku) > USE_PREVIOUS_MODEL (Sonnet 4.5) > default (Sonnet 4.6)
const ACTIVE_BEDROCK_MODEL_ID = USE_FALLBACK ? BEDROCK_FALLBACK_MODEL_ID : USE_PREVIOUS ? BEDROCK_PREVIOUS_MODEL_ID : BEDROCK_MODEL_ID;
const ACTIVE_DIRECT_MODEL_ID = USE_FALLBACK ? DIRECT_FALLBACK_MODEL_ID : USE_PREVIOUS ? DIRECT_PREVIOUS_MODEL_ID : DIRECT_MODEL_ID;

const MODEL_ID = USE_BEDROCK ? ACTIVE_BEDROCK_MODEL_ID : ACTIVE_DIRECT_MODEL_ID;

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
 * Call Claude Sonnet 4.6 (or Sonnet 4.5 / Haiku 4.5 fallback) for all AI tasks
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
      // Use cached bearer token client
      const bearerClient = getBearerTokenClient();
      response = await bearerClient.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages,
      });
    } else {
      // Use Anthropic SDK (either Bedrock with traditional keys or direct Anthropic)
      if (!anthropic) throw new Error('Anthropic client not initialized — check API key configuration');
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
 * Call Claude Sonnet 4.6 with streaming response
 */
export async function callAnthropicStream(
  options: AnthropicCallOptions,
  onChunk: (chunk: string) => void
): Promise<ModelResponse> {
  const { prompt, systemPrompt, systemBlocks, temperature = 0.7, maxTokens = 4096, jsonMode = false } = options;

  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

  // Build system parameter — mirrors callAnthropic: prefer systemBlocks (with cache_control)
  // over plain systemPrompt string
  let systemParam: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined;
  const jsonInstruction = '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.';

  if (systemBlocks && systemBlocks.length > 0) {
    const blocks = [...systemBlocks];
    if (jsonMode) {
      blocks.push({ type: 'text', text: jsonInstruction.trim() });
    }
    systemParam = blocks;
  } else if (systemPrompt) {
    systemParam = jsonMode ? systemPrompt + jsonInstruction : systemPrompt;
  }

  try {
    let stream;

    if (HAS_BEARER_TOKEN) {
      // Bearer token path uses non-streaming (streaming can be added later)
      const bearerClient = getBearerTokenClient();
      const response = await bearerClient.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages: [{ role: 'user', content: prompt }],
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
      if (!anthropic) throw new Error('Anthropic client not initialized — check API key configuration');
      stream = (anthropic as Anthropic).messages.stream({
        model: MODEL_ID,
        max_tokens: maxTokens,
        temperature,
        ...(systemParam && { system: systemParam }),
        messages: [{ role: 'user', content: prompt }],
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
        const usage = event.message.usage as unknown as Record<string, number>;
        cacheCreationTokens = usage.cache_creation_input_tokens || 0;
        cacheReadTokens = usage.cache_read_input_tokens || 0;
        if (cacheCreationTokens > 0 || cacheReadTokens > 0) {
          console.log(`[Anthropic Cache Stream] write=${cacheCreationTokens} read=${cacheReadTokens} input=${inputTokens}`);
        }
      }
    }
    
    return {
      content: fullContent,
      usage: {
        inputTokens,
        outputTokens,
        cacheCreationInputTokens: cacheCreationTokens || undefined,
        cacheReadInputTokens: cacheReadTokens || undefined,
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
 * Extract text from a PDF using Claude's native document understanding.
 * Sends the PDF as a proper document content block — NOT as base64 text.
 * Works for scanned PDFs and PDFs with broken font encoding.
 */
export async function extractDocumentText(pdfBuffer: Buffer): Promise<string> {
  const base64Data = pdfBuffer.toString('base64');
  const startTime = Date.now();

  const systemPrompt = 'You are a document text extractor. Extract ALL text content from the provided document faithfully. Preserve the original structure, section headers, dates, bullet points, and formatting. Return ONLY the extracted text, nothing else.';
  const userText = 'Extract ALL text content from this CV/resume document. Preserve the original structure including section headers, dates, company names, job titles, bullet points, skills, education, and languages. Return ONLY the extracted text with proper formatting.';

  try {
    if (HAS_BEARER_TOKEN) {
      // Bedrock Converse API with document content block
      const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK!;
      const region = process.env.AWS_BEDROCK_ENDPOINT_URL || AWS_REGION;
      const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${MODEL_ID}/converse`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: [
              {
                document: {
                  name: 'cv',
                  format: 'pdf',
                  source: { bytes: base64Data },
                },
              },
              { text: userText },
            ],
          }],
          system: [{ text: systemPrompt }],
          inferenceConfig: { maxTokens: 8192, temperature: 0 },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Bedrock document extraction error: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      const text = data.output?.message?.content?.[0]?.text || '';
      console.log(`[Anthropic] PDF document extraction via Bedrock: ${text.length} chars in ${Date.now() - startTime}ms`);
      return text;
    }

    // Anthropic SDK (Bedrock traditional keys or direct API)
    if (!anthropic) throw new Error('Anthropic client not initialized');

    const response = await (anthropic as any).messages.create({
      model: MODEL_ID,
      max_tokens: 8192,
      temperature: 0,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Data,
            },
          },
          { type: 'text', text: userText },
        ],
      }],
    });

    const textContent = response.content.find((b: any) => b.type === 'text');
    const text = textContent?.text || '';
    console.log(`[Anthropic] PDF document extraction: ${text.length} chars in ${Date.now() - startTime}ms`);
    return text;
  } catch (error) {
    console.error('[Anthropic] Document extraction failed:', error);
    throw error;
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
