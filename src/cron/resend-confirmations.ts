import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildConfirmationEmail } from '@/lib/email/templates/confirmation';
import { getSiteUrl } from '@/lib/auth/site-url';

const SIGNUP_GRACE_HOURS = 24;
const NUDGE_THROTTLE_HOURS = 24;
const MAX_NUDGES_PER_USER = 2;

interface AuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
}

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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[cron/resend-confirmations] RESEND_API_KEY missing');
    throw new Error('Server misconfigured');
  }

  const supabaseAdmin = createAdminClient();
  const resend = new Resend(apiKey);
  const siteUrl = getSiteUrl();
  const now = Date.now();

  const allUsers: AuthUser[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('[cron/resend-confirmations] listUsers failed:', error.message);
      throw new Error('Server error');
    }
    if (!data?.users?.length) break;
    allUsers.push(...(data.users as unknown as AuthUser[]));
    if (data.users.length < 200) break;
    page += 1;
  }

  const candidates = allUsers.filter((u) => {
    if (u.email_confirmed_at) return false;
    if (!u.email) return false;
    if (!u.created_at) return false;
    return new Date(u.created_at).getTime() < now - SIGNUP_GRACE_HOURS * 60 * 60 * 1000;
  });

  if (candidates.length === 0) {
    return { processed: 0, sent: 0, throttled: 0, skipped: 0, errors: 0 };
  }

  const profileMap = new Map<string, ProfileRow>();
  const userIds = candidates.map((u) => u.id);
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, last_confirmation_resend_at, confirmation_resend_count')
    .in('id', userIds);
  if (profilesError) {
    console.error('[cron/resend-confirmations] profiles query failed:', profilesError.message);
    throw new Error('Server error');
  }
  for (const row of (profiles ?? []) as ProfileRow[]) {
    profileMap.set(row.id, row);
  }

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

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email!,
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      console.error(`[cron/resend-confirmations] generateLink failed for user ${user.id}: ${linkError?.message ?? 'no hashed_token'}`);
      errors += 1;
      continue;
    }

    const fullName = (profile?.full_name ?? String(user.user_metadata?.full_name ?? '')).trim();
    const firstName = fullName.split(/\s+/).filter(Boolean)[0] ?? '';

    const confirmationLink =
      `${siteUrl}/auth/confirm` +
      `?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&type=magiclink` +
      `&next=${encodeURIComponent('/dashboard')}`;

    const email = buildConfirmationEmail({
      confirmationLink,
      firstName,
      isReminder: count > 0,
    });

    // Claim the nudge before sending (compare-and-set on the counter) so two
    // schedulers hitting the same hour cannot both send. If another run already
    // advanced the counter, this update matches zero rows and we skip.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- profiles resend counters not in generated types
    const { data: claimed, error: updateError } = await (supabaseAdmin as any)
      .from('profiles')
      .update({
        last_confirmation_resend_at: new Date(now).toISOString(),
        confirmation_resend_count: count + 1,
      })
      .eq('id', user.id)
      .eq('confirmation_resend_count', count)
      .select('id');
    if (updateError) {
      console.error(`[cron/resend-confirmations] profile update failed for ${user.id}: ${updateError.message}`);
      errors += 1;
      continue;
    }
    if (!claimed || claimed.length === 0) {
      throttled += 1;
      continue;
    }

    const sendResult = await resend.emails.send({
      from: email.from,
      to: user.email!,
      subject: email.subject,
      html: email.html,
    });
    if (sendResult.error) {
      console.error(`[cron/resend-confirmations] send failed for user ${user.id}: ${sendResult.error.message}`);
      errors += 1;
      continue;
    }

    sent += 1;
  }

  return {
    processed: candidates.length,
    sent,
    throttled,
    skipped,
    errors,
  };
}
