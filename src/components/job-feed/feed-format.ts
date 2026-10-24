/**
 * Display strings for the feed conversation and canvas. Pure functions so the
 * copy rules (short sentences, contractions, no em dashes) live in one place.
 */

import type { JobFeedFeedItem, JobFeedOverviewResponse } from '@/lib/job-feed/types';
import { JOB_FEED_COUNTRY_OPTIONS } from '@/lib/job-feed/constants';
import { getLocalDateKey, isSafeExternalUrl } from '@/lib/job-feed/helpers';
import {
  DEFAULT_DATE_PREFS,
  formatDayMonth,
  formatLongDay,
  formatTime,
  type DatePrefs,
} from '@/lib/utils/format-date';

/** "Wednesday 19 August" for the conversation header. */
export function formatFeedDay(date: Date, prefs?: DatePrefs): string {
  return formatLongDay(date, prefs);
}

/** "09:25" from an ISO timestamp, in the reader's saved clock. */
export function formatFeedTime(value: string | null, prefs?: DatePrefs): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatTime(date, prefs);
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

/** One search per line in the consent-step recap. Comma-join wraps with a trailing comma. */
export function formatSetupPlanSummary(
  plan: { query: string; targetCountry: string }[],
): string {
  if (plan.length === 0) return 'These searches';
  return plan
    .map((row) => `${row.query} in ${countryLabel(row.targetCountry)}`)
    .join('\n\n');
}

/**
 * "Ranked for Product, Senior, B2B SaaS · United States · refreshed 09:25".
 * Every part comes from saved settings or the run, so a missing part is left
 * out rather than guessed.
 */
export function buildRankedForLine(
  overview: JobFeedOverviewResponse | null,
  prefs?: DatePrefs,
): string {
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

  const runStamp = formatRunStamp(overview, prefs);
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
    // A bullet means the prose is over and the lists have started, and plenty
    // of ads put the first bullet on the very next line rather than after a
    // blank one. Cut there, before the newlines are flattened away.
    .map((block) => block.split(/\n\s*[•\-*►●○■▪–·]/)[0] ?? '')
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const block of blocks) {
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
function formatRunStamp(overview: JobFeedOverviewResponse, prefs?: DatePrefs): string | null {
  const completedAt = overview.feedRun?.completed_at ?? null;
  if (!completedAt) return null;
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return null;
  const timeZone = overview.settings?.user_timezone || overview.feedRun?.local_timezone || 'UTC';
  // The day key runs in the feed's own zone, so the clock it prints has to as
  // well, or "today" and the time beside it can disagree by a day.
  const stamp: DatePrefs = { timeZone, order: prefs?.order ?? DEFAULT_DATE_PREFS.order };
  const runDay = overview.feedRun?.local_date ?? getLocalDateKey(date, timeZone);
  const today = getLocalDateKey(new Date(), timeZone);
  if (runDay === today) {
    const time = formatFeedTime(completedAt, stamp);
    return time ? `last run ${time}` : null;
  }
  return `last run ${formatDayMonth(date, stamp, 'long')}`;
}

/**
 * A role the server won't let the user dismiss: the kit was applied or built,
 * or the role was rated not relevant. The server answers 409 for these, so the
 * card doesn't offer Dismiss at all.
 */
export function canDismissJob(job: JobFeedFeedItem): boolean {
  const feedback = job.feedback;
  return !feedback.appliedAt
    && !feedback.dismissedAt
    && feedback.generationStatus !== 'succeeded'
    && feedback.matchRating !== 'not_relevant';
}
