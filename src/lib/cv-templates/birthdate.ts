import { cvPaper } from './paper';
import { MONTH_NAMES, inferCvLocale, monthFromWord } from './locale';
import type { CVData } from './types';

/**
 * A date of birth as the CV's language and market write it, so a reader is never handed
 * "07.04.1989" on an English CV (April 7 or July 4?):
 *
 *   English, US or Canada   April 7, 1989
 *   English, elsewhere      7 April 1989
 *   German                  07.04.1989
 *   French and Italian      7 avril 1989, 7 aprile 1989
 *   Spanish and Portuguese  7 de abril de 1989
 *   Dutch                   7 april 1989
 *
 * Text that is not a recognisable date is returned as typed.
 */
export function formatBirthDate(data: CVData): string {
  const raw = (data.personal.dateOfBirth ?? '').trim();
  if (!raw) return '';
  const parsed = parseDate(raw);
  if (!parsed) return raw;
  const { day, month, year } = parsed;
  const locale = inferCvLocale(data);
  if (locale === 'de') return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  const names = MONTH_NAMES[locale === 'other' ? 'en' : locale];
  const name = names[month - 1];
  switch (locale) {
    case 'es':
    case 'pt':
      return `${day} de ${name} de ${year}`;
    case 'fr':
    case 'it':
    case 'nl':
      return `${day} ${name} ${year}`;
    default:
      return cvPaper(data) === 'letter' ? `${name} ${day}, ${year}` : `${day} ${name} ${year}`;
  }
}

function valid(day: number, month: number, year: number): { day: number; month: number; year: number } | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
}

function parseDate(raw: string): { day: number; month: number; year: number } | null {
  let m = raw.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]));
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    // Day first unless only the other reading is a real date.
    return b > 12 && a <= 12 ? valid(b, a, Number(m[3])) : valid(a, b, Number(m[3]));
  }
  m = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:de\s+)?([\p{L}.]+)\s+(?:de\s+)?(\d{4})$/u);
  if (m) {
    const month = monthFromWord(m[2]);
    return month ? valid(Number(m[1]), month, Number(m[3])) : null;
  }
  m = raw.match(/^([\p{L}.]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/u);
  if (m) {
    const month = monthFromWord(m[1]);
    return month ? valid(Number(m[2]), month, Number(m[3])) : null;
  }
  return null;
}
