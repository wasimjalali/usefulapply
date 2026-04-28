import { cleanupHistoricalJobFeedData } from '@/lib/job-feed/cleanup';
import { captureJobFeedEvent } from '@/lib/job-feed/analytics';
import {
  expireStaleJobFeedApplicationGenerations,
  listDueJobFeedUsers,
  runJobFeedFoundationWorkflow,
  stageJobFeedRunForBatch,
} from '@/lib/job-feed/server';
import { releaseStaleReservations } from '@/lib/supabase/credit-reservations';
import {
  listPendingBatchIds,
  reconcileJobFeedBatch,
  reconcileStaleJobFeedBatchRuns,
  submitJobFeedBatchForStagedRuns,
} from '@/lib/job-feed/batch-workflow';
import { isBatchRankingEnabled } from '@/lib/job-feed/batch-ranker';
import {
  inngest,
  JOB_FEED_RUN_REQUESTED_EVENT,
  JOB_FEED_SWEEP_REQUESTED_EVENT,
  type JobFeedRunRequestedEventData,
  type JobFeedSweepRequestedEventData,
} from '@/inngest/client';

export const jobFeedSchedulerTickFunction = inngest.createFunction(
  {
    id: 'job-feed-hourly-scheduler-tick',
    name: 'Job Feed Hourly Scheduler Tick',
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => {
    const requestedAt = new Date().toISOString();
    const event = {
      name: JOB_FEED_SWEEP_REQUESTED_EVENT,
      data: {
        requestedAt,
        triggerSource: 'cron',
      } satisfies JobFeedSweepRequestedEventData,
    };

    const queued = await step.sendEvent('queue-job-feed-sweep', event);

    return {
      requestedAt,
      queuedSweepEvents: queued.ids.length,
      eventIds: queued.ids,
    };
  }
);

export const jobFeedSweepRequestedFunction = inngest.createFunction(
  {
    id: 'job-feed-sweep-requested',
    name: 'Job Feed Sweep Requested',
    triggers: [{ event: JOB_FEED_SWEEP_REQUESTED_EVENT }],
  },
  async ({ event, step }) => {
    const data = parseSweepRequestedEventData(event.data);
    const requestedAt = new Date(data.requestedAt);

    const dueUsers = await step.run('load-due-job-feed-users', async () => {
      return listDueJobFeedUsers(requestedAt);
    });
    await step.run('capture-due-job-feed-users', async () => {
      captureJobFeedEvent({
        event: 'job_feed_scheduler_due_users',
        properties: {
          trigger_source: data.triggerSource,
          requested_at: data.requestedAt,
          due_users: dueUsers.length,
          batch_ranking_enabled: isBatchRankingEnabled(),
        },
      });
    });

    // Batch path: stage every due user in one pass, then submit a single
    // Batch API job containing all of their ranking payloads. One JSONL
    // file, one batch_id, 50% cost vs sync. The batch reconciler (cron
    // every 10min) hydrates ranked_items once Azure finishes the batch.
    if (isBatchRankingEnabled() && dueUsers.length > 0) {
      const stagedCount = await step.run('stage-and-submit-batch', async () => {
        const staged: Array<Awaited<ReturnType<typeof stageJobFeedRunForBatch>>> = [];
        for (const dueUser of dueUsers) {
          try {
            const stagedRun = await stageJobFeedRunForBatch({
              userId: dueUser.userId,
              triggerSource: 'scheduled',
              now: requestedAt,
              force: false,
            });
            if (stagedRun) staged.push(stagedRun);
          } catch (error) {
            console.error('[job-feed] stage failed for', dueUser.userId, error);
          }
        }

        const stagedNonNull = staged.filter((item): item is NonNullable<typeof item> => item !== null);
        if (stagedNonNull.length === 0) return 0;

        const submission = await submitJobFeedBatchForStagedRuns(stagedNonNull);
        return submission?.submittedRunIds.length ?? 0;
      });

      const cleanup = await step.run('cleanup-historical-job-feed-data', async () => {
        return cleanupHistoricalJobFeedData({ now: requestedAt });
      });

      return {
        triggerSource: data.triggerSource,
        requestedAt: data.requestedAt,
        dueUsers: dueUsers.length,
        rankingMode: 'batch',
        batchStagedRuns: stagedCount,
        cleanup,
      };
    }

    // Sync path (default): fan out per-user events, each runs the full sync
    // workflow independently.
    const runEvents = dueUsers.map((dueUser) => ({
      name: JOB_FEED_RUN_REQUESTED_EVENT,
      data: {
        userId: dueUser.userId,
        requestedAt: data.requestedAt,
        triggerSource: 'scheduled',
        force: false,
      } satisfies JobFeedRunRequestedEventData,
    }));

    const queued = runEvents.length > 0
      ? await step.sendEvent('queue-per-user-job-feed-runs', runEvents)
      : { ids: [] };

    const cleanup = await step.run('cleanup-historical-job-feed-data', async () => {
      return cleanupHistoricalJobFeedData({ now: requestedAt });
    });

    return {
      triggerSource: data.triggerSource,
      requestedAt: data.requestedAt,
      dueUsers: dueUsers.length,
      rankingMode: 'sync',
      queuedRunEvents: queued.ids.length,
      cleanup,
    };
  }
);

export const jobFeedRunRequestedFunction = inngest.createFunction(
  {
    id: 'job-feed-run-requested',
    name: 'Job Feed Run Requested',
    triggers: [{ event: JOB_FEED_RUN_REQUESTED_EVENT }],
  },
  async ({ event, step }) => {
    const data = parseRunRequestedEventData(event.data);

    const workflow = await step.run('run-job-feed-workflow', async () => {
      return runJobFeedFoundationWorkflow({
        userId: data.userId,
        triggerSource: data.triggerSource,
        now: new Date(data.requestedAt),
        force: data.force,
        orchestrator: 'inngest',
      });
    });

    return {
      userId: data.userId,
      requestedAt: data.requestedAt,
      triggerSource: data.triggerSource,
      created: workflow.created,
      skipped: workflow.skipped,
      forced: workflow.forced ?? false,
      runId: workflow.run.id,
      runStatus: workflow.run.status,
    };
  }
);

// Poll pending Azure Batch API submissions every 10 minutes. The scheduled
// overnight path may create batches with status='validating' or 'in_progress';
// this reconciler walks each pending batch, fetches status, and if completed
// downloads the JSONL output and hydrates job_feed_ranked_items.
// Skipped entirely when JOB_FEED_BATCH_RANKING_ENABLED is not 'true'.
export const jobFeedBatchReconcilerFunction = inngest.createFunction(
  {
    id: 'job-feed-batch-reconciler',
    name: 'Job Feed Batch Reconciler',
    triggers: [{ cron: '*/10 * * * *' }],
  },
  async ({ step }) => {
    const staleRuns = await step.run('reconcile-stale-batch-runs', async () => {
      return reconcileStaleJobFeedBatchRuns();
    });

    if (!isBatchRankingEnabled()) {
      return {
        skipped: true,
        reason: 'Batch ranking is disabled.',
        staleRuns,
      };
    }

    const pendingIds = await step.run('list-pending-batch-ids', async () => {
      return listPendingBatchIds();
    });

    if (pendingIds.length === 0) {
      return {
        skipped: false,
        reconciledBatches: 0,
        runsReconciled: staleRuns.runsReconciled,
        runsFailed: staleRuns.runsFailed,
        staleRuns,
      };
    }

    let reconciledBatches = 0;
    let runsReconciled = 0;
    let runsFailed = 0;

    for (const batchId of pendingIds) {
      const result = await step.run(`reconcile-batch-${batchId}`, async () => {
        return reconcileJobFeedBatch(batchId);
      });

      if (result.status === 'completed' || result.status === 'failed' || result.status === 'expired' || result.status === 'cancelled') {
        reconciledBatches += 1;
      }
      runsReconciled += result.runsReconciled;
      runsFailed += result.runsFailed;
    }

    return {
      skipped: false,
      pendingBatches: pendingIds.length,
      reconciledBatches,
      runsReconciled: runsReconciled + staleRuns.runsReconciled,
      runsFailed: runsFailed + staleRuns.runsFailed,
      staleRuns,
    };
  }
);

export const jobFeedApplicationGenerationReconcilerFunction = inngest.createFunction(
  {
    id: 'job-feed-application-generation-reconciler',
    name: 'Job Feed Application Generation Reconciler',
    triggers: [{ cron: '*/10 * * * *' }],
  },
  async ({ step }) => {
    return step.run('expire-stale-application-generations', async () => {
      return expireStaleJobFeedApplicationGenerations();
    });
  }
);

export const creditReservationReconcilerFunction = inngest.createFunction(
  {
    id: 'credit-reservation-reconciler',
    name: 'Credit Reservation Reconciler',
    triggers: [{ cron: '*/10 * * * *' }],
  },
  async ({ step }) => {
    return step.run('release-stale-credit-reservations', async () => {
      return releaseStaleReservations({ maxAgeMs: 30 * 60 * 1000, limit: 50 });
    });
  }
);

export const jobFeedFunctions = [
  jobFeedSchedulerTickFunction,
  jobFeedSweepRequestedFunction,
  jobFeedRunRequestedFunction,
  jobFeedBatchReconcilerFunction,
  jobFeedApplicationGenerationReconcilerFunction,
  creditReservationReconcilerFunction,
];

function parseSweepRequestedEventData(value: unknown): JobFeedSweepRequestedEventData {
  if (!isRecord(value)) {
    throw new Error('Invalid job-feed sweep event payload.');
  }

  const requestedAt = typeof value.requestedAt === 'string' ? value.requestedAt : '';
  const triggerSource = value.triggerSource;

  if (!requestedAt || Number.isNaN(Date.parse(requestedAt))) {
    throw new Error('Job-feed sweep event is missing a valid requestedAt timestamp.');
  }

  if (triggerSource !== 'cron' && triggerSource !== 'internal_scheduler') {
    throw new Error('Job-feed sweep event has an invalid triggerSource.');
  }

  return {
    requestedAt,
    triggerSource,
  };
}

function parseRunRequestedEventData(value: unknown): JobFeedRunRequestedEventData {
  if (!isRecord(value)) {
    throw new Error('Invalid job-feed run event payload.');
  }

  const userId = typeof value.userId === 'string' ? value.userId : '';
  const requestedAt = typeof value.requestedAt === 'string' ? value.requestedAt : '';
  const triggerSource = value.triggerSource;
  const force = value.force === true;

  if (!userId) {
    throw new Error('Job-feed run event is missing a userId.');
  }

  if (!requestedAt || Number.isNaN(Date.parse(requestedAt))) {
    throw new Error('Job-feed run event is missing a valid requestedAt timestamp.');
  }

  if (
    triggerSource !== 'scheduled'
    && triggerSource !== 'manual_debug'
    && triggerSource !== 'manual_debug_force'
  ) {
    throw new Error('Job-feed run event has an invalid triggerSource.');
  }

  return {
    userId,
    requestedAt,
    triggerSource,
    force,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
