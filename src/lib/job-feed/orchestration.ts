import { listDueJobFeedUsers, runJobFeedFoundationWorkflow } from '@/lib/job-feed/server';
import type { JobFeedRunWorkflowResult } from '@/lib/job-feed/types';

export type JobFeedOrchestrator = 'direct';
export type JobFeedExecutionMode = 'inline';

export interface JobFeedDispatchState {
  orchestrator: JobFeedOrchestrator;
  execution: JobFeedExecutionMode;
}

export interface JobFeedUserRunDispatchResult extends JobFeedDispatchState {
  requestedUserId: string;
  accepted: boolean;
  workflow: JobFeedRunWorkflowResult;
}

export interface JobFeedScheduledSweepDispatchResult extends JobFeedDispatchState {
  checkedUsers: number;
  dueUsers: number;
  acceptedUsers: number;
  processedRuns: number;
  skippedRuns: number;
  failedRuns: Array<{ userId: string; error: string }>;
}

const DIRECT_DISPATCH: JobFeedDispatchState = {
  orchestrator: 'direct',
  execution: 'inline',
};

export async function dispatchJobFeedUserRun(params: {
  userId: string;
  triggerSource?: string;
  now?: Date;
  force?: boolean;
}): Promise<JobFeedUserRunDispatchResult> {
  const workflow = await runJobFeedFoundationWorkflow(params);

  return {
    ...DIRECT_DISPATCH,
    requestedUserId: params.userId,
    accepted: true,
    workflow,
  };
}

export async function dispatchScheduledJobFeedSweep(now = new Date()): Promise<JobFeedScheduledSweepDispatchResult> {
  const dueUsers = await listDueJobFeedUsers(now);

  const result: JobFeedScheduledSweepDispatchResult = {
    ...DIRECT_DISPATCH,
    checkedUsers: dueUsers.length,
    dueUsers: dueUsers.length,
    acceptedUsers: dueUsers.length,
    processedRuns: 0,
    skippedRuns: 0,
    failedRuns: [],
  };

  for (const dueUser of dueUsers) {
    try {
      const dispatch = await dispatchJobFeedUserRun({
        userId: dueUser.userId,
        triggerSource: 'scheduled',
        now,
      });

      if (dispatch.workflow.skipped) {
        result.skippedRuns += 1;
      } else {
        result.processedRuns += 1;
      }
    } catch (error) {
      result.failedRuns.push({
        userId: dueUser.userId,
        error: error instanceof Error ? error.message : 'Unknown scheduling error',
      });
    }
  }

  return result;
}
