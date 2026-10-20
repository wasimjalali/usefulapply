import posthog from 'posthog-js';
import type { CVData } from '@/lib/cv-templates/types';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';

/**
 * Client side of the server export. The Download buttons ask POST /api/exports
 * for a file, fetch the signed link it returns and hand the blob to the usual
 * download helper. When the server cannot render, callers fall back to the
 * in-browser export and say so with FALLBACK_NOTICE.
 */

export type ServerExportFormat =
  | 'cv_pdf'
  | 'cv_docx'
  | 'cover_letter_pdf'
  | 'cover_letter_docx'
  | 'emails_txt'
  | 'answers_pdf'
  | 'answers_txt';

export interface ServerExportArgs {
  applicationId: string;
  format: ServerExportFormat;
  templateId?: string;
  variant?: 'tailored' | 'original';
  /** What the canvas shows, so a download right after an edit matches the screen. */
  cv?: CVData;
  structuredLetter?: StructuredCoverLetter;
  legacyLetterText?: string;
}

export class ServerExportError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Server export failed (${code})`);
    this.name = 'ServerExportError';
  }
}

export const FALLBACK_NOTICE = 'We used the quick download. The full-quality PDF will be back shortly.';

/** Renders on the server and returns the file. Throws ServerExportError, never a message meant for the user. */
export async function serverExport(args: ServerExportArgs): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch('/api/exports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const payload = (await response.json().catch(() => null)) as { file?: { url: string; fileName: string }; code?: string } | null;
  if (!response.ok || !payload?.file) {
    throw new ServerExportError(response.status, payload?.code ?? 'UNKNOWN');
  }
  const file = await fetch(payload.file.url);
  if (!file.ok) throw new ServerExportError(file.status, 'DOWNLOAD_FAILED');
  return { blob: await file.blob(), fileName: payload.file.fileName };
}

/** True when the failure means "use the browser export" rather than "this document cannot exist". */
export function shouldFallBack(error: unknown): boolean {
  if (!(error instanceof ServerExportError)) return true;
  return error.status >= 500 || error.status === 404 || error.status === 429 || error.code === 'DOWNLOAD_FAILED';
}

export function trackExportFallback(format: ServerExportFormat, error: unknown): void {
  try {
    posthog.capture('export_fallback_used', {
      format,
      status: error instanceof ServerExportError ? error.status : null,
      code: error instanceof ServerExportError ? error.code : 'network',
    });
  } catch {
    // Analytics never blocks a download.
  }
}
