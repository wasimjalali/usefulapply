/**
 * Job-ad text shared by ingestion (src/lib/job-feed/serpapi.ts), the web renderer
 * (src/components/job-feed/job-ad-text.tsx) and so the MCP: section headings, and the separators
 * job boards strip from lists.
 */

/**
 * Section headings job boards use. A provider can send these with a trailing
 * colon inside a run-on blob, or on their own line with no colon at all, so
 * both shapes are matched off one list.
 */
const AD_SECTION_HEADINGS = [
  'Key Responsibilities',
  'Responsibilities',
  'Required Qualifications',
  'Minimum Qualifications',
  'Preferred Qualifications',
  'Basic Qualifications',
  'Qualifications',
  'Requirements',
  "What You'll Do",
  'What You Will Do',
  'What We Offer',
  'What You Bring',
  "What We're Looking For",
  'Who You Are',
  'Your Role',
  'Your Profile',
  'About The Role',
  'About The Job',
  'About The Position',
  'About You',
  'About Us',
  'The Role',
  'Role Overview',
  'Job Description',
  'Compensation & Benefits',
  'Compensation and Benefits',
  'Compensation',
  'Benefits',
  'Perks',
  'Perks & Benefits',
  'Nice To Have',
  'Nice-To-Haves',
  'Salary',
  'Location',
  'Skills',
  'Education',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HEADING_ALTERNATION = AD_SECTION_HEADINGS.map(escapeRegExp).join('|');

/**
 * Matches a known heading with its colon anywhere in the text, so a run-on
 * blob can be broken into sections. No lookbehind: older Safari throws on it
 * at parse time, which would take the whole component down.
 */
export const INLINE_AD_HEADINGS = new RegExp(`\\s*\\b(${HEADING_ALTERNATION})\\s*:`, 'gi');

/**
 * A known heading with the next sentence glued straight onto it: "QualificationsUniversity degree".
 * Case-sensitive, so "requirementsGathering" in prose is never taken for one. No lookbehind (older Safari
 * throws on it at parse time): the character before the heading is captured and put back.
 */
const GLUED_AD_HEADINGS = new RegExp(`(^|[\\s.:;!?])(${HEADING_ALTERNATION})(?=[A-ZÄÖÜ][a-zäöüß])`, 'g');

/** Straighten curly quotes so one apostrophe spelling matches every ad. */
export function straightenQuotes(value: string): string {
  return value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

const WHOLE_LINE_HEADING = new RegExp(`^(?:${HEADING_ALTERNATION})\\s*:?$`, 'i');

/**
 * True when a line is a section heading rather than ad prose. Deliberately
 * strict: a known heading phrase, a short line ending in a colon, or a short
 * line in caps. Anything else is treated as prose, so real copy is never
 * swallowed as a title.
 */
export function looksLikeAdHeading(line: string): boolean {
  const trimmed = straightenQuotes(line).trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (WHOLE_LINE_HEADING.test(trimmed)) return true;
  if (trimmed.endsWith(':')) return true;
  return trimmed.length > 3 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

const MIN_PIECE_LENGTH = 10;
const MIN_PIECE_WORDS = 2;

/**
 * A sentence that ends and restarts with no space is always a lost separator:
 * "…B2B SaaS products.Partner closely with…". This is the only shape we infer.
 * A rule for a word glued straight onto a capital was tried and removed: over
 * 41 real ads it never produced a boundary the provider's own items or this
 * rule had not already found, and it cannot tell "salaryCompetitive" from
 * "HealthTech".
 */
function findGlueBoundaries(text: string): number[] {
  const boundaries = new Set<number>();
  for (const match of text.matchAll(/[.!?][A-Z][a-z]/g)) {
    if (match.index !== undefined) boundaries.add(match.index + 1);
  }
  return Array.from(boundaries).sort((a, b) => a - b);
}

/**
 * Job boards strip list markup and leave the items glued together:
 * "base salaryCompetitive equity packageFully covered…". This puts the
 * separators back. The provider's own highlight items are exact, so they go
 * first; the boundary rules only cover what they miss.
 */
export function splitGluedAdText(line: string, knownItems: string[] = []): string[] {
  const boundaries = new Set<number>();

  // Only restore separators that are genuinely missing. Providers list prose
  // sentences as items too, and those already read as sentences, so splitting
  // there would turn an ad's opening paragraph into a bullet list.
  const straightLine = straightenQuotes(line);
  for (const item of knownItems) {
    const needle = straightenQuotes(item).trim();
    if (needle.length < 12) continue;
    const at = straightLine.indexOf(needle);
    if (at < 0) continue;

    if (at > 0 && !/\s/.test(straightLine[at - 1])) boundaries.add(at);

    const end = at + needle.length;
    const rest = straightLine.slice(end);
    if (rest.length > 0 && !/^\s/.test(rest) && !/^[.,;:!?]\s/.test(rest)) {
      boundaries.add(end);
    }
  }

  for (const boundary of findGlueBoundaries(line)) boundaries.add(boundary);

  const ordered = Array.from(boundaries)
    .filter((index) => index > 0 && index < line.length)
    .sort((a, b) => a - b);
  if (ordered.length === 0) return [line];

  const rawPieces: string[] = [];
  let start = 0;
  for (const boundary of ordered) {
    rawPieces.push(line.slice(start, boundary));
    start = boundary;
  }
  rawPieces.push(line.slice(start));

  // Two boundaries can land a character apart: the provider's item text ends
  // just before the full stop that also marks the break. That leaves a
  // fragment of pure punctuation, which belongs to the piece before it.
  const merged: string[] = [];
  for (const piece of rawPieces) {
    if (merged.length > 0 && !/[A-Za-z0-9]/.test(piece)) {
      merged[merged.length - 1] += piece;
      continue;
    }
    merged.push(piece);
  }

  const cleaned = merged
    .map((piece) => piece.trim().replace(/^[.;,·•]+\s*/, '').trim())
    .filter(Boolean);
  if (cleaned.length < 2) return [line];

  // Every piece has to read as a phrase. If any does not, the boundaries were
  // wrong and the line is left exactly as it arrived.
  const usable = cleaned.every(
    (piece) => piece.length >= MIN_PIECE_LENGTH && wordCount(piece) >= MIN_PIECE_WORDS
  );
  if (!usable) return [line];

  return cleaned;
}

/**
 * Google's copy of an ad, with the structure its board stripped put back where that is safe: a known
 * section heading glued to the text after it ("QualificationsUniversity degree") or followed by a colon
 * goes on a line of its own, and a line whose items Google also lists as highlights is split into
 * "- item" lines. Anything uncertain stays as it arrived.
 */
export function structureAdText(text: string, knownItems: string[] = []): string {
  // Colon headings first: the glued pass adds a colon the inline pass would otherwise match again.
  const withHeadings = text
    .replace(INLINE_AD_HEADINGS, (_match, header: string) => `\n\n${header}:\n`)
    .replace(GLUED_AD_HEADINGS, (_match, before: string, header: string) => `${before}\n\n${header}:\n`);
  const items = knownItems.map((item) => straightenQuotes(item).trim()).filter((item) => item.length >= 12);
  return withHeadings
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || /^[-•*]\s/.test(trimmed) || looksLikeAdHeading(trimmed)) return trimmed;
      const pieces = splitGluedAdText(trimmed, knownItems);
      if (pieces.length < 2) return trimmed;
      return pieces.map((piece) => {
        // The last item of a list often runs on into the next sentence: "…spoken We offer…".
        const item = items.find((candidate) => straightenQuotes(piece).startsWith(candidate) && piece.length > candidate.length + 1);
        if (item && /^\s+\S/.test(piece.slice(item.length))) return `- ${piece.slice(0, item.length)}\n${piece.slice(item.length).trim()}`;
        return `- ${piece}`;
      }).join('\n');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
