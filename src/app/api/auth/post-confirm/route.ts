import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { buildWelcomeEmail } from '@/lib/email/templates/welcome';
import { buildCheckInEmail } from '@/lib/email/templates/check-in';

export const runtime = 'nodejs';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/auth/post-confirm
 *
 * Fires once after a user confirms their email (or first OAuth callback).
 * Idempotent via profiles.welcome_sent_at — safe to call on every /auth/callback hit.
 *
 * Flow:
 *  1. Auth (session cookie must be valid; user.email_confirmed_at must be set).
 *  2. CAS-claim by setting welcome_sent_at = NOW() WHERE welcome_sent_at IS NULL.
 *     Zero rows updated => already sent, return success.
 *  3. Best-effort: add contact to "Karko AI - New Users" Resend audience.
 *  4. Send Day 0 founder welcome via Resend (fatal if it fails: roll back claim).
 *  5. Schedule Day 3 check-in via Resend `scheduledAt` (non-fatal if it fails: log).
 */
export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(`post-confirm:${clientIP}`, RATE_LIMITS['post-confirm']);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: 'Email not yet confirmed.' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // CAS-style atomic claim: only succeeds if welcome_sent_at IS NULL.
    // Concurrent /auth/callback refreshes lose the race and become idempotent no-ops.
    const sentAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await (supabaseAdmin as any)
      .from('profiles')
      .update({ welcome_sent_at: sentAt })
      .eq('id', user.id)
      .is('welcome_sent_at', null)
      .select('id');

    if (claimError) {
      console.error('[/api/auth/post-confirm] claim error:', claimError.message);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      // Welcome already sent for this user. No-op.
      return NextResponse.json({ success: true, alreadySent: true });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const audienceId = process.env.RESEND_AUDIENCE_ID;
    if (!apiKey) {
      console.error('[/api/auth/post-confirm] RESEND_API_KEY missing — rolling back claim');
      await (supabaseAdmin as any)
        .from('profiles')
        .update({ welcome_sent_at: null })
        .eq('id', user.id);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    const resend = new Resend(apiKey);

    const fullName = String(user.user_metadata?.full_name ?? '').trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ');

    // Best-effort audience add. Failure is non-fatal — welcome still goes out.
    // Most common failure: contact already exists (silent OK).
    if (audienceId) {
      try {
        await resend.contacts.create({
          audienceId,
          email: user.email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          unsubscribed: false,
        });
      } catch (contactError) {
        console.warn('[/api/auth/post-confirm] contact create (non-fatal):', contactError);
      }
    }

    const welcome = buildWelcomeEmail({ firstName });
    const welcomeResult = await resend.emails.send({
      from: welcome.from,
      to: user.email,
      replyTo: welcome.replyTo,
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
    });
    if (welcomeResult.error) {
      console.error('[/api/auth/post-confirm] welcome send error:', welcomeResult.error.message);
      await (supabaseAdmin as any)
        .from('profiles')
        .update({ welcome_sent_at: null })
        .eq('id', user.id);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    // Day 3 check-in. Failure here is logged but not rolled back —
    // we don't want to re-send the welcome on retry.
    const checkIn = buildCheckInEmail({ firstName });
    const scheduledAt = new Date(Date.now() + 3 * DAY_MS).toISOString();
    const checkInResult = await resend.emails.send({
      from: checkIn.from,
      to: user.email,
      replyTo: checkIn.replyTo,
      subject: checkIn.subject,
      html: checkIn.html,
      text: checkIn.text,
      scheduledAt,
    });
    if (checkInResult.error) {
      console.error('[/api/auth/post-confirm] check-in schedule error:', checkInResult.error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/auth/post-confirm] unexpected:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
