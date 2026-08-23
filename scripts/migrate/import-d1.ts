/**
 * Task 4.3: transform the Supabase NDJSON export into SQLite rows and bulk
 * insert them into D1 via `wrangler d1 execute --file` in 500-row chunks.
 *
 * Run: npx tsx scripts/migrate/import-d1.ts --local | --remote --db <name> [--dry-run] [--reset]
 * --remote requires --db (staging usefulapply-db, production usefulapply-db-prod).
 * Requires: scripts/migrate/out/<table>.ndjson from export-supabase.ts, and the
 * D1 schema already applied (`wrangler d1 migrations apply usefulapply-db ...`).
 *
 * Transform rules (mirrors src/db/schema.ts):
 *   json/array columns -> JSON text, booleans -> 0/1, timestamps -> ISO 8601 with
 *   'Z' (Postgres emits '+00:00' and microseconds; the app writes toISOString(),
 *   and the repos compare timestamps as strings so both forms must match).
 * Rows whose FK parent is missing on the source side are skipped and written to
 * out/_orphans.ndjson; the counts are printed so nothing disappears silently.
 * subscription_plans / addon_credit_packs are replaced (0001_init.sql seeds them).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { orderedTables } from './tables';

const OUT_DIR = join('scripts', 'migrate', 'out');
const SQL_DIR = join(OUT_DIR, 'sql');
const CHUNK = 500;
const REPLACE_TABLES = new Set(['subscription_plans', 'addon_credit_packs']);
// D1 rejects statements over 100 KB (SQLITE_TOOBIG). Raw SerpAPI payloads are the
// only rows that can get there; the cleanup cron already redacts them the same way.
const MAX_STATEMENT_BYTES = 95_000;
const REDACTED_PAYLOAD = JSON.stringify({ redacted: true });
// Source column renames: Postgres name -> D1 name.
const COLUMN_RENAMES: Record<string, Record<string, string>> = {
  webhook_events: { processed_at: 'created_at' },
};

const args = process.argv.slice(2);
let targetArg: '--remote' | '--local' | null = null;
let dbName: string | null = null;
let dryRun = false;
let reset = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--local' || arg === '--remote') {
    if (targetArg && targetArg !== arg) throw new Error('Pass only one of --local or --remote');
    targetArg = arg;
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
  if (arg === '--reset') {
    reset = true;
    continue;
  }
  throw new Error(`Unrecognised flag: ${arg}`);
}
if (!targetArg) throw new Error('Pass --local or --remote');
if (targetArg === '--remote' && !dbName) {
  throw new Error('--remote requires --db <name> (staging usefulapply-db, production usefulapply-db-prod)');
}
const target: '--remote' | '--local' = targetArg;
const DB_NAME = dbName ?? 'usefulapply-db';

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:?\d{2}|Z)?$/;

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function transformValue(kind: string, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case 'SQLiteTextJson':
      return JSON.stringify(value);
    case 'SQLiteBoolean':
      return value ? 1 : 0;
    case 'SQLiteInteger':
    case 'SQLiteReal': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw new Error(`Non-numeric value for ${column}: ${String(value)}`);
      return n;
    }
    case 'SQLiteText': {
      if (typeof value === 'string' && ISO_DATETIME.test(value)) {
        return new Date(value).toISOString();
      }
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
    default:
      throw new Error(`Unhandled column kind ${kind} for ${column}`);
  }
}

function readRows(table: string): Record<string, unknown>[] {
  const file = join(OUT_DIR, `${table}.ndjson`);
  if (!existsSync(file)) throw new Error(`Missing export ${file}. Run export-supabase.ts first.`);
  const text = readFileSync(file, 'utf8');
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

function runFile(file: string) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, target, '--file', file], { stdio: ['ignore', 'inherit', 'inherit'] });
}

function runCommand(command: string) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, target, '--command', command], { stdio: ['ignore', 'inherit', 'inherit'] });
}

async function main() {
  rmSync(SQL_DIR, { recursive: true, force: true });
  mkdirSync(SQL_DIR, { recursive: true });
  if (reset && !dryRun) {
    // Children first so FKs never block the delete.
    const tables = orderedTables().map((t) => t.name).reverse();
    console.log(`--reset: clearing ${tables.length} tables on ${target}`);
    runCommand(tables.map((n) => `DELETE FROM ${n};`).join(' '));
  }
  const keptKeys = new Map<string, Set<string>>(); // table -> set of "column=value" kept
  const orphanLines: string[] = [];
  const report: Record<string, { source: number; inserted: number; orphans: number; droppedColumns: string[] }> = {};
  let fileIndex = 0;
  let redactedPayloads = 0;

  for (const t of orderedTables()) {
    const rows = readRows(t.name);
    const schemaCols = new Map(t.columns.map((c) => [c.name, c]));
    const dropped = new Set<string>();
    const kept: Record<string, unknown>[] = [];
    let orphans = 0;

    for (const row of rows) {
      // Orphan check against kept parent keys.
      let orphan = false;
      for (const fk of t.foreignKeys) {
        const v = row[fk.column];
        if (v === null || v === undefined) continue;
        const parentSet = keptKeys.get(`${fk.parentTable}.${fk.parentColumn}`);
        if (!parentSet || !parentSet.has(String(v))) {
          orphan = true;
          orphanLines.push(JSON.stringify({ table: t.name, missing: `${fk.parentTable}.${fk.parentColumn}=${String(v)}`, row }));
          break;
        }
      }
      if (orphan) { orphans++; continue; }

      const out: Record<string, unknown> = {};
      const renames = COLUMN_RENAMES[t.name] ?? {};
      for (const [sourceCol, value] of Object.entries(row)) {
        const col = renames[sourceCol] ?? sourceCol;
        const meta = schemaCols.get(col);
        if (!meta) { dropped.add(col); continue; }
        out[col] = transformValue(meta.kind, `${t.name}.${col}`, value);
      }
      for (const c of t.columns) {
        if (!(c.name in out) && c.notNull && !c.hasDefault) {
          throw new Error(`${t.name}: NOT NULL column ${c.name} missing from source and has no default`);
        }
      }
      kept.push(out);
    }

    // Register keys for children (PK columns and any column referenced by a child FK).
    for (const c of t.columns) {
      const set = new Set<string>();
      for (const r of kept) if (r[c.name] !== null && r[c.name] !== undefined) set.add(String(r[c.name]));
      keptKeys.set(`${t.name}.${c.name}`, set);
    }

    report[t.name] = { source: rows.length, inserted: kept.length, orphans, droppedColumns: [...dropped] };

    if (kept.length === 0 && !REPLACE_TABLES.has(t.name)) continue;
    const cols = t.columns.map((c) => c.name).filter((c) => kept.some((r) => c in r));
    for (let i = 0; i < Math.max(kept.length, 1); i += CHUNK) {
      const chunk = kept.slice(i, i + CHUNK);
      const statements: string[] = [];
      if (i === 0 && REPLACE_TABLES.has(t.name)) statements.push(`DELETE FROM ${t.name};`);
      for (const r of chunk) {
        let statement = `INSERT INTO ${t.name} (${cols.join(', ')}) VALUES (${cols.map((c) => sqlLiteral(r[c])).join(', ')});`;
        if (Buffer.byteLength(statement) > MAX_STATEMENT_BYTES && t.name === 'job_feed_raw_fetches') {
          r.response_payload = REDACTED_PAYLOAD;
          redactedPayloads++;
          statement = `INSERT INTO ${t.name} (${cols.join(', ')}) VALUES (${cols.map((c) => sqlLiteral(r[c])).join(', ')});`;
        }
        if (Buffer.byteLength(statement) > MAX_STATEMENT_BYTES) {
          throw new Error(`${t.name} row ${String(r[t.primaryKey[0] ?? cols[0]])} is ${Buffer.byteLength(statement)} bytes, over the D1 statement cap`);
        }
        statements.push(statement);
      }
      const file = join(SQL_DIR, `${String(fileIndex++).padStart(3, '0')}-${t.name}-${i / CHUNK}.sql`);
      writeFileSync(file, statements.join('\n') + '\n');
      if (!dryRun) {
        console.log(`applying ${file} (${chunk.length} rows)`);
        runFile(file);
      }
    }
  }

  writeFileSync(join(OUT_DIR, '_orphans.ndjson'), orphanLines.join('\n') + (orphanLines.length ? '\n' : ''));
  writeFileSync(join(OUT_DIR, `_import-report-${target.replace('--', '')}.json`), JSON.stringify({ importedAt: new Date().toISOString(), target, dryRun, tables: report }, null, 2));
  console.table(Object.entries(report).map(([table, r]) => ({ table, source: r.source, inserted: r.inserted, orphans: r.orphans, droppedColumns: r.droppedColumns.join(',') })));
  if (redactedPayloads > 0) console.log(`job_feed_raw_fetches: ${redactedPayloads} oversized response_payload(s) redacted to {"redacted":true}`);
  console.log(dryRun ? 'dry run: SQL written, nothing executed' : 'import complete');
}

main().catch((e) => { console.error(e); process.exit(1); });
