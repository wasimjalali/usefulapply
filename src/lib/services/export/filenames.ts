import type { CvLocale } from '@/lib/cv-templates/locale';

/**
 * File names a recruiter's inbox and an ATS both handle: ASCII, no spaces, the
 * applicant's name in it. `First_Last_CV.pdf`, `Lebenslauf_First_Last.pdf`.
 */

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

function asciiPart(value: string): string {
  return value
    .replace(/[äöüÄÖÜß]/g, (char) => UMLAUTS[char])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
}

/** "Jürgen Müller-Schäfer" becomes "Juergen_Mueller-Schaefer". */
export function nameForFile(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map(asciiPart)
    .filter(Boolean);
  return parts.length > 0 ? parts.join('_') : 'Applicant';
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

export function exportFileName(format: ExportFormat, fullName: string, locale: CvLocale | 'other'): string {
  const name = nameForFile(fullName);
  const de = locale === 'de';
  const ext = EXTENSION[format];
  switch (format) {
    case 'cv_pdf':
    case 'cv_docx':
      return de ? `Lebenslauf_${name}.${ext}` : `${name}_CV.${ext}`;
    case 'cover_letter_pdf':
    case 'cover_letter_docx':
      return de ? `Anschreiben_${name}.${ext}` : `${name}_Cover_Letter.${ext}`;
    case 'emails_txt':
      return de ? `E-Mails_${name}.${ext}` : `${name}_Emails.${ext}`;
    case 'answers_pdf':
    case 'answers_txt':
      return de ? `Screening-Antworten_${name}.${ext}` : `${name}_Screening_Answers.${ext}`;
  }
}
