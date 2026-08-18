import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { BRAND } from '@/lib/brand';
import { getSiteUrl } from '@/lib/auth/site-url';
import { sendEmail } from '@/lib/email/send';
import { buildConfirmationEmail } from '@/lib/email/templates/confirmation';
import { buildPasswordResetEmail } from '@/lib/email/templates/password-reset';
import { getDb, getDbBinding, type Database } from '@/db/client';
import { account, session, user, verification } from '@/db/schema';
import { initializeUserCredits } from '@/db/repos/credits';
import { getConfirmationResendMeta, getOrCreateProfile } from '@/db/repos/profiles';

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

function authBaseURL(): string {
  return (
    process.env.BETTER_AUTH_URL?.replace(/\/$/, '')
    || process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    || process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    || getSiteUrl()
  );
}

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
    ],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      // D1 has no interactive transactions. Sequential writes only.
      transaction: false,
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 6,
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
          },
        },
      },
    },
    plugins: [nextCookies()],
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
