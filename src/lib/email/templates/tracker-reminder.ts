import { BRAND } from '@/lib/brand';
import { LOGO_URL, NOREPLY_FROM, SITE_URL } from '../config';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface BuiltEmail {
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}

interface ReminderOpts {
  firstName?: string | null;
  company: string | null;
  role: string | null;
  /** The interview time, already formatted for the user. */
  when?: string | null;
}

function shell(greeting: string, lines: string[], ctaLabel: string, ctaHref: string): string {
  return `
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#fafaf8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border:1px solid #e8e4dc;border-radius:12px;padding:36px 32px;line-height:1.65;font-size:16px;color:#1a1a1a;">
      <img src="${LOGO_URL}" alt="Useful Apply" width="48" height="48" style="display:block;margin:0 0 20px 0;border-radius:12px;" />
      <p style="margin:0 0 18px 0;">${greeting}</p>
      ${lines.map((line) => `<p style="margin:0 0 18px 0;">${line}</p>`).join('\n      ')}
      <p style="margin:28px 0 0 0;">
        <a href="${ctaHref}" style="display:inline-block;background:#D4A853;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;">${ctaLabel}</a>
      </p>
    </div>
    <p style="margin:18px 0 0 0;font-size:13px;color:#7a736a;text-align:center;">
      You can turn these off in Notifications.
    </p>
  </div>
</body>
</html>`;
}

function greetingFor(firstName?: string | null): { html: string; text: string } {
  const clean = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  return {
    html: clean ? `Hi ${escapeHtml(clean)},` : 'Hi,',
    text: clean ? `Hi ${clean},` : 'Hi,',
  };
}

export function buildInterviewReminderEmail({ firstName, company, role, when }: ReminderOpts): BuiltEmail {
  const name = company ?? 'your interview';
  const greeting = greetingFor(firstName);
  const roleLine = role ? ` for ${role}` : '';
  const whenLine = when ? ` It's ${when}.` : '';
  const href = `${SITE_URL}/dashboard?workspace=tracker`;

  return {
    from: NOREPLY_FROM,
    replyTo: BRAND.supportEmail,
    subject: `Your ${name} interview is tomorrow`,
    html: shell(
      greeting.html,
      [
        `Your interview with ${escapeHtml(name)}${escapeHtml(roleLine)} is tomorrow.${escapeHtml(whenLine)}`,
        'Your kit is in the tracker if you want to read it back before you go in.',
      ],
      'Open the tracker',
      href,
    ),
    text: `${greeting.text}

Your interview with ${name}${roleLine} is tomorrow.${whenLine}

Your kit is in the tracker if you want to read it back before you go in.

${href}

You can turn these off in Notifications.`,
  };
}

export function buildFollowUpReminderEmail({ firstName, company, role }: ReminderOpts): BuiltEmail {
  const name = company ?? 'that role';
  const greeting = greetingFor(firstName);
  const roleLine = role ? ` (${role})` : '';
  const href = `${SITE_URL}/dashboard?workspace=tracker`;

  return {
    from: NOREPLY_FROM,
    replyTo: BRAND.supportEmail,
    subject: `Time to follow up with ${name}`,
    html: shell(
      greeting.html,
      [
        `Your follow-up for ${escapeHtml(name)}${escapeHtml(roleLine)} is due.`,
        'Open the tracker and I’ll draft it from the job description and your CV.',
      ],
      'Draft the follow-up',
      href,
    ),
    text: `${greeting.text}

Your follow-up for ${name}${roleLine} is due.

Open the tracker and I'll draft it from the job description and your CV.

${href}

You can turn these off in Notifications.`,
  };
}

/**
 * An offer deadline. Shorter than the follow-up email on purpose: there is
 * nothing for us to draft here, the user just needs the date in front of them.
 */
export function buildOfferDeadlineReminderEmail({ firstName, company, role }: ReminderOpts): BuiltEmail {
  const name = company ?? 'that offer';
  const greeting = greetingFor(firstName);
  const roleLine = role ? ` (${role})` : '';
  const href = `${SITE_URL}/dashboard?workspace=tracker`;

  return {
    from: NOREPLY_FROM,
    replyTo: BRAND.supportEmail,
    subject: `Your ${name} offer needs an answer`,
    html: shell(
      greeting.html,
      [
        `You said you'd respond to the ${escapeHtml(name)} offer${escapeHtml(roleLine)} by tomorrow.`,
        'The tracker has the role and your kit if you want to read it back first.',
      ],
      'Open the tracker',
      href,
    ),
    text: `${greeting.text}

You said you'd respond to the ${name} offer${roleLine} by tomorrow.

The tracker has the role and your kit if you want to read it back first.

${href}

You can turn these off in Notifications.`,
  };
}
