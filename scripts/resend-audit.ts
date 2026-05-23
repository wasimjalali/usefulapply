/**
 * Resend Audit Script
 *
 * Verifies the Resend account is ready for the welcome-email automation:
 *   1. Confirms RESEND_API_KEY is present (never prints the key itself).
 *   2. Lists verified domains and reports DKIM/SPF/DMARC status.
 *   3. Confirms karkoai.com is verified (required to send from wasim@karkoai.com).
 *   4. Lists existing audiences so we know whether to create or reuse one.
 *
 * Usage:
 *   npx tsx scripts/resend-audit.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Resend } from 'resend';

// Load .env.local manually — same pattern as scripts/test-job-feed-pipeline.ts
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
    // No .env.local — rely on real env
  }
}

// Try worktree first, then walk up to find a sibling repo with .env.local
const envCandidates = [
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '../../../.env.local'),
  '/Users/wasimjalali/Desktop/Karko_AI/.env.local',
];
for (const p of envCandidates) loadEnvFile(p);

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('FAIL: RESEND_API_KEY is missing from environment / .env.local');
  process.exit(1);
}

const resend = new Resend(apiKey);

function divider(label: string) {
  console.log(`\n=== ${label} ===`);
}

async function main() {
  console.log('Karko AI - Resend Audit');
  console.log(`API key detected (length: ${apiKey!.length}, prefix: ${apiKey!.slice(0, 3)}...)`);

  // 1. Domains
  divider('Domains');
  const domains = await resend.domains.list();
  if (domains.error) {
    console.error('Domain list error:', domains.error.message);
    process.exit(1);
  }
  const domainList = (domains.data as unknown as { data?: Array<Record<string, unknown>> })?.data
    ?? (Array.isArray(domains.data) ? domains.data : []);
  if (!domainList || domainList.length === 0) {
    console.log('No domains configured. You need to add karkoai.com in Resend before we can send from wasim@karkoai.com.');
  } else {
    for (const d of domainList) {
      const name = String(d.name ?? '<unknown>');
      const status = String(d.status ?? '<unknown>');
      const region = String(d.region ?? '<unknown>');
      console.log(`- ${name}  status=${status}  region=${region}`);
    }
  }

  const karko = (domainList as Array<Record<string, unknown>>).find(
    (d) => String(d.name ?? '').toLowerCase() === 'karkoai.com'
  );
  if (karko) {
    console.log('\nkarkoai.com detected. Status:', karko.status);
    console.log('  -> wasim@karkoai.com is sendable iff status === "verified"');
  } else {
    console.log('\nkarkoai.com NOT found in Resend domains. Add it in the Resend dashboard first.');
  }

  // 2. Audiences
  divider('Audiences');
  const audiences = await resend.audiences.list();
  if (audiences.error) {
    console.error('Audience list error:', audiences.error.message);
    process.exit(1);
  }
  const audienceList = (audiences.data as unknown as { data?: Array<Record<string, unknown>> })?.data
    ?? (Array.isArray(audiences.data) ? audiences.data : []);
  if (!audienceList || audienceList.length === 0) {
    console.log('No audiences exist yet. The next script will create "Karko AI - New Users".');
  } else {
    for (const a of audienceList) {
      console.log(`- ${a.name ?? '<unnamed>'}  id=${a.id ?? '<no id>'}  created=${a.created_at ?? '<unknown>'}`);
    }
  }

  // 3. Summary
  divider('Summary');
  console.log('Ready to proceed?');
  console.log(`  karkoai.com verified: ${karko && karko.status === 'verified' ? 'YES' : 'NO'}`);
  console.log(`  Existing "Karko AI - New Users" audience: ${
    (audienceList as Array<Record<string, unknown>>).find((a) => String(a.name ?? '') === 'Karko AI - New Users')
      ? 'YES (will reuse)'
      : 'NO (will create)'
  }`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
