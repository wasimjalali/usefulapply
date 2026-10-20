/**
 * The consumer half of a queued job feed run (the producer is queueFeedRun in run.ts). A queue
 * message names a run row that is `queued`. The run is claimed by a conditional UPDATE inside
 * runJobFeedFoundationWorkflow({ runId }), so a redelivered or duplicate message finds nothing to
 * claim and the feed never runs twice for one row. A run that was claimed is never run again, even
 * when it fails: a failed run is marked failed by the workflow and the user's next run_job_feed
 * call queues a fresh attempt.
 */

import * as jobFeedRepo from '@/db/repos/jobFeed';
import { runJobFeedFoundationWorkflow } from '@/lib/job-feed/server';

export type FeedRunOutcome =
  | { outcome: 'ran'; runId: string; status: string }
  /** Nothing to do: unknown run, already claimed or finished, or the claim was lost to another worker. */
  | { outcome: 'dropped'; reason: string }
  /** The run was never claimed and the failure may be transient: ask the queue for another delivery. */
  | { outcome: 'retry' }
  | { outcome: 'failed' };

export async function runQueuedFeedRun(params: {
  userId: string;
  runId: string;
  /** 1 for the first delivery. */
  attempt: number;
  /** The last delivery the queue will make. */
  maxAttempts: number;
}): Promise<FeedRunOutcome> {
  const { userId, runId, attempt, maxAttempts } = params;
  const run = await jobFeedRepo.getRun(userId, runId);
  if (!run) return { outcome: 'dropped', reason: 'unknown_run' };
  if (run.status !== 'queued') return { outcome: 'dropped', reason: `already_${run.status}` };

  try {
    const result = await runJobFeedFoundationWorkflow({
      userId,
      runId,
      requestExecutionId: crypto.randomUUID(),
      triggerSource: 'manual_user',
      orchestrator: 'queue',
      // The queue only carries runs the producer accepted on consent already on file.
      consentAccepted: false,
    });
    if (result.skipped) return { outcome: 'dropped', reason: `claim_lost_${result.run.status}` };
    return { outcome: 'ran', runId, status: result.run.status };
  } catch (error) {
    console.error(`[feed-queue] run ${runId} failed on delivery ${attempt}:`, error instanceof Error ? error.message : error);
    const after = await jobFeedRepo.getRun(userId, runId);
    // Claimed: the workflow marked it failed (or it is still running elsewhere). Never run it again.
    if (!after || after.status !== 'queued') return { outcome: 'failed' };
    // Never claimed: the workflow stopped before the claim (consent withdrawn, settings changed, the
    // database blipped). Another delivery is safe until the queue's last one.
    if (attempt < maxAttempts) return { outcome: 'retry' };
    await failUnclaimedRun(userId, runId);
    return { outcome: 'failed' };
  }
}

/** The queue gave up on a run's message: end the run if nobody ever claimed it. */
export async function failUnclaimedRun(userId: string, runId: string): Promise<void> {
  const ended = await jobFeedRepo.failQueuedRun(userId, runId, 'The job feed run could not start.');
  if (ended) console.error(`[feed-queue] run ${runId} was never claimed and is now failed`);
}
