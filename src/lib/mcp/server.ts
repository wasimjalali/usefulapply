import { McpServer, requireScopes, type AuthInfo, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getDocuments } from '@/db/repos/documents';
import { getTotalCredits, getUserCredits } from '@/db/repos/credits';
import { getProfile } from '@/db/repos/profiles';
import { isMcpTestMode } from '@/lib/mcp/config';
import { TEST_TOOL_SCOPES, TOOL_SCOPES, type McpScope } from '@/lib/mcp/scopes';

/**
 * The /mcp tool set. `userId` only ever comes from the verified token, which
 * the route passes in as `authInfo.extra.userId`; no tool takes a user id as
 * an argument.
 *
 * Every tool declares its scope in scopes.ts. `scopeChallenge` makes the SDK
 * refuse a call whose token lacks that scope with a 403 `insufficient_scope`
 * challenge before the tool runs, and the wrapper below checks again so a tool
 * can never run without it.
 */

const GENERIC_ERROR = 'Something went wrong. Try again in a moment.';

function userIdFrom(authInfo: AuthInfo | undefined): string | null {
  const id = authInfo?.extra?.userId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function textResult(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

const getAccountOutput = z.object({
  plan: z.string(),
  credits: z.object({
    monthly: z.number(),
    rollover: z.number(),
    addon: z.number(),
    total: z.number(),
  }),
  nextResetDate: z.string().nullable(),
  cvOnFile: z.object({ primary: z.boolean(), master: z.boolean() }),
  profile: z.object({ name: z.string().nullable(), email: z.string() }),
});

async function getAccount(userId: string): Promise<CallToolResult> {
  const [{ credits, error }, profile, documents] = await Promise.all([
    getUserCredits(userId),
    getProfile(userId),
    getDocuments(userId),
  ]);
  if (error || !credits || !profile) {
    console.error('[mcp] get_account failed', error?.message ?? 'missing credits or profile');
    return errorResult(GENERIC_ERROR);
  }
  return textResult({
    plan: credits.plan_tier,
    credits: {
      monthly: credits.monthly_credits,
      rollover: credits.rollover_credits,
      addon: credits.addon_credits,
      total: getTotalCredits(credits),
    },
    nextResetDate: credits.next_reset_date,
    cvOnFile: {
      primary: documents.some((d) => d.type === 'primary_cv'),
      master: documents.some((d) => d.type === 'master_cv'),
    },
    profile: { name: profile.full_name, email: profile.email },
  });
}

/** Run a tool body only for a token that holds the tool's scope and names a user. */
function guarded(
  scope: McpScope,
  authInfo: AuthInfo | undefined,
  body: (userId: string) => Promise<CallToolResult>,
): () => Promise<CallToolResult> {
  return async () => {
    const userId = userIdFrom(authInfo);
    if (!userId || !authInfo?.scopes.includes(scope)) return errorResult('This app is not allowed to do that.');
    try {
      return await body(userId);
    } catch (error) {
      console.error('[mcp] tool failed', error instanceof Error ? error.message : error);
      return errorResult(GENERIC_ERROR);
    }
  };
}

export function createMcpServer(authInfo: AuthInfo | undefined): McpServer {
  const server = new McpServer({ name: 'useful-apply', version: '1.0.0' });

  server.registerTool(
    'get_account',
    {
      title: 'Get account',
      description:
        'Returns the signed-in user\'s plan, credit balance (monthly, rollover, add-on and total), next credit reset date, whether a primary and a master CV are on file, and their profile name and email.',
      inputSchema: z.object({}),
      outputSchema: getAccountOutput,
      annotations: {
        title: 'Get account',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      scopeChallenge: requireScopes(TOOL_SCOPES.get_account),
    },
    guarded(TOOL_SCOPES.get_account, authInfo, getAccount),
  );

  if (isMcpTestMode()) {
    // Lets the E2E prove a read-only token cannot reach a write tool. Never registered outside localhost test mode.
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
          openWorldHint: false,
        },
        scopeChallenge: requireScopes(TEST_TOOL_SCOPES.test_write_stub),
      },
      guarded(TEST_TOOL_SCOPES.test_write_stub, authInfo, async () => textResult({ ok: true })),
    );
  }

  return server;
}
