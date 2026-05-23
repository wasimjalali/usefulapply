/**
 * Inspect the karkoai.com domain's deliverability posture: DKIM, SPF, DMARC.
 *
 * Resend's status=verified only means DKIM is set up. DMARC must be added
 * separately on the user's DNS (any provider — Vercel, Cloudflare, GoDaddy).
 * Missing or weak DMARC is the #1 reason Gmail throttles into Promotions.
 *
 * Usage:
 *   npx tsx scripts/resend-domain-deliverability.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { promises as dns } from 'dns';
import { Resend } from 'resend';

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

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('FAIL: RESEND_API_KEY missing.');
  process.exit(1);
}

const DOMAIN = 'karkoai.com';

function divider(label: string) {
  console.log(`\n=== ${label} ===`);
}

async function checkTxt(hostname: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(hostname);
    return records.map((parts) => parts.join(''));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOTFOUND' || (err as NodeJS.ErrnoException).code === 'ENODATA') {
      return [];
    }
    throw err;
  }
}

async function main() {
  const resend = new Resend(apiKey);

  divider('Resend domain status');
  const domains = await resend.domains.list();
  if (domains.error) {
    console.error('Resend list failed:', domains.error.message);
    process.exit(1);
  }
  const list = (domains.data as unknown as { data?: Array<Record<string, unknown>> })?.data
    ?? (Array.isArray(domains.data) ? domains.data : []);
  const karko = (list as Array<Record<string, unknown>>).find(
    (d) => String(d.name ?? '').toLowerCase() === DOMAIN
  );
  if (karko) {
    console.log(`Resend says: ${DOMAIN} status=${karko.status}, region=${karko.region}`);
  } else {
    console.log(`Resend has no record of ${DOMAIN}`);
  }

  divider('SPF (must include resend)');
  const spf = await checkTxt(DOMAIN);
  const spfRecord = spf.find((r) => r.toLowerCase().startsWith('v=spf1'));
  if (spfRecord) {
    console.log(spfRecord);
    if (spfRecord.includes('include:_spf.resend.com') || spfRecord.includes('include:amazonses.com')) {
      console.log('-> SPF includes Resend / Amazon SES. OK.');
    } else {
      console.log('-> WARN: SPF does NOT include _spf.resend.com or amazonses.com. Gmail may flag.');
    }
  } else {
    console.log(`No SPF record on ${DOMAIN}`);
  }

  divider('DMARC (most important for Inbox vs Promotions)');
  const dmarc = await checkTxt(`_dmarc.${DOMAIN}`);
  const dmarcRecord = dmarc.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
  if (dmarcRecord) {
    console.log(dmarcRecord);
    const policy = (dmarcRecord.match(/p=([a-z]+)/i) ?? [])[1] ?? 'unknown';
    console.log(`-> DMARC policy: ${policy}`);
    if (policy === 'none') {
      console.log('-> OK for now. Gmail accepts p=none. For tighter inboxing later, move to p=quarantine.');
    }
  } else {
    console.log(`NO DMARC record on _dmarc.${DOMAIN}`);
    console.log('-> ACTION: Add a TXT record at _dmarc.karkoai.com with value:');
    console.log('     v=DMARC1; p=none; rua=mailto:wasim@karkoai.com');
    console.log('-> p=none is reporting-only, no enforcement, but its presence tells Gmail you care.');
    console.log('-> This is the most common cause of marketing emails landing in Promotions.');
  }

  divider('DKIM (Resend signature)');
  const dkim = await checkTxt(`resend._domainkey.${DOMAIN}`);
  if (dkim.length > 0) {
    console.log(`resend._domainkey.${DOMAIN} -> ${dkim[0]!.slice(0, 80)}...`);
    console.log('-> DKIM record present at resend._domainkey subdomain.');
  } else {
    console.log(`No DKIM record at resend._domainkey.${DOMAIN}`);
    console.log('-> Resend may use a different selector. Resend says verified=${karko?.status} so DKIM is wired somehow.');
  }

  divider('Summary');
  console.log(`Inbox-vs-Promotions checklist for ${DOMAIN}:`);
  console.log(`  Resend verified:           ${karko?.status === 'verified' ? 'YES' : 'NO'}`);
  console.log(`  SPF includes Resend/SES:   ${spfRecord && (spfRecord.includes('_spf.resend.com') || spfRecord.includes('amazonses.com')) ? 'YES' : 'NO'}`);
  console.log(`  DMARC record present:      ${dmarcRecord ? 'YES' : 'NO'}`);
  console.log('');
  console.log('If any of those say NO, fixing them will help Day 3 reach Primary instead of Promotions.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
