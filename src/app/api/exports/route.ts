import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import {
  ExportInputError,
  ExportRateLimitedError,
  ExportRenderError,
  ExportTooLargeError,
  SigningUnavailableError,
  exportDocument,
  isExportFormat,
  type ExportOptions,
} from '@/lib/services/export';
import { sanitizeAnswers, sanitizeCvData, sanitizeEmails, sanitizeStructuredLetter } from '@/lib/services/export/sanitize';
import { getPostHogServer } from '@/lib/posthog-server';

export const runtime = 'nodejs';

/** The body as text, or null when it is longer than `max` bytes. Counts bytes, not characters. */
async function readBodyWithCap(request: NextRequest, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > max) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 768 * 1024;

function bad(message = 'Invalid request.', status = 400, code = 'BAD_REQUEST') {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Renders a CV, cover letter, emails or screening answers for one of the
 * signed-in user's applications and returns a signed link to the file. With
 * no applicationId it renders the user's own base CV (cv_pdf or cv_docx only).
 * The web app's Download buttons use it. The same service backs the MCP
 * `export_documents` tool.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const rateLimit = await checkRateLimit(`exports:${user.id}`, RATE_LIMITS['exports']);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // Read the body with a byte cap, so a chunked request with no Content-Length cannot get past it either.
    const text = await readBodyWithCap(request, MAX_BODY_BYTES);
    if (text === null) return bad('Request is too large.', 413, 'TOO_LARGE');

    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad();
      body = parsed as Record<string, unknown>;
    } catch {
      return bad();
    }

    const { applicationId, format } = body;
    // No application: the signed-in user's own base CV, as a CV only (see exportDocument).
    const baseCv = applicationId === undefined || applicationId === null;
    if (!baseCv && (typeof applicationId !== 'string' || !UUID_RE.test(applicationId))) return bad();
    if (!isExportFormat(format)) return bad();
    if (baseCv && format !== 'cv_pdf' && format !== 'cv_docx') return bad();

    const options: ExportOptions = {};
    if (body.templateId !== undefined) {
      if (typeof body.templateId !== 'string' || body.templateId.length > 64) return bad();
      options.templateId = body.templateId;
    }
    if (body.paper !== undefined) {
      if (body.paper !== 'a4' && body.paper !== 'letter') return bad();
      options.paper = body.paper;
    }
    if (body.letterLocale !== undefined) {
      if (typeof body.letterLocale !== 'string' || body.letterLocale.length > 8) return bad();
      options.letterLocale = body.letterLocale;
    }
    if (body.variant !== undefined) {
      if (body.variant !== 'tailored' && body.variant !== 'original') return bad();
      options.variant = body.variant;
    }

    const overrides: NonNullable<ExportOptions['overrides']> = {};
    if (body.cv !== undefined) {
      const cv = sanitizeCvData(body.cv);
      if (!cv) return bad();
      overrides.cv = cv;
    }
    if (body.structuredLetter !== undefined) {
      const letter = sanitizeStructuredLetter(body.structuredLetter);
      if (!letter) return bad();
      overrides.structuredLetter = letter;
    }
    if (body.legacyLetterText !== undefined) {
      if (typeof body.legacyLetterText !== 'string' || body.legacyLetterText.length > 30_000) return bad();
      overrides.legacyLetterText = body.legacyLetterText;
    }
    if (body.emails !== undefined) overrides.emails = sanitizeEmails(body.emails);
    if (body.answers !== undefined) overrides.answers = sanitizeAnswers(body.answers);
    if (Object.keys(overrides).length > 0) options.overrides = overrides;

    try {
      const file = await exportDocument({ userId: user.id, applicationId: baseCv ? null : applicationId, format, ...options });
      return NextResponse.json({ file }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      if (error instanceof ExportInputError) {
        if (error.code === 'NOT_FOUND') return bad('Not found.', 404, 'NOT_FOUND');
        return bad(error.message, error.code === 'BAD_REQUEST' ? 400 : 422, error.code);
      }
      if (error instanceof ExportRateLimitedError) return bad('Too many requests. Please try again later.', 429, 'RATE_LIMITED');
      if (error instanceof ExportTooLargeError) return bad('The document is too large to export.', 413, 'EXPORT_TOO_LARGE');
      // Renderer down, signing secret missing, storage error: the client says so and offers a retry.
      const reason = error instanceof ExportRenderError ? 'render' : error instanceof SigningUnavailableError ? 'signing' : 'other';
      // Server logs only: the message never reaches the client.
      console.error(`[exports] ${format} failed (${reason}):`, error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : 'unknown');
      const posthog = getPostHogServer();
      posthog?.capture({ distinctId: user.id, event: 'server_export_failed', properties: { format, reason } });
      await posthog?.flush();
      return bad('The export is unavailable right now.', 503, 'RENDER_UNAVAILABLE');
    }
  } catch (error) {
    console.error('[exports] unexpected error:', error instanceof Error ? error.name : 'unknown');
    return bad('Something went wrong.', 500, 'INTERNAL');
  }
}
