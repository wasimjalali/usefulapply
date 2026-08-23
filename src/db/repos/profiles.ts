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

export async function getOrCreateProfile(
  userId: string,
  email: string,
  extras?: Partial<Pick<Profile, 'full_name'>>,
): Promise<Profile> {
  const existing = await getProfile(userId);
  if (existing) return existing;
  try {
    return await createProfile(userId, email, extras);
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

/**
 * CAS claim of the Day 3 check-in. Only succeeds when check_in_sent_at is
 * still null, so two cron runs collapse into one send.
 */
/** Undo a check-in claim whose send failed. Scoped to this run's timestamp. */
export async function releaseCheckInClaim(userId: string, sentAt: string): Promise<void> {
  const db = await getDb();
  await db
    .update(profiles)
    .set({ check_in_sent_at: null, updated_at: nowIso() })
    .where(and(eq(profiles.id, userId), eq(profiles.check_in_sent_at, sentAt)));
}

export async function claimCheckInSend(userId: string, sentAt: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .update(profiles)
    .set({ check_in_sent_at: sentAt, updated_at: nowIso() })
    .where(and(eq(profiles.id, userId), isNull(profiles.check_in_sent_at)))
    .returning({ id: profiles.id });
  return result.length > 0;
}

/**
 * Resend fields live on profiles but are not on the generated Profile type.
 * Used by the verification-email hook to pick reminder copy (Better Auth 1.7
 * sendVerificationEmail body is only { email, callbackURL }).
 */
export async function getConfirmationResendMeta(userId: string): Promise<{
  confirmation_resend_count: number;
  last_confirmation_resend_at: string | null;
} | null> {
  const db = await getDb();
  const rows = await db
    .select({
      confirmation_resend_count: profiles.confirmation_resend_count,
      last_confirmation_resend_at: profiles.last_confirmation_resend_at,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return rows[0] ?? null;
}
