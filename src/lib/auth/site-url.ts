import { BRAND } from '@/lib/brand';

/**
 * Canonical public site URL for auth redirects and email links.
 * The live request origin wins: NEXT_PUBLIC_SITE_URL is inlined at build
 * time, so a stale .env value would bake the wrong domain into mailed
 * links (this shipped karkoai.com callbacks after the rebrand). Better
 * Auth's trustedOrigins still rejects anything unexpected.
 */
const TRUSTED_LINK_ORIGINS = new Set([
  'https://usefulapply.com',
  'https://www.usefulapply.com',
  'http://localhost:3000',
  'http://localhost:8787',
  'http://localhost:8788',
  'http://localhost:8790',
]);

export function getSiteUrl(fallbackOrigin?: string): string {
  const origin = fallbackOrigin?.replace(/\/$/, '');
  if (origin && TRUSTED_LINK_ORIGINS.has(origin)) {
    return origin;
  }

  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  return BRAND.url;
}
