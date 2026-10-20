/**
 * Links in a CV or a letter show their address, not a label and not a raw
 * https:// URL: "linkedin.com/in/wasimjalali", "github.com/wasimjalali",
 * "wasimjalali.com". Most ATS read only the visible text and ignore link
 * annotations, and a printed copy loses the target too, so the visible text has
 * to carry the address. The link itself stays clickable with the full URL.
 */

const MAX_DISPLAY_LENGTH = 48;

/** The full URL a link points to: a scheme is added when the text has none. */
export function fullUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * The clean visible form: scheme, "www." and a trailing slash removed, no query
 * string, no tracking parameters, no fragment, the path kept. Over-long paths
 * are cut with an ellipsis.
 */
export function displayUrl(raw: string, maxLength = MAX_DISPLAY_LENGTH): string {
  let text = raw.trim();
  if (!text) return '';
  let host = '';
  let path = '';
  try {
    const url = new URL(fullUrl(text));
    host = url.hostname.toLowerCase().replace(/^www\./, '');
    path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep the encoded path
    }
  } catch {
    text = text.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[?#].*$/, '');
    host = text.replace(/\/.*$/, '');
    path = text.slice(host.length);
  }
  path = path.replace(/\/+$/, '');
  const clean = `${host}${path}`;
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

const isLinkedIn = (link: string) => /(^|\/\/|\.)linkedin\.com\//i.test(link.trim());
const isGitHub = (link: string) => /(^|\/\/|\.)github\.com\//i.test(link.trim());

/**
 * At most two links for a letterhead: LinkedIn first, then a personal site or
 * portfolio. GitHub only when it is the only other link. Without LinkedIn the
 * first two others, personal sites ahead of GitHub.
 */
export function pickLetterLinks(links: readonly string[] | undefined): string[] {
  const all = (links ?? []).map((link) => link.trim()).filter(Boolean);
  const linkedin = all.find(isLinkedIn);
  const others = all.filter((link) => link !== linkedin);
  const ranked = [...others.filter((link) => !isGitHub(link)), ...others.filter(isGitHub)];
  return [...(linkedin ? [linkedin] : []), ...ranked].slice(0, 2);
}
