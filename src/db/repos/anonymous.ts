import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { anonymousGenerations } from '../schema';

// Not user-scoped: anonymous visitors are keyed by a hashed IP. Only the
// agent-v2 route uses this to grant a single free generation per IP.

export async function hasAnonymousGeneration(ipHash: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: anonymousGenerations.id })
    .from(anonymousGenerations)
    .where(eq(anonymousGenerations.ip_hash, ipHash))
    .limit(1);
  return rows.length > 0;
}

export async function recordAnonymousGeneration(ipHash: string): Promise<void> {
  const db = await getDb();
  await db.insert(anonymousGenerations).values({ ip_hash: ipHash });
}
