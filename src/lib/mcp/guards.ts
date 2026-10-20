import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { isAllowedRedirectUri } from '@/lib/mcp/redirects';

/**
 * Dynamic client registration is open (no login), so it is the one place an
 * unknown party can name redirect URIs. Reject anything off the allowlist here,
 * at registration, instead of only at authorization time.
 */
export function mcpRegistrationGuard(): BetterAuthPlugin {
  return {
    id: 'ua-mcp-registration-guard',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/oauth2/register',
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { redirect_uris?: unknown } | undefined;
            const uris = body?.redirect_uris;
            if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === 'string' && isAllowedRedirectUri(u))) {
              throw new APIError('BAD_REQUEST', {
                error: 'invalid_redirect_uri',
                error_description: 'redirect_uris must be on the allowed list',
              });
            }
          }),
        },
      ],
    },
  };
}
