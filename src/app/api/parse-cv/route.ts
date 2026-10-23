import { NextRequest, NextResponse } from 'next/server';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { getObject } from '@/storage/r2';
import {
  ACCEPTED_CV_EXTENSIONS,
  CvParseError,
  hasCvParsingCapability,
  parseCvBuffer,
  type ParsedCv,
} from '@/lib/cv-parser/parse-cv-core';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';

export const runtime = 'nodejs';
export const maxDuration = 300;

// File size limits
const MAX_FILE_SIZE_DIRECT = 4.5 * 1024 * 1024;  // Direct upload (Vercel body limit)
const MAX_FILE_SIZE_STORAGE = 10 * 1024 * 1024;   // Storage-first upload (no body limit)

// Accepted file extensions
const ACCEPTED_EXTENSIONS = ACCEPTED_CV_EXTENSIONS;

function resolveOwnedCvKey(userId: string, storagePath: unknown): string | null {
  if (typeof storagePath !== 'string') return null;
  if (storagePath.includes('\\') || storagePath.includes('..')) return null;
  const segments = storagePath.split('/');
  if (segments.some((segment) => segment.length === 0)) return null;
  const fileOk = (name: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(name);
  const typeOk = (type: string) => type === 'primary_cv' || type === 'master_cv';
  if (
    segments.length === 4
    && segments[0] === 'cv-files'
    && segments[1] === userId
    && typeOk(segments[2])
    && fileOk(segments[3])
  ) {
    return storagePath;
  }
  if (
    segments.length === 3
    && segments[0] === userId
    && typeOk(segments[1])
    && fileOk(segments[2])
  ) {
    return `cv-files/${storagePath}`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Auth check: determines rate limiting (anonymous = 5/24h IP limit, authenticated = unlimited)
    const clientIP = getClientIP(request);
    const user = await getCurrentUser(request);
    const isAuthenticated = !!user;
    const limiterSubject = clientIP === 'unknown' && user ? `user:${user.id}` : clientIP;
    const rateLimitResult = await checkRateLimit(`parse-cv:${limiterSubject}`, RATE_LIMITS['parse-cv']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const clientRequestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    const generationContext: LlmGenerationContext = {
      requestExecutionId: crypto.randomUUID(),
      clientRequestId,
      userId: user?.id ?? null,
      anonymousSubjectHash: user ? null : `parse-cv:${clientIP}`,
      route: '/api/parse-cv',
      feature: 'cv_parse',
      operation: 'parse_cv',
    };

    // Two input modes:
    // 1) FormData with 'file' field — direct upload (≤ 4.5 MB, Vercel body limit)
    // 2) JSON with 'storagePath' + 'fileName' — storage-first (up to 10 MB)
    let buffer: Buffer = undefined!;
    let originalFileName = '';
    let fileExt: string;
    let region = 'EU';

    let documentType: 'primary_cv' | 'master_cv' = 'primary_cv';
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // Mode 2: Storage-first — file already uploaded to R2
      if (!isAuthenticated) {
        return NextResponse.json({ error: 'Authentication required for storage-based parsing.' }, { status: 401 });
      }

      const body = await request.json();
      const { storagePath, fileName } = body;
      region = body.region === 'US' ? 'US' : 'EU';
      if (body.documentType === 'master_cv') documentType = 'master_cv';

      if (!storagePath || !fileName) {
        return NextResponse.json({ error: 'Missing storagePath or fileName.' }, { status: 400 });
      }

      originalFileName = fileName;
      fileExt = '.' + (fileName.toLowerCase().split('.').pop() || '');

      if (!ACCEPTED_EXTENSIONS.includes(fileExt)) {
        return NextResponse.json(
          { error: `Unsupported file type "${fileExt}". Accepted formats: PDF, DOCX, TXT, MD, TEX.` },
          { status: 400 }
        );
      }

      console.log(`[Parser] Storage-first mode: ${fileName}, path: ${storagePath}`);

      // Ownership: new keys are `cv-files/<userId>/<primary_cv|master_cv>/<name>.<ext>`.
      // Legacy D1 rows still store `<userId>/<primary_cv|master_cv>/<name>.<ext>`
      // (copied to R2 as `cv-files/<legacy>`). Segment-wise check so `..` or extra
      // segments cannot escape the user's prefix.
      const r2Key = resolveOwnedCvKey(user.id, storagePath);
      if (!r2Key) {
        return NextResponse.json({ error: 'Authentication required for storage-based parsing.' }, { status: 401 });
      }

      const fileData = await getObject(r2Key);
      if (!fileData) {
        console.error('[Parser] Failed to download from storage');
        return NextResponse.json({ error: 'Failed to download file from storage.' }, { status: 400 });
      }

      // Check the stored size before materialising the body in memory.
      if (fileData.size > MAX_FILE_SIZE_STORAGE) {
        return NextResponse.json(
          { error: `File is too large (${(fileData.size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.` },
          { status: 400 }
        );
      }

      buffer = Buffer.from(await new Response(fileData.body).arrayBuffer());
    } else {
      // Mode 1: Direct FormData upload (original path)
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch (e) {
        console.error('[Parser] Failed to parse form data:', e);
        return NextResponse.json(
          { error: 'Failed to read upload. The file may be too large (max 4.5 MB). For larger files, try from the Documents page.' },
          { status: 400 }
        );
      }

      const file = formData.get('file') as File;
      region = (formData.get('region') as string) === 'US' ? 'US' : 'EU';
      if ((formData.get('documentType') as string) === 'master_cv') documentType = 'master_cv';

      if (!file || !(file instanceof File) || file.size === 0) {
        console.error('[Parser] No valid file in form data. Keys:', [...formData.keys()]);
        return NextResponse.json({ error: 'No file provided. Please select a PDF, DOCX, TXT, MD, or TEX file.' }, { status: 400 });
      }

      originalFileName = file.name;
      fileExt = '.' + (originalFileName.toLowerCase().split('.').pop() || '');

      if (!ACCEPTED_EXTENSIONS.includes(fileExt)) {
        return NextResponse.json(
          { error: `Unsupported file type "${fileExt}". Accepted formats: PDF, DOCX, TXT, MD, TEX.` },
          { status: 400 }
        );
      }

      console.log(`[Parser] Direct upload: ${originalFileName}, size: ${(file.size / 1024).toFixed(1)} KB`);

      if (file.size > MAX_FILE_SIZE_DIRECT) {
        return NextResponse.json(
          { error: isAuthenticated
            ? `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum for direct upload: 4.5 MB. For larger files, use the Documents page.`
            : `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Free uploads are limited to 4.5 MB. Sign up to upload files up to 10 MB.`
          },
          { status: 400 }
        );
      }

      try {
        buffer = Buffer.from(await file.arrayBuffer());
      } catch (e) {
        console.error('[Parser] Failed to read file buffer:', e);
        return NextResponse.json({ error: 'Failed to read file contents. Please try again.' }, { status: 400 });
      }
    }

    // Buffer integrity check
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'File appears to be empty. Please try uploading again.' }, { status: 400 });
    }

    // Tighter rate limiting for anonymous users: 5 parses per hour per IP
    if (!isAuthenticated) {
      const anonResult = await checkRateLimit(`anon-parse:${clientIP}`, RATE_LIMITS['anon-parse']);
      const anonMinuteResult = await checkRateLimit(`anon-parse-minute:${clientIP}`, RATE_LIMITS['anon-parse-minute']);
      if (!anonResult.allowed || !anonMinuteResult.allowed) {
        return NextResponse.json(
          { error: "You've reached the free parse limit. Sign up free to get unlimited CV uploads." },
          { status: 429 }
        );
      }
    }

    if (!hasCvParsingCapability()) {
      return NextResponse.json(
        { error: 'CV parsing is temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    // Parse CV using AI
    const parseStartTime = Date.now();
    let parsed: ParsedCv;
    try {
      parsed = await parseCvBuffer({
        buffer,
        fileExt,
        fileName: originalFileName,
        region: region as 'US' | 'EU',
        documentType,
        generationContext,
      });
    } catch (e) {
      if (e instanceof CvParseError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    const { structuredCV, rawText, parserUsed, parseTime } = parsed;

    // Track anonymous AI parse usage separately for cost monitoring
    if (!isAuthenticated) {
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: `anon-ip:${clientIP}`,
        event: 'anonymous_cv_parse',
        properties: {
          file_type: fileExt,
          text_length: rawText.length,
          parse_time_ms: Date.now() - parseStartTime,
        },
      });
    }


    return NextResponse.json({
      success: true,
      structuredCV,
      originalPdf: {
        id: crypto.randomUUID(),
        url: undefined,
        fileName: originalFileName,
        size: buffer.length,
      },
      rawText,
      metadata: {
        parserUsed,
        parseTime,
        region,
        textLength: rawText.length,
      },
    });

  } catch (error) {
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/parse-cv',
      method: 'POST',
    });
    await posthog.flush();
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse CV' },
      { status: 500 }
    );
  }
}
