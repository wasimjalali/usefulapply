/**
 * The six tracker statuses, the labels the user sees, and the NEXT step each
 * one implies. The stored vocabulary is older than the design: `follow_up` is
 * "Follow-up sent" and `accepted` is "Offer". Map here, never in a component.
 */

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
      return 'bg-gold-100 text-gold-700';
    case 'applied':
      return 'bg-navy-50 text-navy-800';
    case 'follow_up':
      return 'bg-navy-50 text-navy-800';
    case 'interview':
      return 'bg-sage-50 text-sage-700';
    case 'accepted':
      return 'bg-sage-50 text-sage-700';
    case 'rejected':
      return 'bg-cream-100 text-warm-gray';
  }
}

/** A match at 80 or above reads as sage, below it as gold. */
export function matchToneClass(score: number | null): string {
  if (score === null) return 'text-warm-gray';
  return score >= 80 ? 'text-sage-700' : 'text-gold-600';
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

/** "19 Aug 2026" in the user's locale. */
export function formatSavedDate(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '–';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "27 Aug" in the user's locale. */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "Thu 21 Aug, 14:00" in the user's locale. */
export function formatInterviewDate(date: Date): string {
  const day = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
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
}

export function deriveNextStep(row: TrackerRowDates, now: Date = new Date()): NextStep {
  const today = startOfDay(now);

  switch (row.status) {
    case 'drafted':
      return { label: 'Send it', tone: 'action' };

    case 'applied': {
      const due = parseDate(row.followUpDueAt) ?? defaultFollowUpDue(row.createdAt);
      if (!due) return { label: 'Follow up', tone: 'default' };
      if (startOfDay(due) < today) return { label: 'Follow up overdue', tone: 'overdue' };
      return { label: `Follow up by ${formatShortDate(due)}`, tone: 'default' };
    }

    case 'follow_up': {
      // The spec's label is Waiting. The chase date is a reminder trigger, not
      // something the column reports, until it has actually passed.
      const due = parseDate(row.followUpDueAt);
      if (due && startOfDay(due) < today) return { label: 'Follow up overdue', tone: 'overdue' };
      return { label: 'Waiting', tone: 'default' };
    }

    case 'interview': {
      const at = parseDate(row.interviewAt);
      if (!at) return { label: 'Add a date', tone: 'muted' };
      return { label: formatInterviewDate(at), tone: 'default' };
    }

    case 'accepted': {
      const due = parseDate(row.followUpDueAt);
      if (!due) return { label: 'Offer in hand', tone: 'default' };
      return { label: `Respond by ${formatShortDate(due)}`, tone: 'default' };
    }

    case 'rejected':
      return { label: '–', tone: 'muted' };
  }
}

/** Rows that went to Applied before the date column existed still need a due date. */
export function defaultFollowUpDue(createdAt: string | null | undefined): Date | null {
  const created = parseDate(createdAt);
  if (!created) return null;
  return addBusinessDays(created, 7);
}

/** How many follow-ups are due or overdue this week, for the header line. */
export function countFollowUpsDueThisWeek(rows: TrackerRowDates[], now: Date = new Date()): number {
  const today = startOfDay(now);
  const weekEnd = new Date(today.getTime());
  weekEnd.setDate(weekEnd.getDate() + 7);
  return rows.filter((row) => {
    if (row.status !== 'applied' && row.status !== 'follow_up') return false;
    const due = parseDate(row.followUpDueAt) ?? (row.status === 'applied' ? defaultFollowUpDue(row.createdAt) : null);
    if (!due) return false;
    return startOfDay(due) < weekEnd;
  }).length;
}
