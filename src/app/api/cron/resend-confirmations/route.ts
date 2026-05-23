import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildConfirmationEmail } from '@/lib/email/templates/confirmation';

export const runtime = 'nodejs';

const DAY_MS = 24 * 60 * 60 * 1000;
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

/**
 * POST /api/cron/resend-confirmations
 *
 * Called hourly by Supabase pg_cron (see migration 202605230003).
 * Re-sends the confirmation email to users who:
 *   - have email_confirmed_at IS NULL
 *   - signed up > 24 hours ago
 *   - have not been nudged in the last 24 hours
 *   - have been nudged fewer than 2 times total
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (set in env + Supabase Vault).
 *
 * Returns: { processed, sent, throttled, skipped, errors }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[cron/resend-confirmations] RESEND_API_KEY missing');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const supabaseAdmin = createAdminClient();
    const resend = new Resend(apiKey);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://karkoai.com').replace(/\/$/, '');
    const now = Date.now();

    // 1. Page through every auth user (10-12 today, plan for growth).
    const allUsers: AuthUser[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.error('[cron/resend-confirmations] listUsers failed:', error.message);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
      }
      if (!data?.users?.length) break;
      allUsers.push(...(data.users as unknown as AuthUser[]));
      if (data.users.length < 200) break;
      page += 1;
    }

    // 2. Initial filter: unconfirmed + signed up > 24h ago.
    const candidates = allUsers.filter((u) => {
      if (u.email_confirmed_at) return false;
      if (!u.email) return false;
      if (!u.created_at) return false;
      return new Date(u.created_at).getTime() < now - SIGNUP_GRACE_HOURS * 60 * 60 * 1000;
    });

    if (candidates.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0, throttled: 0, skipped: 0, errors: 0 });
    }

    // 3. Load profile rows so we can throttle by last_confirmation_resend_at + count.
    const profileMap = new Map<string, ProfileRow>();
    const userIds = candidates.map((u) => u.id);
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, last_confirmation_resend_at, confirmation_resend_count')
      .in('id', userIds);
    if (profilesError) {
      console.error('[cron/resend-confirmations] profiles query failed:', profilesError.message);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
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

      // Generate fresh confirmation link via admin API (24h-valid).
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email!,
        options: { redirectTo: `${siteUrl}/auth/callback` },
      });
      if (linkError || !linkData?.properties?.action_link) {
        console.error(`[cron/resend-confirmations] generateLink failed for ${user.email}: ${linkError?.message ?? 'no action_link'}`);
        errors += 1;
        continue;
      }

      const fullName = (profile?.full_name ?? String(user.user_metadata?.full_name ?? '')).trim();
      const firstName = fullName.split(/\s+/).filter(Boolean)[0] ?? '';

      const email = buildConfirmationEmail({
        confirmationLink: linkData.properties.action_link,
        firstName,
        isReminder: count > 0,
      });

      const sendResult = await resend.emails.send({
        from: email.from,
        to: user.email!,
        subject: email.subject,
        html: email.html,
      });
      if (sendResult.error) {
        console.error(`[cron/resend-confirmations] send failed for ${user.email}: ${sendResult.error.message}`);
        errors += 1;
        continue;
      }

      const { error: updateError } = await (supabaseAdmin as any)
        .from('profiles')
        .update({
          last_confirmation_resend_at: new Date(now).toISOString(),
          confirmation_resend_count: count + 1,
        })
        .eq('id', user.id);
      if (updateError) {
        console.error(`[cron/resend-confirmations] profile update failed for ${user.id}: ${updateError.message}`);
      }

      sent += 1;
    }

    return NextResponse.json({
      processed: candidates.length,
      sent,
      throttled,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('[cron/resend-confirmations] unexpected:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
