import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { buildPasswordResetEmail } from '@/lib/email/templates/password-reset';
import { getSiteUrl } from '@/lib/auth/site-url';

export const runtime = 'nodejs';

/**
 * POST /api/auth/forgot-password
 *
 * Sends a password-reset email via Resend using admin generateLink + token_hash.
 * Unlike client-side resetPasswordForEmail (PKCE), this works cross-device:
 * the user opens the link, /auth/confirm verifies token_hash server-side,
 * then lands on /auth/reset-password with a recovery session.
 *
 * Always returns { success: true } for valid-shaped requests to avoid
 * account enumeration (even when the email is unknown).
 */
export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(
      `forgot-password:${clientIP}`,
      RATE_LIMITS['forgot-password']
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many reset attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }
    if (email.length > 254 || !email.includes('@')) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const siteUrl = getSiteUrl(new URL(request.url).origin);
    const supabaseAdmin = createAdminClient();

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${siteUrl}/auth/reset-password`,
      },
    });

    // Unknown email, OAuth-only account, or provider errors: log and still
    // return success so callers cannot probe which addresses exist.
    if (linkError || !linkData?.properties?.hashed_token) {
      if (linkError) {
        console.error('[/api/auth/forgot-password] generateLink error:', {
          message: linkError.message,
          status: linkError.status,
        });
      }
      return NextResponse.json({ success: true });
    }

    const resetLink =
      `${siteUrl}/auth/confirm` +
      `?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&type=recovery` +
      `&next=${encodeURIComponent('/auth/reset-password')}`;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('[/api/auth/forgot-password] Missing RESEND_API_KEY');
      // Do not claim success when we know the email was never queued.
      return NextResponse.json(
        { error: 'Unable to send reset email right now. Please try again later.' },
        { status: 503 }
      );
    }

    const fullName = String(
      (linkData.user as { user_metadata?: { full_name?: string } } | undefined)?.user_metadata
        ?.full_name ?? ''
    ).trim();
    const firstName = fullName.split(/\s+/)[0] || null;
    const built = buildPasswordResetEmail({ resetLink, firstName });

    const resend = new Resend(resendApiKey);
    const { error: emailError } = await resend.emails.send({
      from: built.from,
      to: email,
      subject: built.subject,
      html: built.html,
      text: built.text,
    });

    if (emailError) {
      console.error('[/api/auth/forgot-password] Resend error:', emailError);
      return NextResponse.json(
        { error: 'Unable to send reset email right now. Please try again later.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/auth/forgot-password] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
