import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { isAllowedRedirectUri } from '@/lib/mcp/redirects';

/**
 * Hooks on Better Auth's OAuth endpoints that the provider has no option for.
 *
 * Registration (`/oauth2/register`) is open (no login), so it is the one place
 * an unknown party can put data in our database. It takes a small, fixed set of
 * fields and rejects the rest. The raw body size is capped earlier, in the auth
 * route, before Better Auth reads it.
 *
 * Token (`/oauth2/token`): a code or refresh token is only redeemable while the
 * user's consent for that client exists AND was given before the code or
 * refresh token was issued. Revoking deletes the consent; if the user then
 * reconnects (new consent, maybe with fewer scopes), anything issued under the
 * old consent is older than the new row and is refused, so an old broad code
 * cannot come back to life. Revoke also deletes pending codes and refresh
 * tokens outright (mcpGrants.ts); this is the backstop for a request that was
 * already in flight.
 *
 * This hook hashes the token the way the provider stores it: SHA-256,
 * base64url, no padding, no prefix. Setting `prefix.refreshToken` (or a custom
 * `storeTokens`) on mcp() changes the stored form and silently disables the
 * lookup below for refresh tokens, so the revoke check would stop working.
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
              const row = await ctx.context.adapter.findOne<{ userId: string; clientId: string; createdAt: Date }>({
                model: 'oauthRefreshToken',
                where: [{ field: 'token', value: await hashToken(body.refresh_token) }],
              });
              if (!row) return;
              userId = row.userId;
              clientId = row.clientId;
              issuedAt = new Date(row.createdAt).getTime();
            } else {
              return;
            }

            if (!userId || !clientId) return;
            const consent = await ctx.context.adapter.findOne<{ createdAt: Date }>({
              model: 'oauthConsent',
              where: [
                { field: 'userId', value: userId },
                { field: 'clientId', value: clientId },
              ],
            });
            // Timestamps here have one-second resolution, and a code or refresh token is created
            // after the consent in the same request, so "older" is strictly less.
            const consentedAt = consent ? new Date(consent.createdAt).getTime() : null;
            if (consentedAt === null || (issuedAt !== undefined && Number.isFinite(consentedAt) && issuedAt < consentedAt)) {
              throw new APIError('BAD_REQUEST', {
                error: 'invalid_grant',
                error_description: 'authorization was revoked',
              });
            }
          }),
        },
      ],
    },
  };
}
