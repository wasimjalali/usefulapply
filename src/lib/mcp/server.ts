import { McpServer, requireScopes, type AuthInfo, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { isMcpTestMode } from '@/lib/mcp/config';
import { TEST_TOOL_SCOPES } from '@/lib/mcp/scopes';
import { CATALOG } from '@/lib/mcp/tools/catalog';
import { registerCatalog } from '@/lib/mcp/tools/framework';

/**
 * The /mcp tool set. `userId` only ever comes from the verified token, which
 * the route passes in as `authInfo.extra.userId`; no tool takes a user id as
 * an argument. Every catalog tool is defined in src/lib/mcp/tools/ and runs
 * through the framework wrapper (scope check, errors, analytics, elicitation).
 */

export function createMcpServer(authInfo: AuthInfo | undefined): McpServer {
  const server = new McpServer({ name: 'useful-apply', version: '1.0.0' });

  registerCatalog(server, authInfo, CATALOG);

  if (isMcpTestMode()) {
    // Lets the E2E prove a read-only token cannot reach a write tool. Never registered outside localhost test mode.
    const scope = TEST_TOOL_SCOPES.test_write_stub;
    server.registerTool(
      'test_write_stub',
      {
        title: 'Test write stub',
        description: 'Test-only tool that changes nothing.',
        inputSchema: z.object({}),
        annotations: {
          title: 'Test write stub',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes(scope),
      },
      async (): Promise<CallToolResult> => {
        const userId = authInfo?.extra?.userId;
        if (typeof userId !== 'string' || !authInfo?.scopes.includes(scope)) {
          return { isError: true, content: [{ type: 'text', text: 'This app is not allowed to do that.' }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }], structuredContent: { ok: true } };
      },
    );
  }

  return server;
}
