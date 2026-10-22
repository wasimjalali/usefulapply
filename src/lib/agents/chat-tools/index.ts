/**
 * Chat tool registry. The chat route passes chatToolDefinitions() to
 * callHaiku and runs executeChatTool() for each tool call the model
 * returns. Max rounds are enforced by the route, not here.
 */

import type { HaikuToolDefinition } from '@/lib/models/haiku';
import { READ_TOOLS } from './read-tools';
import { APP_TOOLS } from './app-tools';
import { INTENT_TOOLS } from './intent';
import { WRITE_TOOLS } from './write-tools';
import { FEED_TOOLS } from './feed-tools';
import { KIT_TOOLS } from './kit-tools';
import { CV_TOOLS } from './cv-tools';
import { NAVIGATE_TOOLS } from './navigate';
import { MAX_TOOL_RESULT_CHARS, type ChatTool, type ChatToolContext, type ChatToolResult } from './types';

export type { ChatToolContext, ChatToolResult, ExecutedEffect, ChatActionChip, NavigateTarget } from './types';
export { MAX_TOOL_RESULT_CHARS } from './types';

export const CHAT_TOOLS: ChatTool[] = [...READ_TOOLS, ...APP_TOOLS, ...INTENT_TOOLS, ...NAVIGATE_TOOLS, ...WRITE_TOOLS, ...FEED_TOOLS, ...KIT_TOOLS, ...CV_TOOLS];

const TOOLS_BY_NAME = new Map(CHAT_TOOLS.map((tool) => [tool.name, tool]));

/**
 * A deep copy with every object's keys in sorted order. Arrays keep their
 * order (enums and `required` lists mean something in order). The tool
 * definitions open the cached prefix, so their bytes must not depend on how
 * a schema object happened to be built.
 */
function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, withSortedKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

// Built once per isolate: the same order (CHAT_TOOLS) and the same bytes for
// every user and every request, so tools + system stay one cache entry.
const TOOL_DEFINITIONS: readonly HaikuToolDefinition[] = Object.freeze(
  CHAT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: withSortedKeys(tool.parameters) as Record<string, unknown>,
  })),
);

export function chatToolDefinitions(): HaikuToolDefinition[] {
  return [...TOOL_DEFINITIONS];
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
  let result: ChatToolResult;
  try {
    result = await tool.handler(args, ctx);
  } catch (error) {
    console.error(`[chat-tools] ${name} failed:`, error);
    return {
      data: { error: 'That action failed. Tell the user what did not run and to try again in a moment.' },
      failed: true,
    };
  }
  // Handlers cap their own lists (fitListsToBudget). Anything still over the
  // cap is a handler bug: refuse it loudly instead of cutting JSON or sending
  // a result that can push the round over the input budget. Effects and chips
  // the handler already produced are kept, because they already happened.
  const serialized = JSON.stringify(result.data);
  if (typeof serialized !== 'string' || serialized.length > MAX_TOOL_RESULT_CHARS) {
    console.error(`[chat-tools] ${name} returned an oversized result: ${serialized?.length ?? 'unserializable'} chars`);
    return {
      ...result,
      data: { error: 'That result was too large to read here. Tell the user to ask about one thing at a time.' },
      failed: true,
    };
  }
  return result;
}
