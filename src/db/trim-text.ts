/**
 * One trim rule for comparing stored text in JS and in SQL: only space, tab,
 * LF and CR are stripped, at both ends. JS String.prototype.trim() also strips
 * NBSP, BOM and other Unicode spaces while SQLite's trim(x, set) strips only
 * the set it is given, so mixing the two made a job description with a
 * leading NBSP or BOM look "changed" on every write. Use these two together.
 */

import { sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export function trimStoredText(value: string | null | undefined): string {
  return (value ?? '').replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');
}

/** The narrow-trimmed text, or '' when nothing but whitespace (any kind) is left. */
export function storedTextOrEmpty(value: string | null | undefined): string {
  return value?.trim() ? trimStoredText(value) : '';
}

/** Same stored text under the narrow trim, as the SQL side compares it. */
export function isSameStoredText(a: string | null | undefined, b: string | null | undefined): boolean {
  return trimStoredText(a) === trimStoredText(b);
}

export function sqlTrimStoredText(column: AnySQLiteColumn): SQL {
  return sql`trim(${column}, ' ' || char(9) || char(10) || char(13))`;
}
