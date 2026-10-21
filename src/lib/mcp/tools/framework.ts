import {
  CLIENT_CAPABILITIES_META_KEY,
  acceptedContent,
  inputRequired,
  inputResponse,
  requireScopes,
  type AuthInfo,
  type CallToolResult,
  type ContentBlock,
  type InputRequiredResult,
  type McpServer,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getOAuthClientName } from '@/db/repos/mcpGrants';
import { captureMcpToolCall } from '@/lib/mcp/analytics';
import { TOOL_SCOPES, type McpScope, type ToolName } from '@/lib/mcp/scopes';
import { toToolFailure } from '@/lib/mcp/tools/errors';

/**
 * How every /mcp tool is defined, registered and run.
 *
 * A tool is data: a name, a title, a one or two sentence description, the four
 * annotations as static booleans, a zod input schema, a zod output schema and a
 * `run` function. The wrapper below is the only code that touches the MCP
 * transport, so every tool gets the same guarantees without repeating them:
 *
 * - the user id is read ONLY from the verified token (`authInfo.extra.userId`).
 *   No tool takes a user id as input;
 * - the scope in scopes.ts is enforced twice: the SDK refuses the call with a 403
 *   `insufficient_scope` challenge before the tool runs (`scopeChallenge`), and
 *   the wrapper checks again;
 * - whatever `run` throws becomes a short, actionable message with no internals
 *   (see errors.ts), and no `error.message` from a library ever leaves;
 * - a result always carries `structuredContent` plus the same JSON as a text
 *   block, validated against the output schema first so a bug in a schema is a
 *   generic error, not a leaked validation message;
 * - destructive tools can ask the user to confirm through MCP elicitation when
 *   the client says it supports it; otherwise they run, and `destructiveHint`
 *   is what makes Claude and ChatGPT ask. There is no model-set `confirm` flag;
 * - one `mcp_tool_called` event per call: tool, client, duration, outcome.
 */

export interface ToolHints {
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  openWorld: boolean;
}

export interface ToolContext {
  /** From the verified token. Never from tool input. */
  userId: string;
  clientId: string;
  scopes: readonly string[];
}

export interface ToolResult {
  structured: Record<string, unknown>;
  /** Extra content blocks after the JSON text block, e.g. resource links to exported files. */
  extraContent?: ContentBlock[];
}

export interface ToolDefinition<I extends z.ZodObject = z.ZodObject, O extends z.ZodObject = z.ZodObject> {
  name: ToolName;
  title: string;
  /** One or two neutral sentences. A prerequisite is phrased as a parameter description, not an instruction. */
  description: string;
  hints: ToolHints;
  input: I;
  output: O;
  /**
   * Destructive tools only. The question to put to the user in a confirmation form, or null when
   * this particular call needs none (for example, nothing is being replaced). Only asked when the
   * client declares elicitation support.
   */
  confirm?: (args: z.infer<I>, ctx: ToolContext) => Promise<string | null> | string | null;
  run: (args: z.infer<I>, ctx: ToolContext) => Promise<ToolResult>;
}

// The registry stores definitions with their schemas erased: each tool's `run` was checked against its own schemas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any, any>;

export function defineTool<I extends z.ZodObject, O extends z.ZodObject>(definition: ToolDefinition<I, O>): AnyToolDefinition {
  return definition as AnyToolDefinition;
}

function userIdFrom(authInfo: AuthInfo | undefined): string | null {
  const id = authInfo?.extra?.userId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

const GENERIC_ERROR = 'Something went wrong. Try again in a moment.';

/** Does the client say, on this request, that it can show the user a form? Only the 2026-07-28 wire carries that per request. */
function clientCanElicit(ctx: ServerContext): boolean {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as { elicitation?: unknown } | undefined;
  return Boolean(capabilities && typeof capabilities === 'object' && capabilities.elicitation);
}

const confirmationForm = z.object({
  confirm: z.boolean().describe('Set to true to go ahead.'),
});

type Confirmation =
  | { kind: 'go' }
  | { kind: 'declined' }
  | { kind: 'ask'; result: InputRequiredResult };

/**
 * The user's answer to a confirmation form, or the form itself. The answer comes back on a retried
 * call (`ctx.mcpReq.inputResponses`), so this is stateless. A client that cannot show a form gets
 * `go`: the tool runs, and the destructiveHint is what made the client ask before calling it.
 */
function confirmation(ctx: ServerContext, message: string): Confirmation {
  const answer = inputResponse(ctx.mcpReq.inputResponses, 'confirm');
  if (answer.kind === 'elicit') {
    const accepted = acceptedContent(ctx.mcpReq.inputResponses, 'confirm', confirmationForm);
    return accepted?.confirm === true ? { kind: 'go' } : { kind: 'declined' };
  }
  if (!clientCanElicit(ctx)) return { kind: 'go' };
  return {
    kind: 'ask',
    result: inputRequired({
      inputRequests: {
        confirm: inputRequired.elicit({ message, requestedSchema: confirmationForm }),
      },
    }),
  };
}

function successResult(definition: AnyToolDefinition, result: ToolResult): CallToolResult {
  const parsed = definition.output.safeParse(result.structured);
  if (!parsed.success) {
    console.error('[mcp] tool result does not match its output schema:', definition.name, parsed.error.issues.slice(0, 3).map((issue: { path: PropertyKey[] }) => issue.path.join('.')));
    return errorResult(GENERIC_ERROR);
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(parsed.data) }, ...(result.extraContent ?? [])],
    structuredContent: parsed.data,
  };
}

/** Register one tool. The scope comes from scopes.ts so it cannot drift from the definition. */
function registerOne(server: McpServer, definition: AnyToolDefinition, authInfo: AuthInfo | undefined): void {
  const scope = (TOOL_SCOPES as Record<string, McpScope>)[definition.name];
  server.registerTool(
    definition.name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.input,
      outputSchema: definition.output,
      annotations: {
        title: definition.title,
        readOnlyHint: definition.hints.readOnly,
        destructiveHint: definition.hints.destructive,
        idempotentHint: definition.hints.idempotent,
        openWorldHint: definition.hints.openWorld,
      },
      scopeChallenge: requireScopes(scope),
    },
    async (args: unknown, serverCtx: ServerContext): Promise<CallToolResult | InputRequiredResult> => {
      const started = Date.now();
      const userId = userIdFrom(authInfo);
      if (!userId || !authInfo || !authInfo.scopes.includes(scope)) {
        return errorResult('This app is not allowed to do that.');
      }
      const ctx: ToolContext = { userId, clientId: authInfo.clientId, scopes: authInfo.scopes };
      const record = async (outcome: 'ok' | 'error' | 'confirmation_requested' | 'declined', errorClass?: string) => {
        let clientName: string | null = null;
        try {
          clientName = await getOAuthClientName(authInfo.clientId);
        } catch {
          clientName = null;
        }
        await captureMcpToolCall({ tool: definition.name, userId, clientName, durationMs: Date.now() - started, outcome, errorClass });
      };
      try {
        if (definition.hints.destructive && definition.confirm) {
          const question = await definition.confirm(args, ctx);
          if (question) {
            const decision = confirmation(serverCtx, question);
            if (decision.kind === 'ask') {
              await record('confirmation_requested');
              return decision.result;
            }
            if (decision.kind === 'declined') {
              await record('declined');
              return errorResult('The user declined the confirmation form, so nothing was changed.');
            }
          }
        }
        const result = await definition.run(args, ctx);
        const response = successResult(definition, result);
        await record(response.isError ? 'error' : 'ok', response.isError ? 'output_schema' : undefined);
        return response;
      } catch (error) {
        const failure = toToolFailure(error);
        if (failure.errorClass === 'internal') {
          // Server logs only. The class name and a short message, never the stack or any user content.
          console.error('[mcp] tool failed', definition.name, error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : 'unknown');
        }
        await record('error', failure.errorClass);
        return errorResult(failure.message);
      }
    },
  );
}

export function registerCatalog(server: McpServer, authInfo: AuthInfo | undefined, definitions: readonly AnyToolDefinition[]): void {
  for (const definition of definitions) registerOne(server, definition, authInfo);
}

// ---------------------------------------------------------------------------
// Small helpers the tool modules share
// ---------------------------------------------------------------------------

export function ok(structured: Record<string, unknown>, extraContent?: ContentBlock[]): ToolResult {
  return { structured, extraContent };
}
