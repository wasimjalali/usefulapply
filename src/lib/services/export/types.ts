import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import type { CVData } from '@/lib/cv-templates/types';
import type { PaperSize } from '@/lib/cv-templates/print-spec';
import type { ExportFormat } from './filenames';
import type { LetterLayout } from './letter-html';

export type { ExportFormat, LetterLayout };

/**
 * Bump when a template, the print stylesheet, the fonts or a layout changes in
 * a way that alters the output. It is part of the cache key, so old exports are
 * never served for new rendering.
 */
export const RENDERER_VERSION = '1.0.0';

export interface ExportEmail {
  /** "Application email", "Follow-up email" (or the German labels). */
  label: string;
  subject: string;
  body: string;
}

export interface ExportAnswer {
  question: string;
  answer: string;
}

/**
 * Everything an export needs, read from one application. The orchestrator
 * points `loadKit` at the shared `getKit` service when it lands; nothing else
 * in the export service reaches into the session row.
 */
export interface ExportKit {
  applicationId: string;
  jobTitle: string;
  company: string;
  /** The template saved on the application, if any. */
  templateId: string | null;
  applicantName: string;
  /** The tailored CV, or the primary CV when no tailored one exists yet. Without a photo. */
  cv: CVData | null;
  /** The primary CV as parsed, for the Original view. */
  originalCv: CVData | null;
  coverLetter: { structured: StructuredCoverLetter | null; legacyText: string | null } | null;
  emails: ExportEmail[];
  answers: ExportAnswer[];
  /** The profile photo as a data URI, or null. Used only by templates that print one. */
  photoDataUri: string | null;
}

export type KitLoader = (userId: string, applicationId: string) => Promise<ExportKit | null>;

export interface ExportOptions {
  /** CV template. Defaults to the one saved on the application, then Premium ATS. */
  templateId?: string;
  /** Overrides the template's paper. The layout reflows to the new width. */
  paper?: PaperSize;
  /** An explicit letter locale ("de" gives DIN 5008). Otherwise the letter's own market, the language and the template decide. */
  letterLocale?: string;
  /** Which CV to export. Tailored is the default. */
  variant?: 'tailored' | 'original';
  /**
   * The web app sends what the canvas shows, so a download right after an edit
   * matches the screen even before the autosave lands. The photo is never taken
   * from it. MCP callers do not use these.
   */
  overrides?: {
    cv?: CVData;
    legacyLetterText?: string;
    structuredLetter?: StructuredCoverLetter;
    emails?: ExportEmail[];
    answers?: ExportAnswer[];
  };
}

export interface ExportRequest extends ExportOptions {
  userId: string;
  applicationId: string;
  format: ExportFormat;
}

export interface ExportedFile {
  format: ExportFormat;
  fileName: string;
  contentType: string;
  bytes: number;
  /** Signed, valid 15 minutes. Relative to the site origin. */
  url: string;
  expiresAt: string;
  /** True when an identical export already existed and nothing was rendered. */
  cached: boolean;
  templateId: string;
  paper: PaperSize;
  layout: LetterLayout | null;
}
