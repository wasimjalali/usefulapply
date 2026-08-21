/**
 * Chat tool registry. The chat route passes chatToolDefinitions() to
 * callWorkersAI and runs executeChatTool() for each tool call the model
 * returns. Max rounds are enforced by the route, not here.
 */

import type { WorkersAiToolDefinition } from '@/lib/models/workers-ai';
import { READ_TOOLS } from './read-tools';
import { APP_TOOLS } from './app-tools';
import { INTENT_TOOLS } from './intent';
import { WRITE_TOOLS } from './write-tools';
import { FEED_TOOLS } from './feed-tools';
import { KIT_TOOLS } from './kit-tools';
import { NAVIGATE_TOOLS } from './navigate';
import type { ChatTool, ChatToolContext, ChatToolResult } from './types';

export type { ChatToolContext, ChatToolResult, ExecutedEffect, ChatActionChip, NavigateTarget } from './types';

export const CHAT_TOOLS: ChatTool[] = [...READ_TOOLS, ...APP_TOOLS, ...INTENT_TOOLS, ...NAVIGATE_TOOLS, ...WRITE_TOOLS, ...FEED_TOOLS, ...KIT_TOOLS];

const TOOLS_BY_NAME = new Map(CHAT_TOOLS.map((tool) => [tool.name, tool]));

export function chatToolDefinitions(): WorkersAiToolDefinition[] {
  return CHAT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/**
 * Execute one tool call. Errors come back as data for the model to relay,
 * never as a thrown 500: a failed lookup is an answer, not an outage.
 */
export async function executeChatTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ChatToolContext,
): Promise<ChatToolResult> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) {
    return { data: { error: `Unknown tool: ${name.slice(0, 60)}` } };
  }
  try {
    return await tool.handler(args, ctx);
  } catch (error) {
    console.error(`[chat-tools] ${name} failed:`, error);
    return { data: { error: 'That lookup failed. Tell the user to try again in a moment.' } };
  }
}
