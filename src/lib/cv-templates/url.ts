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

/** displayUrl plus the query and fragment: the form that tells two links on one host apart. */
function detailedDisplayUrl(raw: string): string {
  const text = raw.trim();
  if (/^(?:mailto|tel):/i.test(text)) return displayUrl(text);
  try {
    const url = new URL(fullUrl(text));
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep the encoded path
    }
    const tail = `${url.search}${url.hash}`;
    // "wasimjalali.com/#work" keeps its slash; a bare path loses a trailing one, as in displayUrl.
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${tail ? path : path.replace(/\/+$/, '')}${tail}`;
  } catch {
    return displayUrl(text);
  }
}

export interface ContactLink {
  /** The link as stored: pass it to fullUrl() for the href. */
  raw: string;
  /** The visible address. */
  text: string;
}

/**
 * The links of a contact line with their visible text. Each shows its clean
 * address (displayUrl). Links that would show the same text (a website and its
 * #work portfolio) show host, path, query and fragment instead, so they read
 * differently whichever comes first; links whose full address is identical
 * are shown once. Links with distinct text come out exactly as displayUrl
 * gives them.
 */
export function contactLinks(raws: readonly string[]): ContactLink[] {
  const links = raws.filter((raw) => raw && raw.trim());
  const plain = links.map(displayUrl);
  const out: ContactLink[] = [];
  const shown = new Set<string>();
  links.forEach((raw, index) => {
    const clash = plain.some((text, other) => other !== index && text === plain[index]);
    const text = clash ? detailedDisplayUrl(raw) : plain[index];
    // Case-insensitive: a host is case-insensitive and the plain form already lowercases it.
    const key = text.toLowerCase();
    if (shown.has(key)) return;
    shown.add(key);
    out.push({ raw, text });
  });
  return out;
}

/** The letterhead's links (see pickLetterLinks) with their visible text (see contactLinks). */
export function letterContactLinks(links: readonly string[] | undefined): ContactLink[] {
  return contactLinks(pickLetterLinks(links));
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
