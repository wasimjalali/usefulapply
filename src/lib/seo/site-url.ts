import { BRAND } from '@/lib/brand';

/**
 * Public origin for canonicals, Open Graph, sitemap and robots.
 *
 * Always `BRAND.url`. Do not read `NEXT_PUBLIC_SITE_URL` here: that env is
 * inlined at build time and previously shipped https://www.karkoai.com into
 * production `<link rel="canonical">` tags after the rebrand.
 */
export const SEO_SITE_URL = BRAND.url.replace(/\/$/, '');

const KARKO_HOST = /(^|\.)karkoai\.com$/i;

/**
 * Absolute Useful Apply URL for the given path.
 * Homepage has no trailing slash; other paths do not either.
 * Host is always usefulapply.com: karkoai.com and www are rewritten away.
 */
export function canonicalUrl(path: string = '/'): string {
  let pathname = '/';
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    pathname = url.pathname || '/';
  } else if (path) {
    pathname = path.startsWith('/') ? path : `/${path}`;
  }

  const normalized = pathname === '/' ? '' : pathname.replace(/\/$/, '');
  const result = `${SEO_SITE_URL}${normalized}`;
  if (KARKO_HOST.test(result)) {
    throw new Error('SEO canonical must not use karkoai.com');
  }
  return result;
}

export const SEO_METADATA_BASE = new URL(SEO_SITE_URL);
