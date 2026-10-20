import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { LOCAL_STATE_V3 } from './env';

/**
 * Open the preview's local D1 file directly. Used by the specs to seed rows the
 * product creates through email (verification) and to read the stored columns
 * back. Local sqlite only.
 */
export function openLocalD1(stateV3: string = LOCAL_STATE_V3): Database.Database {
  const dir = join(stateV3, 'd1', 'miniflare-D1DatabaseObject');
  if (!existsSync(dir)) throw new Error(`No local D1 at ${dir}. Run: npx wrangler d1 migrations apply usefulapply-db --local`);
  const files = readdirSync(dir).filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite');
  if (files.length !== 1) throw new Error(`Expected one local D1 sqlite file in ${dir}, found ${files.length}`);
  const db = new Database(join(dir, files[0]));
  db.pragma('busy_timeout = 10000');
  return db;
}
