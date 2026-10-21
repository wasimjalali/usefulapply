import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
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
  return server;
}
