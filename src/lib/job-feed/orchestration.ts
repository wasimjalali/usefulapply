import {
  inngest,
  JOB_FEED_RUN_REQUESTED_EVENT,
  JOB_FEED_SWEEP_REQUESTED_EVENT,
  type JobFeedRunRequestedEventData,
  type JobFeedSweepRequestedEventData,
} from '@/inngest/client';
import type { JobFeedRunWorkflowResult } from '@/lib/job-feed/types';

export type JobFeedOrchestrator = 'inngest';
export type JobFeedExecutionMode = 'background';

export interface JobFeedDispatchState {
  orchestrator: JobFeedOrchestrator;
  execution: JobFeedExecutionMode;
}

export interface JobFeedUserRunDispatchResult extends JobFeedDispatchState {
  requestedUserId: string;
  accepted: boolean;
  eventIds: string[];
  workflow: JobFeedRunWorkflowResult | null;
}

export interface JobFeedScheduledSweepDispatchResult extends JobFeedDispatchState {
  accepted: boolean;
  requestedAt: string;
  triggerSource: JobFeedSweepRequestedEventData['triggerSource'];
  eventIds: string[];
}

const INNGEST_DISPATCH: JobFeedDispatchState = {
  orchestrator: 'inngest',
  execution: 'background',
};

export async function dispatchJobFeedUserRun(params: {
  userId: string;
  triggerSource?: JobFeedRunRequestedEventData['triggerSource'];
  now?: Date;
  force?: boolean;
}): Promise<JobFeedUserRunDispatchResult> {
  const requestedAt = (params.now ?? new Date()).toISOString();
  const payload = {
    name: JOB_FEED_RUN_REQUESTED_EVENT,
    data: {
      userId: params.userId,
      requestedAt,
      triggerSource: params.triggerSource ?? 'manual_debug',
      force: params.force === true,
    } satisfies JobFeedRunRequestedEventData,
  };

  const result = await inngest.send(payload).catch((error) => {
    throw withDispatchContext(error, 'job feed run dispatch');
  });

  return {
    ...INNGEST_DISPATCH,
    requestedUserId: params.userId,
    accepted: result.ids.length > 0,
    eventIds: result.ids,
    workflow: null,
  };
}

export async function dispatchScheduledJobFeedSweep(now = new Date()): Promise<JobFeedScheduledSweepDispatchResult> {
  const requestedAt = now.toISOString();
  const payload = {
    name: JOB_FEED_SWEEP_REQUESTED_EVENT,
    data: {
      requestedAt,
      triggerSource: 'internal_scheduler',
    } satisfies JobFeedSweepRequestedEventData,
  };

  const result = await inngest.send(payload).catch((error) => {
    throw withDispatchContext(error, 'job feed sweep dispatch');
  });

  return {
    ...INNGEST_DISPATCH,
    accepted: result.ids.length > 0,
    requestedAt,
    triggerSource: 'internal_scheduler',
    eventIds: result.ids,
  };
}

function withDispatchContext(error: unknown, action: string): Error {
  const message = error instanceof Error ? error.message : `Unknown ${action} failure`;
  return new Error(
    `Failed to send ${action} via Inngest. ${message}`
  );
}
