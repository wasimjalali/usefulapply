import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { ImagesBindingUnavailableError } from '@/storage/images';
import { PhotoUnprocessableError, StorageQuotaError, storeUserUpload } from '@/lib/services/profile';
import {
  FILE_BUCKET_LIMITS,
  isAllowedFileBucket,
  sanitizeSubpath,
  sanitizeUploadExt,
} from '@/storage/paths';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(`files-upload:${user.id}`, RATE_LIMITS['files-upload']);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
    }

    const file = formData.get('file');
    const bucketRaw = formData.get('bucket');
    const subpathRaw = formData.get('subpath');

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (typeof bucketRaw !== 'string' || !isAllowedFileBucket(bucketRaw)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const limits = FILE_BUCKET_LIMITS[bucketRaw];
    if (file.size > limits.maxBytes) {
      return NextResponse.json({ error: 'File is too large.' }, { status: 400 });
    }

    const ext = sanitizeUploadExt(file.name, limits.exts);
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
    }

    const contentType = (file.type || '').toLowerCase();
    if (contentType && !limits.types.has(contentType)) {
      return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
    }

    const subpath = sanitizeSubpath(typeof subpathRaw === 'string' ? subpathRaw : '');
    if (subpath === null) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    let key: string;
    try {
      key = await storeUserUpload(user.id, { bucket: bucketRaw, subpath, file, ext });
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        return NextResponse.json(
          { error: 'Storage limit reached. Delete some files to upload more.' },
          { status: 413 },
        );
      }
      if (error instanceof ImagesBindingUnavailableError) {
        // Configuration outage, not the user's file.
        return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
      }
      if (error instanceof PhotoUnprocessableError) {
        return NextResponse.json(
          { error: 'That image could not be processed. Try a JPG or PNG.' },
          { status: 400 },
        );
      }
      throw error;
    }

    return NextResponse.json({ key });
  } catch (error) {
    console.error('[files/upload] unexpected error:', error);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}
