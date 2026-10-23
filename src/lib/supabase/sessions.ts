import {
  getSessionsAction,
  getSessionAction,
  createSessionAction,
  saveApplicationEditsAction,
  getApplicationRevisionAction,
  deleteSessionAction,
  getChatMessagesAction,
  getChatCompactionMarkerAction,
  addChatMessageAction,
} from '@/db/actions';
import { authClient } from '@/auth/client';

export async function getSessions(userId: string) {
  return getSessionsAction(userId);
}

export async function getSession(sessionId: string, userId?: string) {
  const id = userId ?? (await currentUserId());
  if (!id) return null;
  return getSessionAction(id, sessionId);
}

export async function createSession(userId: string, jobDescription: string) {
  return createSessionAction(userId, jobDescription);
}

/**
 * Write the changed columns of an application, if it is still at
 * `expectedRevision`. The result says whether it landed; a conflict means
 * someone else wrote first and the caller should reload.
 */
export async function saveApplicationEdits(
  sessionId: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
  userId?: string,
) {
  const id = userId ?? (await currentUserId());
  if (!id) return { ok: false as const, reason: 'invalid' as const, message: 'Authentication required' };
  return saveApplicationEditsAction(id, sessionId, expectedRevision, patch);
}

export async function getApplicationRevision(sessionId: string, userId?: string) {
  const id = userId ?? (await currentUserId());
  if (!id) return null;
  return getApplicationRevisionAction(id, sessionId);
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

export async function getChatCompactionMarker(sessionId: string): Promise<string | null> {
  const id = await currentUserId();
  if (!id) return null;
  return getChatCompactionMarkerAction(id, sessionId);
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
