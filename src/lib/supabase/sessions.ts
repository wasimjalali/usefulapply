import {
  getSessionsAction,
  getSessionAction,
  createSessionAction,
  updateSessionAction,
  deleteSessionAction,
  getChatMessagesAction,
  addChatMessageAction,
} from '@/db/actions';
import { authClient } from '@/auth/client';

export type { ApplicationSession, ChatMessage } from '@/db/repos/sessions';

export async function getSessions(userId: string) {
  return getSessionsAction(userId);
}

export async function getSession(sessionId: string, userId?: string) {
  const id = userId ?? (await currentUserId());
  if (!id) return null;
  return getSessionAction(id, sessionId);
}

export async function createSession(
  userId: string,
  jobDescription: string,
  extras?: Parameters<typeof createSessionAction>[2],
) {
  return createSessionAction(userId, jobDescription, extras);
}

export async function updateSession(
  sessionId: string,
  updates: Parameters<typeof updateSessionAction>[2],
  userId?: string,
) {
  const id = userId ?? (await currentUserId());
  if (!id) return { error: new Error('Authentication required') };
  return updateSessionAction(id, sessionId, updates);
}

export async function deleteSession(sessionId: string, userId?: string) {
  const id = userId ?? (await currentUserId());
  if (!id) return { error: new Error('Authentication required') };
  return deleteSessionAction(id, sessionId);
}

export async function getChatMessages(sessionId: string) {
  const id = await currentUserId();
  if (!id) return [];
  return getChatMessagesAction(id, sessionId);
}

export async function addChatMessage(
  sessionId: string,
  userId: string,
  message: Parameters<typeof addChatMessageAction>[2],
) {
  return addChatMessageAction(userId, sessionId, message);
}

export async function clearChatMessages(sessionId: string) {
  const { clearChatMessagesAction } = await import('@/db/actions');
  const id = await currentUserId();
  if (!id) return { error: new Error('Authentication required') };
  return clearChatMessagesAction(id, sessionId);
}

async function currentUserId(): Promise<string | null> {
  const { data } = await authClient.getSession();
  return data?.user?.id ?? null;
}
