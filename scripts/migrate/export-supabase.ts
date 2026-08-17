/**
 * Task 4.3: export every app table from Supabase (read-only, service role) to
 * NDJSON files in scripts/migrate/out/<table>.ndjson.
 *
 * Run: npx tsx scripts/migrate/export-supabase.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (loaded from the local env file)
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { orderedTables } from './tables';

loadEnv({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const OUT_DIR = join('scripts', 'migrate', 'out');
const PAGE = 1000;

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function exportTable(name: string, orderBy: string): Promise<{ rows: number; missing?: boolean }> {
  const lines: string[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(name)
      .select('*')
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
        return { rows: 0, missing: true };
      }
      throw new Error(`[${name}] ${error.message}`);
    }
    for (const row of data ?? []) lines.push(JSON.stringify(row));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  writeFileSync(join(OUT_DIR, `${name}.ndjson`), lines.length ? lines.join('\n') + '\n' : '');
  return { rows: lines.length };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const summary: Record<string, number | 'MISSING_IN_SUPABASE'> = {};
  for (const t of orderedTables()) {
    // Stable pagination: order by the first PK column, else a natural key.
    const orderBy = t.primaryKey[0]
      ?? (t.name === 'serpapi_filter_tokens' ? 'country_code' : t.name === 'user_search_strategies' ? 'user_id' : 'created_at');
    const result = await exportTable(t.name, orderBy);
    summary[t.name] = result.missing ? 'MISSING_IN_SUPABASE' : result.rows;
    console.log(`${t.name}: ${summary[t.name]}`);
  }
  writeFileSync(join(OUT_DIR, '_export-summary.json'), JSON.stringify({ exportedAt: new Date().toISOString(), tables: summary }, null, 2));
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
