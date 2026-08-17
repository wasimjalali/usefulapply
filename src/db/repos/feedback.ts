import { and, eq } from 'drizzle-orm';
import { getDb, nowIso } from '../client';
import { messageFeedback } from '../schema';

export interface MessageFeedback {
  id: string;
  user_id: string;
  session_id?: string | null;
  message_id: string;
  feedback_type: 'positive' | 'negative';
  feedback_text?: string | null;
  message_content?: string | null;
  created_at: string;
}

export async function submitMessageFeedback(
  userId: string,
  messageId: string,
  feedbackType: 'positive' | 'negative',
  options?: { sessionId?: string; messageContent?: string; feedbackText?: string },
): Promise<{ feedback: MessageFeedback | null; error: Error | null }> {
  const db = await getDb();
  const existing = await db
    .select()
    .from(messageFeedback)
    .where(and(eq(messageFeedback.user_id, userId), eq(messageFeedback.message_id, messageId)))
    .limit(1);

  if (existing[0]) {
    if (existing[0].feedback_type !== feedbackType) {
      await db
        .update(messageFeedback)
        .set({ feedback_type: feedbackType })
        .where(and(eq(messageFeedback.id, existing[0].id), eq(messageFeedback.user_id, userId)));
      const rows = await db.select().from(messageFeedback).where(eq(messageFeedback.id, existing[0].id)).limit(1);
      return { feedback: (rows[0] as MessageFeedback | undefined) ?? null, error: null };
    }
    await db.delete(messageFeedback).where(and(eq(messageFeedback.id, existing[0].id), eq(messageFeedback.user_id, userId)));
    return { feedback: null, error: null };
  }

  const id = crypto.randomUUID();
  await db.insert(messageFeedback).values({
    id,
    user_id: userId,
    message_id: messageId,
    feedback_type: feedbackType,
    session_id: options?.sessionId ?? null,
    message_content: options?.messageContent ?? null,
    feedback_text: options?.feedbackText ?? null,
    created_at: nowIso(),
  });
  const rows = await db.select().from(messageFeedback).where(and(eq(messageFeedback.id, id), eq(messageFeedback.user_id, userId))).limit(1);
  return { feedback: (rows[0] as MessageFeedback | undefined) ?? null, error: null };
}

export async function getSessionFeedback(
  userId: string,
  sessionId: string,
): Promise<{ feedbacks: MessageFeedback[]; error: Error | null }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(messageFeedback)
    .where(and(eq(messageFeedback.user_id, userId), eq(messageFeedback.session_id, sessionId)));
  return { feedbacks: rows as MessageFeedback[], error: null };
}

export async function getMessageFeedback(
  userId: string,
  messageId: string,
): Promise<{ feedback: MessageFeedback | null; error: Error | null }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(messageFeedback)
    .where(and(eq(messageFeedback.user_id, userId), eq(messageFeedback.message_id, messageId)))
    .limit(1);
  return { feedback: (rows[0] as MessageFeedback | undefined) ?? null, error: null };
}
