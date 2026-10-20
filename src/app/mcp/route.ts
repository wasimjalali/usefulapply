import {
  createMcpHandler,
  originValidationResponse,
  type AuthInfo,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import { getAuthBaseUrl } from '@/lib/auth/site-url';
import { resourceMetadataUrl, verifyMcpBearer } from '@/lib/mcp/auth';
import { getMcpResourceUrl, isMcpEnabled } from '@/lib/mcp/config';
import { createMcpServer } from '@/lib/mcp/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

/**
 * Streamable HTTP MCP server, stateless: a new McpServer per request, no
 * session, served by `@modelcontextprotocol/server` v2's own `createMcpHandler`
 * (legacy stateless clients included). Off (404) unless MCP_ENABLED is "true".
 *
 * Order: flag, Origin check, bearer token (signature, audience, expiry,
 * revocation), rate limit on the token's user, then the SDK handler, which
 * enforces each tool's scope (403 insufficient_scope) before the tool runs.
 */

// Browsers set Origin; MCP clients that run server-side (Claude, ChatGPT) do not.
// This list is the DNS-rebinding guard for the browser case.
const ALLOWED_ORIGIN_HOSTNAMES = [
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'platform.openai.com',
  'localhost',
  '127.0.0.1',
  '[::1]',
];

let handler: McpHttpHandler | null = null;

function getHandler(): McpHttpHandler {
  handler ??= createMcpHandler((ctx) => createMcpServer(ctx.authInfo), {
    legacy: 'stateless',
    onerror: (error) => console.error('[mcp] handler error', error.message),
  });
  return handler;
}

function jsonRpcError(status: number, message: string, headers?: HeadersInit): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}

async function handle(request: Request): Promise<Response> {
  if (!isMcpEnabled()) return new Response('Not Found', { status: 404 });

  try {
    const siteHostname = new URL(getAuthBaseUrl()).hostname;
    const originRejection = originValidationResponse(request, [
      ...ALLOWED_ORIGIN_HOSTNAMES,
      siteHostname,
      `www.${siteHostname}`,
    ]);
    if (originRejection) return originRejection;

    const verified = await verifyMcpBearer(request);
    if (verified instanceof Response) return verified;

    const limit = await checkRateLimit(`mcp:${verified.userId}`, RATE_LIMITS.mcp);
    if (!limit.allowed) {
      return jsonRpcError(429, 'Too many requests. Try again shortly.', {
        'Retry-After': String(Math.ceil((limit.retryAfterMs ?? 60_000) / 1000)),
      });
    }

    const authInfo: AuthInfo = {
      token: verified.token,
      clientId: verified.clientId,
      scopes: verified.scopes,
      expiresAt: verified.expiresAt,
      resource: new URL(getMcpResourceUrl()),
      resourceMetadataUrl: resourceMetadataUrl(),
      extra: { userId: verified.userId },
    };
    return await getHandler().fetch(request, { authInfo });
  } catch (error) {
    console.error('[mcp] request failed', error instanceof Error ? error.message : error);
    return jsonRpcError(500, 'Something went wrong.');
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
