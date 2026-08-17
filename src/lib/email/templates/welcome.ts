import { FOUNDER_FROM, FOUNDER_REPLY_TO, LOGO_URL, SITE_URL } from '../config';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface BuildWelcomeEmailOpts {
  firstName?: string | null;
}

interface BuiltEmail {
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}

export function buildWelcomeEmail({ firstName }: BuildWelcomeEmailOpts): BuiltEmail {
  const cleanName = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  const safeName = escapeHtml(cleanName);
  const greeting = safeName ? `Hi ${safeName},` : 'Hi,';
  const subject = 'Welcome to Useful Apply';

  const html = `
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#fafaf8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border:1px solid #e8e4dc;border-radius:12px;padding:36px 32px;line-height:1.65;font-size:16px;color:#1a1a1a;">
      <img src="${LOGO_URL}" alt="Useful Apply" width="48" height="48" style="display:block;margin:0 0 20px 0;border-radius:12px;" />
      <p style="margin:0 0 18px 0;">${greeting}</p>

      <p style="margin:0 0 18px 0;">
        Wasim here. I'm the founder of Useful Apply. Thanks for signing up.
      </p>

      <p style="margin:0 0 22px 0;">
        You've got 4 credits (2 full applications). Drop in a job description and Useful Apply writes a tailored CV, cover letter and email in 90 seconds, grounded in your real CV.
      </p>

      <div style="background:#fff8e6;border-left:3px solid #d4a017;padding:14px 18px;border-radius:6px;margin:0 0 22px 0;">
        <p style="margin:0;font-size:15px;color:#3a2e0c;line-height:1.55;">
          <strong>One thing to know:</strong> Useful Apply is built for desktop. You can track applications from your phone, but for generating new ones (CV, cover letter, emails), please open it on a laptop or computer.
        </p>
      </div>

      <p style="margin:0 0 22px 0;">
        If something's broken or confusing, hit reply. I read every email and answer personally.
      </p>

      <div style="margin:24px 0 8px 0;">
        <a href="${SITE_URL}/dashboard"
           style="display:inline-block;background:#0f3057;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:600;">
          Try your first application
        </a>
      </div>

      <p style="margin:28px 0 0 0;">
        Wasim<br>
        <span style="color:#888;font-size:14px;">Founder, Useful Apply</span>
      </p>
    </div>

    <p style="text-align:center;color:#bbb;font-size:12px;margin-top:20px;">
      Useful Apply . usefulapply.com
    </p>
  </div>
</body>
</html>
`.trim();

  const text = [
    greeting,
    '',
    "Wasim here. I'm the founder of Useful Apply. Thanks for signing up.",
    '',
    "You've got 4 credits (2 full applications). Drop in a job description and Useful Apply writes a tailored CV, cover letter and email in 90 seconds, grounded in your real CV.",
    '',
    'One thing to know: Useful Apply is built for desktop. You can track applications from your phone, but for generating new ones (CV, cover letter, emails), please open it on a laptop or computer.',
    '',
    "If something's broken or confusing, hit reply. I read every email and answer personally.",
    '',
    `Try your first application: ${SITE_URL}/dashboard`,
    '',
    'Wasim',
    'Founder, Useful Apply',
  ].join('\n');

  return {
    from: FOUNDER_FROM,
    replyTo: FOUNDER_REPLY_TO,
    subject,
    html,
    text,
  };
}
