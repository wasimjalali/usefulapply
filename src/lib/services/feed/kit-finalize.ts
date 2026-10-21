/**
 * Finish the feed row of a kit that was queued through MCP (apply_to_feed_job). The queue runner
 * and the operation housekeeping call this once a kit operation has ended, after its own writes.
 *
 * It never throws: the kit, its credit capture or its refund are already stored, and a feed row
 * that cannot be updated must not fail the run or undo any of that. A failure is logged loudly
 * instead, with the ids to find the row by.
 */

import { settleJobFeedFeedbackForSession } from '@/lib/job-feed/server';
import type { AgentOperation } from '../operations';

export async function finalizeFeedRowForKit(
  operation: Pick<AgentOperation, 'id' | 'user_id' | 'session_id'>,
  status: 'succeeded' | 'failed' | 'cancelled',
  errorCode: string | null = null,
): Promise<void> {
  if (!operation.session_id) return;
  try {
    await settleJobFeedFeedbackForSession({
      userId: operation.user_id,
      sessionId: operation.session_id,
      status,
      errorMessage: status === 'failed' ? errorCode : null,
    });
  } catch (error) {
    console.error(
      `[feed-finalize] could not mark the feed row of application ${operation.session_id} ${status} (operation ${operation.id}):`,
      error instanceof Error ? error.message : error,
    );
  }
}
