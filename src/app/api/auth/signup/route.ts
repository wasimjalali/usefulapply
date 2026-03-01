import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

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
    const rateLimitResult = checkRateLimit(`signup:${clientIP}`, RATE_LIMITS['signup']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json() as { email?: string; password?: string; fullName?: string };
    const { email, password, fullName } = body;

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

    // Use NEXT_PUBLIC_SITE_URL env var so redirectTo is always the canonical
    // production URL — never a Vercel preview URL that isn't in Supabase's allowlist.
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
    const supabaseAdmin = createAdminClient();

    // Pre-check: detect existing confirmed users by querying profiles table.
    // Service role bypasses RLS so this always works.
    const { data: existingProfile } = await (supabaseAdmin as any)
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingProfile) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      );
    }

    // Generate a signup confirmation link via admin API.
    // Creates user in auth.users (email_confirmed_at = null) and returns
    // a one-time confirmation URL we send via Resend instead of Supabase SMTP.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
        data: { full_name: fullName ?? '' },
      },
    });

    if (linkError) {
      console.error('[/api/auth/signup] generateLink error:', {
        message: linkError.message,
        status: linkError.status,
        name: linkError.name,
      });
      // Return the actual Supabase error — surfacing it is the only way to
      // diagnose remaining config issues (e.g. redirectTo not in allowlist,
      // password policy violation, project-level restrictions).
      return NextResponse.json(
        { error: linkError.message || 'Failed to create account. Please try again.' },
        { status: 400 }
      );
    }

    // Create profile immediately with service role key — no RLS, no trigger dependency.
    // Root cause fix: DB trigger handle_new_user() silently swallows errors, leaving
    // the profiles table empty. We guarantee the profile exists here.
    const { error: profileError } = await (supabaseAdmin as any)
      .from('profiles')
      .upsert(
        { id: linkData.user.id, email, full_name: fullName ?? '' },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.error('[/api/auth/signup] Profile upsert error:', profileError.message);
      // Non-fatal — user can still confirm email and profile will be created on login
    }

    // Send confirmation email via Resend (no rate limit, unlike Supabase built-in SMTP)
    const resend = new Resend(process.env.RESEND_API_KEY);
    const confirmationLink = linkData.properties.action_link;
    const safeName = escapeHtml(fullName ?? '');
    const greeting = safeName ? `Hi ${safeName},` : 'Hi there,';

    const { error: emailError } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Confirm your KarKo AI account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fafaf8; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; color: #0f3057; margin: 0; letter-spacing: -0.5px;">KarKo AI</h1>
            <p style="color: #888; font-size: 14px; margin: 4px 0 0 0;">Your job application copilot</p>
          </div>

          <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e8e4dc;">
            <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 12px 0;">${greeting}</h2>
            <p style="color: #555; line-height: 1.6; margin: 0 0 8px 0;">
              Thanks for signing up for KarKo AI. One quick step to get started:
            </p>
            <p style="color: #555; line-height: 1.6; margin: 0 0 28px 0;">
              Click the button below to confirm your email address and activate your free account (10 credits included).
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
            KarKo AI &mdash; karkoai.com
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
