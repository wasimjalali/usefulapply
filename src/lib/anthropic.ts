import Anthropic from '@anthropic-ai/sdk';

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Get model from environment or use default
// All tasks now use Claude Haiku 4.5
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Send a single prompt to Claude and get a response
 */
export async function askClaude(
  prompt: string,
  systemPrompt?: string,
  maxTokens: number = 4096
): Promise<ClaudeResponse> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt || 'You are a helpful assistant.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    console.error('Claude API Error:', error);
    throw new Error('Failed to get response from Claude');
  }
}

/**
 * Send a conversation with multiple messages to Claude
 */
export async function chatWithClaude(
  messages: ClaudeMessage[],
  systemPrompt?: string,
  maxTokens: number = 4096
): Promise<ClaudeResponse> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt || 'You are a helpful assistant.',
      messages: messages,
    });

    const textContent = response.content.find((block) => block.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    console.error('Claude API Error:', error);
    throw new Error('Failed to get response from Claude');
  }
}

/**
 * Parse JSON from Claude's response (handles markdown code blocks)
 */
export function parseClaudeJSON<T>(response: string): T {
  // Remove markdown code blocks if present
  let cleaned = response.trim();
  
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  return JSON.parse(cleaned.trim()) as T;
}

export { anthropic, MODEL };
