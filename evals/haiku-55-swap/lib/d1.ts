/**
 * A D1Database over better-sqlite3, for the chat site. The shipped route, repos and tool handlers run
 * against a real SQLite database built from migrations/d1/*.sql, in a temp file that is deleted
 * afterwards. No mocks of the data layer, no wrangler, no network, and nothing that can reach the
 * local `.wrangler` state or any remote database.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { REPO_ROOT } from './core';

type Params = unknown[];

class Statement {
  constructor(
    private readonly db: Database.Database,
    readonly sql: string,
    private readonly params: Params = [],
  ) {}

  bind(...params: Params): Statement {
    return new Statement(this.db, this.sql, params);
  }

  /** Synchronous core, also used by batch(). */
  exec(): { success: true; results: unknown[]; meta: { changes: number; last_row_id: number } } {
    const stmt = this.db.prepare(this.sql);
    if (stmt.reader) return { success: true, results: stmt.all(...this.params), meta: { changes: 0, last_row_id: 0 } };
    const info = stmt.run(...this.params);
    return { success: true, results: [], meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
  }

  async run() {
    return this.exec();
  }

  async all() {
    return this.exec();
  }

  async first(column?: string) {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params) as Record<string, unknown> | undefined;
    if (row === undefined) return null;
    return column ? row[column] : row;
  }

  async raw() {
    return this.db.prepare(this.sql).raw().all(...this.params);
  }
}

export interface EvalDb {
  /** The D1 binding to hand to the product code. */
  d1: unknown;
  /** The same database, for seeding and assertions. */
  sqlite: Database.Database;
  close(): void;
}

export function openEvalDb(): EvalDb {
  const dir = mkdtempSync(join(tmpdir(), 'haiku-55-swap-d1-'));
  const sqlite = new Database(join(dir, 'eval.sqlite'));
  sqlite.pragma('foreign_keys = ON');
  const migrations = join(REPO_ROOT, 'migrations', 'd1');
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      sqlite.exec(readFileSync(join(migrations, file), 'utf8'));
    } catch (error) {
      throw new Error(`migration ${file} failed on the eval database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const d1 = {
    prepare: (sql: string) => new Statement(sqlite, sql),
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    batch: async (statements: Statement[]) => sqlite.transaction(() => statements.map((s) => s.exec()))(),
  };
  return {
    d1,
    sqlite,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
