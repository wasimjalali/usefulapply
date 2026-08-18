/**
 * Task 5.3: import auth-users.ndjson into D1 `user` + Google `account` rows.
 *
 * Path taken: passwords are NOT migrated (no bcrypt, no credential rows).
 * Email/password users reset once after cutover via forgot-password; Better
 * Auth 1.7 createAccount on reset (issuer local:credential). Google users
 * get issuer https://accounts.google.com (Better Auth 1.7 built-in Google
 * provider's accountIssuer) + the Google sub and sign straight in.
 *
 * Writes through raw SQL with the explicit Supabase UUID. Do not go through
 * auth.api.* (the Drizzle adapter drops a supplied id unless forceAllowId).
 * SQL files use literals, same as import-d1.ts, so the 100-bound-param cap
 * does not apply. Do not create profiles or credits; they exist from 4.3.
 *
 * Run: npx tsx scripts/migrate/import-auth-users.ts --local|--remote --db <name> [--dry-run]
 * --remote requires --db (staging usefulapply-db, production usefulapply-db-prod).
 * --remote is the auth cutover only: run it immediately before cutover so no
 * new Supabase sign-ups are missed. Do not run --remote during rehearsal
 * against production.
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ExportedAuthUser } from './export-auth-users';

const OUT_DIR = join('scripts', 'migrate', 'out');
const SQL_DIR = join(OUT_DIR, 'sql-auth');
const CHUNK = 500;
// @better-auth/core social-providers/google.mjs declares accountIssuer
// 'https://accounts.google.com'; only providers without accountIssuer fall
// back to 'local:oauth:<id>'.
const GOOGLE_ISSUER = 'https://accounts.google.com';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const args = process.argv.slice(2);
let target: '--remote' | '--local' | null = null;
let dbName: string | null = null;
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--local' || arg === '--remote') {
    if (target && target !== arg) throw new Error('Pass only one of --local or --remote');
    target = arg;
    continue;
  }
  if (arg === '--db') {
    const name = args[i + 1];
    if (!name || name.startsWith('--')) throw new Error('--db requires a database name');
    dbName = name;
    i += 1;
    continue;
  }
  if (arg === '--dry-run') {
    dryRun = true;
    continue;
  }
  throw new Error(`Unrecognised flag: ${arg}`);
}
if (!target) throw new Error('Pass --local or --remote');
if (target === '--remote' && !dbName) {
  throw new Error('--remote requires --db <name> (staging usefulapply-db, production usefulapply-db-prod)');
}
const resolvedTarget: '--remote' | '--local' = target;
const DB_NAME = dbName ?? 'usefulapply-db';

type SkipReason =
  | 'invalid_uuid'
  | 'missing_email'
  | 'id_exists'
  | 'email_exists'
  | 'google_account_exists'
  | 'google_sub_missing';

type Skip = { reason: SkipReason; id: string; detail?: string };

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toEpochMs(value: unknown): number {
  if (value == null || value === '') return Date.now();
  const t = new Date(value as string | number).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function readUsers(): ExportedAuthUser[] {
  const file = join(OUT_DIR, 'auth-users.ndjson');
  if (!existsSync(file)) throw new Error(`Missing export ${file}. Run export-auth-users.ts first.`);
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ExportedAuthUser);
}

function runFile(file: string) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, resolvedTarget, '--file', file], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

function d1Query(sql: string): Record<string, unknown>[] {
  const raw = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, resolvedTarget, '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const parsed = JSON.parse(raw) as Array<{ results: Record<string, unknown>[] }>;
  return parsed[0]?.results ?? [];
}

function writeAndApply(prefix: string, statements: string[]) {
  if (statements.length === 0) return;
  for (let i = 0; i < statements.length; i += CHUNK) {
    const chunk = statements.slice(i, i + CHUNK);
    const file = join(SQL_DIR, `${prefix}-${i / CHUNK}.sql`);
    writeFileSync(file, chunk.join('\n') + '\n');
    if (!dryRun) {
      console.log(`applying ${file} (${chunk.length} rows)`);
      runFile(file);
    }
  }
}

async function main() {
  if (resolvedTarget === '--remote') {
    console.log('NOTE: --remote is the cutover import. Rehearsal and this task use --local only.');
  }

  rmSync(SQL_DIR, { recursive: true, force: true });
  mkdirSync(SQL_DIR, { recursive: true });

  const exported = readUsers();
  const existingUsers = d1Query('SELECT id, email FROM user');
  const existingIds = new Set(existingUsers.map((r) => String(r.id)));
  const existingEmails = new Set(
    existingUsers.map((r) => String(r.email ?? '').toLowerCase()).filter(Boolean),
  );
  const existingAccounts = d1Query('SELECT issuer, account_id FROM account');
  const existingAccountKeys = new Set(
    existingAccounts.map((r) => `${String(r.issuer)}\0${String(r.account_id)}`),
  );
  const profileIds = new Set(d1Query('SELECT id FROM profiles').map((r) => String(r.id)));

  const userInserts: string[] = [];
  const accountInserts: string[] = [];
  const skipped: Skip[] = [];
  const importedIds: string[] = [];
  const missingProfiles: string[] = [];
  let googleAccounts = 0;
  const seenEmails = new Set<string>();

  for (const raw of exported) {
    if (!UUID_V4.test(raw.id)) {
      skipped.push({ reason: 'invalid_uuid', id: raw.id });
      continue;
    }
    const email = raw.email?.trim().toLowerCase() ?? '';
    if (!email) {
      skipped.push({ reason: 'missing_email', id: raw.id });
      continue;
    }

    const alreadyId = existingIds.has(raw.id);
    if (alreadyId) {
      skipped.push({ reason: 'id_exists', id: raw.id });
    } else if (existingEmails.has(email) || seenEmails.has(email)) {
      skipped.push({ reason: 'email_exists', id: raw.id, detail: email });
      continue;
    } else {
      const fullName = raw.user_metadata?.full_name?.trim() || email.split('@')[0] || 'User';
      const createdAt = toEpochMs(raw.created_at);
      const updatedAt = toEpochMs(raw.updated_at ?? raw.created_at);
      const emailVerified = raw.email_confirmed_at != null ? 1 : 0;
      userInserts.push(
        `INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at) VALUES (${[
          sqlLiteral(raw.id),
          sqlLiteral(fullName),
          sqlLiteral(email),
          emailVerified,
          'NULL',
          createdAt,
          updatedAt,
        ].join(', ')});`,
      );
      existingIds.add(raw.id);
      existingEmails.add(email);
      seenEmails.add(email);
      importedIds.push(raw.id);
      if (!profileIds.has(raw.id)) missingProfiles.push(raw.id);
    }

    for (const identity of raw.identities ?? []) {
      if (identity.provider !== 'google') continue;
      const sub = identity.identity_data?.sub?.trim() ?? '';
      if (!sub) {
        skipped.push({ reason: 'google_sub_missing', id: raw.id });
        continue;
      }
      const key = `${GOOGLE_ISSUER}\0${sub}`;
      if (existingAccountKeys.has(key)) {
        skipped.push({ reason: 'google_account_exists', id: raw.id, detail: sub });
        continue;
      }
      if (!existingIds.has(raw.id)) continue;
      const createdAt = toEpochMs(raw.created_at);
      const updatedAt = toEpochMs(raw.updated_at ?? raw.created_at);
      accountInserts.push(
        `INSERT INTO account (id, issuer, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at) VALUES (${[
          sqlLiteral(randomUUID()),
          sqlLiteral(GOOGLE_ISSUER),
          sqlLiteral(sub),
          sqlLiteral('google'),
          sqlLiteral(raw.id),
          'NULL',
          'NULL',
          'NULL',
          'NULL',
          'NULL',
          'NULL',
          'NULL',
          createdAt,
          updatedAt,
        ].join(', ')});`,
      );
      existingAccountKeys.add(key);
      googleAccounts += 1;
    }
  }

  writeAndApply('000-user', userInserts);
  writeAndApply('001-account', accountInserts);

  const skipCounts = skipped.reduce<Record<string, number>>((acc, s) => {
    acc[s.reason] = (acc[s.reason] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    importedAt: new Date().toISOString(),
    target: resolvedTarget,
    db: DB_NAME,
    dryRun,
    pathTaken: 'no-password-migration: email users reset once; google users sign in via issuer https://accounts.google.com',
    exported: exported.length,
    importedUsers: importedIds.length,
    googleAccounts,
    skipped,
    skipCounts,
    missingProfiles: missingProfiles.length,
    missingProfileIds: missingProfiles,
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(
    join(OUT_DIR, `_import-auth-report-${resolvedTarget.replace('--', '')}-${stamp}.json`),
    JSON.stringify(report, null, 2),
  );

  console.log(`exported: ${exported.length}`);
  console.log(`imported users: ${importedIds.length}`);
  console.log(`google accounts: ${googleAccounts}`);
  console.log(`skipped: ${skipped.length}`);
  for (const s of skipped) {
    console.log(`  ${s.id} ${s.reason}`);
  }
  if (missingProfiles.length) {
    console.log(`missing profiles (imported user, no profiles row): ${missingProfiles.length}`);
    for (const id of missingProfiles) console.log(`  ${id}`);
  } else {
    console.log('missing profiles: 0');
  }
  console.log(dryRun ? 'dry run: SQL written, nothing executed' : 'import complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
