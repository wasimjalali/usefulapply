/**
 * OAuth scopes for the MCP server and the scope every tool needs.
 *
 * - read: look at the account, applications, CVs and the feed.
 * - write: change tracker data, CVs, profile and settings. Spends nothing.
 * - spend: start work that costs credits.
 *
 * Exact membership, no hierarchy: a token with `spend` still needs `write`
 * for a write tool. The /mcp route checks the scope before a call reaches the
 * tool (a missing scope is a 403 insufficient_scope the client can step up
 * from) and each tool checks it again.
 */
export const MCP_SCOPES = ['read', 'write', 'spend'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

/** `offline_access` is what makes the server issue a refresh token. It grants no tool access. */
export const OAUTH_SCOPES = [...MCP_SCOPES, 'offline_access'] as const;

export const SCOPE_LABELS: Record<McpScope, { title: string; detail: string }> = {
  read: { title: 'Read', detail: 'See your account, credits, CVs and applications.' },
  write: { title: 'Edit', detail: 'Change your applications, CVs and profile. Costs no credits.' },
  spend: { title: 'Spend credits', detail: 'Start work that uses your credits, up to your daily agent limit.' },
};

/** Every MCP tool and the one scope it needs. A tool missing here cannot be called. */
export const TOOL_SCOPES = {
  get_account: 'read',
} as const satisfies Record<string, McpScope>;

/** Test-only tools (MCP_TEST_MODE on localhost). Same rule: scope declared next to the name. */
export const TEST_TOOL_SCOPES = {
  test_write_stub: 'write',
} as const satisfies Record<string, McpScope>;

export type ToolName = keyof typeof TOOL_SCOPES | keyof typeof TEST_TOOL_SCOPES;

export function requiredScopeFor(tool: string, testMode: boolean): McpScope | null {
  if (Object.hasOwn(TOOL_SCOPES, tool)) return TOOL_SCOPES[tool as keyof typeof TOOL_SCOPES];
  if (testMode && Object.hasOwn(TEST_TOOL_SCOPES, tool)) {
    return TEST_TOOL_SCOPES[tool as keyof typeof TEST_TOOL_SCOPES];
  }
  return null;
}

/** Space-separated `scope` claim (or an array) to a set. */
export function parseScopeClaim(claim: unknown): Set<string> {
  if (typeof claim === 'string') return new Set(claim.split(/\s+/).filter(Boolean));
  if (Array.isArray(claim)) return new Set(claim.filter((s): s is string => typeof s === 'string'));
  return new Set();
}

export function hasScope(granted: ReadonlySet<string>, needed: McpScope): boolean {
  return granted.has(needed);
}
