/**
 * The full text of a job ad, read from the employer's or the job board's own page.
 *
 * Google Jobs (SerpAPI) hands us its own copy of each ad: list markup stripped and the items glued
 * together, sometimes only a snippet of a hundred characters. Google lists a page only when it carries
 * `JobPosting` structured data (https://developers.google.com/search/docs/appearance/structured-data/job-posting),
 * whose `description` is the ad as HTML. So for an ad whose copy is short, cut off or flat, the page the
 * apply link points at is fetched and that description is converted here, keeping list items and headings
 * on lines of their own.
 *
 * Every page is untrusted: only http(s) on a public host name, re-checked on every redirect, with a
 * timeout and a size cap. Nothing here throws on a bad page; it returns null and the caller keeps the
 * Google copy.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'Mozilla/5.0 (compatible; UsefulApplyBot/1.0; +https://usefulapply.com)';

/** Shorter than this, a Google copy is taken for a snippet. Real ads run 1,500 to 6,000 characters. */
const SHORT_DESCRIPTION_CHARS = 700;

// ---------------------------------------------------------------------------
// How good the Google copy is
// ---------------------------------------------------------------------------

/** Ends in an ellipsis: Google cut the text. */
function endsCut(text: string): boolean {
  return /(…|\.\.\.)\s*$/.test(text);
}

/**
 * Whether the stored text can be taken as the whole ad. A short text or one ending in an ellipsis is
 * not. Used for `description_complete` when no employer page could be read.
 */
export function isDescriptionComplete(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed.length >= SHORT_DESCRIPTION_CHARS && !endsCut(trimmed);
}

/**
 * Whether the employer page is worth reading for this ad: the copy is missing, short or cut, or it is
 * one flat block with no line breaks, which is how Google returns an ad whose lists it stripped.
 */
export function needsPostingPage(text: string | null | undefined): boolean {
  if (!isDescriptionComplete(text)) return true;
  return !(text as string).includes('\n');
}

// ---------------------------------------------------------------------------
// HTML to text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  bull: '•', middot: '·', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', pound: '£',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è',
  agrave: 'à', ccedil: 'ç', ntilde: 'ñ', oacute: 'ó', aacute: 'á', iacute: 'í', uacute: 'ú', copy: '©', reg: '®',
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** A heading line ends in a colon, so the web renderer and an agent both read it as one. */
function asHeading(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return /[:.!?]$/.test(clean) ? clean : `${clean}:`;
}

/**
 * The ad's HTML as plain text: list items as "- item" lines, paragraphs and breaks as line breaks,
 * headings (and a paragraph that is nothing but bold text) on a line of their own ending in a colon.
 */
export function htmlToAdText(html: string): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\r\n?/g, '\n')
    // Source line breaks inside HTML are layout, not content.
    .replace(/\n/g, ' ');

  text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_m, inner: string) => `\n\n${asHeading(stripTags(inner))}\n`);
  // <p><strong>Your tasks</strong></p> is how most boards write a heading.
  text = text.replace(
    /<p[^>]*>\s*<(strong|b)[^>]*>([\s\S]*?)<\/\1>\s*(?:<br\s*\/?>\s*)?<\/p>/gi,
    (_m, _tag: string, inner: string) => `\n\n${asHeading(stripTags(inner))}\n`,
  );
  text = text
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|section|article|ul|ol|table|tr|header|footer|blockquote)[^>]*>/gi, '\n\n')
    .replace(/<\/?(td|th)[^>]*>/gi, ' ');

  text = decodeHtmlEntities(stripTags(text));

  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // A "- " left with nothing after it was an empty <li>.
    .replace(/^- *$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

interface JobPostingLd {
  title: string;
  description: string;
}

function isJobPostingType(value: unknown): boolean {
  if (typeof value === 'string') return value === 'JobPosting' || value.endsWith('/JobPosting');
  return Array.isArray(value) && value.some(isJobPostingType);
}

function collectJobPostings(node: unknown, out: JobPostingLd[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 6) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJobPostings(item, out, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  if (isJobPostingType(record['@type']) && typeof record.description === 'string') {
    out.push({ title: typeof record.title === 'string' ? record.title : '', description: record.description });
  }
  if (record['@graph']) collectJobPostings(record['@graph'], out, depth + 1);
}

/** Every `JobPosting` in the page's `application/ld+json` blocks. A block that does not parse is skipped. */
export function extractJobPostings(html: string): JobPostingLd[] {
  const postings: JobPostingLd[] = [];
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of scripts) {
    try {
      collectJobPostings(JSON.parse(body.trim()), postings);
    } catch {
      // Malformed JSON-LD is common on job boards. The next block may still be good.
    }
  }
  return postings;
}

function titleTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/\((?:[mwfdxi]\s*\/\s*){1,3}[mwfdxi]\)/g, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1),
  );
}

/** Share of our title's words the posting's title has. A page listing other jobs scores low. */
function titleOverlap(ours: string, theirs: string): number {
  const mine = titleTokens(ours);
  if (mine.size === 0) return 0;
  const other = titleTokens(theirs);
  let shared = 0;
  for (const token of mine) if (other.has(token)) shared += 1;
  return shared / mine.size;
}

/**
 * The ad text from a page's HTML, for the job titled `title`: the `JobPosting` whose title matches best
 * (half our title's words or more), its description converted to text. Null when there is none, or when
 * the converted text is shorter than what we already have.
 */
export function readPostingFromHtml(html: string, title: string, current: string | null): string | null {
  const postings = extractJobPostings(html);
  let best: { posting: JobPostingLd; score: number } | null = null;
  for (const posting of postings) {
    // A posting without a title is accepted only when it is the page's only one.
    const score = posting.title ? titleOverlap(title, posting.title) : postings.length === 1 ? 1 : 0;
    if (!best || score > best.score) best = { posting, score };
  }
  if (!best || best.score < 0.5) return null;

  // Some boards entity-encode the HTML inside the JSON string (&lt;p&gt;).
  const raw = /&lt;\/?[a-z]/i.test(best.posting.description) ? decodeHtmlEntities(best.posting.description) : best.posting.description;
  const text = htmlToAdText(raw);
  if (text.length < 200) return null;
  if (current && text.length < current.trim().length * 0.8) return null;
  return text;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Only http(s) on a public host name: no IP literals, no localhost, no single-label or internal names,
 * no credentials, default ports only.
 */
export function isFetchablePostingUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.')) return false;
  if (/^[\d.]+$/.test(host) || host.startsWith('[') || host.includes(':')) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|example|invalid)$/.test(host)) return false;
  // Google's own job search page is where SerpAPI's share link points: it is not the ad.
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return false;
  return true;
}

async function readCapped(response: Response): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/** The page's HTML, following at most three redirects, each one re-checked. Null on any failure. */
export async function fetchPostingHtml(startUrl: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isFetchablePostingUrl(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) return null;
        url = new URL(location, url).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const type = response.headers.get('content-type') ?? '';
      if (type && !/html|xml/i.test(type)) {
        await response.body?.cancel();
        return null;
      }
      return await readCapped(response);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** The links worth trying for an ad, apply options first, each host once, at most three. */
export function postingUrlCandidates(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of urls) {
    if (!value || !isFetchablePostingUrl(value)) continue;
    const key = value.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 3) break;
  }
  return out;
}

/** The first page among `urls` that carries this job's `JobPosting`, as text. */
export async function readFullPosting(params: {
  urls: string[];
  title: string;
  current: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; url: string } | null> {
  for (const url of params.urls) {
    const html = await fetchPostingHtml(url, params.fetchImpl);
    if (!html) continue;
    const text = readPostingFromHtml(html, params.title, params.current);
    if (text) return { text, url };
  }
  return null;
}
