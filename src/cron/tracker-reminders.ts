import {
  claimTrackerReminder,
  listFollowUpReminderCandidates,
  listInterviewReminderCandidates,
  releaseTrackerReminderClaim,
  type TrackerReminderCandidate,
} from '@/db/repos/admin';
import { defaultFollowUpDue } from '@/components/tracker/tracker-status';
import { sendEmail } from '@/lib/email/send';
import {
  buildFollowUpReminderEmail,
  buildInterviewReminderEmail,
} from '@/lib/email/templates/tracker-reminder';

/**
 * The window is a calendar day, not an offset from the run time, so moving the
 * cron hour never changes who gets reminded. The query casts a wide UTC net and
 * each candidate is then judged in its owner's own timezone, because "tomorrow"
 * in Auckland and "tomorrow" in Los Angeles are not the same day.
 */
function startOfUtcDay(date: Date, addDays = 0): Date {
  const copy = new Date(date.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  copy.setUTCDate(copy.getUTCDate() + addDays);
  return copy;
}

/** "2026-08-21" in the given zone. Sorts correctly as a plain string. */
function localDayKey(value: Date | string, timeZone: string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** The next calendar day, done on the key so a DST shift cannot skip a day. */
function nextDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * How far back an Applied row with no stored follow-up date is still worth a
 * reminder. The derived date is created_at plus seven business days, so this
 * window covers roughly the last three weeks of due dates. Anything older was
 * missed, and mailing it now is noise, not a reminder.
 */
const FOLLOW_UP_BACKFILL_DAYS = 30;

/** Email Service errors where retrying can never help; keep the claim. */
const PERMANENT_SEND_ERRORS = ['E_RECIPIENT_SUPPRESSED', 'E_VALIDATION_ERROR', 'E_SENDER_NOT_VERIFIED'];

export interface TrackerReminderResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
}

function isPermanentSendError(error: unknown): boolean {
  const text = `${(error as { code?: string })?.code ?? ''} ${error instanceof Error ? error.message : ''}`;
  return PERMANENT_SEND_ERRORS.some((code) => text.includes(code));
}

/** Company and role reach an email subject, so no newlines and no runaway length. */
function clean(value: string | null): string | null {
  if (!value) return null;
  const flat = value.replace(/[\r\n]+/g, ' ').trim();
  return flat ? flat.slice(0, 80) : null;
}

/** An unknown zone would throw inside Intl and take the whole sweep with it. */
function safeZone(timeZone: string | null): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function firstNameOf(candidate: TrackerReminderCandidate): string {
  return (candidate.full_name ?? '').trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

/**
 * One reminder per dated thing: an interview starting inside the window and a
 * follow-up that has come due. The claim is taken before the send, so a second
 * run in the same day is a no-op; a transient send failure releases it and the
 * next run retries.
 */
export async function runTrackerReminders(now: Date = new Date()): Promise<TrackerReminderResult> {
  // Interviews happening tomorrow, and follow-ups due by the end of tomorrow
  // so the email arrives the day before, as the popover promises. Anything
  // already overdue is swept up by the same upper bound.
  //
  // The upper bounds are deliberately loose. Local "tomorrow" runs from UTC-12
  // to UTC+14, so a three-day UTC window is the smallest one that contains
  // every user's tomorrow; the per-candidate checks below do the exact test.
  //
  // The lower bound is `now`, not the start of the UTC day: an interview that
  // has already happened cannot be anybody's tomorrow, and letting those rows
  // in would fill the batch with candidates that can never be sent and can
  // never be stamped, crowding out real ones past CRON_BATCH_LIMIT.
  const interviewFrom = now.toISOString();
  const interviewTo = startOfUtcDay(now, 3).toISOString();
  const followUpTo = startOfUtcDay(now, 3).toISOString();
  // Seven business days always spans at least nine calendar days, so nothing
  // created inside the last week can be due yet.
  const createdBefore = startOfUtcDay(now, -7).toISOString();
  // And nothing created before this is worth chasing now. A row that came due
  // months ago and was never chased is history, not a reminder.
  const createdAfter = startOfUtcDay(now, -FOLLOW_UP_BACKFILL_DAYS).toISOString();

  const [interviewCandidates, followUpCandidates] = await Promise.all([
    listInterviewReminderCandidates(interviewFrom, interviewTo),
    listFollowUpReminderCandidates(followUpTo, createdBefore, createdAfter),
  ]);

  const interviews = interviewCandidates.filter((candidate) =>
    isInterviewTomorrow(candidate, now));
  const followUps = followUpCandidates.filter((candidate) =>
    isFollowUpDue(candidate, now));

  const result: TrackerReminderResult = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  for (const candidate of interviews) {
    await sendOne(candidate, 'interview', result, now);
  }
  for (const candidate of followUps) {
    await sendOne(candidate, 'follow_up', result, now);
  }

  return result;
}

/** Tomorrow in the owner's own clock, not in UTC. */
function isInterviewTomorrow(candidate: TrackerReminderCandidate, now: Date): boolean {
  if (!candidate.interview_at) return false;
  const zone = safeZone(candidate.timezone);
  const today = localDayKey(now, zone);
  const interviewDay = localDayKey(candidate.interview_at, zone);
  if (!today || !interviewDay) return false;
  return interviewDay === nextDayKey(today);
}

/**
 * Due by the end of the owner's tomorrow, overdue included. An Applied row with
 * no stored date falls back to the same created_at rule the tracker shows the
 * user, so the two never disagree.
 */
function isFollowUpDue(candidate: TrackerReminderCandidate, now: Date): boolean {
  const zone = safeZone(candidate.timezone);
  const today = localDayKey(now, zone);
  if (!today) return false;

  const stored = candidate.follow_up_due_at;
  const due = stored
    ?? (candidate.status === 'applied'
      ? defaultFollowUpDue(candidate.created_at)?.toISOString() ?? null
      : null);
  if (!due) return false;

  const dueDay = localDayKey(due, zone);
  if (dueDay === null || dueDay > nextDayKey(today)) return false;

  // A stored date is a promise the user saw, so it is chased however old it is.
  // A derived one is our own inference, and inferring a chase for something
  // that came due months ago is noise.
  if (!stored) {
    const floor = localDayKey(
      new Date(now.getTime() - FOLLOW_UP_BACKFILL_DAYS * 86_400_000),
      zone,
    );
    if (floor !== null && dueDay < floor) return false;
  }

  return true;
}

async function sendOne(
  candidate: TrackerReminderCandidate,
  kind: 'interview' | 'follow_up',
  result: TrackerReminderResult,
  now: Date,
): Promise<void> {
  result.processed += 1;

  const claimedAt = now.toISOString();
  let claimed = false;
  try {
    claimed = await claimTrackerReminder(candidate.id, kind, claimedAt);
  } catch (error) {
    console.error(
      `[cron/tracker-reminders] claim failed for ${candidate.id}: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    result.errors += 1;
    return;
  }
  if (!claimed) {
    result.skipped += 1;
    return;
  }

  const company = clean(candidate.company);
  const role = clean(candidate.job_title);
  const when = candidate.interview_at
    ? new Date(candidate.interview_at).toLocaleString('en-GB', {
        timeZone: safeZone(candidate.timezone),
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const email =
    kind === 'interview'
      ? buildInterviewReminderEmail({ firstName: firstNameOf(candidate), company, role, when })
      : buildFollowUpReminderEmail({ firstName: firstNameOf(candidate), company, role });

  try {
    await sendEmail({
      to: candidate.email,
      from: email.from,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    result.sent += 1;
  } catch (error) {
    result.errors += 1;
    console.error(
      `[cron/tracker-reminders] send failed for ${candidate.id}: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    if (isPermanentSendError(error)) return;
    try {
      await releaseTrackerReminderClaim(candidate.id, kind, claimedAt);
    } catch (releaseError) {
      console.error(
        `[cron/tracker-reminders] release failed for ${candidate.id}: ${releaseError instanceof Error ? releaseError.message : 'unknown'}`,
      );
    }
  }
}
