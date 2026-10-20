import type { CvLocale } from '@/lib/cv-templates/locale';
import { exportText } from './export-text';

/**
 * File names a recruiter's inbox and an ATS both handle: ASCII, no spaces, the
 * applicant's name in it. `First_Last_CV.pdf`, `Lebenslauf_First_Last.pdf`.
 */

/** Letters that NFKD does not split into a base letter and a mark, and the scripts that are written another way. */
const TRANSLITERATION: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss',
  ø: 'o', Ø: 'O', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ð: 'd', Ð: 'D', æ: 'ae', Æ: 'Ae', œ: 'oe', Œ: 'Oe', þ: 'th', Þ: 'Th', ı: 'i', ħ: 'h', Ħ: 'H',
  // Cyrillic
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
  // Greek
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's',
  τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

function transliterate(value: string): string {
  return Array.from(value)
    .map((char) => {
      const lower = char.toLowerCase();
      const mapped = TRANSLITERATION[char] ?? (char !== lower && TRANSLITERATION[lower] !== undefined ? capitalize(TRANSLITERATION[lower]) : undefined);
      return mapped ?? char;
    })
    .join('');
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function asciiPart(value: string): string {
  // Letters with their own spelling (ä, ø, Cyrillic) first, then accents come off (Greek tonos, é), then what the accents hid.
  // The Greek digraph ου is "ou" (ELOT 743), so it goes before its letters are mapped one by one.
  const base = transliterate(value.replace(/ο[υύ]/g, 'ou').replace(/Ο[υύ]/g, 'Ou').replace(/ΟΥ|ΟΎ/g, 'OU'))
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '');
  return transliterate(base)
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
}

/** Longest name part, so the whole file name stays under 80 characters with its prefix, suffix and extension. */
const MAX_FILE_NAME = 80;

/**
 * "Jürgen Müller-Schäfer" becomes "Juergen_Mueller-Schaefer", "Søren Łukasz"
 * becomes "Soren_Lukasz", Cyrillic and Greek are transliterated, and a name
 * with nothing transliterable (CJK, for example) falls back to "Applicant".
 * The unicode name is kept separately for the `filename*` of the download.
 */
export function nameForFile(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map(asciiPart)
    .filter(Boolean);
  return parts.length > 0 ? parts.join('_') : 'Applicant';
}

/** The applicant's name as written, made safe for a file name: no separators or control characters, spaces as underscores. */
export function unicodeNameForFile(fullName: string): string {
  const cleaned = fullName
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('_');
  return cleaned || 'Applicant';
}

export type ExportFormat =
  | 'cv_pdf'
  | 'cv_docx'
  | 'cover_letter_pdf'
  | 'cover_letter_docx'
  | 'emails_txt'
  | 'answers_pdf'
  | 'answers_txt';

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  'cv_pdf',
  'cv_docx',
  'cover_letter_pdf',
  'cover_letter_docx',
  'emails_txt',
  'answers_pdf',
  'answers_txt',
];

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);
}

const EXTENSION: Record<ExportFormat, string> = {
  cv_pdf: 'pdf',
  cv_docx: 'docx',
  cover_letter_pdf: 'pdf',
  cover_letter_docx: 'docx',
  emails_txt: 'txt',
  answers_pdf: 'pdf',
  answers_txt: 'txt',
};

export function extensionFor(format: ExportFormat): string {
  return EXTENSION[format];
}

export const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
};

function build(format: ExportFormat, name: string, locale: CvLocale | 'other'): string {
  const words = exportText(locale);
  const ext = EXTENSION[format];
  const [prefix, suffix] = (() => {
    switch (format) {
      case 'cv_pdf':
      case 'cv_docx':
        return words.fileCv;
      case 'cover_letter_pdf':
      case 'cover_letter_docx':
        return words.fileLetter;
      case 'emails_txt':
        return words.fileEmails;
      case 'answers_pdf':
      case 'answers_txt':
        return words.fileAnswers;
    }
  })();
  const room = MAX_FILE_NAME - prefix.length - suffix.length - ext.length - 1;
  // Cut by code point, not UTF-16 unit, so an emoji or a rare letter is never split in half, then
  // make the result well formed (a lone surrogate would break the header it ends up in).
  const cut = Array.from(name).slice(0, Math.max(8, room)).join('');
  const wellFormed = typeof cut.toWellFormed === 'function' ? cut.toWellFormed() : cut.replace(/[\uD800-\uDFFF]/g, '\uFFFD');
  return `${prefix}${wellFormed.replace(/[_-]+$/, '')}${suffix}.${ext}`;
}

/** The ASCII file name an ATS, a mail client and a file system all accept, 80 characters at most. */
export function exportFileName(format: ExportFormat, fullName: string, locale: CvLocale | 'other'): string {
  return build(format, nameForFile(fullName), locale);
}

/** The same name with the applicant's own letters, for the `filename*` of the download. */
export function exportDisplayFileName(format: ExportFormat, fullName: string, locale: CvLocale | 'other'): string {
  return build(format, unicodeNameForFile(fullName), locale);
}

/** RFC 5987 `filename*` value: encodeURIComponent leaves ' ( ) * alone, and the standard allows them only encoded. */
export function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
