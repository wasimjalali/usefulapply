'use server';

import { createClient } from '@/lib/supabase/server';
import * as profilesRepo from './repos/profiles';
import * as documentsRepo from './repos/documents';
import * as sessionsRepo from './repos/sessions';
import * as creditsRepo from './repos/credits';
import * as subscriptionsRepo from './repos/subscriptions';
import * as feedbackRepo from './repos/feedback';
import type { Profile } from '@/lib/supabase/types';

async function requireCurrentUser(): Promise<{ id: string; email?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return { id: user.id, email: user.email };
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
// welcome_sent_at, confirmation resend fields, email) are written only by
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
  'notify_tips',
  'notify_updates',
  'notify_weekly',
  'notify_marketing',
  'job_feed_last_seen_run_date',
] as const;
type UserEditableProfile = Pick<Profile, (typeof USER_EDITABLE_PROFILE_FIELDS)[number]>;

export async function updateProfileAction(userId: string, updates: Partial<UserEditableProfile>) {
  await requireUserId(userId);
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
  return sessionsRepo.getSessions(userId);
}

export async function getSessionAction(userId: string, sessionId: string) {
  await requireUserId(userId);
  return sessionsRepo.getSession(userId, sessionId);
}

export async function createSessionAction(userId: string, jobDescription: string) {
  await requireUserId(userId);
  return sessionsRepo.createSession(userId, jobDescription);
}

export async function updateSessionAction(
  userId: string,
  sessionId: string,
  updates: Parameters<typeof sessionsRepo.updateSession>[2],
) {
  await requireUserId(userId);
  return sessionsRepo.updateSession(userId, sessionId, updates);
}

export async function deleteSessionAction(userId: string, sessionId: string) {
  await requireUserId(userId);
  return sessionsRepo.deleteSession(userId, sessionId);
}

export async function listTrackerApplicationsAction(
  userId: string,
  params: { offset: number; limit: number; search: string; status: string | 'all' },
) {
  await requireUserId(userId);
  return sessionsRepo.listTrackerApplications(userId, params);
}

export async function listTrackerStatusesAction(userId: string) {
  await requireUserId(userId);
  return sessionsRepo.listTrackerStatuses(userId);
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
