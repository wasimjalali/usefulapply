/**
 * Transactional email sender on Cloudflare Email Service.
 *
 * Uses the `EMAIL` send_email binding from wrangler.jsonc. The `from` domain
 * must be onboarded (`npx wrangler email sending list`), which usefulapply.com
 * is. Callers pass `from` as either `"Name <addr@usefulapply.com>"` or a bare
 * address; it defaults to NOREPLY_FROM.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NOREPLY_FROM } from '@/lib/email/config';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

type EmailAddress = { email: string; name?: string };

type SendEmailBinding = {
  send(message: {
    to: string;
    from: EmailAddress;
    replyTo?: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId?: string }>;
};

declare global {
  interface CloudflareEnv {
    EMAIL?: SendEmailBinding;
  }
}

/** `"Name <addr>"` or `"addr"` to the binding's `{ email, name }` shape. */
export function parseFrom(value: string): EmailAddress {
  const match = value.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^<>\s]+)>\s*$/);
  if (match) {
    const name = match[1]?.trim();
    return name ? { email: match[2], name } : { email: match[2] };
  }
  return { email: value.trim() };
}

async function getEmailBinding(): Promise<SendEmailBinding> {
  let env: { EMAIL?: SendEmailBinding };
  try {
    ({ env } = await getCloudflareContext({ async: true }) as { env: { EMAIL?: SendEmailBinding } });
  } catch {
    throw new Error('[email] EMAIL binding is unavailable. Run `npm run dev` or `npx opennextjs-cloudflare preview`.');
  }
  if (!env.EMAIL) {
    throw new Error('[email] env.EMAIL is missing. Add `send_email: [{ name: "EMAIL" }]` to wrangler.jsonc.');
  }
  return env.EMAIL;
}

/** Plain-text fallback when a caller has no dedicated text version. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Header-bound fields must never carry CR/LF or other control characters. */
function headerSafe(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const binding = await getEmailBinding();
  const from = parseFrom(headerSafe(input.from ?? NOREPLY_FROM));
  await binding.send({
    to: headerSafe(input.to),
    from,
    replyTo: input.replyTo ? headerSafe(input.replyTo) : undefined,
    subject: headerSafe(input.subject),
    html: input.html,
    text: input.text ?? htmlToText(input.html),
  });
}
