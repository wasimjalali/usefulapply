/**
 * Display strings for the feed conversation and canvas. Pure functions so the
 * copy rules (short sentences, contractions, no em dashes) live in one place.
 */

import type { JobFeedFeedItem, JobFeedOverviewResponse } from '@/lib/job-feed/types';
import { JOB_FEED_COUNTRY_OPTIONS } from '@/lib/job-feed/constants';
import { getLocalDateKey, isSafeExternalUrl } from '@/lib/job-feed/helpers';

/** "Wednesday 19 August" for the conversation header. */
export function formatFeedDay(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/** "09:25" from an ISO timestamp, in the reader's own clock. */
export function formatFeedTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** "3 days ago" from the freshness the provider gave us. Null when unknown. */
export function formatJobAge(job: JobFeedFeedItem): string | null {
  if (typeof job.freshnessDays === 'number') {
    if (job.freshnessDays <= 0) return 'Today';
    if (job.freshnessDays === 1) return '1 day ago';
    return `${job.freshnessDays} days ago`;
  }
  return job.postedAtText;
}

export function countryLabel(code: string): string {
  const match = JOB_FEED_COUNTRY_OPTIONS.find((option) => option.value === code);
  return match?.label ?? code.toUpperCase();
}

/**
 * "Ranked for Product, Senior, B2B SaaS · United States · refreshed 09:25".
 * Every part comes from saved settings or the run, so a missing part is left
 * out rather than guessed.
 */
export function buildRankedForLine(overview: JobFeedOverviewResponse | null): string {
  if (!overview) return '';
  const parts: string[] = [];

  const roles = overview.settings?.target_roles ?? [];
  if (roles.length > 0) {
    parts.push(`Ranked for ${roles.slice(0, 3).join(', ')}`);
  }

  const countries = overview.settings?.target_countries ?? [];
  if (countries.length > 0) {
    parts.push(countries.map(countryLabel).join(' and '));
  }

  const runStamp = formatRunStamp(overview);
  if (runStamp) parts.push(runStamp);

  return parts.join(' · ');
}

/** "Remote, US · $87.5K to $180K" for the handoff message into an application. */
export function buildJobHandoffLine(job: JobFeedFeedItem): string {
  const parts: string[] = [];
  if (job.location) parts.push(job.location);
  if (job.salaryText) parts.push(job.salaryText);
  return parts.join(' · ');
}

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

/**
 * Words that carry a capital in the middle on purpose. A glued-list split must
 * not cut them in half. Only entries whose first half is four characters or
 * longer need to be here; shorter ones are already ruled out by the length
 * guard in findGlueBoundaries.
 */
const INNER_CAPITAL_WORDS = new Set([
  'javascript',
  'typescript',
  'coffeescript',
  'actionscript',
  'linkedin',
  'tensorflow',
  'wordpress',
  'powerpoint',
  'powershell',
  'powerbi',
  'sharepoint',
  'cloudwatch',
  'cloudformation',
  'cloudflare',
  'openshift',
  'opentelemetry',
  'quickbooks',
  'servicenow',
  'salesloft',
  'mailchimp',
  'datadog',
  'pagerduty',
  'lookerstudio',
  'base64',
  'sha256',
  'utf8',
]);

const MIN_GLUED_LINE_LENGTH = 120;
const MIN_PIECE_LENGTH = 10;
const MIN_PIECE_WORDS = 2;

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** The run of letters and digits either side of a boundary, joined and cased
 *  down, so "JavaScript" can be checked against INNER_CAPITAL_WORDS. */
function gluedWordAt(text: string, index: number): string {
  let start = index;
  while (start > 0 && /[A-Za-z0-9]/.test(text[start - 1])) start -= 1;
  let end = index;
  while (end < text.length && /[A-Za-z0-9]/.test(text[end])) end += 1;
  return text.slice(start, end).toLowerCase();
}

function findGlueBoundaries(text: string): number[] {
  const boundaries = new Set<number>();

  // A sentence that ends and restarts with no space is always a lost
  // separator. "…B2B SaaS products.Partner closely with…"
  for (const match of text.matchAll(/[.!?][A-Z][a-z]/g)) {
    if (match.index !== undefined) boundaries.add(match.index + 1);
  }

  // A word glued straight onto a capital or a digit. Riskier, because a name
  // like "SnowFlake" looks the same, so it only runs on a long line and only
  // when the line carries several of them. A stripped list has many; a stray
  // brand name has one.
  if (text.length >= MIN_GLUED_LINE_LENGTH) {
    const risky: number[] = [];
    for (const match of text.matchAll(/[a-z](?=[A-Z][a-z]|\d)/g)) {
      if (match.index === undefined) continue;
      const index = match.index + 1;
      let leftLength = 0;
      while (leftLength < index && /[A-Za-z0-9]/.test(text[index - 1 - leftLength])) leftLength += 1;
      if (leftLength < 4) continue;
      if (INNER_CAPITAL_WORDS.has(gluedWordAt(text, index))) continue;
      risky.push(index);
    }
    if (risky.length >= 2) {
      for (const index of risky) boundaries.add(index);
    }
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
 * The opening prose of the ad, for the two-line card summary. Skips the
 * headings an ad opens with, and stops at the first bullet so a card never
 * shows half a list.
 */
export function buildCardSummary(job: JobFeedFeedItem): string {
  const raw = straightenQuotes(job.description ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(INLINE_AD_HEADINGS, (_match, heading: string) => `\n\n${heading}:\n`);

  const blocks = raw
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const block of blocks) {
    // A bullet means the prose is over and the lists have started.
    if (/^[•\-*►●○■▪–·]\s/.test(block)) break;
    if (looksLikeAdHeading(block)) continue;
    const text = splitGluedAdText(block)[0]?.trim() ?? '';
    if (text.length < 30) continue;
    if (text.length <= 190) return text;
    return `${text.slice(0, 187).trimEnd()}...`;
  }

  return '';
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Escape job-board / ranker strings before they go into MarkdownText. */
export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
}

export function safeEmployerUrl(job: Pick<JobFeedFeedItem, 'applyUrl' | 'sourceUrl'>): string | null {
  if (job.applyUrl && isSafeExternalUrl(job.applyUrl)) return job.applyUrl;
  if (job.sourceUrl && isSafeExternalUrl(job.sourceUrl)) return job.sourceUrl;
  return null;
}

/** "last run 09:25" when it is today, otherwise "last run 17 August". */
function formatRunStamp(overview: JobFeedOverviewResponse): string | null {
  const completedAt = overview.feedRun?.completed_at ?? null;
  if (!completedAt) return null;
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return null;
  const timeZone = overview.settings?.user_timezone || overview.feedRun?.local_timezone || 'UTC';
  const runDay = overview.feedRun?.local_date ?? getLocalDateKey(date, timeZone);
  const today = getLocalDateKey(new Date(), timeZone);
  if (runDay === today) {
    const time = formatFeedTime(completedAt);
    return time ? `last run ${time}` : null;
  }
  return `last run ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(date)}`;
}
