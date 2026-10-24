/**
 * The six tracker statuses, the labels the user sees, and the NEXT step each
 * one implies. The stored vocabulary is older than the design: `follow_up` is
 * "Follow-up sent" and `accepted` is "Offer". Map here, never in a component.
 */

import {
  addDaysToDayKey,
  dayKey,
  formatDate,
  formatDateTime,
  formatDayMonth,
  type DatePrefs,
} from '@/lib/utils/format-date';

export type TrackerStatus =
  | 'drafted'
  | 'applied'
  | 'follow_up'
  | 'interview'
  | 'accepted'
  | 'rejected';

export const TRACKER_STATUSES: TrackerStatus[] = [
  'drafted',
  'applied',
  'follow_up',
  'interview',
  'accepted',
  'rejected',
];

export const TRACKER_STATUS_LABEL: Record<TrackerStatus, string> = {
  drafted: 'Drafted',
  applied: 'Applied',
  follow_up: 'Follow-up sent',
  interview: 'Interview',
  accepted: 'Offer',
  rejected: 'Rejected',
};

/** Statuses that ask "when?" as a second step in the popover. */
export const STATUSES_WITH_DATE: TrackerStatus[] = ['follow_up', 'interview', 'accepted'];

export function isTrackerStatus(value: string | null | undefined): value is TrackerStatus {
  return TRACKER_STATUSES.includes(value as TrackerStatus);
}

export function toTrackerStatus(value: string | null | undefined): TrackerStatus {
  return isTrackerStatus(value) ? value : 'drafted';
}

export function statusPillClass(status: TrackerStatus): string {
  switch (status) {
    case 'drafted':
      return 'bg-accent-soft-strong text-accent-soft-ink';
    case 'applied':
      return 'bg-brand-soft text-ink';
    case 'follow_up':
      return 'bg-brand-soft text-ink';
    case 'interview':
      return 'bg-success-soft text-success-strong';
    case 'accepted':
      return 'bg-success-soft text-success-strong';
    case 'rejected':
      return 'bg-canvas text-ink-muted';
  }
}

/** A match at 80 or above reads as sage, below it as gold. */
export function matchToneClass(score: number | null): string {
  if (score === null) return 'text-ink-muted';
  return score >= 80 ? 'text-success-strong' : 'text-ink-accent';
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Follow-ups are due seven business days after the application went out. */
export function addBusinessDays(from: Date, days: number): Date {
  const date = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return date;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "19 Aug 2026" in the reader's saved zone and order. */
export function formatSavedDate(value: string | null | undefined, prefs?: DatePrefs): string {
  const date = parseDate(value);
  if (!date) return '–';
  return formatDate(date, prefs);
}

/** "27 Aug" in the reader's saved zone and order. */
export function formatShortDate(date: Date, prefs?: DatePrefs): string {
  return formatDayMonth(date, prefs);
}

/** "Thu 21 Aug, 14:00" in the reader's saved zone and order. */
export function formatInterviewDate(date: Date, prefs?: DatePrefs): string {
  return formatDateTime(date, prefs);
}

/** An ISO datetime the DB and the reminder cron can both read. */
export function toIso(date: Date): string {
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// The NEXT column
// ---------------------------------------------------------------------------

export interface TrackerRowDates {
  status: TrackerStatus;
  interviewAt: string | null;
  followUpDueAt: string | null;
  createdAt: string | null;
}

export interface NextStep {
  label: string;
  /** `overdue` prints in gold, `action` is the one that opens the kit. */
  tone: 'default' | 'overdue' | 'action' | 'muted';
  /**
   * What clicking the step does. `emails` opens the application on the
   * Emails tab (drafting and sending live there). `popover` edits the date
   * behind the label. `none` is informational.
   */
  opens: 'emails' | 'popover' | 'none';
}

export function deriveNextStep(row: TrackerRowDates, now: Date = new Date(), prefs?: DatePrefs): NextStep {
  const today = dayKey(now, prefs?.timeZone);
  const isPast = (due: Date) => dayKey(due, prefs?.timeZone) < today;

  switch (row.status) {
    case 'drafted':
      // Sending happens from the Emails tab, where the application email is.
      return { label: 'Send it', tone: 'action', opens: 'emails' };

    case 'applied': {
      // Every follow-up step lands on the Emails tab, where the follow-up
      // is drafted and sent.
      const due = parseDate(row.followUpDueAt) ?? defaultFollowUpDue(row.createdAt);
      if (!due) return { label: 'Follow up', tone: 'default', opens: 'emails' };
      if (isPast(due)) return { label: 'Follow up overdue', tone: 'overdue', opens: 'emails' };
      return { label: `Follow up by ${formatShortDate(due, prefs)}`, tone: 'default', opens: 'emails' };
    }

    case 'follow_up': {
      // The spec's label is Waiting. The chase date is a reminder trigger, not
      // something the column reports, until it has actually passed.
      const due = parseDate(row.followUpDueAt);
      if (due && isPast(due)) return { label: 'Follow up overdue', tone: 'overdue', opens: 'emails' };
      return { label: 'Waiting', tone: 'default', opens: 'popover' };
    }

    case 'interview': {
      // Both labels are the interview date itself, so clicking edits it.
      const at = parseDate(row.interviewAt);
      if (!at) return { label: 'Add a date', tone: 'muted', opens: 'popover' };
      return { label: formatInterviewDate(at, prefs), tone: 'default', opens: 'popover' };
    }

    case 'accepted': {
      // The respond-by date is a date edit, not a navigation.
      const due = parseDate(row.followUpDueAt);
      if (!due) return { label: 'Offer in hand', tone: 'default', opens: 'popover' };
      return { label: `Respond by ${formatShortDate(due, prefs)}`, tone: 'default', opens: 'popover' };
    }

    case 'rejected':
      return { label: '–', tone: 'muted', opens: 'none' };
  }
}

/** Rows that went to Applied before the date column existed still need a due date. */
export function defaultFollowUpDue(createdAt: string | null | undefined): Date | null {
  const created = parseDate(createdAt);
  if (!created) return null;
  return addBusinessDays(created, 7);
}

/** How many follow-ups are due or overdue this week, for the header line. */
export function countFollowUpsDueThisWeek(
  rows: TrackerRowDates[],
  now: Date = new Date(),
  prefs?: DatePrefs,
): number {
  const weekEnd = addDaysToDayKey(dayKey(now, prefs?.timeZone), 7);
  return rows.filter((row) => {
    if (row.status !== 'applied' && row.status !== 'follow_up') return false;
    const due = parseDate(row.followUpDueAt) ?? (row.status === 'applied' ? defaultFollowUpDue(row.createdAt) : null);
    if (!due) return false;
    return dayKey(due, prefs?.timeZone) < weekEnd;
  }).length;
}
