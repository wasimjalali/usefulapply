import { eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { anonymousGenerations } from '../schema';

// Not user-scoped: anonymous visitors are keyed by a hashed IP. Only the
// agent-v2 route uses this to grant one free generation per IP every 30 days.

export async function claimAnonymousGeneration(ipHash: string): Promise<boolean> {
  const db = await getDb();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.run(sql`
    INSERT OR REPLACE INTO anonymous_generations (id, ip_hash, generated_at)
    SELECT ${crypto.randomUUID()}, ${ipHash}, ${now}
    WHERE NOT EXISTS (
      SELECT 1
      FROM anonymous_generations
      WHERE ip_hash = ${ipHash} AND generated_at >= ${cutoff}
    )
  `);
  return result.meta.changes === 1;
}

export async function releaseAnonymousGeneration(ipHash: string): Promise<void> {
  const db = await getDb();
  await db.delete(anonymousGenerations).where(eq(anonymousGenerations.ip_hash, ipHash));
}
