import { LOGO_URL, NOREPLY_FROM } from '../config';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface BuildConfirmationEmailOpts {
  confirmationLink: string;
  firstName?: string | null;
  /** Use the nudge subject + intro for users who already received the first confirmation. */
  isReminder?: boolean;
}

interface BuiltEmail {
  from: string;
  subject: string;
  html: string;
}

/**
 * Single source of truth for the confirmation email body, used by:
 *   - Better Auth sendVerificationEmail in src/auth/server.ts
 *   - src/cron/resend-confirmations.ts (hourly auto-nudge for unconfirmed > 24h)
 */
export function buildConfirmationEmail({
  confirmationLink,
  firstName,
  isReminder = false,
}: BuildConfirmationEmailOpts): BuiltEmail {
  const cleanName = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  const safeName = escapeHtml(cleanName);
  const greeting = safeName ? `Hi ${safeName},` : 'Hi there,';
  const subject = isReminder
    ? 'A reminder: confirm your Useful Apply account'
    : 'Confirm your Useful Apply account';

  const intro = isReminder
    ? "You signed up for Useful Apply a little while back but haven't confirmed your email yet. Here's a fresh link, valid for 24 hours."
    : "Thanks for signing up. Click the button below to confirm your email and activate your free account (4 credits included).";

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fafaf8; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="${LOGO_URL}" alt="Useful Apply" width="56" height="56" style="display:block;margin:0 auto 12px auto;border-radius:12px;" />
    <h1 style="font-size: 28px; color: #0f3057; margin: 0; letter-spacing: -0.5px;">Useful Apply</h1>
    <p style="color: #888; font-size: 14px; margin: 4px 0 0 0;">Your job application copilot</p>
  </div>
  <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e8e4dc;">
    <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 12px 0;">${greeting}</h2>
    <p style="color: #555; line-height: 1.6; margin: 0 0 28px 0;">${intro}</p>
    <div style="text-align: center; margin: 0 0 28px 0;">
      <a href="${confirmationLink}"
         style="display: inline-block; background: #0f3057; color: #ffffff; text-decoration: none;
                padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;">
        Confirm my account
      </a>
    </div>
    <p style="color: #aaa; font-size: 13px; margin: 0; line-height: 1.6; border-top: 1px solid #f0ece4; padding-top: 20px;">
      If you didn't sign up for Useful Apply, you can safely ignore this email. This link expires in 24 hours.
    </p>
  </div>
  <p style="text-align: center; color: #bbb; font-size: 12px; margin-top: 24px;">
    Useful Apply . usefulapply.com
  </p>
</div>
`.trim();

  return {
    from: NOREPLY_FROM,
    subject,
    html,
  };
}
