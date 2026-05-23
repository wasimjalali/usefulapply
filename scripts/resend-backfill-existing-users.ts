/**
 * Backfill the Resend welcome flow for existing users.
 *
 * Two passes:
 *   1. CONFIRMED users (email_confirmed_at IS NOT NULL, welcome_sent_at IS NULL):
 *      - Add to "Karko AI - New Users" audience
 *      - Send Day 0 founder welcome immediately
 *      - Schedule Day 3 check-in (now + 3 days)
 *      - Set profiles.welcome_sent_at so the live endpoint never re-sends.
 *
 *   2. UNCONFIRMED users (email_confirmed_at IS NULL):
 *      - Generate a fresh confirmation link via Supabase admin
 *      - Re-send the confirmation email via Resend (same template as /api/auth/signup)
 *      - Do NOT touch welcome_sent_at — they'll get the welcome through the normal
 *        post-confirm path once they click the new link.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx npx tsx scripts/resend-backfill-existing-users.ts --dry-run
 *   RESEND_API_KEY=re_xxx npx tsx scripts/resend-backfill-existing-users.ts --confirmed-only
 *   RESEND_API_KEY=re_xxx npx tsx scripts/resend-backfill-existing-users.ts --unconfirmed-only
 *   RESEND_API_KEY=re_xxx npx tsx scripts/resend-backfill-existing-users.ts        (both passes, live)
 *
 * Required env vars (loaded from .env.local at worktree, walk-up, or main repo):
 *   RESEND_API_KEY
 *   RESEND_AUDIENCE_ID
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SITE_URL   (used for the confirmation redirect)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { buildWelcomeEmail } from '../src/lib/email/templates/welcome';
import { buildCheckInEmail } from '../src/lib/email/templates/check-in';
import { buildConfirmationEmail } from '../src/lib/email/templates/confirmation';

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

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const CONFIRMED_ONLY = args.has('--confirmed-only');
const UNCONFIRMED_ONLY = args.has('--unconfirmed-only');
const DAY_MS = 24 * 60 * 60 * 1000;

const requiredEnv = [
  'RESEND_API_KEY',
  'RESEND_AUDIENCE_ID',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`FAIL: ${key} is missing from environment.`);
    process.exit(1);
  }
}

const resend = new Resend(process.env.RESEND_API_KEY!);
const audienceId = process.env.RESEND_AUDIENCE_ID!;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://karkoai.com').replace(/\/$/, '');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function divider(label: string) {
  console.log(`\n=== ${label} ===`);
}

interface AuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  welcome_sent_at: string | null;
}

async function listAllAuthUsers(): Promise<AuthUser[]> {
  const result: AuthUser[] = [];
  let page = 1;
  // Supabase admin paginates listUsers. perPage cap = 1000 by default.
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (!data?.users?.length) break;
    result.push(...(data.users as unknown as AuthUser[]));
    if (data.users.length < 200) break;
    page += 1;
  }
  return result;
}

async function loadProfiles(userIds: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, welcome_sent_at')
    .in('id', userIds);
  if (error) throw new Error(`profiles query failed: ${error.message}`);
  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.id, row);
  }
  return map;
}

function pickFirstName(profile: ProfileRow | undefined, authUser: AuthUser): string {
  const fromProfile = (profile?.full_name ?? '').trim();
  const fromMetadata = String(authUser.user_metadata?.full_name ?? '').trim();
  const full = fromProfile || fromMetadata;
  return full.split(/\s+/).filter(Boolean)[0] ?? '';
}

async function runConfirmedPass(users: AuthUser[], profiles: Map<string, ProfileRow>) {
  const eligible = users.filter((u) => {
    const profile = profiles.get(u.id);
    return (
      Boolean(u.email_confirmed_at)
      && Boolean(u.email)
      && !profile?.welcome_sent_at
    );
  });

  console.log(`Confirmed-user pass: ${eligible.length} eligible (${users.length} total auth users).`);
  if (eligible.length === 0) return;

  for (const user of eligible) {
    const profile = profiles.get(user.id);
    const firstName = pickFirstName(profile, user);
    const email = user.email!;

    console.log(`\n-> ${email}  (first name: ${firstName || '<none>'})`);

    if (DRY_RUN) {
      console.log('   [dry-run] would add to audience + send welcome + schedule check-in');
      continue;
    }

    // CAS-style claim. Skip if another process already won.
    const { data: claimed, error: claimError } = await (supabaseAdmin as any)
      .from('profiles')
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq('id', user.id)
      .is('welcome_sent_at', null)
      .select('id');
    if (claimError) {
      console.error(`   claim error: ${claimError.message}`);
      continue;
    }
    if (!claimed || claimed.length === 0) {
      console.log('   already sent (concurrent); skipping');
      continue;
    }

    try {
      await resend.contacts.create({
        audienceId,
        email,
        firstName: firstName || undefined,
        unsubscribed: false,
      });
    } catch (e) {
      console.warn(`   contact create (non-fatal): ${(e as Error).message ?? e}`);
    }

    const welcome = buildWelcomeEmail({ firstName });
    const welcomeResult = await resend.emails.send({
      from: welcome.from,
      to: email,
      replyTo: welcome.replyTo,
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
    });
    if (welcomeResult.error) {
      console.error(`   welcome send FAILED: ${welcomeResult.error.message}`);
      // Roll back so the live endpoint can retry next time the user lands on /auth/callback.
      await (supabaseAdmin as any)
        .from('profiles')
        .update({ welcome_sent_at: null })
        .eq('id', user.id);
      continue;
    }
    console.log(`   welcome sent (id=${welcomeResult.data?.id})`);

    const checkIn = buildCheckInEmail({ firstName });
    const scheduledAt = new Date(Date.now() + 3 * DAY_MS).toISOString();
    const checkInResult = await resend.emails.send({
      from: checkIn.from,
      to: email,
      replyTo: checkIn.replyTo,
      subject: checkIn.subject,
      html: checkIn.html,
      text: checkIn.text,
      scheduledAt,
    });
    if (checkInResult.error) {
      console.error(`   check-in schedule FAILED (welcome already sent): ${checkInResult.error.message}`);
    } else {
      console.log(`   check-in scheduled for ${scheduledAt} (id=${checkInResult.data?.id})`);
    }
  }
}

async function runUnconfirmedPass(users: AuthUser[], profiles: Map<string, ProfileRow>) {
  const eligible = users.filter((u) => !u.email_confirmed_at && Boolean(u.email));
  console.log(`Unconfirmed-user pass: ${eligible.length} eligible.`);
  if (eligible.length === 0) return;

  for (const user of eligible) {
    const profile = profiles.get(user.id);
    const firstName = pickFirstName(profile, user);
    const email = user.email!;
    console.log(`\n-> ${email}  (first name: ${firstName || '<none>'})`);

    if (DRY_RUN) {
      console.log('   [dry-run] would generate fresh link + send confirmation email');
      continue;
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (linkError || !linkData?.properties?.action_link) {
      console.error(`   generateLink failed: ${linkError?.message ?? 'no action_link'}`);
      continue;
    }

    const confirmation = buildConfirmationEmail({
      confirmationLink: linkData.properties.action_link,
      firstName,
      isReminder: true,
    });
    const sendResult = await resend.emails.send({
      from: confirmation.from,
      to: email,
      subject: confirmation.subject,
      html: confirmation.html,
    });
    if (sendResult.error) {
      console.error(`   confirmation send FAILED: ${sendResult.error.message}`);
    } else {
      console.log(`   confirmation re-sent (id=${sendResult.data?.id})`);
    }
  }
}

async function main() {
  divider('Setup');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Confirmed-only: ${CONFIRMED_ONLY}`);
  console.log(`Unconfirmed-only: ${UNCONFIRMED_ONLY}`);
  console.log(`Audience ID: ${audienceId}`);

  divider('Loading users');
  const users = await listAllAuthUsers();
  console.log(`Loaded ${users.length} auth users.`);

  const profiles = await loadProfiles(users.map((u) => u.id));
  console.log(`Loaded ${profiles.size} profile rows.`);

  if (!UNCONFIRMED_ONLY) {
    divider('Confirmed users (welcome + check-in)');
    await runConfirmedPass(users, profiles);
  }
  if (!CONFIRMED_ONLY) {
    divider('Unconfirmed users (re-send confirmation link)');
    await runUnconfirmedPass(users, profiles);
  }

  divider('Done');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
