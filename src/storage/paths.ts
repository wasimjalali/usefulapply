export const ALLOWED_FILE_BUCKETS = ['cv-files', 'generated-pdfs', 'avatars', 'profile-photos'] as const;

export type AllowedFileBucket = (typeof ALLOWED_FILE_BUCKETS)[number];

const CV_EXTS = new Set(['.pdf', '.docx', '.txt', '.md', '.tex']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const CV_TYPES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'application/x-tex', 'text/x-tex']);
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

export const FILE_BUCKET_LIMITS: Record<AllowedFileBucket, { maxBytes: number; exts: Set<string>; types: Set<string> }> = {
  'cv-files': { maxBytes: 10 * 1024 * 1024, exts: CV_EXTS, types: CV_TYPES },
  'generated-pdfs': { maxBytes: 10 * 1024 * 1024, exts: new Set(['.pdf']), types: new Set(['application/pdf']) },
  avatars: { maxBytes: 5 * 1024 * 1024, exts: IMAGE_EXTS, types: IMAGE_TYPES },
  'profile-photos': { maxBytes: 5 * 1024 * 1024, exts: IMAGE_EXTS, types: IMAGE_TYPES },
};

export function isAllowedFileBucket(value: string): value is AllowedFileBucket {
  return (ALLOWED_FILE_BUCKETS as readonly string[]).includes(value);
}

/**
 * Split a storage key into segments. Rejects `..`, empty segments, backslashes
 * and a leading slash so a client string cannot walk out of its prefix.
 */
export function splitStorageKey(key: string): string[] | null {
  if (typeof key !== 'string' || key.length === 0 || key.length > 1024) return null;
  if (key.includes('\\') || /[\x00-\x1f\x7f]/.test(key)) return null;
  if (key.startsWith('/') || key.endsWith('/')) return null;
  const segments = key.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return null;
  }
  return segments;
}

export function userOwnsKey(key: string, userId: string): boolean {
  const segments = splitStorageKey(key);
  if (!segments || segments.length < 3) return false;
  return isAllowedFileBucket(segments[0]) && segments[1] === userId;
}

export function userPrefix(bucket: AllowedFileBucket, userId: string): string {
  return `${bucket}/${userId}/`;
}

/** Browser and server: turn a stored R2 key (or a leftover Supabase URL) into a same-origin file URL. */
export function fileDisplayUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith('data:') || stored.startsWith('/api/files/')) return stored;
  const key = storedFileKey(stored);
  if (!key) return stored;
  return `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** A stored value (R2 key or leftover Supabase URL) as an R2 key, or null when it is neither. */
export function storedFileKey(stored: string): string | null {
  const fromLegacy = extractKeyFromLegacyUrl(stored);
  if (fromLegacy) return fromLegacy;
  if (stored.startsWith('http://') || stored.startsWith('https://')) return null;
  return splitStorageKey(stored) ? stored : null;
}

function extractKeyFromLegacyUrl(value: string): string | null {
  if (!value.startsWith('http://') && !value.startsWith('https://')) return null;
  try {
    const url = new URL(value);
    const marker = '/storage/v1/object/';
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return null;
    const rest = url.pathname.slice(idx + marker.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts[0] === 'public' || parts[0] === 'sign' || parts[0] === 'authenticated') {
      parts.shift();
    }
    if (parts.length < 2 || !isAllowedFileBucket(parts[0])) return null;
    const key = parts.map((part) => decodeURIComponent(part)).join('/');
    return splitStorageKey(key) ? key : null;
  } catch {
    return null;
  }
}

export function sanitizeUploadExt(fileName: string, allowed: Set<string>): string | null {
  const raw = fileName.toLowerCase().split('.').pop() || '';
  if (!/^[a-z0-9]{1,8}$/.test(raw)) return null;
  const ext = `.${raw}`;
  return allowed.has(ext) ? ext : null;
}

export function sanitizeSubpath(value: string | null | undefined): string | null {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') return null;
  if (value.includes('/') || value.includes('\\') || value.includes('..')) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) return null;
  return value;
}

/**
 * Stored documents.storage_path may be a full R2 key (`cv-files/<userId>/...`)
 * or a leftover Supabase path (`<userId>/...`). Always talk to R2 with the bucket prefix.
 */
export function toR2Key(bucket: AllowedFileBucket, stored: string): string | null {
  if (stored.startsWith(`${bucket}/`)) {
    return splitStorageKey(stored) ? stored : null;
  }
  const combined = `${bucket}/${stored}`;
  return splitStorageKey(combined) ? combined : null;
}
