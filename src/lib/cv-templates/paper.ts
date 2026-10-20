import type { CVData } from './types';
import { inferCvLocale } from './locale';
import type { PaperSize } from './print-spec';

/**
 * Paper follows the CV's market, not the template. Letter only for a US or
 * Canadian CV, A4 for everyone else. An explicit `paper` override still wins
 * (callers pass it instead of calling this).
 *
 * Evidence, in order:
 *   1. the country on the CV
 *   2. an address that looks American ("Austin, TX 78701") or Canadian ("M5V 2T6")
 *   3. an address that looks European (a 4 or 5 digit postcode before the city)
 *   4. no address at all: an English CV is read as US, anything else as A4
 */

const US_CANADA_COUNTRY = /^(united states( of america)?|usa|u\.s\.a?\.?|us|america|canada|ca|can)$/i;
const US_ADDRESS = /,\s*[A-Z]{2}\s+\d{5}(-\d{4})?\b/;
const CA_ADDRESS = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/;
const EUROPEAN_ADDRESS = /\b\d{4,5}\s+[A-ZÄÖÜÉÈÀÁÍÓÚÑ][\p{L}-]+/u;

export function cvPaper(data: CVData): PaperSize {
  const country = data.personal.country?.trim() ?? '';
  if (country) return US_CANADA_COUNTRY.test(country) ? 'letter' : 'a4';
  const place = [data.personal.address, data.personal.city].filter(Boolean).join(', ');
  if (US_ADDRESS.test(place) || CA_ADDRESS.test(place)) return 'letter';
  if (EUROPEAN_ADDRESS.test(place)) return 'a4';
  return inferCvLocale(data) === 'en' ? 'letter' : 'a4';
}
