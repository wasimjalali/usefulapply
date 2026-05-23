/**
 * Centralized email sender identities for Karko AI.
 *
 * Founder-personal: welcome + check-in + any 1:1 outreach.
 * No-reply: transactional system mail (confirmation, receipts, password reset).
 */

export const FOUNDER_FROM = 'Wasim from Karko AI <wasim@karkoai.com>';
export const FOUNDER_REPLY_TO = 'wasim@karkoai.com';

export const NOREPLY_FROM = 'KarKo AI <noreply@karkoai.com>';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://karkoai.com';
