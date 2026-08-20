import { LOGO_URL, NOREPLY_FROM } from '../config';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface BuildDeleteAccountEmailOpts {
  confirmLink: string;
  firstName?: string | null;
}

interface BuiltEmail {
  from: string;
  subject: string;
  html: string;
  text: string;
}

export function buildDeleteAccountEmail({
  confirmLink,
  firstName,
}: BuildDeleteAccountEmailOpts): BuiltEmail {
  const cleanName = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  const safeName = escapeHtml(cleanName);
  const safeLink = escapeHtml(confirmLink);
  const greeting = safeName ? `Hi ${safeName},` : 'Hi there,';
  const textGreeting = cleanName ? `Hi ${cleanName},` : 'Hi there,';

  const subject = 'Confirm you want to delete your Useful Apply account';
  const text = [
    textGreeting,
    '',
    'You asked to delete your Useful Apply account.',
    'Open this link in the same browser you asked from, and everything goes: your CV, your applications and your credits. It cannot be undone.',
    'The link works for 30 minutes.',
    confirmLink,
    '',
    "If this wasn't you, ignore this email. Nothing is deleted until the link is opened, and it's worth changing your password.",
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fafaf8; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${LOGO_URL}" alt="Useful Apply" width="56" height="56" style="display:block;margin:0 auto 12px auto;border-radius:12px;" />
        <h1 style="font-size: 28px; color: #0f3057; margin: 0; letter-spacing: -0.5px;">Useful Apply</h1>
        <p style="color: #888; font-size: 14px; margin: 4px 0 0 0;">Your job application copilot</p>
      </div>

      <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e8e4dc;">
        <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 12px 0;">${greeting}</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 8px 0;">
          You asked to delete your Useful Apply account.
        </p>
        <p style="color: #555; line-height: 1.6; margin: 0 0 28px 0;">
          Open this in the same browser you asked from and everything goes: your CV, your applications and your credits.
          It can't be undone. The link works for 30 minutes.
        </p>

        <div style="text-align: center; margin: 0 0 28px 0;">
          <a href="${safeLink}"
             style="display: inline-block; background: #0f3057; color: #ffffff; text-decoration: none;
                    padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600;
                    letter-spacing: 0.2px;">
            Delete my account
          </a>
        </div>

        <p style="color: #aaa; font-size: 13px; margin: 0; line-height: 1.6; border-top: 1px solid #f0ece4; padding-top: 20px;">
          If this wasn't you, ignore this email. Nothing is deleted until the link is opened,
          and it's worth changing your password.
        </p>
      </div>

      <p style="text-align: center; color: #bbb; font-size: 12px; margin-top: 24px;">
        Useful Apply - usefulapply.com
      </p>
    </div>
  `;

  return { from: NOREPLY_FROM, subject, html, text };
}
