import { cleanupHistoricalJobFeedData } from '@/lib/job-feed/cleanup';
import { listDueJobFeedUsers, runJobFeedFoundationWorkflow } from '@/lib/job-feed/server';
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

export const jobFeedFunctions = [
  jobFeedSchedulerTickFunction,
  jobFeedSweepRequestedFunction,
  jobFeedRunRequestedFunction,
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
