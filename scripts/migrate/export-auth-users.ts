/**
 * Task 5.3: export Supabase Auth users (read-only, service role) to
 * scripts/migrate/out/auth-users.ndjson, plus password-users.csv for the
 * post-7.1 "set your new password" notice.
 *
 * Passwords are NOT exported. Wasim's decision: no bcrypt, no direct DB
 * access. Email/password users reset once after cutover; Google users sign
 * straight in.
 *
 * Run: npx tsx scripts/migrate/export-auth-users.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (loaded from the local env file)
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

loadEnv({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const OUT_DIR = join('scripts', 'migrate', 'out');
const PAGE = 1000;

const supabase = createClient(url, key, { auth: { persistSession: false } });

export type ExportedIdentity = {
  provider: string;
  identity_data: {
    sub: string | null;
    email: string | null;
  };
};

export type ExportedAuthUser = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  created_at: string;
  updated_at: string | null;
  user_metadata: { full_name: string | null };
  identities: ExportedIdentity[];
};

function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function pickIdentity(identity: {
  provider: string;
  identity_data?: Record<string, unknown> | null;
}): ExportedIdentity {
  const data = identity.identity_data ?? {};
  const sub = typeof data.sub === 'string' && data.sub.trim() ? data.sub : null;
  const email = typeof data.email === 'string' && data.email.trim() ? data.email : null;
  return {
    provider: identity.provider,
    identity_data: { sub, email },
  };
}

async function listAllUsers() {
  const users: ExportedAuthUser[] = [];
  let page = 1;
  let lastTotal: number | undefined;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`[auth.users] ${error.message}`);
    lastTotal = data.total;
    const batch = data.users ?? [];
    for (const listed of batch) {
      // listUsers() returns identities: [] on this GoTrue version. The
      // Google sub and email-provider flag live on getUserById().
      const { data: one, error: oneError } = await supabase.auth.admin.getUserById(listed.id);
      if (oneError || !one.user) {
        throw new Error(`[auth.users/${listed.id}] ${oneError?.message ?? 'missing user'}`);
      }
      const user = one.user;
      const identities = (user.identities ?? []).map(pickIdentity);
      if (identities.length === 0) {
        throw new Error(`[auth.users/${user.id}] has zero identities`);
      }
      const fullName =
        typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()
          ? user.user_metadata.full_name.trim()
          : null;
      users.push({
        id: user.id,
        email: user.email ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at ?? null,
        user_metadata: { full_name: fullName },
        identities,
      });
    }
    if (data.nextPage == null) break;
    page = data.nextPage;
  }
  if (users.length !== lastTotal) {
    throw new Error(`exported ${users.length} users but listUsers total was ${lastTotal}`);
  }
  return users;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const users = await listAllUsers();

  const ndjson = users.length ? users.map((u) => JSON.stringify(u)).join('\n') + '\n' : '';
  writeFileSync(join(OUT_DIR, 'auth-users.ndjson'), ndjson);

  const passwordUsers = users.filter((u) => u.identities.some((i) => i.provider === 'email'));
  const csvLines = ['id,email,full_name,email_verified'];
  for (const u of passwordUsers) {
    csvLines.push(
      [
        csvField(u.id),
        csvField(u.email ?? ''),
        csvField(u.user_metadata.full_name ?? ''),
        csvField(u.email_confirmed_at != null ? '1' : '0'),
      ].join(','),
    );
  }
  writeFileSync(join(OUT_DIR, 'password-users.csv'), csvLines.join('\n') + '\n');

  const googleIdentities = users.reduce(
    (n, u) => n + u.identities.filter((i) => i.provider === 'google').length,
    0,
  );
  console.log(`exported: ${users.length}`);
  console.log(`password users listed: ${passwordUsers.length}`);
  console.log(`google identities: ${googleIdentities}`);
  console.log('wrote scripts/migrate/out/auth-users.ndjson');
  console.log('wrote scripts/migrate/out/password-users.csv');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
