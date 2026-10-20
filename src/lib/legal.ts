import { BRAND } from '@/lib/brand';

/** Shared facts for public legal pages. Keep in sync with company/SOURCE-OF-TRUTH.md. */
export const LEGAL = {
  updated: 'October 20, 2026',
  entity: 'Karko AI Inc.',
  dba: BRAND.name,
  entityLine: `${BRAND.name}, operated by Karko AI Inc.`,
  director: 'Wasim Jalali',
  directorTitle: 'President and CEO',
  email: BRAND.supportEmail,
  addressLines: ['1207 Delaware Ave #412', 'Wilmington, DE 19806', 'USA'] as const,
  addressOneLine: 'Karko AI Inc., 1207 Delaware Ave #412, Wilmington, DE 19806, USA',
  governingLaw: 'Delaware, United States',
  courts: 'state and federal courts located in Delaware',
} as const;
