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
      // A lone surrogate (U+D800 to U+DFFF) is not a character: an API refuses text that carries one.
      const valid = Number.isFinite(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Lowercase A to Z only: every index stays the same as in the original, which toLowerCase does not promise
 * ("İ" becomes two code units). Tag names are ASCII, which is all this is used to find.
 */
function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

/** A heading line ends in a colon, so the web renderer and an agent both read it as one. */
function asHeading(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return /[:.!?]$/.test(clean) ? clean : `${clean}:`;
}

/** A bold-only paragraph reads as a heading when it is short and not a sentence. */
function isHeadingLike(text: string): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 0 && clean.length <= 80 && !/[.!?]$/.test(clean);
}

/** Past this much HTML the rest is not read: real ads are a few tens of KB. */
const MAX_HTML_CHARS = 200_000;
const SKIPPED_TAGS = new Set(['script', 'style', 'noscript', 'template']);
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'ul', 'ol', 'table', 'tr', 'header', 'footer', 'blockquote']);

/**
 * The ad's HTML as plain text: list items as "- item" lines, paragraphs and breaks as line breaks,
 * headings (and a short paragraph that is nothing but bold text) on a line of their own ending in a colon.
 *
 * One pass over the tags with indexOf, so the work grows with the length of the HTML and an unclosed
 * tag or comment ends the read instead of being searched for again from every opener. The HTML is a
 * stranger's page.
 */
export function htmlToAdText(html: string): string {
  const source = html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
  const lower = asciiLower(source);
  const out: string[] = [];
  let heading: string[] | null = null;
  let paragraph: { parts: string[]; boldDepth: number; sawBold: boolean; plainText: boolean; bullet: boolean } | null = null;

  const write = (text: string) => {
    if (heading) heading.push(text);
    else if (paragraph) paragraph.parts.push(text);
    else out.push(text);
  };
  const writeText = (raw: string) => {
    const text = decodeHtmlEntities(raw.replace(/\s+/g, ' '));
    if (paragraph && !heading && text.trim()) {
      if (paragraph.boldDepth > 0) paragraph.sawBold = true;
      else paragraph.plainText = true;
    }
    write(text);
  };
  const closeParagraph = () => {
    if (!paragraph) return;
    const text = paragraph.parts.join('');
    const boldHeading = paragraph.sawBold && !paragraph.plainText && isHeadingLike(text);
    const bullet = paragraph.bullet;
    paragraph = null;
    if (bullet) out.push(`\n- ${text.trim()}`);
    else out.push(boldHeading ? `\n\n${asHeading(text)}\n` : `\n\n${text}\n\n`);
  };

  let at = 0;
  while (at < source.length) {
    const open = source.indexOf('<', at);
    const textEnd = open === -1 ? source.length : open;
    if (textEnd > at) writeText(source.slice(at, textEnd));
    if (open === -1) break;
    if (source.startsWith('<!--', open)) {
      const close = source.indexOf('-->', open + 4);
      if (close === -1) break;
      at = close + 3;
      continue;
    }
    const gt = source.indexOf('>', open + 1);
    if (gt === -1) break;
    const tag = /^(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(source.slice(open + 1, Math.min(gt, open + 40)));
    at = gt + 1;
    if (!tag) continue;
    const closing = tag[1] === '/';
    const name = tag[2].toLowerCase();

    if (!closing && SKIPPED_TAGS.has(name)) {
      const close = lower.indexOf(`</${name}`, at);
      if (close === -1) break;
      const end = source.indexOf('>', close);
      at = end === -1 ? source.length : end + 1;
      continue;
    }
    if (/^h[1-6]$/.test(name)) {
      if (!closing) {
        closeParagraph();
        heading = [];
      } else if (heading) {
        const text = heading.join('');
        heading = null;
        out.push(`\n\n${asHeading(text)}\n`);
      }
      continue;
    }
    if (name === 'p') {
      closeParagraph();
      if (!closing) {
        // <li><p>Item</p></li>, common on ATS pages: the paragraph is the item, so it keeps the bullet.
        const bullet = !heading && out.length > 0 && out[out.length - 1] === '\n- ';
        if (bullet) out.pop();
        paragraph = { parts: [], boldDepth: 0, sawBold: false, plainText: false, bullet };
      }
      continue;
    }
    if (name === 'strong' || name === 'b') {
      if (paragraph) paragraph.boldDepth = Math.max(0, paragraph.boldDepth + (closing ? -1 : 1));
      continue;
    }
    if (name === 'li') {
      // An item starts its own line; the next item or block ends it.
      if (!closing) write('\n- ');
      continue;
    }
    if (name === 'br') {
      write('\n');
      continue;
    }
    if (BLOCK_TAGS.has(name)) {
      write('\n\n');
      continue;
    }
    if (name === 'td' || name === 'th') write(' ');
  }
  closeParagraph();
  if (heading) out.push(`\n\n${asHeading(heading.join(''))}\n`);

  return out.join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // A "- " left with nothing after it was an empty <li>.
    .replace(/^- *$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

interface JobPostingLd {
  title: string;
  description: string;
  /** hiringOrganization.name, when the page states it. */
  company: string | null;
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
    const organization = record.hiringOrganization;
    const company = organization && typeof organization === 'object' && !Array.isArray(organization)
      && typeof (organization as Record<string, unknown>).name === 'string'
      ? (organization as Record<string, unknown>).name as string
      : typeof organization === 'string' ? organization : null;
    out.push({ title: typeof record.title === 'string' ? record.title : '', description: record.description, company });
  }
  if (record['@graph']) collectJobPostings(record['@graph'], out, depth + 1);
}

/** Every `JobPosting` in the page's `application/ld+json` blocks. A block that does not parse is skipped. */
export function extractJobPostings(html: string): JobPostingLd[] {
  const postings: JobPostingLd[] = [];
  const lower = asciiLower(html);
  let at = 0;
  // indexOf from each script's end: an unclosed script ends the read rather than being searched again.
  for (;;) {
    const open = lower.indexOf('<script', at);
    if (open === -1) break;
    const gt = lower.indexOf('>', open);
    if (gt === -1) break;
    const close = lower.indexOf('</script', gt);
    if (close === -1) break;
    at = close + 8;
    if (!lower.slice(open, gt).includes('application/ld+json')) continue;
    try {
      collectJobPostings(JSON.parse(html.slice(gt + 1, close).trim()), postings);
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

/** Share of `ours`' words that `theirs` has. */
function coverage(ours: Set<string>, theirs: Set<string>): number {
  if (ours.size === 0) return 0;
  let shared = 0;
  for (const token of ours) if (theirs.has(token)) shared += 1;
  return shared / ours.size;
}

/** How well a posting's title fits ours: the weaker of the two directions, so a longer title of another job scores low. */
function titleFit(ours: string, theirs: string): number {
  const mine = titleTokens(ours);
  const other = titleTokens(theirs);
  return Math.min(coverage(mine, other), coverage(other, mine));
}

function companyTokens(value: string): Set<string> {
  const generic = new Set(['gmbh', 'ag', 'se', 'kg', 'co', 'inc', 'ltd', 'llc', 'plc', 'bv', 'sa', 'group', 'gruppe', 'the', 'und', 'and']);
  return new Set([...titleTokens(value)].filter((token) => !generic.has(token)));
}

const LEVEL_WORDS = ['senior', 'junior', 'intern', 'internship', 'lead', 'principal', 'staff', 'head', 'werkstudent', 'praktikant', 'praktikum', 'trainee', 'director'];

/** The level words in two titles agree: "Senior Software Engineer" is not "Software Engineer Intern". */
function sameLevelWords(ours: string, theirs: string): boolean {
  const mine = titleTokens(ours);
  const other = titleTokens(theirs);
  return LEVEL_WORDS.every((word) => mine.has(word) === other.has(word));
}

/** A stated employer must share a word with ours; no stated employer is not a mismatch. */
function companyFits(ours: string, theirs: string | null): boolean {
  if (!theirs) return true;
  const mine = companyTokens(ours);
  const other = companyTokens(theirs);
  if (mine.size === 0 || other.size === 0) return true;
  for (const token of mine) if (other.has(token)) return true;
  return false;
}

/** Longer than this, a "description" is not one ad: the Google copy is kept. */
const MAX_POSTING_CHARS = 40_000;

/**
 * The ad text from a page's HTML, for the job titled `title` at `company`: the one `JobPosting` that fits.
 * A posting naming another employer never fits. With one posting on the page, half the title words in
 * common is enough (boards rename titles); with several, the best must fit well and beat the next, or the
 * page is a list and nothing is taken. Null when nothing fits, or the converted text is shorter than what we
 * have or too long to be one ad.
 */
export function readPostingFromHtml(html: string, title: string, company: string, current: string | null): string | null {
  const postings = extractJobPostings(html).filter((posting) => companyFits(company, posting.company));
  if (postings.length === 0) return null;
  const scored = postings
    .map((posting) => ({ posting, score: posting.title ? titleFit(title, posting.title) : postings.length === 1 ? 1 : 0 }))
    .sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (postings.length === 1 ? best.score < 0.7 : best.score < 0.7 || (next && next.score >= best.score)) return null;
  if (best.posting.title && !sameLevelWords(title, best.posting.title)) return null;

  // Some boards entity-encode the HTML inside the JSON string (&lt;p&gt;).
  const raw = /&lt;\/?[a-z]/i.test(best.posting.description) ? decodeHtmlEntities(best.posting.description) : best.posting.description;
  const text = htmlToAdText(raw);
  if (text.length < 200 || text.length > MAX_POSTING_CHARS) return null;
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
  // "localhost." and "x.internal." are the same hosts as without the dot.
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
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
  return decodeBody(bytes, response.headers.get('content-type'));
}

/** The body in the charset its Content-Type names (German boards still send windows-1252), UTF-8 otherwise. */
function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // An unknown label (a typo on the server): UTF-8 below, which is what most pages are.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/** The page's HTML, following at most three redirects, each one re-checked. Null on any failure. */
export async function fetchPostingHtml(startUrl: string, fetchImpl: typeof fetch = fetch, deadline = Number.POSITIVE_INFINITY): Promise<string | null> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isFetchablePostingUrl(url)) return null;
    // Each hop gets the usual timeout, cut short by the caller's deadline for the whole pass.
    const timeout = Math.min(FETCH_TIMEOUT_MS, deadline - Date.now());
    if (timeout <= 0) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
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
  company: string;
  current: string | null;
  fetchImpl?: typeof fetch;
  /** When the whole enrichment pass must end (epoch ms). */
  deadline?: number;
}): Promise<{ text: string; url: string } | null> {
  for (const url of params.urls) {
    const html = await fetchPostingHtml(url, params.fetchImpl, params.deadline);
    if (!html) continue;
    const text = readPostingFromHtml(html, params.title, params.company, params.current);
    if (text) return { text, url };
  }
  return null;
}
