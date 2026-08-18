import { BRAND } from '@/lib/brand';

/**
 * Centralized email sender identities for Useful Apply.
 *
 * Founder-personal: welcome + check-in + any 1:1 outreach.
 * No-reply: transactional system mail (confirmation, receipts, password reset).
 */

export const FOUNDER_FROM = `Wasim from ${BRAND.name} <${BRAND.founderEmail}>`;
export const FOUNDER_REPLY_TO = BRAND.founderEmail;

export const NOREPLY_FROM = `${BRAND.name} <${BRAND.noreplyEmail}>`;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? BRAND.url;

export const LOGO_URL = `${BRAND.url}/useful-apply-logo.png`;
