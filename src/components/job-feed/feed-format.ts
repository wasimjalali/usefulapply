/**
 * Display strings for the feed conversation and canvas. Pure functions so the
 * copy rules (short sentences, contractions, no em dashes) live in one place.
 */

import type { JobFeedFeedItem, JobFeedOverviewResponse } from '@/lib/job-feed/types';
import { JOB_FEED_COUNTRY_OPTIONS } from '@/lib/job-feed/constants';
import { getLocalDateKey, isSafeExternalUrl } from '@/lib/job-feed/helpers';
import { INLINE_AD_HEADINGS, looksLikeAdHeading, splitGluedAdText, straightenQuotes } from '@/lib/job-feed/ad-text';
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
