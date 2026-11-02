/**
 * Redirect URIs an MCP client may use. Exact match for the hosted clients,
 * plus loopback on any port for native clients (Claude Code and other
 * CLIs/editors listen on a random local port). Enforced twice: when a client
 * registers (DCR) and again at authorization time, which also covers clients
 * that identify themselves with a Client ID Metadata Document.
 */
const EXACT_REDIRECT_URIS: ReadonlySet<string> = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://platform.openai.com/apps-manage/oauth',
  // Cursor web and Cursor Agents (cursor.com/docs/context/mcp, "Static redirect URL"). The desktop app uses loopback.
  'https://www.cursor.com/agents/mcp/oauth/callback',
  // Executor MCP gateway (executor.sh).
  'https://executor.sh/api/oauth/callback',
]);

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedRedirectUri(uri: string): boolean {
  if (EXACT_REDIRECT_URIS.has(uri)) return true;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (
    url.protocol === 'http:'
    && LOOPBACK_HOSTS.has(url.hostname)
    && !url.username
    && !url.password
    && !uri.includes('#')
  );
}
