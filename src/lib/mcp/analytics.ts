import { getPostHogServer } from '@/lib/posthog-server';

/**
 * `mcp_tool_called`: which tool, which client, how long, and how it ended. Never content:
 * no arguments, no results, no error messages, no CV or job text. The user id is the PostHog
 * distinct id like every other server event.
 */
export interface McpToolCall {
  tool: string;
  userId: string;
  clientName: string | null;
  durationMs: number;
  outcome: 'ok' | 'error' | 'confirmation_requested' | 'declined';
  /** A short class like `not_found` or `revision_conflict`. Never an error message. */
  errorClass?: string;
}

export async function captureMcpToolCall(call: McpToolCall): Promise<void> {
  try {
    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: call.userId,
      event: 'mcp_tool_called',
      properties: {
        tool: call.tool,
        client_name: call.clientName,
        duration_ms: Math.round(call.durationMs),
        outcome: call.outcome,
        ...(call.errorClass ? { error_class: call.errorClass } : {}),
      },
    });
    await posthog.flush();
  } catch {
    // Analytics never fails a tool call.
  }
}
