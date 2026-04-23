import { Inngest } from 'inngest';

export const JOB_FEED_SWEEP_REQUESTED_EVENT = 'job-feed/sweep.requested';
export const JOB_FEED_RUN_REQUESTED_EVENT = 'job-feed/run.requested';

export interface JobFeedSweepRequestedEventData {
  requestedAt: string;
  triggerSource: 'cron' | 'internal_scheduler';
}

export interface JobFeedRunRequestedEventData {
  userId: string;
  requestedAt: string;
  triggerSource: 'scheduled' | 'manual_debug' | 'manual_debug_force';
  force?: boolean;
}

export const inngest = new Inngest({
  id: 'karko-ai',
});
