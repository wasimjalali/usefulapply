/**
 * Centralized email sender identities for Karko AI.
 *
 * Founder-personal: welcome + check-in + any 1:1 outreach.
 * No-reply: transactional system mail (confirmation, receipts, password reset).
 */

export const FOUNDER_FROM = 'Wasim from Karko AI <wasim@karkoai.com>';
export const FOUNDER_REPLY_TO = 'wasim@karkoai.com';

// Note: the legacy /api/auth/signup route still uses an inline 'KarKo AI' display
// name (capital K); that's existing tech debt out of scope for this PR. All new
// senders use the brand-correct lowercase form.
export const NOREPLY_FROM = 'Karko AI <noreply@karkoai.com>';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://karkoai.com';
