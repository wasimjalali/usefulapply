/**
 * Links in a CV or a letter show their address, not a label and not a raw
 * https:// URL: "linkedin.com/in/wasimjalali", "github.com/wasimjalali",
 * "wasimjalali.com". Most ATS read only the visible text and ignore link
 * annotations, and a printed copy loses the target too, so the visible text has
 * to carry the address. The link itself stays clickable with the full URL.
 */

/** The full URL a link points to: a scheme is added when the text has none. */
export function fullUrl(raw: string): string {
  const trimmed = raw.trim();
  // mailto: and tel: are already complete links; a scheme must never be glued in front of them.
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * The clean visible form: scheme, "www." and a trailing slash removed, no query
 * string, no tracking parameters, no fragment, the path kept. Never cut: a
 * long address wraps at its slashes where it is printed (`wbr`), so the text
 * an ATS reads and the text on paper are the whole address.
 */
export function displayUrl(raw: string): string {
  let text = raw.trim();
  if (!text) return '';
  // An address or a number shows without its scheme.
  const direct = text.match(/^(?:mailto|tel):(.+)$/i);
  if (direct) return direct[1];
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
  return `${host}${path}`;
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
