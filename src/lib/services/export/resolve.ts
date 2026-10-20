import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { FALLBACK_TEMPLATE_ID } from '@/lib/cv-templates/default-template';
import { isCvTemplateId } from '@/lib/cv-templates/catalog';
import { inferCvLocale, type CvTextLocale } from '@/lib/cv-templates/locale';
import { getPrintSpec, type PaperSize } from '@/lib/cv-templates/print-spec';
import { visibleCvData } from '@/lib/cv-templates/hidden';
import type { CVData } from '@/lib/cv-templates/types';
import { resolveLetterLayout } from './layout';
import type { LetterInput, LetterLayout } from './letter-html';
import { letterPaper } from './letter-html';
import { isExportFormat, type ExportFormat } from './filenames';
import { RENDERER_VERSION, type ExportAnswer, type ExportEmail, type ExportKit, type ExportOptions } from './types';

/** A request the service cannot satisfy, with a code a caller can act on and no internal detail. */
export class ExportInputError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'NO_CV' | 'NO_COVER_LETTER' | 'NO_EMAILS' | 'NO_ANSWERS' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'ExportInputError';
  }
}

export interface ResolvedExport {
  format: ExportFormat;
  templateId: string;
  paper: PaperSize;
  layout: LetterLayout | null;
  locale: CvTextLocale;
  applicantName: string;
  company: string;
  cv: CVData | null;
  letter: LetterInput | null;
  emails: ExportEmail[];
  answers: ExportAnswer[];
  /** Hash input: everything that changes the bytes, nothing that does not. */
  cacheInput: unknown;
}

function structuredOverride(options: ExportOptions): StructuredCoverLetter | null {
  return options.overrides?.structuredLetter ?? null;
}

/**
 * Applies the request to the kit and fixes every input of the render. Pure:
 * the same kit and options always resolve the same way, which is what lets the
 * cache key be a hash of the result.
 */
export function resolveExport(kit: ExportKit, format: ExportFormat, options: ExportOptions): ResolvedExport {
  if (!isExportFormat(format)) throw new ExportInputError('BAD_REQUEST', 'Unknown export format.');

  const requestedTemplate = options.templateId?.trim();
  if (requestedTemplate && !isCvTemplateId(requestedTemplate)) {
    throw new ExportInputError('BAD_REQUEST', 'Unknown template.');
  }
  const templateId = requestedTemplate || (kit.templateId && isCvTemplateId(kit.templateId) ? kit.templateId : FALLBACK_TEMPLATE_ID);
  const spec = getPrintSpec(templateId, options.paper);

  const sourceCv = options.overrides?.cv ?? (options.variant === 'original' ? kit.originalCv ?? kit.cv : kit.cv);
  const cvLocale = sourceCv ? inferCvLocale(sourceCv) : 'en';

  const structured = structuredOverride(options) ?? (options.overrides?.legacyLetterText ? null : kit.coverLetter?.structured ?? null);
  const legacyText = options.overrides?.legacyLetterText ?? kit.coverLetter?.legacyText ?? null;
  const layout = resolveLetterLayout({
    letterLocale: options.letterLocale,
    structured,
    legacyText,
    templateId,
  });

  const base = {
    format,
    templateId,
    locale: cvLocale,
    applicantName: kit.applicantName || sourceCv?.personal.fullName || '',
    company: kit.company,
    emails: [] as ExportEmail[],
    answers: [] as ExportAnswer[],
  };

  switch (format) {
    case 'cv_pdf':
    case 'cv_docx': {
      if (!sourceCv) throw new ExportInputError('NO_CV', 'This application has no CV yet.');
      const photoUsed = spec.market === 'dach' && Boolean(kit.photoDataUri);
      const cv: CVData = photoUsed ? { ...sourceCv, personal: { ...sourceCv.personal, photoUrl: kit.photoDataUri ?? undefined } } : { ...sourceCv, personal: { ...sourceCv.personal, photoUrl: undefined } };
      return {
        ...base,
        paper: spec.paper,
        layout: null,
        cv,
        letter: null,
        applicantName: base.applicantName || sourceCv.personal.fullName,
        cacheInput: {
          cv: visibleCvData({ ...cv, personal: { ...cv.personal, photoUrl: undefined } }),
          marketSpec: spec,
        },
      };
    }
    case 'cover_letter_pdf':
    case 'cover_letter_docx': {
      let letter: LetterInput | null = null;
      if (structured) letter = { kind: 'structured', letter: structured };
      else if (legacyText && legacyText.trim()) letter = { kind: 'legacy', text: legacyText };
      if (!letter) throw new ExportInputError('NO_COVER_LETTER', 'This application has no cover letter yet.');
      return {
        ...base,
        locale: layout === 'din' ? 'de' : cvLocale,
        paper: letterPaper(layout),
        layout,
        cv: null,
        letter,
        cacheInput: { letter, layout },
      };
    }
    case 'emails_txt': {
      const emails = options.overrides?.emails ?? kit.emails;
      if (emails.length === 0) throw new ExportInputError('NO_EMAILS', 'This application has no emails yet.');
      return { ...base, paper: spec.paper, layout: null, cv: null, letter: null, emails, cacheInput: { emails } };
    }
    case 'answers_pdf':
    case 'answers_txt': {
      const answers = options.overrides?.answers ?? kit.answers;
      if (answers.length === 0) throw new ExportInputError('NO_ANSWERS', 'This application has no screening answers yet.');
      const answersLayout = layout;
      return {
        ...base,
        paper: letterPaper(answersLayout),
        layout: answersLayout,
        cv: null,
        letter: null,
        answers,
        cacheInput: { answers, layout: answersLayout, company: kit.company },
      };
    }
  }
}

/** The text of a hash input: stable key order, so equal inputs always hash alike. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** sha256(content, template, paper, locale, rendererVersion, photoHash) as one hex string. */
export async function exportCacheHash(resolved: ResolvedExport): Promise<string> {
  const photoHash = resolved.cv?.personal.photoUrl ? await sha256Hex(resolved.cv.personal.photoUrl) : 'none';
  return sha256Hex(
    canonicalJson({
      content: resolved.cacheInput,
      format: resolved.format,
      template: resolved.templateId,
      paper: resolved.paper,
      locale: resolved.locale,
      layout: resolved.layout,
      rendererVersion: RENDERER_VERSION,
      photoHash,
    }),
  );
}
