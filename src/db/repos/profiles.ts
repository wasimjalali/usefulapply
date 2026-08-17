import { and, eq, isNull } from 'drizzle-orm';
import { getDb, nowIso } from '../client';
import { profiles } from '../schema';
import type { Profile } from '@/lib/supabase/types';

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = await getDb();
  const rows = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return (rows[0] as Profile | undefined) ?? null;
}

export async function createProfile(
  userId: string,
  email: string,
  extras?: Partial<Pick<Profile, 'full_name'>>,
): Promise<Profile> {
  const db = await getDb();
  const now = nowIso();
  await db.insert(profiles).values({
    id: userId,
    email,
    full_name: extras?.full_name ?? null,
    created_at: now,
    updated_at: now,
    job_searches_reset_at: now,
  });
  const created = await getProfile(userId);
  if (!created) {
    throw new Error('Failed to create profile');
  }
  return created;
}

export async function getOrCreateProfile(userId: string, email: string): Promise<Profile> {
  const existing = await getProfile(userId);
  if (existing) return existing;
  try {
    return await createProfile(userId, email);
  } catch {
    const raced = await getProfile(userId);
    if (raced) return raced;
    throw new Error('Failed to create profile');
  }
}

export async function updateProfile(
  userId: string,
  updates: Partial<Omit<Profile, 'id' | 'created_at'>>,
): Promise<Profile> {
  const db = await getDb();
  const rest = { ...updates };
  await db
    .update(profiles)
    .set({ ...rest, updated_at: nowIso() })
    .where(eq(profiles.id, userId));
  const updated = await getProfile(userId);
  if (!updated) {
    throw new Error('Profile not found');
  }
  return updated;
}

/**
 * CAS claim of the welcome send. Only succeeds when welcome_sent_at is still
 * null, so concurrent /auth/callback hits collapse into one send.
 */
export async function claimWelcomeSend(userId: string, sentAt: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .update(profiles)
    .set({ welcome_sent_at: sentAt, updated_at: nowIso() })
    .where(and(eq(profiles.id, userId), isNull(profiles.welcome_sent_at)))
    .returning({ id: profiles.id });
  return result.length > 0;
}

/** Signup: guarantee the profile row exists (service-role upsert in the old code). */
export async function upsertProfileOnSignup(userId: string, email: string, fullName: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db
    .insert(profiles)
    .values({ id: userId, email, full_name: fullName, created_at: now, updated_at: now, job_searches_reset_at: now })
    .onConflictDoUpdate({ target: profiles.id, set: { email, full_name: fullName, updated_at: now } });
}
