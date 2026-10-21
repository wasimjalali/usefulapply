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
import { deleteObject, deletePrefix, listPrefix, putObject, USER_STORAGE_QUOTA_BYTES, userStorageBytes } from '@/storage/r2';
import { ImagesBindingUnavailableError, normalizePhotoToJpeg } from '@/storage/images';
import {
  ALLOWED_FILE_BUCKETS,
  PHOTO_BUCKETS,
  storedFileKey,
  userOwnsKey,
  userPrefix,
  type AllowedFileBucket,
} from '@/storage/paths';
import type { Profile } from '@/lib/supabase/types';
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
] as const;
export type UserEditableProfile = Pick<Profile, (typeof USER_EDITABLE_PROFILE_FIELDS)[number]>;

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

export async function updateUserProfile(userId: string, updates: Partial<UserEditableProfile>): Promise<Profile> {
  if (typeof updates.timezone === 'string' && !isKnownTimezone(updates.timezone)) {
    throw new InvalidInputError('Unknown timezone');
  }
  if (typeof updates.date_format === 'string' && !DATE_FORMATS.includes(updates.date_format)) {
    throw new InvalidInputError('Unknown date format');
  }
  const safe: Partial<UserEditableProfile> = {};
  for (const key of USER_EDITABLE_PROFILE_FIELDS) {
    if (key in updates) {
      (safe as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key];
    }
  }
  const rejected = Object.keys(updates).filter((k) => !(USER_EDITABLE_PROFILE_FIELDS as readonly string[]).includes(k));
  if (rejected.length > 0) {
    throw new InvalidInputError(`Forbidden profile fields: ${rejected.join(', ')}`);
  }
  if (typeof safe.avatar_url === 'string') {
    // Only a key in this user's avatars prefix (or its leftover Supabase URL) may be stored.
    const key = storedFileKey(safe.avatar_url);
    if (!key || !key.startsWith('avatars/') || !userOwnsKey(key, userId)) {
      throw new InvalidInputError('Invalid avatar');
    }
    safe.avatar_url = key;
  }
  return profilesRepo.updateProfile(userId, safe);
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

/**
 * Point avatar_url at `key` and return the value it replaced. Compare-and-swap, so two
 * concurrent replacements each delete exactly the object they displaced and never one
 * the other has stored but not yet linked.
 */
async function swapAvatar(userId: string, key: string): Promise<string | null> {
  const db = await getDb();
  for (let attempt = 0; attempt < AVATAR_SWAP_ATTEMPTS; attempt++) {
    const profile = await profilesRepo.getProfile(userId);
    if (!profile) throw new Error('Profile not found');
    const previous = profile.avatar_url ?? null;
    const swapped = await db
      .update(profiles)
      .set({ avatar_url: key, updated_at: nowIso() })
      .where(and(eq(profiles.id, userId), previous === null ? isNull(profiles.avatar_url) : eq(profiles.avatar_url, previous)))
      .returning({ id: profiles.id });
    if (swapped.length > 0) return previous;
  }
  throw new Error('The profile photo changed too often to save');
}

/** Store a new photo as the account avatar, then drop the avatar it replaced and any legacy CV photo. */
export async function replaceProfilePhoto(userId: string, file: File, ext: string): Promise<void> {
  const key = await storeUserUpload(userId, { bucket: 'avatars', subpath: '', file, ext });
  const previous = await swapAvatar(userId, key);
  // The row is saved. Leftover old objects waste quota but do not change what is shown.
  try {
    if (previous && previous !== key && userOwnsKey(previous, userId)) await deleteObject(previous);
    await deletePrefix(userPrefix('profile-photos', userId));
  } catch (error) {
    console.error('[profile] failed to remove old profile photos:', error);
  }
}

/** Unlink the photo, then delete its objects. False when objects may remain (retrying is safe). */
export async function removeProfilePhoto(userId: string): Promise<boolean> {
  await profilesRepo.updateProfile(userId, { avatar_url: null });
  try {
    await deletePrefix(userPrefix('avatars', userId));
    await deletePrefix(userPrefix('profile-photos', userId));
    return true;
  } catch (error) {
    console.error('[profile] photo delete incomplete:', error);
    return false;
  }
}
