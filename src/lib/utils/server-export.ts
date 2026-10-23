import posthog from 'posthog-js';
import type { CVData } from '@/lib/cv-templates/types';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';

/**
 * Client side of the export. Every Download button asks POST /api/exports for a
 * file (Browser Run renders the PDFs), fetches the signed link it returns and
 * hands the blob to the download helper. There is no in-browser export: when the
 * server can't render, the user gets an error that says so and offers a retry.
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
  /** For answers_pdf / answers_txt: what the Answers tab shows. */
  answers?: Array<{ question: string; answer: string }>;
}

const SAVED_APPLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for an application saved on the server. A local id (`session-…`, `fit-…`) has nothing the server can export yet. */
export function isSavedApplicationId(id: string | null | undefined): id is string {
  return typeof id === 'string' && SAVED_APPLICATION_ID.test(id);
}

export class ServerExportError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Server export failed (${code})`);
    this.name = 'ServerExportError';
  }
}

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
  const blob = await file.blob();
  // Never hand the user an empty file.
  if (blob.size === 0) throw new ServerExportError(502, 'EMPTY_FILE');
  return { blob, fileName: payload.file.fileName };
}

/** What the user reads when an export fails, and whether trying again can help. `label` names the file: "PDF", "Word file". */
export function exportFailure(error: unknown, label: string): { message: string; retryable: boolean } {
  if (error instanceof ServerExportError && error.code !== 'DOWNLOAD_FAILED' && error.code !== 'EMPTY_FILE') {
    if (error.status === 429) return { message: 'Too many downloads at once. Try again in a minute.', retryable: true };
    if (error.status === 401) return { message: 'Your session expired. Sign in again to download.', retryable: false };
    if (error.status === 413) return { message: `The ${label} is too large to export.`, retryable: false };
    if (error.status === 404) return { message: `We couldn't find this application. Reload the page and try again.`, retryable: false };
    if (error.status >= 400 && error.status < 500) return { message: `The ${label} couldn't be exported as it is.`, retryable: false };
  }
  // Renderer down, storage error, an empty file or no network: the same request can work in a moment.
  return { message: `The ${label} didn't build. Try again in a moment.`, retryable: true };
}

interface ErrorToast {
  error: (message: string, duration?: number, actions?: Array<{ label: string; onClick: () => void }>) => void;
}

/** Shows the failure, with a Try again button when trying again can help. */
export function notifyExportFailure(toast: ErrorToast, error: unknown, label: string, retry: () => void): void {
  const { message, retryable } = exportFailure(error, label);
  toast.error(message, retryable ? 10000 : 7000, retryable ? [{ label: 'Try again', onClick: retry }] : undefined);
}

export function trackExportFailure(format: ServerExportFormat, error: unknown): void {
  try {
    posthog.capture('export_failed', {
      format,
      status: error instanceof ServerExportError ? error.status : null,
      code: error instanceof ServerExportError ? error.code : 'network',
    });
  } catch {
    // Analytics never blocks a download.
  }
}
