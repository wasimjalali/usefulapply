import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { jwt } from 'better-auth/plugins';
import { cimd } from '@better-auth/cimd';
import { mcp } from '@better-auth/mcp';
import { BRAND } from '@/lib/brand';
import { getAuthBaseUrl } from '@/lib/auth/site-url';
import { fetchClientMetadataResource } from '@/lib/mcp/cimd-fetch';
import { getMcpResourceUrl, isMcpCimdEnabled } from '@/lib/mcp/config';
import { mcpRegistrationGuard } from '@/lib/mcp/guards';
import { isAllowedRedirectUri } from '@/lib/mcp/redirects';
import { OAUTH_SCOPES } from '@/lib/mcp/scopes';
import { sendEmail } from '@/lib/email/send';
import { buildConfirmationEmail } from '@/lib/email/templates/confirmation';
import { buildPasswordResetEmail } from '@/lib/email/templates/password-reset';
import { buildDeleteAccountEmail } from '@/lib/email/templates/delete-account';
import { getDb, getDbBinding, type Database } from '@/db/client';
import {
  account,
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  session,
  user,
  verification,
} from '@/db/schema';
import { initializeUserCredits } from '@/db/repos/credits';
import { recordAuthMetricEvent } from '@/db/repos/adminMetrics';
import { getConfirmationResendMeta, getOrCreateProfile } from '@/db/repos/profiles';

/**
 * Better Auth awaits `sendDeleteAccountVerification` but catches a throw and
 * still answers 200, so a failed send would read as "check your email" with no
 * email coming. The outcome is recorded here instead. The hook finishes before
 * `auth.api.deleteUser` returns, in the same isolate and the same request, so
 * the route that asked reads its own result.
 */
const deleteEmailFailures = new Map<string, number>();

/** True when this user's confirmation email failed to send. Clears on read. */
export function takeDeleteEmailFailure(userId: string): boolean {
  const failedAt = deleteEmailFailures.get(userId);
  deleteEmailFailures.delete(userId);
  return failedAt !== undefined && Date.now() - failedAt < 30_000;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  image?: string | null;
};

export type AuthInstance = ReturnType<typeof createAuth>;

const SESSION_COOKIE_NAME = 'usefulapply.session';

const authBaseURL = getAuthBaseUrl;

function googleProvider() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return {};
  return {
    google: { clientId, clientSecret },
  };
}

function createAuth(db: Database) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('[auth] BETTER_AUTH_SECRET is not set');
  }

  return betterAuth({
    secret,
    baseURL: authBaseURL(),
    trustedOrigins: [
      BRAND.url,
      'https://www.usefulapply.com',
      'http://localhost:3000',
      'http://localhost:8787',
      'http://localhost:8788',
      'http://localhost:8790',
      'http://localhost:8791',
    ],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      // D1 has no interactive transactions. Sequential writes only.
      transaction: false,
      schema: {
        user,
        session,
        account,
        verification,
        jwks,
        oauthClient,
        oauthResource,
        oauthClientResource,
        oauthRefreshToken,
        oauthAccessToken,
        oauthConsent,
        oauthClientAssertion,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      // 30 minutes. The reset card and the reset email both state this window,
      // so it is set explicitly rather than left on Better Auth's 1 hour default.
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: resetUser, url }) => {
        const firstName = resetUser.name?.trim().split(/\s+/)[0] || null;
        const built = buildPasswordResetEmail({ resetLink: url, firstName });
        await sendEmail({
          to: resetUser.email,
          subject: built.subject,
          html: built.html,
          text: built.text,
          from: built.from,
        });
      },
    },
    emailVerification: {
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: verifyUser, url }) => {
        const firstName = verifyUser.name?.trim().split(/\s+/)[0] || null;
        // Better Auth 1.7 sendVerificationEmail body is only { email, callbackURL }.
        // Cron claims last_confirmation_resend_at before send, so that (or
        // count > 0 after a prior nudge) selects the reminder copy.
        const resendMeta = await getConfirmationResendMeta(verifyUser.id);
        const isReminder =
          (resendMeta?.confirmation_resend_count ?? 0) > 0
          || Boolean(resendMeta?.last_confirmation_resend_at);
        const built = buildConfirmationEmail({
          confirmationLink: url,
          firstName,
          isReminder,
        });
        await sendEmail({
          to: verifyUser.email,
          subject: built.subject,
          html: built.html,
          text: `Open this link to confirm your Useful Apply account:\n${url}`,
          from: built.from,
        });
      },
    },
    socialProviders: googleProvider(),
    user: {
      // Deleting an account is irreversible and D1 holds the only copy, so a
      // borrowed session is not enough on its own. Better Auth mails a link,
      // and its callback only completes for the session that asked, so the
      // attacker would need the mailbox and the browser.
      deleteUser: {
        enabled: true,
        // 30 minutes, the same window the reset link uses and the email states.
        deleteTokenExpiresIn: 60 * 30,
        sendDeleteAccountVerification: async ({ user: deleteUser, url }) => {
          const firstName = deleteUser.name?.trim().split(/\s+/)[0] || null;
          const built = buildDeleteAccountEmail({ confirmLink: url, firstName });
          try {
            await sendEmail({
              to: deleteUser.email,
              subject: built.subject,
              html: built.html,
              text: built.text,
              from: built.from,
            });
            deleteEmailFailures.delete(deleteUser.id);
          } catch (error) {
            console.error('[auth] delete-account verification email failed', deleteUser.id, error);
            deleteEmailFailures.set(deleteUser.id, Date.now());
          }
        },
        // Files, then app data, both before the user row goes. A throw here
        // aborts the deletion and the account stays signed in, but Better Auth
        // spends the token before calling this, so that link is dead. Recovery
        // is asking for a new one from Settings, which still works because the
        // account survived. Every delete in here is idempotent, so the retry
        // finishes what the first attempt started.
        beforeDelete: async (deleting) => {
          const { deletePrefix } = await import('@/storage/r2');
          const { ALLOWED_FILE_BUCKETS } = await import('@/storage/paths');
          for (const bucket of ALLOWED_FILE_BUCKETS) {
            await deletePrefix(`${bucket}/${deleting.id}/`);
          }
          const { deleteAllUserData } = await import('@/db/repos/admin');
          await deleteAllUserData(deleting.id);
        },
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google'],
      },
    },
    advanced: {
      cookiePrefix: 'usefulapply',
      cookies: {
        session_token: {
          name: SESSION_COOKIE_NAME,
        },
      },
      database: {
        // New users get a UUID. A supplied id (Task 5.3 imports) is accepted
        // because `user.id` has no default and generateId only runs when
        // Better Auth creates the row itself.
        generateId: 'uuid',
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            // transaction:false: a throw here leaves a committed user row
            // with no credential account and bricks the email. Profile and
            // credits self-heal on first sign-in.
            try {
              const fullName = created.name?.trim() || null;
              await getOrCreateProfile(
                created.id,
                created.email,
                fullName ? { full_name: fullName } : undefined,
              );
              const { error } = await initializeUserCredits(created.id);
              if (error) {
                console.error('[auth] initializeUserCredits failed after user.create', created.id, error);
              }
            } catch (error) {
              console.error('[auth] user.create.after failed', created.id, error);
            }
            try {
              await recordAuthMetricEvent({
                sourceId: `user:${created.id}`,
                userId: created.id,
                eventType: 'signup',
                occurredAt: created.createdAt.toISOString(),
              });
            } catch (error) {
              console.error('[auth] signup metric write failed', created.id, error);
            }
          },
        },
      },
      session: {
        create: {
          after: async (created) => {
            try {
              await recordAuthMetricEvent({
                sourceId: `session:${created.id}`,
                userId: created.userId,
                eventType: 'session_started',
                occurredAt: created.createdAt.toISOString(),
              });
            } catch (error) {
              console.error('[auth] session metric write failed', created.id, error);
            }
          },
        },
      },
    },
    plugins: [
      // MCP OAuth: signing keys, the authorization server (on
      // @better-auth/oauth-provider) bound to the /mcp resource, and Client ID
      // Metadata Documents. `mcp()` is the OAuth provider, so there is no
      // separate oauthProvider(). Migration 0009 holds the tables.
      jwt(),
      mcp({
        loginPage: '/auth/login',
        consentPage: '/oauth/consent',
        resource: getMcpResourceUrl(),
        scopes: [...OAUTH_SCOPES],
        accessTokenExpiresIn: 10 * 60,
        refreshTokenExpiresIn: 30 * 24 * 60 * 60,
        // Browser-approved grants only: no client_credentials (machine-to-machine) tokens.
        grantTypes: ['authorization_code', 'refresh_token'],
        // Open dynamic client registration (RFC 7591). Redirect URIs are
        // checked at registration by mcpRegistrationGuard and again at authorize.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: 'infer',
        // Exact-match allowlist plus loopback (see redirects.ts). Applied on top
        // of the built-in match, so a URI must pass both.
        validateRedirectUri: (redirectUri, _registered, defaultResult) =>
          defaultResult && isAllowedRedirectUri(redirectUri),
      }),
      // Client ID Metadata Documents stay off until the fetch boundary is proven
      // on Workers (see cimd-fetch.ts and docs/agent-integration/spikes.md).
      // Dynamic client registration covers every client meanwhile.
      ...(isMcpCimdEnabled()
        ? [cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' })]
        : []),
      mcpRegistrationGuard(),
      nextCookies(),
    ],
  });
}

let cachedAuth: AuthInstance | null = null;
let cachedBinding: unknown = null;

export async function getAuth(): Promise<AuthInstance> {
  const db = await getDb();
  const binding = await getDbBinding();
  if (cachedAuth && cachedBinding === binding) {
    return cachedAuth;
  }
  cachedAuth = createAuth(db);
  cachedBinding = binding;
  return cachedAuth;
}

function toAuthUser(raw: {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  image?: string | null;
}): AuthUser {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    emailVerified: raw.emailVerified,
    createdAt: raw.createdAt,
    image: raw.image ?? null,
  };
}

/**
 * Authenticate the caller from the request session cookie.
 * Use this first in every API route (then rate limit, then validate).
 */
export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user) return null;
  return toAuthUser(result.user);
}

export { SESSION_COOKIE_NAME };
