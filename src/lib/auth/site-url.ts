import { BRAND } from '@/lib/brand';

/**
 * Canonical public site URL for auth redirects and email links.
 * The live request origin wins: NEXT_PUBLIC_SITE_URL is inlined at build
 * time, so a stale .env value would bake the wrong domain into mailed
 * links (this shipped karkoai.com callbacks after the rebrand). Better
 * Auth's trustedOrigins still rejects anything unexpected.
 */
export function getSiteUrl(fallbackOrigin?: string): string {
  if (fallbackOrigin) {
    return fallbackOrigin.replace(/\/$/, '');
  }

  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  return BRAND.url;
}
