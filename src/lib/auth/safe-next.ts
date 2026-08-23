/**
 * Validate post-auth redirect targets so open redirects can't leave our origin.
 * Only same-origin relative paths are allowed.
 */

// Every consumer eventually resolves the result with the WHATWG URL parser
// (router.push, Better Auth's callbackURL), and that parser strips ASCII tab,
// LF and CR from anywhere in the input before parsing. So "/\t/evil.com"
// resolves to "//evil.com", which is protocol-relative and off-origin. Strip
// them here, before any check runs, or the checks below read a different
// string than the browser will.
const URL_STRIPPED_CHARS = /[\t\n\r]/g;

// Any host would do. It only has to be one we can compare against.
const PROBE_ORIGIN = 'https://useful-apply.invalid';

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

  trimmed = trimmed.replace(URL_STRIPPED_CHARS, '');

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

  // The decider: resolve it the way the browser will and keep it only if the
  // origin didn't move. The checks above are the cheap first pass; this is the
  // one that has to hold.
  try {
    if (new URL(trimmed, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return fallback;
  } catch {
    return fallback;
  }

  return trimmed;
}
