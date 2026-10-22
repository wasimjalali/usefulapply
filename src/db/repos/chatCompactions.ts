import { and, eq, sql } from 'drizzle-orm';
import { getDb, nowIso } from '../client';
import { chatCompactions } from '../schema';

// The chat's compaction block per application (migration 0013). Only /api/chat reads and writes it. Every query is
// scoped to the user, and a write only lands on an application the user owns.

export interface StoredChatCompaction {
  /** The `compaction` block as the API returned it. Parsed JSON; the caller validates its shape. */
  block: unknown;
  coversThroughMessageId: string;
  inputTokens: number;
  createdAt: string;
}

export async function getChatCompaction(userId: string, sessionId: string): Promise<StoredChatCompaction | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(chatCompactions)
    .where(and(eq(chatCompactions.session_id, sessionId), eq(chatCompactions.user_id, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    block: row.block,
    coversThroughMessageId: row.covers_through_message_id,
    inputTokens: row.input_tokens,
    createdAt: row.created_at,
  };
}

/**
 * Store (or replace) the block for an application the user owns. A re-compaction replaces the row: the new block
 * already carries the old one's facts. Returns false when nothing was written (not the user's application).
 */
export async function saveChatCompaction(
  userId: string,
  sessionId: string,
  compaction: { block: unknown; coversThroughMessageId: string; inputTokens: number },
): Promise<boolean> {
  if (!Number.isInteger(compaction.inputTokens) || compaction.inputTokens < 0) {
    throw new Error(`saveChatCompaction: invalid input token count ${compaction.inputTokens}`);
  }
  const db = await getDb();
  const result = await db.run(sql`
    INSERT INTO chat_compactions (session_id, user_id, block, covers_through_message_id, input_tokens, created_at)
    SELECT s.id, s.user_id, ${JSON.stringify(compaction.block)}, ${compaction.coversThroughMessageId}, ${compaction.inputTokens}, ${nowIso()}
    FROM application_sessions s
    WHERE s.id = ${sessionId} AND s.user_id = ${userId}
    ON CONFLICT(session_id) DO UPDATE SET
      block = excluded.block,
      covers_through_message_id = excluded.covers_through_message_id,
      input_tokens = excluded.input_tokens,
      created_at = excluded.created_at
    WHERE chat_compactions.user_id = excluded.user_id
  `);
  return result.meta.changes === 1;
}

/** Drop a block whose last message is gone (the chat was cleared). */
export async function deleteChatCompaction(userId: string, sessionId: string): Promise<void> {
  const db = await getDb();
  await db
    .delete(chatCompactions)
    .where(and(eq(chatCompactions.session_id, sessionId), eq(chatCompactions.user_id, userId)));
}
