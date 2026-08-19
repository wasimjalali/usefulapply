/**
 * Display strings for the feed conversation and canvas. Pure functions so the
 * copy rules (short sentences, contractions, no em dashes) live in one place.
 */

import type { JobFeedFeedItem, JobFeedOverviewResponse } from '@/lib/job-feed/types';
import { JOB_FEED_COUNTRY_OPTIONS } from '@/lib/job-feed/constants';

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

  const refreshed = formatFeedTime(overview.feedRun?.completed_at ?? null);
  if (refreshed) parts.push(`refreshed ${refreshed}`);

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
 * The opening prose of the ad, for the two-line card summary. Stops at the
 * first section header or bullet so a card never shows half a list.
 */
export function buildCardSummary(job: JobFeedFeedItem): string {
  const raw = (job.description ?? '').replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
  const lead = raw.split(/\n\s*\n|\n\s*[•\-*►●○■▪–·]|\b(?:Responsibilities|Requirements|Qualifications|What You'?ll Do|Benefits)\s*:/i)[0] ?? '';
  const text = lead.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= 190) return text;
  return `${text.slice(0, 187).trimEnd()}...`;
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
