/**
 * Anthropic user profiles: every model request made for a signed-in user names that user's profile, so a safety
 * enforcement action (a restriction or a ban) hits that one user instead of the whole organization.
 * Docs: https://platform.claude.com/docs/en/manage-claude/user-profiles (read 2026-10-22). GA, no beta header.
 *
 * - One `application` profile per user, created lazily on the user's first model call with
 *   `external_user_details.reference_id` = our user id and nothing else. The `uprof_` id is stored in D1
 *   (anthropic_user_profiles, migration 0014).
 * - The id goes in the `anthropic-user-profile-id` header on every Messages and count_tokens request for that user
 *   (`userProfileRequestOptions`). Claude in Amazon Bedrock takes it as a top-level `user_profile_id` body field
 *   instead; the Bedrock SDK's mantle client moves the header into the body itself, so both providers get the same
 *   request options. Anonymous and system calls send none.
 * - POST /v1/user_profiles is not idempotent. Concurrent first calls in one isolate share one creation; across
 *   isolates the D1 insert is ON CONFLICT DO NOTHING and the losing writer deletes its own profile at Anthropic.
 *   A shared creation belongs to the request that started it, and a cancelled request can leave it unsettled, so
 *   every other waiter gives up after SHARED_WAIT_MS (no header) and a stale entry is replaced.
 * - A profile that cannot be created or stored never blocks the model call: the call goes out without the header,
 *   and the failure is logged (Workers Logs) and captured (PostHog `anthropic_user_profile_failed`). After a failure
 *   the user's next calls skip creation for CREATE_RETRY_AFTER_MS, so an outage does not add a slow create to every call.
 * - The header is a request header (a body field on Bedrock), outside the prompt, so prompt-cache keys do not change.
 * - The API answers a 400 to an id it does not know for this organization (a profile deleted elsewhere, or an API key
 *   from another organization). That call fails as it is; `forgetRejectedUserProfile` drops the stored id only once a
 *   retrieve answers 404, so the user's next call creates a new profile. A profile that still exists is never swapped:
 *   the docs do not say what an enforcement refusal looks like, and a fresh profile must never route around one.
 */
import { APIError } from '@anthropic-ai/sdk';
import {
  claimAnthropicUserProfileId,
  deleteAnthropicUserProfileRow,
  getAnthropicUserProfileId,
} from '@/db/repos/anthropicUserProfiles';
import { getPostHogServer } from '@/lib/posthog-server';
import { getPrimaryClient } from './providers';

export const USER_PROFILE_HEADER = 'anthropic-user-profile-id';

const PROFILE_REQUEST_TIMEOUT_MS = 10_000;
/** How long a call waits on a creation another request started (create timeout plus the D1 writes). */
const SHARED_WAIT_MS = PROFILE_REQUEST_TIMEOUT_MS + 5_000;
const CREATE_RETRY_AFTER_MS = 60_000;
/** Profile ids remembered per isolate; the oldest is dropped past this. */
const MAX_CACHED = 5_000;

type FailureStage = 'read' | 'create' | 'store' | 'cleanup' | 'delete' | 'rejected';

export interface RemoteProfile {
  enforcementStatus: string;
}

export interface UserProfileStore {
  read(userId: string): Promise<string | null>;
  /** Stores the id unless the user has one, and returns the stored id. */
  claim(userId: string, profileId: string): Promise<string>;
  deleteRow(userId: string, profileId?: string): Promise<number>;
  /** Creates the profile at Anthropic and returns its `uprof_` id. */
  create(userId: string): Promise<string>;
  /** Deletes the profile at Anthropic. A 404 (already gone) is success. */
  remove(profileId: string): Promise<void>;
  /** Reads the profile at Anthropic; null when it answers 404. */
  retrieve(profileId: string): Promise<RemoteProfile | null>;
  capture(event: { distinctId: string; event: string; properties: Record<string, unknown> }): Promise<void>;
}

const defaultStore: UserProfileStore = {
  read: getAnthropicUserProfileId,
  claim: claimAnthropicUserProfileId,
  deleteRow: deleteAnthropicUserProfileRow,
  async create(userId) {
    // No SDK retry: a retried create can leave a second profile behind.
    const profile = await getPrimaryClient().userProfiles.create(
      { access_type: 'application', external_user_details: { reference_id: userId } },
      { timeout: PROFILE_REQUEST_TIMEOUT_MS, maxRetries: 0 },
    );
    return profile.id;
  },
  async remove(profileId) {
    try {
      await getPrimaryClient().userProfiles.delete(profileId, {}, { timeout: PROFILE_REQUEST_TIMEOUT_MS, maxRetries: 2 });
    } catch (error) {
      // The docs: a 404 on a retried delete means the first one went through.
      if (error instanceof APIError && error.status === 404) return;
      throw error;
    }
  },
  async retrieve(profileId) {
    try {
      const profile = await getPrimaryClient().userProfiles.retrieve(profileId, {}, { timeout: PROFILE_REQUEST_TIMEOUT_MS, maxRetries: 1 });
      return { enforcementStatus: profile.enforcement_status };
    } catch (error) {
      if (error instanceof APIError && error.status === 404) return null;
      throw error;
    }
  },
  async capture(event) {
    const posthog = getPostHogServer();
    posthog.capture(event);
    await posthog.flush();
  },
};

let store: UserProfileStore = defaultStore;
const known = new Map<string, string>();
const inFlight = new Map<string, { promise: Promise<string | null>; startedAt: number }>();
const retryAfter = new Map<string, number>();

/** Swap D1, the API and PostHog for a test, and clear the per-isolate state. `null` restores the real ones. */
export function setUserProfileStoreForTests(next: Partial<UserProfileStore> | null): void {
  store = next ? { ...defaultStore, ...next } : defaultStore;
  known.clear();
  inFlight.clear();
  retryAfter.clear();
}

function remember(userId: string, profileId: string): void {
  known.delete(userId);
  known.set(userId, profileId);
  if (known.size > MAX_CACHED) known.delete(known.keys().next().value as string);
}

function describe(error: unknown): { message: string; httpStatus: number | null; errorType: string | null } {
  return {
    message: error instanceof Error ? error.message : String(error),
    httpStatus: error instanceof APIError && typeof error.status === 'number' ? error.status : null,
    errorType: error instanceof APIError ? (error.type ?? null) : null,
  };
}

async function reportFailure(
  userId: string,
  stage: FailureStage,
  error: unknown,
  profileId: string | null = null,
  extra: Record<string, string | boolean | null> = {},
): Promise<void> {
  const { message, httpStatus, errorType } = describe(error);
  console.error(JSON.stringify({
    event: 'anthropic_user_profile_failed',
    stage,
    user_id: userId,
    profile_id: profileId,
    http_status: httpStatus,
    error_type: errorType,
    ...extra,
    message,
  }));
  try {
    await store.capture({
      distinctId: userId,
      event: 'anthropic_user_profile_failed',
      properties: { stage, http_status: httpStatus, error_type: errorType, profile_id: profileId, ...extra },
    });
  } catch (captureError) {
    console.error('[user-profiles] PostHog capture failed', captureError);
  }
}

/** The stored id, reading D1 a second time if the first read fails (a transient D1 error must not unattribute a call). */
async function readStored(userId: string): Promise<string | null> {
  try {
    return await store.read(userId);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'anthropic_user_profile_read_retry', user_id: userId, message: describe(error).message }));
    return await store.read(userId);
  }
}

async function createAndStore(userId: string): Promise<string | null> {
  let stored: string | null;
  try {
    stored = await readStored(userId);
  } catch (error) {
    // Without the mapping we cannot know whether a profile exists; creating one could orphan the stored one.
    await reportFailure(userId, 'read', error);
    retryAfter.set(userId, Date.now() + CREATE_RETRY_AFTER_MS);
    return null;
  }
  if (stored) return stored;

  let created: string;
  try {
    created = await store.create(userId);
  } catch (error) {
    await reportFailure(userId, 'create', error);
    retryAfter.set(userId, Date.now() + CREATE_RETRY_AFTER_MS);
    return null;
  }

  let winner: string;
  try {
    winner = await store.claim(userId, created);
  } catch (error) {
    await reportFailure(userId, 'store', error, created);
    // The insert may have landed before the failure (its follow-up read failed): look before deleting anything.
    let current: string | null;
    try {
      current = await store.read(userId);
    } catch (readError) {
      // Unknown whether ours is stored: keep it rather than delete a profile other isolates may already send.
      await reportFailure(userId, 'read', readError, created);
      retryAfter.set(userId, Date.now() + CREATE_RETRY_AFTER_MS);
      return null;
    }
    if (current === created) return created;
    await removeQuietly(userId, created);
    if (current) return current;
    retryAfter.set(userId, Date.now() + CREATE_RETRY_AFTER_MS);
    return null;
  }
  if (winner !== created) {
    // Another isolate stored its profile first: use that one and delete ours.
    console.warn(JSON.stringify({ event: 'anthropic_user_profile_race_lost', user_id: userId, kept: winner, deleting: created }));
    await removeQuietly(userId, created);
  } else {
    console.log(JSON.stringify({ event: 'anthropic_user_profile_created', user_id: userId, profile_id: created }));
  }
  return winner;
}

/** Delete a profile nobody will use. A failure leaves an orphan at Anthropic, which is logged, not thrown. */
async function removeQuietly(userId: string, profileId: string): Promise<void> {
  try {
    await store.remove(profileId);
  } catch (error) {
    await reportFailure(userId, 'cleanup', error, profileId);
  }
}

/**
 * The user's Anthropic profile id, creating the profile on first use. Null for no user, and null (logged) when the
 * profile cannot be read, created or stored: the caller then sends the request without the header.
 */
export async function resolveUserProfileId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const cached = known.get(userId);
  if (cached) return cached;

  const pending = inFlight.get(userId);
  if (pending && Date.now() - pending.startedAt < SHARED_WAIT_MS) return waitShared(userId, pending.promise);

  const until = retryAfter.get(userId);
  if (until !== undefined) {
    if (Date.now() < until) {
      console.warn(JSON.stringify({ event: 'anthropic_user_profile_skipped', user_id: userId, reason: 'recent_failure' }));
      return null;
    }
    retryAfter.delete(userId);
  }

  const startedAt = Date.now();
  const resolving: Promise<string | null> = createAndStore(userId)
    .then((profileId) => {
      if (profileId) remember(userId, profileId);
      return profileId;
    })
    .finally(() => {
      // A stale entry may have been replaced by a newer creation: only remove our own.
      if (inFlight.get(userId)?.promise === resolving) inFlight.delete(userId);
    });
  inFlight.set(userId, { promise: resolving, startedAt });
  return resolving;
}

/** Wait on a creation another request started, at most SHARED_WAIT_MS; then go without the header. */
async function waitShared(userId: string, shared: Promise<string | null>): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(JSON.stringify({ event: 'anthropic_user_profile_skipped', user_id: userId, reason: 'shared_wait_timeout' }));
      resolve(null);
    }, SHARED_WAIT_MS);
  });
  try {
    return await Promise.race([shared, giveUp]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Called with a call's final error. A 400 from the Anthropic API that names the profile id may mean the profile is gone
 * (deleted elsewhere, or an API key from another organization), or may be how an enforcement action refuses the user.
 * Only a retrieve that answers 404 proves the first: then the mapping is dropped (only while it still holds that id) so
 * the next call creates a new profile. A profile that still exists is kept, whatever the 400 said. Never retries the call.
 */
export async function forgetRejectedUserProfile(userId: string | null | undefined, profileId: string | null, error: unknown): Promise<void> {
  if (!userId || !profileId) return;
  if (!(error instanceof APIError) || error.status !== 400 || !error.message.includes(profileId)) return;
  let remote: RemoteProfile | null;
  try {
    remote = await store.retrieve(profileId);
  } catch (lookupError) {
    await reportFailure(userId, 'rejected', lookupError, profileId, { lookup_failed: true });
    return;
  }
  if (remote) {
    await reportFailure(userId, 'rejected', error, profileId, { profile_exists: true, enforcement_status: remote.enforcementStatus });
    return;
  }
  known.delete(userId);
  await reportFailure(userId, 'rejected', error, profileId, { profile_exists: false });
  try {
    await store.deleteRow(userId, profileId);
  } catch (deleteError) {
    await reportFailure(userId, 'rejected', deleteError, profileId);
  }
}

/** SDK request options that name the profile: the header, which the Bedrock client moves into the body. */
export function userProfileRequestOptions(profileId: string | null): { headers?: Record<string, string> } {
  return profileId ? { headers: { [USER_PROFILE_HEADER]: profileId } } : {};
}

/**
 * Account deletion: delete the user's profile at Anthropic, then the mapping. Throws when the profile cannot be
 * deleted, so the account deletion stops and can be retried (every step here is idempotent).
 */
export async function deleteUserProfileForAccount(userId: string): Promise<void> {
  const profileId = await store.read(userId);
  known.delete(userId);
  retryAfter.delete(userId);
  if (!profileId) return;
  try {
    await store.remove(profileId);
  } catch (error) {
    await reportFailure(userId, 'delete', error, profileId);
    throw error;
  }
  await store.deleteRow(userId);
  console.log(JSON.stringify({ event: 'anthropic_user_profile_deleted', user_id: userId, profile_id: profileId }));
}

/**
 * Account deletion, after the user's rows are gone: delete any profile a model call stored between
 * deleteUserProfileForAccount and the wipe. Logged, not thrown: the rows are gone, so a retry could not find them.
 */
export async function deleteLeftoverUserProfiles(userId: string, profileIds: string[]): Promise<void> {
  known.delete(userId);
  for (const profileId of profileIds) {
    console.warn(JSON.stringify({ event: 'anthropic_user_profile_leftover', user_id: userId, profile_id: profileId }));
    await removeQuietly(userId, profileId);
  }
}
