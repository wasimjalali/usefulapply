import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { SQL } from 'drizzle-orm';
import { drizzle, type AnyD1Database, type DrizzleD1Database } from 'drizzle-orm/d1';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

export type Database = DrizzleD1Database<typeof schema>;

let cached: Database | null = null;
let cachedBinding: AnyD1Database | null = null;

/**
 * Drizzle bound to the Workers D1 binding `DB`.
 *
 * Available under `next dev` (OpenNext `initOpenNextCloudflareForDev`) and
 * `opennextjs-cloudflare preview`. If this throws, the process is not
 * running with wrangler bindings. Do not fall back to Supabase for data.
 */
export async function getDb(): Promise<Database> {
  const binding = await getDbBinding();
  if (cached && cachedBinding === binding) {
    return cached;
  }
  cached = drizzle(binding, { schema });
  cachedBinding = binding;
  return cached;
}

export async function getDbBinding(): Promise<AnyD1Database> {
  let env: { DB?: AnyD1Database };
  try {
    ({ env } = await getCloudflareContext({ async: true }) as { env: { DB?: AnyD1Database } });
  } catch {
    throw new Error(
      '[db] D1 binding is unavailable. Run `npm run dev` (OpenNext wrangler bindings) or `npx opennextjs-cloudflare preview`. Plain Next without wrangler cannot reach D1.',
    );
  }
  if (!env.DB) {
    throw new Error('[db] env.DB is missing. Bind usefulapply-db as DB in wrangler.jsonc.');
  }
  return env.DB;
}

export function nowIso(): string {
  return new Date().toISOString();
}

const dialect = new SQLiteAsyncDialect();

export interface BatchStatementResult {
  success: boolean;
  meta: { changes: number };
}

/**
 * Atomic multi-statement write on the raw D1 binding.
 *
 * `db.batch([db.run(sql\`...\`)])` throws in drizzle-orm 0.45.x because a raw
 * `db.run()` has no prepared statement to bind, so OCC writes that pair an
 * UPDATE with a ledger INSERT go through here instead. Each result carries
 * `meta.changes` for the changes() gate.
 */
export async function runBatch(statements: SQL[]): Promise<BatchStatementResult[]> {
  const binding = await getDbBinding();
  const prepared = statements.map((statement) => {
    const query = dialect.sqlToQuery(statement);
    return binding.prepare(query.sql).bind(...query.params);
  });
  const results = await binding.batch(prepared);
  return results.map((result: { success: boolean; meta: { changes: number } }) => ({
    success: result.success,
    meta: { changes: result.meta.changes },
  }));
}

/**
 * True when the error (or anything in its `cause` chain) is a SQLite unique or
 * primary key violation. Drizzle wraps driver errors in DrizzleQueryError, so
 * the SQLite text lives on `cause`, not on the top-level message.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const message = current instanceof Error ? current.message : String(current);
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_PRIMARYKEY|SQLITE_CONSTRAINT_UNIQUE/i.test(message)) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

/** D1 caps a statement at 100 bound parameters. Split value lists to stay under it. */
export const D1_MAX_PARAMS = 100;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Drop identity/ownership keys from a partial before spreading it into `.set()` or `.values()`. */
export function stripIdentity<T extends Record<string, unknown>>(values: T): Omit<T, 'id' | 'user_id' | 'created_at'> {
  const rest: Record<string, unknown> = { ...values };
  delete rest.id;
  delete rest.user_id;
  delete rest.created_at;
  return rest as Omit<T, 'id' | 'user_id' | 'created_at'>;
}
