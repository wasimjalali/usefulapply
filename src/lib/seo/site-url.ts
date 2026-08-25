import { BRAND } from '@/lib/brand';

/**
 * Public origin for canonicals, Open Graph, sitemap and robots.
 *
 * Always `BRAND.url`. Do not read `NEXT_PUBLIC_SITE_URL` here: that env is
 * inlined at build time and previously shipped https://www.karkoai.com into
 * production `<link rel="canonical">` tags after the rebrand.
 */
export const SEO_SITE_URL = BRAND.url.replace(/\/$/, '');

/** Absolute Useful Apply URL. Homepage has no trailing slash, other paths do not either. */
export function canonicalUrl(path: string = '/'): string {
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    return `${url.origin}${pathname}${url.search}`;
  }

  const normalized =
    !path || path === '/' ? '' : path.startsWith('/') ? path.replace(/\/$/, '') : `/${path}`;
  return `${SEO_SITE_URL}${normalized}`;
}
