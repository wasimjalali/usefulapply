/**
 * Validate post-auth redirect targets so open redirects can't leave our origin.
 * Only same-origin relative paths are allowed.
 */
export function getSafeNextPath(
  next: string | null | undefined,
  fallback = '/dashboard'
): string {
  if (!next) return fallback;

  let trimmed = next.trim();
  try {
    trimmed = decodeURIComponent(trimmed).trim();
  } catch {
    return fallback;
  }

  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return fallback;
  }

  // Block scheme smuggling (e.g. /https://evil.com, /javascript:...)
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return fallback;
  }

  // Block embedded credentials / host confusion
  if (trimmed.includes('@') || trimmed.includes('://')) {
    return fallback;
  }

  return trimmed;
}
