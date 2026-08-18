import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getObject } from '@/storage/r2';
import { userOwnsKey } from '@/storage/paths';

export const runtime = 'nodejs';

const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string[] }> },
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(`files-get:${user.id}`, RATE_LIMITS['files-get']);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const { key: keyParts } = await context.params;
    if (!Array.isArray(keyParts) || keyParts.length === 0) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    // Next.js already percent-decodes catch-all segments; fileDisplayUrl encodes once.
    const key = keyParts.join('/');

    if (!userOwnsKey(key, user.id)) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const object = await getObject(key);
    if (!object) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");

    const etag = object.httpEtag ?? headers.get('etag');
    if (etag) {
      headers.set('ETag', etag);
      const ifNoneMatch = request.headers.get('if-none-match');
      if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
        return new NextResponse(null, { status: 304, headers });
      }
    }

    const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
    const fileName = key.split('/').pop() || 'file';
    const disposition = INLINE_TYPES.has(contentType.toLowerCase()) ? 'inline' : 'attachment';
    // ASCII-only quoted filename plus RFC 6266 filename* for the full name.
    const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file';
    headers.set('Content-Type', contentType);
    headers.set(
      'Content-Disposition',
      `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );

    return new NextResponse(object.body, { status: 200, headers });
  } catch (error) {
    console.error('[files/get] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load file.' }, { status: 500 });
  }
}
