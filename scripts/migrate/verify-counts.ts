/**
 * Task 4.3: compare Supabase (live, read-only) with D1 per table: row count and a
 * sha256 checksum over the sorted primary keys.
 *
 * Run: npx tsx scripts/migrate/verify-counts.ts --local | --remote
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (loaded from the local env file)
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { orderedTables } from './tables';

loadEnv({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const args = process.argv.slice(2);
const targetArg = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null;
if (!targetArg) throw new Error('Pass --local or --remote');
const target: '--remote' | '--local' = targetArg;

const DB_NAME = 'usefulapply-db';
const PAGE = 1000;
// Natural keys for tables without a primary key column.
const NATURAL_KEYS: Record<string, string[]> = {
  serpapi_filter_tokens: ['country_code', 'filter_name', 'option_label'],
  user_search_strategies: ['user_id', 'settings_hash'],
};

const supabase = createClient(url, key, { auth: { persistSession: false } });

function checksum(keys: string[]): string {
  return createHash('sha256').update(keys.sort().join('\n')).digest('hex').slice(0, 16);
}

async function supabaseKeys(table: string, cols: string[]): Promise<string[]> {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(cols.join(',')).order(cols[0], { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) out.push(cols.map((c) => String(row[c])).join('|'));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function d1Keys(table: string, cols: string[]): string[] {
  const sql = `select ${cols.join(', ')} from ${table}`;
  const raw = execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, target, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const parsed = JSON.parse(raw) as Array<{ results: Record<string, unknown>[] }>;
  return parsed[0].results.map((row) => cols.map((c) => String(row[c])).join('|'));
}

async function main() {
  const rows: Array<{ table: string; supabase: number; d1: number; supabaseSum: string; d1Sum: string; match: 'ok' | 'MISMATCH' }> = [];
  for (const t of orderedTables()) {
    const cols = t.primaryKey.length ? t.primaryKey : NATURAL_KEYS[t.name];
    if (!cols) throw new Error(`No key columns for ${t.name}`);
    const [sKeys, dKeys] = [await supabaseKeys(t.name, cols), d1Keys(t.name, cols)];
    const sSum = checksum(sKeys);
    const dSum = checksum(dKeys);
    rows.push({ table: t.name, supabase: sKeys.length, d1: dKeys.length, supabaseSum: sSum, d1Sum: dSum, match: sKeys.length === dKeys.length && sSum === dSum ? 'ok' : 'MISMATCH' });
  }
  console.table(rows);
  const mismatches = rows.filter((r) => r.match !== 'ok');
  writeFileSync(join('scripts', 'migrate', 'out', `_verify-${target.replace('--', '')}.json`), JSON.stringify({ verifiedAt: new Date().toISOString(), target, rows }, null, 2));
  if (mismatches.length) {
    console.error(`MISMATCH in ${mismatches.map((m) => m.table).join(', ')}`);
    process.exit(1);
  }
  console.log(`all ${rows.length} tables match (${rows.reduce((a, r) => a + r.d1, 0)} rows)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
