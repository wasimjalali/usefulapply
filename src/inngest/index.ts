import { inngest } from '@/inngest/client';
import { jobFeedFunctions } from '@/inngest/job-feed';

export { inngest };

export const functions = [
  ...jobFeedFunctions,
];
