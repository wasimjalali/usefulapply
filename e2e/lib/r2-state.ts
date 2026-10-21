import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { LOCAL_STATE_V3 } from './env';

/**
 * Make a stored R2 object look `ageMs` old, by rewriting its upload time in the preview's local R2 state.
 * A spec cannot wait ten minutes, and the avatar orphan sweep only deletes objects older than that.
 * Local sqlite only. Throws when no bucket holds the key.
 */
export function ageR2Object(key: string, ageMs: number): void {
  const dir = join(LOCAL_STATE_V3, 'r2', 'miniflare-R2BucketObject');
  if (!existsSync(dir)) throw new Error(`No local R2 at ${dir}`);
  const uploaded = Date.now() - ageMs;
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')) {
    const db = new Database(join(dir, file));
    try {
      db.pragma('busy_timeout = 10000');
      if (db.prepare('UPDATE _mf_objects SET uploaded = ? WHERE key = ?').run(uploaded, key).changes > 0) return;
    } finally {
      db.close();
    }
  }
  throw new Error(`No stored object with key ${key}`);
}
