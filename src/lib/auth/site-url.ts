/**
 * Canonical public site URL for auth redirects and email links.
 * Prefer NEXT_PUBLIC_SITE_URL so preview hosts never leak into Supabase allowlists.
 */
export function getSiteUrl(fallbackOrigin?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (fallbackOrigin) {
    return fallbackOrigin.replace(/\/$/, '');
  }

  return 'https://www.karkoai.com';
}
