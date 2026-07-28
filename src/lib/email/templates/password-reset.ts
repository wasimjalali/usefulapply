import { NOREPLY_FROM } from '../config';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface BuildPasswordResetEmailOpts {
  resetLink: string;
  firstName?: string | null;
}

interface BuiltEmail {
  from: string;
  subject: string;
  html: string;
  text: string;
}

export function buildPasswordResetEmail({
  resetLink,
  firstName,
}: BuildPasswordResetEmailOpts): BuiltEmail {
  const cleanName = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  const safeName = escapeHtml(cleanName);
  const safeLink = escapeHtml(resetLink);
  const greeting = safeName ? `Hi ${safeName},` : 'Hi there,';

  const subject = 'Reset your Karko AI password';
  const text = [
    greeting.replace(/&[^;]+;/g, ''),
    '',
    'We received a request to reset your Karko AI password.',
    'Open this link to choose a new password (expires in about 1 hour):',
    resetLink,
    '',
    "If you didn't request this, you can ignore this email. Your password will stay the same.",
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fafaf8; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 28px; color: #0f3057; margin: 0; letter-spacing: -0.5px;">Karko AI</h1>
        <p style="color: #888; font-size: 14px; margin: 4px 0 0 0;">Your job application copilot</p>
      </div>

      <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e8e4dc;">
        <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 12px 0;">${greeting}</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 8px 0;">
          We received a request to reset your password.
        </p>
        <p style="color: #555; line-height: 1.6; margin: 0 0 28px 0;">
          Click the button below to choose a new one. This link expires in about an hour.
        </p>

        <div style="text-align: center; margin: 0 0 28px 0;">
          <a href="${safeLink}"
             style="display: inline-block; background: #0f3057; color: #ffffff; text-decoration: none;
                    padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;
                    letter-spacing: 0.2px;">
            Reset password
          </a>
        </div>

        <p style="color: #aaa; font-size: 13px; margin: 0; line-height: 1.6; border-top: 1px solid #f0ece4; padding-top: 20px;">
          If you didn't request a password reset, you can safely ignore this email.
          Your password will stay the same.
        </p>
      </div>

      <p style="text-align: center; color: #bbb; font-size: 12px; margin-top: 24px;">
        Karko AI - karkoai.com
      </p>
    </div>
  `;

  return { from: NOREPLY_FROM, subject, html, text };
}
