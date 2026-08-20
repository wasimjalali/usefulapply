/**
 * Every date the user reads goes through here, so the two columns PREFERENCES
 * saves are actually honoured. Without them the browser's own zone and a
 * day-month-year order stand in, which is what the whole app used before.
 *
 * Pure and dependency-free on purpose: the reminder emails format dates on the
 * Worker, where there is no React and no browser locale to fall back on.
 */

/** The three orders `profiles.date_format` accepts. */
export type DateOrder = 'dmy' | 'mdy' | 'iso';

export interface DatePrefs {
  /** An IANA zone, or undefined to use the reader's own clock. */
  timeZone: string | undefined;
  order: DateOrder;
}

export const DEFAULT_DATE_PREFS: DatePrefs = { timeZone: undefined, order: 'dmy' };

/**
 * The locale that puts the parts in the saved order. en-CA is YYYY-MM-DD, so it
 * carries ISO, and it also gives a 24-hour clock like en-GB.
 */
function localeFor(order: DateOrder): string {
  if (order === 'mdy') return 'en-US';
  if (order === 'iso') return 'en-CA';
  return 'en-GB';
}

/** A stored zone the runtime does not know would throw inside Intl. */
function safeZone(timeZone: string | null | undefined): string | undefined {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

/** Read the two columns off a profile row. Anything unrecognised falls back. */
export function datePrefsFrom(
  profile: { timezone?: string | null; date_format?: string | null } | null | undefined,
): DatePrefs {
  const order = profile?.date_format;
  return {
    timeZone: safeZone(profile?.timezone),
    order: order === 'mdy' || order === 'iso' ? order : 'dmy',
  };
}

/** "19 Aug 2026", or "2026-08-19" on ISO. */
export function formatDate(date: Date, prefs: DatePrefs = DEFAULT_DATE_PREFS): string {
  if (prefs.order === 'iso') {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: prefs.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
  return new Intl.DateTimeFormat(localeFor(prefs.order), {
    timeZone: prefs.timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** "27 Aug", or "08-27" on ISO. The year is dropped, so keep it for near dates. */
export function formatDayMonth(
  date: Date,
  prefs: DatePrefs = DEFAULT_DATE_PREFS,
  month: 'short' | 'long' = 'short',
): string {
  if (prefs.order === 'iso') {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: prefs.timeZone,
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
  return new Intl.DateTimeFormat(localeFor(prefs.order), {
    timeZone: prefs.timeZone,
    day: 'numeric',
    month,
  }).format(date);
}

/** "Wednesday 19 August" for a conversation header. */
export function formatLongDay(date: Date, prefs: DatePrefs = DEFAULT_DATE_PREFS): string {
  return new Intl.DateTimeFormat(localeFor(prefs.order), {
    timeZone: prefs.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/** "09:25", or "09:25 AM" where the saved order is the US one. */
export function formatTime(date: Date, prefs: DatePrefs = DEFAULT_DATE_PREFS): string {
  return new Intl.DateTimeFormat(localeFor(prefs.order), {
    timeZone: prefs.timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** "Thu 21 Aug, 14:00". */
export function formatDateTime(date: Date, prefs: DatePrefs = DEFAULT_DATE_PREFS): string {
  const day = prefs.order === 'iso'
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: prefs.timeZone,
        weekday: 'short',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
    : new Intl.DateTimeFormat(localeFor(prefs.order), {
        timeZone: prefs.timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(date);
  return `${day}, ${formatTime(date, prefs)}`;
}
