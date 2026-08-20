import 'server-only';

import { headers } from 'next/headers';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const ACCESS_HEADER = 'cf-access-jwt-assertion';

export type AdminIdentity = {
  subject: string;
  email: string | null;
  expiresAt: number;
};

export class AdminAccessError extends Error {
  constructor() {
    super('Admin access denied');
    this.name = 'AdminAccessError';
  }
}

type AccessConfig = {
  issuer: string;
  audience: string;
  allowedSubjects: Set<string>;
  allowedEmails: Set<string>;
};

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function readAccessConfig(): AccessConfig {
  const issuer = process.env.CLOUDFLARE_ACCESS_ISSUER?.replace(/\/+$/, '');
  const audience = process.env.CLOUDFLARE_ACCESS_AUD?.trim();
  const allowedSubjects = new Set(
    (process.env.CLOUDFLARE_ACCESS_ADMIN_SUBJECTS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const allowedEmails = new Set(
    (process.env.CLOUDFLARE_ACCESS_ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!issuer || !audience || (allowedSubjects.size === 0 && allowedEmails.size === 0)) {
    throw new AdminAccessError();
  }

  let issuerUrl: URL;
  try {
    issuerUrl = new URL(issuer);
  } catch {
    throw new AdminAccessError();
  }

  if (issuerUrl.protocol !== 'https:' || !issuerUrl.hostname.endsWith('.cloudflareaccess.com')) {
    throw new AdminAccessError();
  }

  return { issuer, audience, allowedSubjects, allowedEmails };
}

function getJwks(issuer: string) {
  const cached = jwksByIssuer.get(issuer);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  jwksByIssuer.set(issuer, jwks);
  return jwks;
}

function readEmail(payload: JWTPayload): string | null {
  return typeof payload.email === 'string' ? payload.email : null;
}

function localDevelopmentIdentity(requestHeaders: Headers): AdminIdentity | null {
  if (process.env.NODE_ENV !== 'development' || process.env.CLOUDFLARE_ACCESS_DEV_BYPASS !== 'true') {
    return null;
  }

  const hostname = requestHeaders.get('host')?.split(':')[0];
  const expectedKey = process.env.CLOUDFLARE_ACCESS_DEV_BYPASS_KEY;
  const suppliedKey = requestHeaders.get('x-usefulapply-admin-dev-key');
  if (
    (hostname !== 'localhost' && hostname !== '127.0.0.1')
    || !expectedKey
    || suppliedKey !== expectedKey
  ) {
    return null;
  }

  return {
    subject: 'local-development',
    email: null,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  };
}

export async function verifyAdminAccessHeaders(requestHeaders: Headers): Promise<AdminIdentity> {
  const localIdentity = localDevelopmentIdentity(requestHeaders);
  if (localIdentity) return localIdentity;

  const config = readAccessConfig();
  const token = requestHeaders.get(ACCESS_HEADER);
  if (!token) throw new AdminAccessError();

  try {
    const { payload } = await jwtVerify(token, getJwks(config.issuer), {
      issuer: config.issuer,
      audience: config.audience,
    });

    const email = readEmail(payload);
    const subjectAllowed = Boolean(payload.sub && config.allowedSubjects.has(payload.sub));
    const emailAllowed = Boolean(email && config.allowedEmails.has(email.toLowerCase()));
    if (!payload.sub || !payload.exp || (!subjectAllowed && !emailAllowed)) {
      throw new AdminAccessError();
    }

    return {
      subject: payload.sub,
      email,
      expiresAt: payload.exp,
    };
  } catch {
    throw new AdminAccessError();
  }
}

export async function requireAdminAccess(): Promise<AdminIdentity> {
  return verifyAdminAccessHeaders(await headers());
}
