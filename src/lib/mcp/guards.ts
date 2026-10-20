import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { bindTokens, getTokenGeneration } from '@/db/repos/mcpGrants';
import { isMcpTestMode } from '@/lib/mcp/config';
import { setTestIssuePause } from '@/lib/mcp/test-hooks';
import { isAllowedRedirectUri } from '@/lib/mcp/redirects';

/**
 * Hooks on Better Auth's OAuth endpoints that the provider has no option for.
 *
 * Registration (`/oauth2/register`) is open (no login), so it is the one place
 * an unknown party can put data in our database. It takes a small, fixed set of
 * fields and rejects the rest. The raw body size is capped earlier, in the auth
 * route, before Better Auth reads it.
 *
 * Token (`/oauth2/token`): every token is bound to a consent generation (the
 * consent row's id; see mcpTokenGeneration). The before-hook refuses a code or
 * refresh token unless a consent exists, was given before the code or refresh
 * token was issued, and (for a refresh token) is the generation the refresh
 * token is bound to and covers its scopes. It remembers the consent id it
 * checked. The after-hook binds the access and refresh tokens the provider
 * issued to that id, then re-reads the consent: if the user revoked (and maybe
 * reconnected) while the provider was issuing, the refresh row is deleted and
 * the response becomes invalid_grant, so a late exchange cannot revive a
 * connection. /mcp checks the same binding, which covers whatever slips
 * through between those steps.
 *
 * Revoke deletes pending codes, tokens, bindings and the consent outright
 * (mcpGrants.ts); the hooks are the backstop for requests already in flight.
 *
 * The hooks hash a token the way the provider stores it: SHA-256, base64url, no
 * padding, no prefix. Setting `prefix.refreshToken` (or a custom `storeTokens`)
 * on mcp() changes the stored form and silently disables the lookups for refresh
 * tokens, so the revoke checks would stop working.
 */

export const MAX_REGISTRATION_BODY_BYTES = 8 * 1024;
const MAX_CLIENT_NAME = 80;
const MAX_URI = 512;
const MAX_CONTACTS = 3;
const MAX_REDIRECT_URIS = 10;

/** Fields a registering client may not send at all. */
const FORBIDDEN_REGISTRATION_FIELDS = [
  'software_statement',
  'jwks',
  'jwks_uri',
  'backchannel_logout_uri',
  'post_logout_redirect_uris',
] as const;

function invalidMetadata(description: string): APIError {
  return new APIError('BAD_REQUEST', { error: 'invalid_client_metadata', error_description: description });
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Throws for a registration request that is outside what we accept. Exported for the route's own use and tests. */
export function validateRegistrationBody(body: unknown): void {
  const data = (body ?? {}) as Record<string, unknown>;

  for (const field of FORBIDDEN_REGISTRATION_FIELDS) {
    if (isPresent(data[field])) throw invalidMetadata(`${field} is not accepted`);
  }

  const name = data.client_name;
  if (name !== undefined && (typeof name !== 'string' || name.length > MAX_CLIENT_NAME)) {
    throw invalidMetadata(`client_name must be a string of at most ${MAX_CLIENT_NAME} characters`);
  }
  for (const field of ['logo_uri', 'client_uri', 'tos_uri', 'policy_uri'] as const) {
    const value = data[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > MAX_URI)) {
      throw invalidMetadata(`${field} must be a string of at most ${MAX_URI} characters`);
    }
  }
  if (data.contacts !== undefined) {
    const contacts = data.contacts;
    if (!Array.isArray(contacts) || contacts.length > MAX_CONTACTS || contacts.some((c) => typeof c !== 'string' || c.length > 254)) {
      throw invalidMetadata(`contacts takes at most ${MAX_CONTACTS} short strings`);
    }
  }

  const uris = data.redirect_uris;
  if (
    !Array.isArray(uris)
    || uris.length === 0
    || uris.length > MAX_REDIRECT_URIS
    || !uris.every((u) => typeof u === 'string' && u.length <= MAX_URI && isAllowedRedirectUri(u))
  ) {
    throw new APIError('BAD_REQUEST', {
      error: 'invalid_redirect_uri',
      error_description: 'redirect_uris must be on the allowed list',
    });
  }
}

/** Same value Better Auth stores for a token: SHA-256, base64url, no padding. */
async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Refresh tokens live 30 days (mcp() refreshTokenExpiresIn in server.ts). */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface ExchangeStash {
  userId: string;
  clientId: string;
  /** The consent row id the exchange was authorised under, read when it started. */
  consentId: string;
}

/** Hand-off from the before-hook to the after-hook of one /oauth2/token request. */
const exchanges = new WeakMap<Request, ExchangeStash>();

function asScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      return value.split(/\s+/).filter(Boolean);
    }
  }
  return [];
}

function revoked(): APIError {
  return new APIError('BAD_REQUEST', { error: 'invalid_grant', error_description: 'authorization was revoked' });
}

function jwtPayload(token: string): { jti?: unknown; exp?: unknown } | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { jti?: unknown; exp?: unknown };
  } catch {
    return null;
  }
}

export function mcpOAuthGuards(): BetterAuthPlugin {
  return {
    id: 'ua-mcp-oauth-guards',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/oauth2/register',
          handler: createAuthMiddleware(async (ctx) => {
            validateRegistrationBody(ctx.body);
          }),
        },
        {
          matcher: (ctx) => ctx.path === '/oauth2/token',
          handler: createAuthMiddleware(async (ctx) => {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            let userId: string | undefined;
            let clientId: string | undefined;
            let issuedAt: number | undefined;
            let refreshHash: string | undefined;
            let refreshScopes: string[] | undefined;

            if (body.grant_type === 'authorization_code' && typeof body.code === 'string') {
              const pending = await ctx.context.internalAdapter.findVerificationValue(await hashToken(body.code));
              if (!pending) return; // unknown or used code: Better Auth answers invalid_grant
              try {
                const parsed = JSON.parse(pending.value) as { userId?: string; query?: { client_id?: string } };
                userId = parsed.userId;
                clientId = parsed.query?.client_id;
                issuedAt = new Date(pending.createdAt).getTime();
              } catch {
                return;
              }
            } else if (body.grant_type === 'refresh_token' && typeof body.refresh_token === 'string') {
              refreshHash = await hashToken(body.refresh_token);
              const row = await ctx.context.adapter.findOne<{ userId: string; clientId: string; createdAt: Date; scopes: unknown }>({
                model: 'oauthRefreshToken',
                where: [{ field: 'token', value: refreshHash }],
              });
              if (!row) return;
              userId = row.userId;
              clientId = row.clientId;
              issuedAt = new Date(row.createdAt).getTime();
              refreshScopes = asScopes(row.scopes);
            } else {
              return;
            }

            if (!userId || !clientId) return;
            const consent = await ctx.context.adapter.findOne<{ id: string; createdAt: Date; scopes: unknown }>({
              model: 'oauthConsent',
              where: [
                { field: 'userId', value: userId },
                { field: 'clientId', value: clientId },
              ],
            });
            if (!consent) throw revoked();
            // Timestamps here have one-second resolution, and a code or refresh token is created
            // after the consent in the same request, so "older" is strictly less.
            const consentedAt = new Date(consent.createdAt).getTime();
            if (issuedAt !== undefined && Number.isFinite(consentedAt) && issuedAt < consentedAt) throw revoked();

            if (refreshHash !== undefined && refreshScopes !== undefined) {
              // The refresh token belongs to the connection the user has now, and does not exceed it.
              if ((await getTokenGeneration(`rt:${refreshHash}`, true)) !== consent.id) throw revoked();
              const consented = new Set(asScopes(consent.scopes));
              if (refreshScopes.some((scope) => !consented.has(scope))) throw revoked();
            }

            if (ctx.request) exchanges.set(ctx.request, { userId, clientId, consentId: consent.id });
            if (isMcpTestMode()) {
              // Test only: stretch the provider's issuance step so the E2E can revoke and reconnect mid-exchange.
              setTestIssuePause(Number(ctx.request?.headers.get('x-test-issue-pause-ms')) || 0);
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === '/oauth2/token',
          handler: createAuthMiddleware(async (ctx) => {
            const exchange = ctx.request ? exchanges.get(ctx.request) : undefined;
            if (!exchange || !ctx.request) return;
            exchanges.delete(ctx.request);

            const returned = ctx.context.returned as Record<string, unknown> | undefined;
            const access = typeof returned?.access_token === 'string' ? returned.access_token : null;
            if (!access) return; // an error response: nothing was issued
            const refresh = typeof returned?.refresh_token === 'string' ? returned.refresh_token : null;

            // Bind first, to the consent the exchange was authorised under (not whatever is current now).
            const now = Date.now();
            const claims = jwtPayload(access);
            const bindings = [];
            if (typeof claims?.jti === 'string') {
              const exp = typeof claims.exp === 'number' ? claims.exp * 1000 : now + 15 * 60_000;
              bindings.push({ tokenKey: `at:${claims.jti}`, consentId: exchange.consentId, userId: exchange.userId, clientId: exchange.clientId, expiresAt: exp });
            }
            const refreshHash = refresh ? await hashToken(refresh) : null;
            if (refreshHash) {
              bindings.push({ tokenKey: `rt:${refreshHash}`, consentId: exchange.consentId, userId: exchange.userId, clientId: exchange.clientId, expiresAt: now + REFRESH_TOKEN_TTL_MS });
            }
            await bindTokens(bindings);

            // Then check the connection is still the one it was authorised under. If the user revoked
            // (and perhaps reconnected) while the provider was issuing, drop what it just made.
            const consent = await ctx.context.adapter.findOne<{ id: string }>({
              model: 'oauthConsent',
              where: [
                { field: 'userId', value: exchange.userId },
                { field: 'clientId', value: exchange.clientId },
              ],
            });
            if (!consent || consent.id !== exchange.consentId) {
              if (refreshHash) {
                await ctx.context.adapter.deleteMany({
                  model: 'oauthRefreshToken',
                  where: [{ field: 'token', value: refreshHash }],
                });
              }
              throw revoked();
            }
          }),
        },
      ],
    },
  };
}
