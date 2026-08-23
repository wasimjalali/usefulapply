import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { claimWelcomeSend, getOrCreateProfile, updateProfile } from '@/db/repos/profiles';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { sendEmail } from '@/lib/email/send';
import { buildWelcomeEmail } from '@/lib/email/templates/welcome';

export const runtime = 'nodejs';

/**
 * POST /api/auth/post-confirm
 *
 * Fires once after a user confirms their email (or first OAuth callback).
 * Idempotent via profiles.welcome_sent_at: safe to call on every /auth/callback hit.
 *
 * Flow:
 *  1. Auth (session cookie must be valid; emailVerified must be set).
 *  2. CAS-claim by setting welcome_sent_at = NOW() WHERE welcome_sent_at IS NULL.
 *     Zero rows updated => already sent, return success.
 *  3. Send Day 0 founder welcome via Cloudflare Email Service (fatal if it
 *     fails: roll back claim). Day 3 check-in is the weekday cron, not here.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.emailVerified) {
      return NextResponse.json({ error: 'Email not yet confirmed.' }, { status: 400 });
    }

    const rateLimit = await checkRateLimit(`post-confirm:${user.id}`, RATE_LIMITS['post-confirm']);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // The profiles row can lag the auth user (self-heal is best-effort at
    // sign-up); make sure it exists so the claim below cannot mistake a
    // missing row for "already sent".
    await getOrCreateProfile(user.id, user.email);

    const sentAt = new Date().toISOString();
    let claimed: boolean;
    try {
      claimed = await claimWelcomeSend(user.id, sentAt);
    } catch (claimError) {
      console.error('[/api/auth/post-confirm] claim error:', claimError);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    if (!claimed) {
      return NextResponse.json({ success: true, alreadySent: true });
    }

    try {
      const firstName = (user.name ?? '').trim().split(/\s+/).filter(Boolean)[0] ?? '';
      const welcome = buildWelcomeEmail({ firstName });
      await sendEmail({
        to: user.email,
        from: welcome.from,
        replyTo: welcome.replyTo,
        subject: welcome.subject,
        html: welcome.html,
        text: welcome.text,
      });
    } catch (sendError) {
      console.error('[/api/auth/post-confirm] welcome send error:', sendError);
      await updateProfile(user.id, { welcome_sent_at: null });
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/auth/post-confirm] unexpected:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
