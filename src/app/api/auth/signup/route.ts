import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertProfileOnSignup } from '@/db/repos/profiles';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getSiteUrl } from '@/lib/auth/site-url';

export const runtime = 'nodejs';

/** Escape HTML to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 signup attempts per IP per minute
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkRateLimit(`signup:${clientIP}`, RATE_LIMITS['signup']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
      resendOnly?: boolean;
    };
    const { email, password, fullName, resendOnly } = body;

    // Input validation
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }
    if (email.length > 254) {
      return NextResponse.json({ error: 'Email address is too long.' }, { status: 400 });
    }
    if (fullName && fullName.length > 200) {
      return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
    }

    // Use NEXT_PUBLIC_SITE_URL so redirectTo is always the canonical
    // production URL — never a Vercel preview URL that isn't in Supabase's allowlist.
    const siteUrl = getSiteUrl(new URL(request.url).origin);
    const supabaseAdmin = createAdminClient();

    // Generate a signup confirmation link via admin API.
    // generateLink handles all cases correctly:
    //   - New email → creates user + generates confirmation link
    //   - Existing unconfirmed email → regenerates confirmation link (resend flow)
    //   - Existing confirmed email → returns error (surfaced carefully)
    // Creates user in auth.users (email_confirmed_at = null) and returns
    // hashed_token we send via Resend instead of Supabase SMTP.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        // After /auth/confirm, land on dashboard. redirectTo is a fallback for
        // any provider-side hops; the email itself uses token_hash on our domain.
        redirectTo: `${siteUrl}/auth/callback`,
        data: { full_name: fullName ?? '' },
      },
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[/api/auth/signup] generateLink error:', {
        message: linkError?.message,
        status: linkError?.status,
        name: linkError?.name,
        resendOnly: Boolean(resendOnly),
      });

      // Resend from login: never reveal whether the account exists / is confirmed.
      if (resendOnly) {
        return NextResponse.json({ success: true });
      }

      // Return generic message — never expose raw provider errors to prevent
      // account enumeration and leaking backend configuration details.
      return NextResponse.json(
        { error: 'Failed to create account. Please try again.' },
        { status: 400 }
      );
    }

    // Create profile immediately with service role key — no RLS, no trigger dependency.
    // Root cause fix: DB trigger handle_new_user() silently swallows errors, leaving
    // the profiles table empty. We guarantee the profile exists here.
    if (linkData.user?.id) {
      try {
        await upsertProfileOnSignup(linkData.user.id, email, fullName ?? '');
      } catch (profileError) {
        console.error('[/api/auth/signup] Profile upsert error:', profileError);
        // Non-fatal: user can still confirm email and the profile is created on login
      }
    }

    // token_hash path: works cross-device (no PKCE code_verifier required).
    const confirmationLink =
      `${siteUrl}/auth/confirm` +
      `?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&type=signup` +
      `&next=${encodeURIComponent('/dashboard')}`;

    // Send confirmation email via Resend (no rate limit, unlike Supabase built-in SMTP)
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('[/api/auth/signup] Missing RESEND_API_KEY, skipping confirmation email');
      // User was created successfully — return success so the UI shows "check your email";
      // the user can request a resend later once the key is configured.
      return NextResponse.json({ success: true });
    }
    const resend = new Resend(resendApiKey);
    const safeName = escapeHtml(fullName ?? '');
    const greeting = safeName ? `Hi ${safeName},` : 'Hi there,';
    const subject = resendOnly
      ? 'Confirm your Useful Apply account (reminder)'
      : 'Confirm your Useful Apply account';

    const { error: emailError } = await resend.emails.send({
      from: 'Useful Apply <noreply@karkoai.com>', // TODO(Task 7.1): switch to noreply@usefulapply.com once Cloudflare Email Service sends for that domain
      to: email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fafaf8; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; color: #0f3057; margin: 0; letter-spacing: -0.5px;">Useful Apply</h1>
            <p style="color: #888; font-size: 14px; margin: 4px 0 0 0;">Your job application copilot</p>
          </div>

          <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e8e4dc;">
            <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 12px 0;">${greeting}</h2>
            <p style="color: #555; line-height: 1.6; margin: 0 0 8px 0;">
              Thanks for signing up for Useful Apply. One quick step to get started:
            </p>
            <p style="color: #555; line-height: 1.6; margin: 0 0 28px 0;">
              Click the button below to confirm your email address and activate your free account (4 credits included).
            </p>

            <div style="text-align: center; margin: 0 0 28px 0;">
              <a href="${confirmationLink}"
                 style="display: inline-block; background: #0f3057; color: #ffffff; text-decoration: none;
                        padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;
                        letter-spacing: 0.2px;">
                Confirm my account
              </a>
            </div>

            <p style="color: #aaa; font-size: 13px; margin: 0; line-height: 1.6; border-top: 1px solid #f0ece4; padding-top: 20px;">
              If you didn't create this account, you can safely ignore this email.
              This link expires in 24 hours.
            </p>
          </div>

          <p style="text-align: center; color: #bbb; font-size: 12px; margin-top: 24px;">
            Useful Apply - usefulapply.com
          </p>
        </div>
      `,
    });

    if (emailError) {
      // Email failed but user was created — log it, still return success
      // so the UI shows "check your email" (they can request a resend later)
      console.error('[/api/auth/signup] Resend error:', emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/auth/signup] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
