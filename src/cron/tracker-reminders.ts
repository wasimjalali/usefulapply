import {
  claimTrackerReminder,
  listFollowUpReminderCandidates,
  listInterviewReminderCandidates,
  releaseTrackerReminderClaim,
  type TrackerReminderCandidate,
} from '@/db/repos/admin';
import { sendEmail } from '@/lib/email/send';
import {
  buildFollowUpReminderEmail,
  buildInterviewReminderEmail,
} from '@/lib/email/templates/tracker-reminder';

/**
 * The window is a calendar day, not an offset from the run time, so moving the
 * cron hour never changes who gets reminded. Days are UTC: per-user timezones
 * are stored but not used here yet (see BACKEND-GAPS).
 */
function startOfUtcDay(date: Date, addDays = 0): Date {
  const copy = new Date(date.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  copy.setUTCDate(copy.getUTCDate() + addDays);
  return copy;
}

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
  const interviewFrom = startOfUtcDay(now, 1).toISOString();
  const interviewTo = startOfUtcDay(now, 2).toISOString();
  const followUpTo = startOfUtcDay(now, 2).toISOString();

  const [interviews, followUps] = await Promise.all([
    listInterviewReminderCandidates(interviewFrom, interviewTo),
    listFollowUpReminderCandidates(followUpTo),
  ]);

  const result: TrackerReminderResult = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  for (const candidate of interviews) {
    await sendOne(candidate, 'interview', result, now);
  }
  for (const candidate of followUps) {
    await sendOne(candidate, 'follow_up', result, now);
  }

  return result;
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
