import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { CONTENT_TYPES, encodeRfc5987 } from '@/lib/services/export/filenames';
import { verifyExportLink } from '@/lib/services/export/signing';
import { readExport } from '@/lib/services/export/storage';
import { splitStorageKey } from '@/storage/paths';

export const runtime = 'nodejs';

const KEY_FILE_RE = /^[0-9a-f]{64}\.(pdf|docx|txt)$/;

function notFound() {
  return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * Serves one export by signed link. No cookie, no session: the signature binds
 * the owner, the key and the expiry, so an agent's plain HTTP client can fetch
 * it and nobody else can. The stored object's owner is checked again against
 * the signed owner before a byte is returned.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ key: string[] }> }) {
  try {
    const { key: parts } = await context.params;
    const pathKey = Array.isArray(parts) ? parts.join('/') : '';
    const segments = splitStorageKey(pathKey);
    if (!segments || segments.length !== 2 || !KEY_FILE_RE.test(segments[1])) return notFound();

    const url = new URL(request.url);
    const verified = await verifyExportLink({
      pathKey,
      exp: url.searchParams.get('exp'),
      sig: url.searchParams.get('sig'),
      secret: process.env.EXPORT_SIGNING_SECRET,
    });
    if (!verified.ok) return notFound();

    const rateLimit = await checkRateLimit(`exports-get:${verified.userId}`, RATE_LIMITS['exports-get']);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const object = await readExport(pathKey);
    if (!object || object.customMetadata?.userId !== verified.userId) return notFound();

    const ext = segments[1].split('.')[1];
    const fileName = object.customMetadata?.fileName || `export.${ext}`;
    let displayName = fileName;
    try {
      if (object.customMetadata?.displayName) displayName = decodeURIComponent(object.customMetadata.displayName);
    } catch {
      // keep the ASCII name
    }
    const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

    // writeHttpMetadata is not used, see the files route: everything is set here.
    const headers = new Headers();
    headers.set('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
    headers.set(
      'Content-Disposition',
      `${ext === 'pdf' ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeRfc5987(displayName)}`,
    );
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Content-Type-Options', 'nosniff');
    // No `sandbox` here: Chrome's PDF viewer refuses to open a sandboxed document.
    headers.set('Content-Security-Policy', "default-src 'none'");
    headers.set('Content-Length', String(object.size));
    return new NextResponse(object.body, { status: 200, headers });
  } catch (error) {
    console.error('[exports/get] unexpected error:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Failed to load file.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
