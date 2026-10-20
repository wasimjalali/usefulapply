/**
 * Signed download links. A link binds the owner, the object key and an expiry
 * with an HMAC, so it works for a plain HTTP client (an agent, a browser tab
 * opened from a chat) without a cookie, and stops working after 15 minutes.
 *
 *   /api/exports/<userId>/<hash>.<ext>?exp=<unix seconds>&sig=<base64url>
 *
 * The secret is EXPORT_SIGNING_SECRET (a Worker secret, never in the repo).
 */

export const SIGNED_URL_TTL_SECONDS = 15 * 60;

const encoder = new TextEncoder();

export class SigningUnavailableError extends Error {
  constructor() {
    super('EXPORT_SIGNING_SECRET is not set.');
    this.name = 'SigningUnavailableError';
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

function message(userId: string, key: string, exp: number): Uint8Array {
  return encoder.encode(`export-v1\n${userId}\n${key}\n${exp}`);
}

/** The key as it appears in the URL path: `<userId>/<hash>.<ext>`, without the `exports/` prefix. */
export function exportPathKey(userId: string, hash: string, ext: string): string {
  return `${userId}/${hash}.${ext}`;
}

export async function signExportLink(args: {
  userId: string;
  pathKey: string;
  secret: string | undefined;
  now?: number;
  ttlSeconds?: number;
}): Promise<{ path: string; expiresAt: string }> {
  if (!args.secret) throw new SigningUnavailableError();
  const nowSeconds = Math.floor((args.now ?? Date.now()) / 1000);
  const exp = nowSeconds + (args.ttlSeconds ?? SIGNED_URL_TTL_SECONDS);
  const key = await hmacKey(args.secret, 'sign');
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message(args.userId, args.pathKey, exp) as BufferSource));
  const path = `/api/exports/${args.pathKey.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${toBase64Url(signature)}`;
  return { path, expiresAt: new Date(exp * 1000).toISOString() };
}

export type VerifyResult = { ok: true; userId: string } | { ok: false };

/**
 * Verifies a link. The owner comes from the first path segment and is part of
 * what was signed, so a link cannot be pointed at another user's object.
 */
export async function verifyExportLink(args: {
  pathKey: string;
  exp: string | null;
  sig: string | null;
  secret: string | undefined;
  now?: number;
}): Promise<VerifyResult> {
  if (!args.secret || !args.exp || !args.sig) return { ok: false };
  if (!/^\d{9,12}$/.test(args.exp)) return { ok: false };
  const exp = Number(args.exp);
  if (exp < Math.floor((args.now ?? Date.now()) / 1000)) return { ok: false };
  const userId = args.pathKey.split('/')[0];
  if (!userId) return { ok: false };
  const signature = fromBase64Url(args.sig);
  if (!signature) return { ok: false };
  const key = await hmacKey(args.secret, 'verify');
  const valid = await crypto.subtle.verify('HMAC', key, signature as BufferSource, message(userId, args.pathKey, exp) as BufferSource);
  return valid ? { ok: true, userId } : { ok: false };
}
