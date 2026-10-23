/**
 * Profile service: contact details, notification settings and the one profile photo.
 *
 * Shared by the web (server actions and /api/files/upload) and the MCP tools, so a
 * change made by an agent is stored exactly as the settings pages would store it.
 * Ownership comes from `userId`, never from the input.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { getDb, nowIso } from '@/db/client';
import * as profilesRepo from '@/db/repos/profiles';
import { profiles } from '@/db/schema';
import { deleteObject, deletePrefix, getFilesBucket, listPrefix, putObject, USER_STORAGE_QUOTA_BYTES, userStorageBytes } from '@/storage/r2';
import { ImagesBindingUnavailableError, normalizePhotoToJpeg } from '@/storage/images';
import {
  ALLOWED_FILE_BUCKETS,
  PHOTO_BUCKETS,
  storedFileKey,
  userOwnsKey,
  userPrefix,
  type AllowedFileBucket,
} from '@/storage/paths';
import type { Profile } from '@/db/types';
import { normalizeLogisticsUpdate, touchesLogistics, type LogisticsPatch } from '@/lib/profile/logistics';
import { InvalidInputError } from './errors';

// Columns a signed-in user may edit about themselves. Entitlement and
// bookkeeping columns (subscription_tier, subscription_status, job_searches_*,
// welcome_sent_at, check_in_sent_at, confirmation resend fields, email) are written only by
// trusted server paths (Stripe webhook, cron, auth routes), never from here.
export const USER_EDITABLE_PROFILE_FIELDS = [
  'full_name',
  'phone',
  'location',
  'avatar_url',
  'linkedin_url',
  'github_url',
  'portfolio_url',
  'website_url',
  'date_of_birth',
  'nationality',
  'notify_marketing',
  'notify_feed_ready',
  'notify_follow_up_due',
  'notify_interview_tomorrow',
  'notify_credits_low',
  'hide_rejected',
  'timezone',
  'date_format',
  'job_feed_last_seen_run_date',
  // The applicant's own start date and salary expectation. Validated by normalizeLogisticsUpdate;
  // availability_asked_at is never accepted from a caller, the server stamps it (see below).
  'availability',
  'availability_note',
  'salary_expectation',
] as const;
export type UserEditableProfile = Pick<Profile, (typeof USER_EDITABLE_PROFILE_FIELDS)[number]>;

/** What an update may carry: the columns above, plus camelCase aliases for the two logistics text fields (the MCP tool's names). */
export type ProfileUpdateInput = Partial<UserEditableProfile> & {
  availabilityNote?: string | null;
  salaryExpectation?: string | null;
};

const LOGISTICS_COLUMNS = ['availability', 'availability_note', 'salary_expectation'] as const;
const LOGISTICS_ALIASES = ['availabilityNote', 'salaryExpectation'] as const;
// Input key (camelCase, what normalizeLogisticsUpdate reads) -> stored column.
const LOGISTICS_INPUT_TO_COLUMN = {
  availability: 'availability',
  availabilityNote: 'availability_note',
  salaryExpectation: 'salary_expectation',
} as const;

// Caps on the existing free-text fields, the same numbers the MCP update_profile tool enforces.
const FIELD_MAX_LENGTH: Partial<Record<(typeof USER_EDITABLE_PROFILE_FIELDS)[number], number>> = {
  full_name: 200,
  phone: 50,
  location: 200,
  linkedin_url: 300,
  github_url: 300,
  portfolio_url: 300,
  website_url: 300,
  date_of_birth: 32,
  nationality: 100,
};

const DATE_FORMATS = ['dmy', 'mdy', 'iso'];

/** A bad timezone would throw inside Intl later, so it never gets stored. */
function isKnownTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Only a key in this user's avatars prefix (or its leftover Supabase URL) may be stored. */
function ownedAvatarKey(userId: string, value: string): string {
  const key = storedFileKey(value);
  if (!key || !key.startsWith('avatars/') || !userOwnsKey(key, userId)) {
    throw new InvalidInputError('Invalid avatar');
  }
  return key;
}

/**
 * Reads the start date and salary expectation out of an update (column names or camelCase
 * aliases; an undefined value means "not given", not "clear") and validates them.
 */
function logisticsPatchFrom(updates: Record<string, unknown>): LogisticsPatch {
  const input: Record<string, unknown> = {};
  for (const [inputKey, column] of Object.entries(LOGISTICS_INPUT_TO_COLUMN)) {
    const viaAlias = updates[inputKey] !== undefined;
    const viaColumn = inputKey !== column && updates[column] !== undefined;
    if (viaAlias && viaColumn) throw new InvalidInputError(`Give ${inputKey} or ${column}, not both.`);
    if (viaAlias) input[inputKey] = updates[inputKey];
    else if (viaColumn) input[inputKey] = updates[column];
  }
  return normalizeLogisticsUpdate(input);
}

/**
 * Validates an update and returns exactly what may be written: the whitelisted columns, the
 * normalised logistics fields, and availability_asked_at stamped (server time) whenever the update
 * touches the start date or salary, so a skip (availability: null) is remembered. Pure apart from
 * the clock, which `now` replaces in tests.
 */
export function prepareProfileWrite(userId: string, updates: ProfileUpdateInput, now: string = nowIso()): Partial<Profile> {
  const raw = updates as Record<string, unknown>;
  if (typeof updates.timezone === 'string' && !isKnownTimezone(updates.timezone)) {
    throw new InvalidInputError('Unknown timezone');
  }
  if (typeof updates.date_format === 'string' && !DATE_FORMATS.includes(updates.date_format)) {
    throw new InvalidInputError('Unknown date format');
  }
  const allowed: readonly string[] = [...USER_EDITABLE_PROFILE_FIELDS, ...LOGISTICS_ALIASES];
  const rejected = Object.keys(updates).filter((k) => !allowed.includes(k));
  if (rejected.length > 0) {
    throw new InvalidInputError(`Forbidden profile fields: ${rejected.join(', ')}`);
  }
  const logistics = logisticsPatchFrom(raw);
  const safe: Partial<Profile> = {};
  for (const key of USER_EDITABLE_PROFILE_FIELDS) {
    if ((LOGISTICS_COLUMNS as readonly string[]).includes(key)) continue;
    if (key in updates) {
      (safe as Record<string, unknown>)[key] = raw[key];
      const max = FIELD_MAX_LENGTH[key];
      const value = raw[key];
      if (max !== undefined && typeof value === 'string' && value.length > max) {
        throw new InvalidInputError(`${key.replace(/_/g, ' ')} can be at most ${max} characters.`);
      }
    }
  }
  if (typeof safe.avatar_url === 'string') safe.avatar_url = ownedAvatarKey(userId, safe.avatar_url);
  Object.assign(safe, logistics);
  // A new start-date choice must not keep the old choice's note ("3 Monate zum Quartalsende" next to
  // "In 1 month"). Only "Other" keeps a stored note, and only when the update doesn't give one.
  if ('availability' in logistics && logistics.availability !== 'other' && !('availability_note' in logistics)) {
    safe.availability_note = null;
  }
  if (touchesLogistics(logistics)) safe.availability_asked_at = now;
  return safe;
}

export async function updateUserProfile(userId: string, updates: ProfileUpdateInput): Promise<Profile> {
  return profilesRepo.updateProfile(userId, prepareProfileWrite(userId, updates));
}

// ---------------------------------------------------------------------------
// Uploads (the part of /api/files/upload after the request is validated)
// ---------------------------------------------------------------------------

/** The user's stored files would pass the storage quota. */
export class StorageQuotaError extends Error {}

/** The bytes are not an image the converter can decode. */
export class PhotoUnprocessableError extends Error {}

/** Photos re-encode to a small JPEG, so a large original counts as at most this against the quota. */
const PHOTO_STORED_CEILING = 512 * 1024;

function fallbackContentType(ext: string): string {
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.txt':
      return 'text/plain';
    case '.md':
      return 'text/markdown';
    case '.tex':
      return 'application/x-tex';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Store one already-validated upload under `<bucket>/<userId>[/<subpath>]/<uuid><ext>` and
 * return the key. Quota runs before the paid conversion so an over-quota account never burns a
 * transformation. Photos are decoded (HEIC from iPhones included), scaled down and re-encoded
 * as JPEG so every stored photo is browser-renderable.
 */
export async function storeUserUpload(
  userId: string,
  upload: { bucket: AllowedFileBucket; subpath: string; file: File; ext: string },
): Promise<string> {
  const { bucket, subpath, file, ext } = upload;
  const isPhoto = PHOTO_BUCKETS.has(bucket);

  const effectiveSize = isPhoto ? Math.min(file.size, PHOTO_STORED_CEILING) : file.size;
  const used = await userStorageBytes(userId, ALLOWED_FILE_BUCKETS);
  if (used + effectiveSize > USER_STORAGE_QUOTA_BYTES) throw new StorageQuotaError();

  const contentType = (file.type || '').toLowerCase();
  let body: ArrayBuffer | File = file;
  let storedExt = ext;
  let storedContentType = contentType || fallbackContentType(ext);
  if (isPhoto) {
    try {
      body = await normalizePhotoToJpeg(file.stream());
      storedExt = '.jpg';
      storedContentType = 'image/jpeg';
    } catch (error) {
      console.error('[files/upload] photo conversion failed:', error);
      // A missing binding is a configuration outage, not the user's file: let it surface as it is.
      if (error instanceof ImagesBindingUnavailableError) throw error;
      throw new PhotoUnprocessableError();
    }
  }

  const fileName = `${crypto.randomUUID()}${storedExt}`;
  const parts: string[] = [bucket, userId];
  if (subpath) parts.push(subpath);
  parts.push(fileName);
  const key = parts.join('/');

  // profile-photos has no D1 reference (the newest object under the prefix is
  // the photo), so replace in place: list what exists, write, then remove the
  // old objects. Avatars are referenced by profiles.avatar_url and are cleaned
  // up by the caller after that row is saved.
  const previous = bucket === 'profile-photos' ? await listPrefix(`${bucket}/${userId}/`) : [];

  await putObject(key, body, { contentType: storedContentType });

  if (previous.length > 0) {
    try {
      for (const object of previous) {
        if (object.key !== key) await deleteObject(object.key);
      }
    } catch (error) {
      // The new object is stored; leftover old objects are housekeeping, not a failed upload.
      console.error('[files/upload] failed to remove previous profile photo:', error);
    }
  }
  return key;
}

// ---------------------------------------------------------------------------
// The one profile photo (avatar = CV photo; the profile-photos bucket is legacy)
// ---------------------------------------------------------------------------

export async function hasProfilePhoto(userId: string): Promise<boolean> {
  const profile = await profilesRepo.getProfile(userId);
  if (profile?.avatar_url) return true;
  return (await listPrefix(userPrefix('profile-photos', userId))).length > 0;
}

const AVATAR_SWAP_ATTEMPTS = 5;

/** An avatar younger than this may be an upload that is stored but not linked yet, so the sweep leaves it. */
const AVATAR_ORPHAN_GRACE_MS = 10 * 60 * 1000;

/**
 * Point avatar_url at `next` (a key, or null to unlink) and return the value it replaced. Compare-and-swap,
 * so concurrent changes each act on exactly the value they displaced and never delete one the other has
 * stored but not yet linked.
 */
async function swapAvatar(userId: string, next: string | null): Promise<string | null> {
  const db = await getDb();
  for (let attempt = 0; attempt < AVATAR_SWAP_ATTEMPTS; attempt++) {
    const profile = await profilesRepo.getProfile(userId);
    if (!profile) throw new Error('Profile not found');
    const previous = profile.avatar_url ?? null;
    const swapped = await db
      .update(profiles)
      .set({ avatar_url: next, updated_at: nowIso() })
      .where(and(eq(profiles.id, userId), previous === null ? isNull(profiles.avatar_url) : eq(profiles.avatar_url, previous)))
      .returning({ id: profiles.id });
    if (swapped.length > 0) return previous;
  }
  throw new Error('The profile photo changed too often to save');
}

/** The R2 key a stored avatar value points at (leftover Supabase URL included), when it is this user's. */
function ownedStoredKey(userId: string, stored: string | null): string | null {
  const key = stored ? storedFileKey(stored) : null;
  return key && userOwnsKey(key, userId) ? key : null;
}

/**
 * Delete avatar objects that are not the current photo and are old enough not to be an upload in flight:
 * leftovers from an upload whose link failed or an earlier failed delete.
 */
async function sweepAvatarOrphans(userId: string): Promise<void> {
  const profile = await profilesRepo.getProfile(userId);
  const current = ownedStoredKey(userId, profile?.avatar_url ?? null);
  const bucket = await getFilesBucket();
  const cutoff = Date.now() - AVATAR_ORPHAN_GRACE_MS;
  const prefix = userPrefix('avatars', userId);
  const stale: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await bucket.list({ prefix, cursor });
    for (const object of page.objects) {
      if (object.key !== current && object.uploaded && object.uploaded.getTime() < cutoff) stale.push(object.key);
    }
    if (!page.truncated || !page.cursor) break;
    cursor = page.cursor;
  }
  if (stale.length > 0) await bucket.delete(stale);
}

/**
 * Make an already uploaded avatar the account photo, then drop the avatar it replaced, old orphans and any legacy CV photo.
 * The web Settings page and set_profile_photo both end here, so neither deletes an object the other just linked.
 */
export async function linkProfilePhoto(userId: string, avatarKey: string): Promise<void> {
  const key = ownedAvatarKey(userId, avatarKey);
  const previous = await swapAvatar(userId, key);
  // The row is saved. Leftover old objects waste quota but do not change what is shown.
  try {
    // A leftover Supabase URL maps to its R2 key, so resolve before deciding what to delete.
    const previousKey = ownedStoredKey(userId, previous);
    if (previousKey && previousKey !== key) await deleteObject(previousKey);
    await deletePrefix(userPrefix('profile-photos', userId));
    await sweepAvatarOrphans(userId);
  } catch (error) {
    console.error('[profile] failed to remove old profile photos:', error);
  }
}

/** Store a new photo as the account avatar. */
export async function replaceProfilePhoto(userId: string, file: File, ext: string): Promise<void> {
  const key = await storeUserUpload(userId, { bucket: 'avatars', subpath: '', file, ext });
  await linkProfilePhoto(userId, key);
}

/**
 * Unlink the photo, then delete the object it pointed at. The unlink is a compare-and-swap, so a photo
 * set from another surface at the same moment is never deleted. False when objects may remain
 * (retrying is safe: old orphans go with the next sweep).
 */
export async function removeProfilePhoto(userId: string): Promise<boolean> {
  const previous = await swapAvatar(userId, null);
  try {
    const previousKey = ownedStoredKey(userId, previous);
    if (previousKey) await deleteObject(previousKey);
    await deletePrefix(userPrefix('profile-photos', userId));
    await sweepAvatarOrphans(userId);
    return true;
  } catch (error) {
    console.error('[profile] photo delete incomplete:', error);
    return false;
  }
}
