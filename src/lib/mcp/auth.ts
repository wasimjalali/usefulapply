import { createResourceServerChallenge } from '@better-auth/oauth-provider';
import { APIError } from 'better-auth/api';
import { verifyJwsAccessToken } from 'better-auth/oauth2';
import { errors as joseErrors, type JWTPayload } from 'jose';
import { getAuth } from '@/auth/server';
import { getGrantState, grantProblem, touchGrantLastUsed } from '@/db/repos/mcpGrants';
import { getMcpResourceUrl, MCP_JWT_ALG } from '@/lib/mcp/config';
import { parseScopeClaim } from '@/lib/mcp/scopes';

/**
 * Bearer-token check for /mcp.
 *
 * `requireMcpAuth` from @better-auth/mcp verifies the same JWT, but it reads
 * the signing keys over HTTP from `<issuer>/jwks`. From inside the Worker that
 * is a request to our own hostname (and to localhost in preview, which
 * `global_fetch_strictly_public` refuses), so a failure there reads as "invalid
 * token" for every caller. This reads the keys in-process through
 * `auth.api.getJwks()` and keeps everything else the same: signature, issuer,
 * audience (the /mcp resource) and expiry through Better Auth's own
 * `verifyJwsAccessToken`, and RFC 9728 / RFC 6750 challenges through its own
 * `createResourceServerChallenge`.
 *
 * On top of that it applies our revocation record (see mcpGrants.ts).
 */

export interface VerifiedMcpToken {
  token: string;
  userId: string;
  clientId: string;
  scopes: string[];
  expiresAt: number | undefined;
  claims: JWTPayload;
}

export const MCP_CHALLENGE_SCOPES = ['read', 'write', 'spend', 'offline_access'] as const;

const jwksCacheKey = {};

export function resourceMetadataUrl(): string {
  const resource = new URL(getMcpResourceUrl());
  return `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
}

function challengeResponse(error: APIError): Response {
  const challenge = createResourceServerChallenge(error, getMcpResourceUrl(), {
    challengeScopes: MCP_CHALLENGE_SCOPES,
  });
  if (!challenge) {
    return Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Forbidden' }, id: null }, { status: 403 });
  }
  const headers = new Headers(challenge.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: challenge.message }, id: null }),
    { status: challenge.statusCode, headers },
  );
}

/** 401 for a token that was presented but is not acceptable: RFC 6750 adds `error="invalid_token"` to the RFC 9728 challenge. */
function unauthorized(message: string): Response {
  const response = challengeResponse(
    new APIError('UNAUTHORIZED', { message, error: 'invalid_token', error_description: message }),
  );
  const headers = new Headers(response.headers);
  headers.set(
    'WWW-Authenticate',
    `Bearer error="invalid_token", error_description="${message}", resource_metadata="${resourceMetadataUrl()}", scope="${MCP_CHALLENGE_SCOPES.join(' ')}"`,
  );
  return new Response(response.body, { status: 401, headers });
}

/** Returns the verified token, or the 401 challenge to send back. */
export async function verifyMcpBearer(request: Request): Promise<VerifiedMcpToken | Response> {
  const header = request.headers.get('authorization');
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  if (!match) {
    // No credentials: the bare challenge that starts the OAuth flow.
    return challengeResponse(new APIError('UNAUTHORIZED', { message: 'Authentication required' }));
  }
  const token = match[1];

  const auth = await getAuth();
  const { baseURL } = await auth.$context;

  let claims: JWTPayload;
  try {
    claims = await verifyJwsAccessToken(token, {
      jwksFetch: async () => (await auth.api.getJwks()) as never,
      jwksCacheKey,
      // typ: oauth-provider signs access tokens with the at+jwt header (RFC 9068), which keeps other JWTs we sign from passing as one.
      // algorithms: the one the jwt plugin is configured to sign with (see server.ts); nothing else is accepted.
      verifyOptions: { issuer: baseURL, audience: getMcpResourceUrl(), typ: 'at+jwt', algorithms: [MCP_JWT_ALG] },
    });
  } catch (error) {
    if (error instanceof joseErrors.JOSEError || (error instanceof Error && error.name === 'TypeError')) {
      return unauthorized(error instanceof joseErrors.JWTExpired ? 'The access token expired' : 'The access token is not valid');
    }
    throw error;
  }

  // Sender-constrained (DPoP) tokens are not supported.
  if (claims.cnf) return unauthorized('The access token is not valid');

  const userId = typeof claims.sub === 'string' ? claims.sub : '';
  const clientId = typeof claims.azp === 'string' ? claims.azp : '';
  if (!userId || !clientId) return unauthorized('The access token is not valid');

  const scopes = [...parseScopeClaim(claims.scope)];
  let state = await getGrantState(userId, clientId);
  let problem = grantProblem(state, claims.iat, scopes);
  if (problem) {
    // The cached state may predate a reconnect (a revoke, then a new consent and a new token).
    // Re-read before refusing; a refused token costs one query, an accepted one still rides the cache.
    state = await getGrantState(userId, clientId, true);
    problem = grantProblem(state, claims.iat, scopes);
  }
  if (problem) return unauthorized(problem);
  // Best effort: "last used" (written at most every 5 minutes) must not fail a request.
  try {
    await touchGrantLastUsed(userId, clientId, state);
  } catch (error) {
    console.error('[mcp] last_used write failed', error instanceof Error ? error.message : error);
  }

  return {
    token,
    userId,
    clientId,
    scopes,
    expiresAt: typeof claims.exp === 'number' ? claims.exp : undefined,
    claims,
  };
}
