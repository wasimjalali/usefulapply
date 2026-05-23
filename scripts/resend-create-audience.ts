/**
 * Create the "Karko AI - New Users" audience in Resend.
 *
 * Idempotent: if the audience already exists, prints its ID without creating a duplicate.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx npx tsx scripts/resend-create-audience.ts
 *
 * After running, copy the printed audience ID into:
 *   1. .env.local        →  RESEND_AUDIENCE_ID=<id>
 *   2. Vercel env vars   →  RESEND_AUDIENCE_ID=<id>  (Production + Preview)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
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
  console.error('FAIL: RESEND_API_KEY missing. Run with: RESEND_API_KEY=re_xxx npx tsx scripts/resend-create-audience.ts');
  process.exit(1);
}

const AUDIENCE_NAME = 'Karko AI - New Users';
const resend = new Resend(apiKey);

async function main() {
  console.log(`Looking for existing audience: "${AUDIENCE_NAME}"...`);

  const list = await resend.audiences.list();
  if (list.error) {
    console.error('Failed to list audiences:', list.error.message);
    process.exit(1);
  }

  const audienceList =
    (list.data as unknown as { data?: Array<Record<string, unknown>> })?.data
    ?? (Array.isArray(list.data) ? list.data : []);

  const existing = (audienceList as Array<Record<string, unknown>>).find(
    (a) => String(a.name ?? '') === AUDIENCE_NAME
  );

  if (existing) {
    console.log('\nAudience already exists. No action taken.');
    console.log(`  Name: ${existing.name}`);
    console.log(`  ID:   ${existing.id}`);
    console.log('\nUse this as RESEND_AUDIENCE_ID in .env.local and Vercel.');
    return;
  }

  console.log('Not found. Creating...');
  const created = await resend.audiences.create({ name: AUDIENCE_NAME });
  if (created.error) {
    console.error('Failed to create audience:', created.error.message);
    process.exit(1);
  }

  const newAudience = created.data as unknown as Record<string, unknown>;
  console.log('\nAudience created.');
  console.log(`  Name: ${newAudience.name}`);
  console.log(`  ID:   ${newAudience.id}`);
  console.log('\nNext steps:');
  console.log('  1. Add to .env.local:    RESEND_AUDIENCE_ID=' + newAudience.id);
  console.log('  2. Add to Vercel env:    RESEND_AUDIENCE_ID=' + newAudience.id  + '   (Production + Preview)');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
