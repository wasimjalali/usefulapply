import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { deleteObject, listPrefix, putObject, USER_STORAGE_QUOTA_BYTES, userStorageBytes } from '@/storage/r2';
import { ImagesBindingUnavailableError, normalizePhotoToJpeg } from '@/storage/images';
import {
  ALLOWED_FILE_BUCKETS,
  FILE_BUCKET_LIMITS,
  PHOTO_BUCKETS,
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

    const isPhoto = PHOTO_BUCKETS.has(bucketRaw);

    // Quota runs before the paid conversion so an over-quota account never
    // burns a transformation. Photos re-encode to a small JPEG, so a large
    // original counts as at most the conversion ceiling, not its raw size.
    const PHOTO_STORED_CEILING = 512 * 1024;
    const effectiveSize = isPhoto ? Math.min(file.size, PHOTO_STORED_CEILING) : file.size;
    const used = await userStorageBytes(user.id, ALLOWED_FILE_BUCKETS);
    if (used + effectiveSize > USER_STORAGE_QUOTA_BYTES) {
      return NextResponse.json(
        { error: 'Storage limit reached. Delete some files to upload more.' },
        { status: 413 },
      );
    }

    // Photos are decoded (HEIC from iPhones included), scaled down and
    // re-encoded as JPEG so every stored photo is browser-renderable.
    let body: ArrayBuffer | File = file;
    let storedExt = ext;
    let storedContentType = contentType || fallbackContentType(ext);
    if (isPhoto) {
      try {
        body = await normalizePhotoToJpeg(file.stream());
        storedExt = '.jpg';
        storedContentType = 'image/jpeg';
      } catch (error) {
        console.error('[files/upload] photo conversion failed:', error);
        if (error instanceof ImagesBindingUnavailableError) {
          // Configuration outage, not the user's file.
          return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
        }
        return NextResponse.json(
          { error: 'That image could not be processed. Try a JPG or PNG.' },
          { status: 400 },
        );
      }
    }

    const fileName = `${crypto.randomUUID()}${storedExt}`;
    const parts = [bucketRaw, user.id];
    if (subpath) parts.push(subpath);
    parts.push(fileName);
    const key = parts.join('/');

    // profile-photos has no D1 reference (the newest object under the prefix is
    // the photo), so replace in place: list what exists, write, then remove the
    // old objects. Avatars are referenced by profiles.avatar_url and are cleaned
    // up by the client after that row is saved (deleteUserFilesAction).
    const previous = bucketRaw === 'profile-photos' ? await listPrefix(`${bucketRaw}/${user.id}/`) : [];

    await putObject(key, body, { contentType: storedContentType });

    if (previous.length > 0) {
      try {
        for (const object of previous) {
          if (object.key !== key) await deleteObject(object.key);
        }
      } catch (error) {
        // The new object is stored; leftover old objects are housekeeping, not a failed upload.
        console.error('[files/upload] failed to remove previous profile photo:', error);
      }
    }

    return NextResponse.json({ key });
  } catch (error) {
    console.error('[files/upload] unexpected error:', error);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}

function fallbackContentType(ext: string): string {
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.txt':
      return 'text/plain';
    case '.md':
      return 'text/markdown';
    case '.tex':
      return 'application/x-tex';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
