/**
 * Send both founder emails (Day 0 welcome + Day 3 check-in) to a single test
 * address NOW so we can vet them visually before any live backfill.
 *
 * Both emails go out immediately (no scheduledAt on Day 3) so you can review
 * both in your inbox in under a minute.
 *
 * Usage:
 *   npx tsx scripts/resend-test-send.ts --to you@example.com
 *   npx tsx scripts/resend-test-send.ts --to you@example.com --name "Wasim"
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Resend } from 'resend';
import { buildWelcomeEmail } from '../src/lib/email/templates/welcome';
import { buildCheckInEmail } from '../src/lib/email/templates/check-in';

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // missing file is fine
  }
}

const envCandidates = [
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '../../../.env.local'),
  '/Users/wasimjalali/Desktop/Karko_AI/.env.local',
];
for (const p of envCandidates) loadEnvFile(p);

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1];
}

const toEmail = parseArg('to');
const firstName = parseArg('name') ?? '';

if (!toEmail) {
  console.error('FAIL: --to <email> is required.');
  console.error('Usage: npx tsx scripts/resend-test-send.ts --to you@example.com [--name "Wasim"]');
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('FAIL: RESEND_API_KEY missing.');
  process.exit(1);
}

const resend = new Resend(apiKey);

async function main() {
  console.log(`Test recipient: ${toEmail}`);
  console.log(`First name override: ${firstName || '<none, will use "Hi,">'}`);

  console.log('\n[1/2] Sending Day 0 welcome...');
  const welcome = buildWelcomeEmail({ firstName });
  const welcomeResult = await resend.emails.send({
    from: welcome.from,
    to: toEmail!,
    replyTo: welcome.replyTo,
    subject: `[TEST] ${welcome.subject}`,
    html: welcome.html,
    text: welcome.text,
  });
  if (welcomeResult.error) {
    console.error('  FAILED:', welcomeResult.error.message);
    process.exit(1);
  }
  console.log(`  OK  id=${welcomeResult.data?.id}`);

  console.log('\n[2/2] Sending Day 3 check-in (immediately, no scheduledAt)...');
  const checkIn = buildCheckInEmail({ firstName });
  const checkInResult = await resend.emails.send({
    from: checkIn.from,
    to: toEmail!,
    replyTo: checkIn.replyTo,
    subject: `[TEST] ${checkIn.subject}`,
    html: checkIn.html,
    text: checkIn.text,
  });
  if (checkInResult.error) {
    console.error('  FAILED:', checkInResult.error.message);
    process.exit(1);
  }
  console.log(`  OK  id=${checkInResult.data?.id}`);

  console.log('\nBoth emails sent. Check your inbox.');
  console.log('Subjects are prefixed with [TEST] so they do not look like real signup emails.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
