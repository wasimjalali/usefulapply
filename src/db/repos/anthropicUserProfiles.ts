import { and, eq } from 'drizzle-orm';
import { getDb, nowIso } from '../client';
import { anthropicUserProfiles } from '../schema';

/**
 * Our user id -> the Anthropic user profile id (`uprof_...`). Every query is scoped to one user_id, so one user's
 * call can never read or change another user's mapping.
 */

export async function getAnthropicUserProfileId(userId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ profileId: anthropicUserProfiles.profile_id })
    .from(anthropicUserProfiles)
    .where(eq(anthropicUserProfiles.user_id, userId))
    .limit(1);
  return rows[0]?.profileId ?? null;
}

/**
 * Store `profileId` for the user unless a row is already there, then return the stored id. When it differs from
 * `profileId`, another caller won the race and the caller must delete its own profile at Anthropic.
 * Throws when the row cannot be written (no profiles row for the user, or the id is not a `uprof_` id).
 */
export async function claimAnthropicUserProfileId(userId: string, profileId: string): Promise<string> {
  const db = await getDb();
  await db
    .insert(anthropicUserProfiles)
    .values({ user_id: userId, profile_id: profileId, created_at: nowIso() })
    .onConflictDoNothing({ target: anthropicUserProfiles.user_id });
  const stored = await getAnthropicUserProfileId(userId);
  if (!stored) throw new Error(`anthropic_user_profiles: no row for user ${userId} after the insert`);
  return stored;
}

/** Delete the user's mapping; with `profileId`, only while it still holds that id. Returns the rows deleted. */
export async function deleteAnthropicUserProfileRow(userId: string, profileId?: string): Promise<number> {
  const db = await getDb();
  const where = profileId
    ? and(eq(anthropicUserProfiles.user_id, userId), eq(anthropicUserProfiles.profile_id, profileId))
    : eq(anthropicUserProfiles.user_id, userId);
  const deleted = await db.delete(anthropicUserProfiles).where(where).returning({ userId: anthropicUserProfiles.user_id });
  return deleted.length;
}
