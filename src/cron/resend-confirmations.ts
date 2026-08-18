import { getAuth } from '@/auth/server';
import { getSiteUrl } from '@/lib/auth/site-url';

const SIGNUP_GRACE_HOURS = 24;
const NUDGE_THROTTLE_HOURS = 24;
const MAX_NUDGES_PER_USER = 2;

interface ProfileRow {
  id: string;
  full_name: string | null;
  last_confirmation_resend_at: string | null;
  confirmation_resend_count: number;
}

export interface ResendConfirmationsResult {
  processed: number;
  sent: number;
  throttled: number;
  skipped: number;
  errors: number;
}

export async function runResendConfirmations(): Promise<ResendConfirmationsResult> {
  const {
    listUnverifiedAuthUsers,
    listProfilesByIds,
    claimConfirmationResend,
    releaseConfirmationResend,
  } = await import('@/db/repos/admin');
  const siteUrl = getSiteUrl();
  const now = Date.now();

  const graceCutoff = new Date(now - SIGNUP_GRACE_HOURS * 60 * 60 * 1000);
  const candidates = (await listUnverifiedAuthUsers(graceCutoff)).filter((u) => Boolean(u.email));

  if (candidates.length === 0) {
    return { processed: 0, sent: 0, throttled: 0, skipped: 0, errors: 0 };
  }

  const profileMap = new Map<string, ProfileRow>();
  const profiles = await listProfilesByIds(candidates.map((u) => u.id));
  for (const row of profiles) {
    profileMap.set(row.id, row);
  }

  const auth = await getAuth();
  let sent = 0;
  let throttled = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of candidates) {
    const profile = profileMap.get(user.id);
    const count = profile?.confirmation_resend_count ?? 0;
    if (count >= MAX_NUDGES_PER_USER) {
      skipped += 1;
      continue;
    }
    if (
      profile?.last_confirmation_resend_at
      && new Date(profile.last_confirmation_resend_at).getTime() > now - NUDGE_THROTTLE_HOURS * 60 * 60 * 1000
    ) {
      throttled += 1;
      continue;
    }

    // Claim sets the throttle and bumps the count in one CAS write.
    let claimedAt: string | null = null;
    try {
      claimedAt = await claimConfirmationResend(user.id, count);
    } catch (updateError) {
      console.error(`[cron/resend-confirmations] profile update failed for ${user.id}: ${updateError instanceof Error ? updateError.message : 'unknown'}`);
      errors += 1;
      continue;
    }
    if (!claimedAt) {
      throttled += 1;
      continue;
    }

    try {
      await auth.api.sendVerificationEmail({
        body: {
          email: user.email,
          callbackURL: `${siteUrl}/auth/callback`,
        },
      });
      sent += 1;
    } catch (sendError) {
      console.error(`[cron/resend-confirmations] send failed for user ${user.id}: ${sendError instanceof Error ? sendError.message : 'unknown'}`);
      errors += 1;
      // Nothing went out: give the throttle window and the nudge back.
      try {
        await releaseConfirmationResend(user.id, claimedAt, count, profile?.last_confirmation_resend_at ?? null);
      } catch (rollbackError) {
        console.error(`[cron/resend-confirmations] rollback failed for ${user.id}: ${rollbackError instanceof Error ? rollbackError.message : 'unknown'}`);
      }
    }
  }

  return {
    processed: candidates.length,
    sent,
    throttled,
    skipped,
    errors,
  };
}
