import { FOUNDER_FROM, FOUNDER_REPLY_TO, LOGO_URL, SITE_URL } from '../config';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface BuildCheckInEmailOpts {
  firstName?: string | null;
}

interface BuiltEmail {
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}

export function buildCheckInEmail({ firstName }: BuildCheckInEmailOpts): BuiltEmail {
  const cleanName = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  const safeName = escapeHtml(cleanName);
  const greeting = safeName ? `Hi ${safeName},` : 'Hi,';
  const textGreeting = cleanName ? `Hi ${cleanName},` : 'Hi,';
  // Question-mark subjects look promotional to Gmail; a statement reads more personal.
  const subject = 'A quick check-in from Wasim';

  const html = `
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#fafaf8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border:1px solid #e8e4dc;border-radius:12px;padding:36px 32px;line-height:1.65;font-size:16px;color:#1a1a1a;">
      <img src="${LOGO_URL}" alt="Useful Apply" width="48" height="48" style="display:block;margin:0 0 20px 0;border-radius:12px;" />
      <p style="margin:0 0 18px 0;">${greeting}</p>

      <p style="margin:0 0 18px 0;">
        Wasim again. You've been on Useful Apply for a few days now, so I wanted to check in.
      </p>

      <p style="margin:0 0 12px 0;">
        A few questions, if you've got a minute:
      </p>

      <ul style="margin:0 0 22px 0;padding-left:22px;">
        <li style="margin-bottom:8px;">How was your experience overall?</li>
        <li style="margin-bottom:8px;">Easy and simple to use?</li>
        <li style="margin-bottom:8px;">Did the quality and speed match what you needed?</li>
        <li style="margin-bottom:8px;">Did you enjoy the product?</li>
      </ul>

      <p style="margin:0 0 22px 0;">
        Just hit reply with whatever comes to mind. One sentence per question is enough. I read every email and answer personally, and your honest take is what shapes what we build next.
      </p>

      <p style="margin:0 0 22px 0;">
        And if you liked it, the Plus plan gives you more credits and a bigger Smart Job Feed, up to 25 roles a day. <a href="${SITE_URL}/pricing" style="color:#0f3057;font-weight:600;text-decoration:underline;">See the plans</a> when you have time.
      </p>

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
    textGreeting,
    '',
    "Wasim again. You've been on Useful Apply for a few days now, so I wanted to check in.",
    '',
    "A few questions, if you've got a minute:",
    '',
    '- How was your experience overall?',
    '- Easy and simple to use?',
    '- Did the quality and speed match what you needed?',
    '- Did you enjoy the product?',
    '',
    'Just hit reply with whatever comes to mind. One sentence per question is enough. I read every email and answer personally, and your honest take is what shapes what we build next.',
    '',
    `And if you liked it, the Plus plan gives you more credits and a bigger Smart Job Feed, up to 25 roles a day. See the plans when you have time: ${SITE_URL}/pricing`,
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
