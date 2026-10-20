'use server';

import { headers } from 'next/headers';
import { getAuth } from '@/auth/server';
import * as profilesRepo from './repos/profiles';
import * as documentsRepo from './repos/documents';
import * as sessionsRepo from './repos/sessions';
import * as applications from '@/lib/services/applications';
import { InvalidInputError, NotFoundError, RevisionConflict } from '@/lib/services/errors';
import * as creditsRepo from './repos/credits';
import * as subscriptionsRepo from './repos/subscriptions';
import * as feedbackRepo from './repos/feedback';
import type { Profile } from '@/lib/supabase/types';

async function requireCurrentUser(): Promise<{ id: string; email?: string }> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error('Authentication required');
  }
  return { id: session.user.id, email: session.user.email };
}

async function requireUserId(userId: string): Promise<string> {
  const user = await requireCurrentUser();
  if (user.id !== userId) {
    throw new Error('Forbidden');
  }
  return user.id;
}

export async function getProfileAction(userId: string) {
  await requireUserId(userId);
  return profilesRepo.getProfile(userId);
}

export async function getOrCreateProfileAction(userId: string) {
  const user = await requireCurrentUser();
  if (user.id !== userId) {
    throw new Error('Forbidden');
  }
  if (!user.email) {
    throw new Error('Authenticated user has no email');
  }
  return profilesRepo.getOrCreateProfile(user.id, user.email);
}

// Columns a signed-in user may edit about themselves. Entitlement and
// bookkeeping columns (subscription_tier, subscription_status, job_searches_*,
// welcome_sent_at, check_in_sent_at, confirmation resend fields, email) are written only by
// trusted server paths (Stripe webhook, cron, auth routes), never from here.
const USER_EDITABLE_PROFILE_FIELDS = [
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
type UserEditableProfile = Pick<Profile, (typeof USER_EDITABLE_PROFILE_FIELDS)[number]>;

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

export async function updateProfileAction(userId: string, updates: Partial<UserEditableProfile>) {
  await requireUserId(userId);
  if (typeof updates.timezone === 'string' && !isKnownTimezone(updates.timezone)) {
    throw new Error('Unknown timezone');
  }
  if (typeof updates.date_format === 'string' && !DATE_FORMATS.includes(updates.date_format)) {
    throw new Error('Unknown date format');
  }
  const safe: Partial<UserEditableProfile> = {};
  for (const key of USER_EDITABLE_PROFILE_FIELDS) {
    if (key in updates) {
      (safe as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key];
    }
  }
  const rejected = Object.keys(updates).filter((k) => !(USER_EDITABLE_PROFILE_FIELDS as readonly string[]).includes(k));
  if (rejected.length > 0) {
    throw new Error(`Forbidden profile fields: ${rejected.join(', ')}`);
  }
  if (typeof safe.avatar_url === 'string') {
    // Only a key in this user's avatars prefix (or its leftover Supabase URL) may be stored.
    const { storedFileKey, userOwnsKey } = await import('@/storage/paths');
    const key = storedFileKey(safe.avatar_url);
    if (!key || !key.startsWith('avatars/') || !userOwnsKey(key, userId)) {
      throw new Error('Invalid avatar');
    }
    safe.avatar_url = key;
  }
  return profilesRepo.updateProfile(userId, safe);
}

export async function getDocumentsAction(userId: string) {
  await requireUserId(userId);
  return documentsRepo.getDocuments(userId);
}

export async function getDocumentByTypeAction(userId: string, type: 'primary_cv' | 'master_cv') {
  await requireUserId(userId);
  return documentsRepo.getDocumentByType(userId, type);
}

export async function saveDocumentAction(
  userId: string,
  type: 'primary_cv' | 'master_cv',
  data: Parameters<typeof documentsRepo.saveDocument>[2],
) {
  await requireUserId(userId);
  return documentsRepo.saveDocument(userId, type, data);
}

export async function updateDocumentStructuredDataAction(userId: string, documentId: string, structuredData: unknown) {
  await requireUserId(userId);
  return documentsRepo.updateDocumentStructuredData(userId, documentId, structuredData);
}

export async function deleteDocumentAction(userId: string, documentId: string) {
  await requireUserId(userId);
  return documentsRepo.deleteDocument(userId, documentId);
}

export async function getSessionsAction(userId: string) {
  await requireUserId(userId);
  return applications.listApplications(userId);
}

export async function getSessionAction(userId: string, sessionId: string) {
  await requireUserId(userId);
  return applications.getApplication(userId, sessionId);
}

export async function createSessionAction(userId: string, jobDescription: string) {
  await requireUserId(userId);
  try {
    const session = await applications.createApplication(userId, { jobDescription });
    return { session, error: null };
  } catch (error) {
    return { session: null, error: error instanceof Error ? error : new Error('Failed to create application') };
  }
}

/** What a revisioned write tells the browser. Plain data: a thrown error loses its message crossing the action boundary. */
export type RevisionedWriteResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict'; currentRevision: number | null }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid'; message: string; field?: string };

function toWriteFailure(error: unknown): Exclude<RevisionedWriteResult, { ok: true }> {
  if (error instanceof RevisionConflict) return { ok: false, reason: 'conflict', currentRevision: error.currentRevision };
  if (error instanceof NotFoundError) return { ok: false, reason: 'not_found' };
  if (error instanceof InvalidInputError) return { ok: false, reason: 'invalid', message: error.message, field: error.field };
  throw error;
}

/**
 * The only way the browser writes an application's content. `patch` holds just
 * the columns that changed since the browser last loaded or saved, and the
 * write lands only if the application is still at `expectedRevision`.
 */
export async function saveApplicationEditsAction(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
): Promise<RevisionedWriteResult> {
  await requireUserId(userId);
  // The cover letter recipient columns are server-managed (filled from the ad,
  // cleared on a job change). A browser bundle, old or new, never writes them.
  const { company_address: _address, company_contact_person: _contact, ...browserPatch } = patch;
  void _address;
  void _contact;
  try {
    const { revision } = await applications.updateApplicationFields(userId, sessionId, expectedRevision, browserPatch);
    return { ok: true, revision };
  } catch (error) {
    return toWriteFailure(error);
  }
}

/** Cheap poll: where is this application now? */
export async function getApplicationRevisionAction(userId: string, sessionId: string) {
  await requireUserId(userId);
  return applications.getApplicationRevision(userId, sessionId);
}

export async function deleteSessionAction(userId: string, sessionId: string) {
  await requireUserId(userId);
  try {
    await applications.deleteApplication(userId, sessionId);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Failed to delete application') };
  }
}

export async function listTrackerOverviewAction(userId: string) {
  await requireUserId(userId);
  return applications.listTrackerOverview(userId);
}

export async function setTrackerStatusAction(
  userId: string,
  sessionId: string,
  next: { status: string; interviewAt?: string | null; followUpDueAt?: string | null },
  expectedRevision?: number,
): Promise<RevisionedWriteResult> {
  await requireUserId(userId);
  try {
    const { revision } = await applications.setTrackerStatus(userId, sessionId, next, expectedRevision);
    return { ok: true, revision };
  } catch (error) {
    return toWriteFailure(error);
  }
}

export async function getChatMessagesAction(userId: string, sessionId: string) {
  await requireUserId(userId);
  return sessionsRepo.getChatMessages(userId, sessionId);
}

export async function clearChatMessagesAction(userId: string, sessionId: string) {
  await requireUserId(userId);
  return sessionsRepo.clearChatMessages(userId, sessionId);
}

export async function addChatMessageAction(
  userId: string,
  sessionId: string,
  message: Parameters<typeof sessionsRepo.addChatMessage>[2],
) {
  await requireUserId(userId);
  return sessionsRepo.addChatMessage(userId, sessionId, message);
}

export async function getUserCreditsAction(userId: string) {
  await requireUserId(userId);
  return creditsRepo.getUserCredits(userId);
}

export async function getCreditTransactionsAction(userId: string, limit?: number) {
  await requireUserId(userId);
  return creditsRepo.getCreditTransactions(userId, limit);
}

export async function getSubscriptionPlansAction() {
  return creditsRepo.getSubscriptionPlans();
}

export async function getAddonCreditPacksAction() {
  return creditsRepo.getAddonCreditPacks();
}

export async function getConnectedAccountsAction(userId: string) {
  await requireUserId(userId);
  return subscriptionsRepo.getConnectedAccounts(userId);
}

export async function disconnectAccountAction(userId: string, provider: 'google' | 'linkedin' | 'github') {
  await requireUserId(userId);
  return subscriptionsRepo.disconnectAccount(userId, provider);
}

export async function getSubscriptionAction(userId: string) {
  await requireUserId(userId);
  return subscriptionsRepo.getSubscription(userId);
}

export async function getBillingSubscriptionAction(userId: string) {
  await requireUserId(userId);
  return subscriptionsRepo.getBillingSubscription(userId);
}

export async function submitMessageFeedbackAction(
  userId: string,
  messageId: string,
  feedbackType: 'positive' | 'negative',
  options?: Parameters<typeof feedbackRepo.submitMessageFeedback>[3],
) {
  await requireUserId(userId);
  return feedbackRepo.submitMessageFeedback(userId, messageId, feedbackType, options);
}

export async function getSessionFeedbackAction(userId: string, sessionId: string) {
  await requireUserId(userId);
  return feedbackRepo.getSessionFeedback(userId, sessionId);
}

export async function getMessageFeedbackAction(userId: string, messageId: string) {
  await requireUserId(userId);
  return feedbackRepo.getMessageFeedback(userId, messageId);
}

type FileBucket = 'cv-files' | 'generated-pdfs' | 'avatars' | 'profile-photos';

async function requireFileRate(userId: string, route: 'files-get' | 'files-upload') {
  const { checkRateLimit, RATE_LIMITS } = await import('@/lib/middleware/rateLimiter');
  const rateLimit = await checkRateLimit(`${route}:${userId}`, RATE_LIMITS[route]);
  if (!rateLimit.allowed) {
    throw new Error('Too many requests. Please try again later.');
  }
}

/** Delete one owned object. Throws on auth, ownership or R2 failure. */
export async function deleteFileAction(key: string): Promise<void> {
  const user = await requireCurrentUser();
  await requireFileRate(user.id, 'files-upload');
  const { userOwnsKey } = await import('@/storage/paths');
  const { deleteObject } = await import('@/storage/r2');
  if (!userOwnsKey(key, user.id)) {
    throw new Error('Not found');
  }
  await deleteObject(key);
}

/** Delete every owned object under `<bucket>/<userId>/`, optionally keeping one key. */
export async function deleteUserFilesAction(bucket: FileBucket, keepKey?: string): Promise<void> {
  const user = await requireCurrentUser();
  await requireFileRate(user.id, 'files-upload');
  const { isAllowedFileBucket, userPrefix, userOwnsKey } = await import('@/storage/paths');
  const { deletePrefix } = await import('@/storage/r2');
  if (!isAllowedFileBucket(bucket)) {
    throw new Error('Invalid request');
  }
  if (keepKey !== undefined && !userOwnsKey(keepKey, user.id)) {
    throw new Error('Not found');
  }
  await deletePrefix(userPrefix(bucket, user.id), keepKey);
}

/** List owned object keys under `<bucket>/<userId>/`. Throws on auth or R2 failure. */
export async function listUserFilesAction(bucket: FileBucket): Promise<string[]> {
  const user = await requireCurrentUser();
  await requireFileRate(user.id, 'files-get');
  const { isAllowedFileBucket, userPrefix } = await import('@/storage/paths');
  const { listPrefix } = await import('@/storage/r2');
  if (!isAllowedFileBucket(bucket)) {
    throw new Error('Invalid request');
  }
  const objects = await listPrefix(userPrefix(bucket, user.id));
  return objects.map((object) => object.key);
}
