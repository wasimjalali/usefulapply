/**
 * Shared table metadata for the Supabase -> D1 migration scripts. Everything is
 * derived from src/db/schema.ts so column types and FK order stay in one place.
 */
import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../../src/db/schema';

export interface ColumnMeta {
  name: string;
  /** Drizzle column type: SQLiteText | SQLiteTextJson | SQLiteInteger | SQLiteBoolean | SQLiteReal | ... */
  kind: string;
  notNull: boolean;
  hasDefault: boolean;
}

export interface TableMeta {
  name: string;
  table: SQLiteTable;
  columns: ColumnMeta[];
  primaryKey: string[];
  /** Table names this table references (FK parents). */
  parents: string[];
  /** child column -> parent table + column, for orphan detection. */
  foreignKeys: Array<{ column: string; parentTable: string; parentColumn: string }>;
}

function buildMeta(): TableMeta[] {
  const tables: TableMeta[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue;
    const config = getTableConfig(value);
    const columns: ColumnMeta[] = config.columns.map((c) => ({
      name: c.name,
      kind: c.columnType,
      notNull: c.notNull,
      hasDefault: c.hasDefault || c.defaultFn !== undefined,
    }));
    const pkFromColumns = config.columns.filter((c) => c.primary).map((c) => c.name);
    const pkFromComposite = config.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name));
    const parents = new Set<string>();
    const foreignKeys: TableMeta['foreignKeys'] = [];
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      const parentTable = getTableName(ref.foreignTable);
      parents.add(parentTable);
      ref.columns.forEach((col, i) => {
        foreignKeys.push({ column: col.name, parentTable, parentColumn: ref.foreignColumns[i].name });
      });
    }
    tables.push({
      name: config.name,
      table: value,
      columns,
      primaryKey: pkFromColumns.length ? pkFromColumns : pkFromComposite,
      parents: [...parents].filter((p) => p !== config.name),
      foreignKeys,
    });
  }
  return tables;
}

/** Tables in FK-safe insert order (parents before children). */
export function orderedTables(): TableMeta[] {
  const all = buildMeta();
  const byName = new Map(all.map((t) => [t.name, t]));
  const done = new Set<string>();
  const out: TableMeta[] = [];
  const visit = (t: TableMeta, stack: string[]) => {
    if (done.has(t.name)) return;
    if (stack.includes(t.name)) throw new Error(`FK cycle: ${[...stack, t.name].join(' -> ')}`);
    for (const p of t.parents) {
      const parent = byName.get(p);
      if (!parent) throw new Error(`Unknown FK parent ${p} for ${t.name}`);
      visit(parent, [...stack, t.name]);
    }
    done.add(t.name);
    out.push(t);
  };
  for (const t of all) visit(t, []);
  return out;
}

if (process.argv[1]?.endsWith('tables.ts')) {
  for (const t of orderedTables()) {
    console.log(`${t.name}  pk=[${t.primaryKey.join(',')}]  parents=[${t.parents.join(',')}]`);
    for (const c of t.columns) console.log(`    ${c.name}: ${c.kind}${c.notNull ? ' NOT NULL' : ''}${c.hasDefault ? ' default' : ''}`);
  }
}
