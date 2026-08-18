import { claimCheckInSend, releaseCheckInClaim } from '@/db/repos/profiles';
import { listCheckInCandidates } from '@/db/repos/admin';
import { sendEmail } from '@/lib/email/send';
import { buildCheckInEmail } from '@/lib/email/templates/check-in';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Welcomes older than this never get a check-in from the cron (guards fresh imports). */
const CHECK_IN_WINDOW_DAYS = 10;

/** Email Service errors where retrying can never help; keep the claim so we stop trying. */
const PERMANENT_SEND_ERRORS = ['E_RECIPIENT_SUPPRESSED', 'E_VALIDATION_ERROR', 'E_SENDER_NOT_VERIFIED'];

export interface WelcomeCheckInResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
}

function isPermanentSendError(error: unknown): boolean {
  const text = `${(error as { code?: string })?.code ?? ''} ${error instanceof Error ? error.message : ''}`;
  return PERMANENT_SEND_ERRORS.some((code) => text.includes(code));
}

/**
 * Day 3 founder check-in. Selects verified users whose welcome went out 3 to
 * 10 days ago and who have not been checked in yet. CAS on check_in_sent_at
 * makes a second run a no-op. A transient send failure releases the claim so
 * the next weekday run retries; a rare duplicate (binding delivered but threw)
 * is accepted over a silent miss.
 */
export async function runWelcomeCheckIn(): Promise<WelcomeCheckInResult> {
  const now = Date.now();
  const cutoff = new Date(now - 3 * DAY_MS).toISOString();
  const floor = new Date(now - CHECK_IN_WINDOW_DAYS * DAY_MS).toISOString();
  const candidates = await listCheckInCandidates(cutoff, floor);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const candidate of candidates) {
    const sentAt = new Date().toISOString();
    let claimed = false;
    try {
      claimed = await claimCheckInSend(candidate.id, sentAt);
    } catch (claimError) {
      console.error(`[cron/welcome-checkin] claim failed for ${candidate.id}: ${claimError instanceof Error ? claimError.message : 'unknown'}`);
      errors += 1;
      continue;
    }
    if (!claimed) {
      skipped += 1;
      continue;
    }

    // Same source of truth as Day 0 when the profile has no name.
    const fullName = (candidate.full_name ?? '').trim() || candidate.auth_name.trim();
    const firstName = fullName.split(/\s+/).filter(Boolean)[0] ?? '';
    const checkIn = buildCheckInEmail({ firstName });
    try {
      await sendEmail({
        to: candidate.email,
        from: checkIn.from,
        replyTo: checkIn.replyTo,
        subject: checkIn.subject,
        html: checkIn.html,
        text: checkIn.text,
      });
      sent += 1;
    } catch (sendError) {
      console.error(`[cron/welcome-checkin] send failed for ${candidate.id}: ${sendError instanceof Error ? sendError.message : 'unknown'}`);
      errors += 1;
      if (isPermanentSendError(sendError)) continue;
      try {
        await releaseCheckInClaim(candidate.id, sentAt);
      } catch (rollbackError) {
        console.error(`[cron/welcome-checkin] rollback failed for ${candidate.id}: ${rollbackError instanceof Error ? rollbackError.message : 'unknown'}`);
      }
    }
  }

  return {
    processed: candidates.length,
    sent,
    skipped,
    errors,
  };
}
