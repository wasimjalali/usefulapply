import { getPostHogServer } from '@/lib/posthog-server';

type JobFeedAnalyticsValue = string | number | boolean | null | undefined;
type JobFeedAnalyticsProperties = Record<string, JobFeedAnalyticsValue>;

function compactProperties(properties: JobFeedAnalyticsProperties): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  ) as Record<string, string | number | boolean | null>;
}

export function captureJobFeedEvent(params: {
  distinctId?: string | null;
  event: string;
  properties?: JobFeedAnalyticsProperties;
  logLevel?: 'info' | 'warn' | 'error';
}): void {
  const properties = compactProperties(params.properties ?? {});
  const distinctId = params.distinctId ?? 'job-feed-system';

  try {
    getPostHogServer().capture({
      distinctId,
      event: params.event,
      properties,
    });
  } catch (error) {
    console.error('[job-feed/analytics] capture failed:', params.event, error);
  }

  const logPayload = { distinctId, ...properties };
  if (params.logLevel === 'error') {
    console.error(`[job-feed/analytics] ${params.event}`, logPayload);
  } else if (params.logLevel === 'warn') {
    console.warn(`[job-feed/analytics] ${params.event}`, logPayload);
  } else {
    console.info(`[job-feed/analytics] ${params.event}`, logPayload);
  }
}

export function captureJobFeedActionRejected(params: {
  userId?: string | null;
  route: string;
  action: string;
  reason: string;
  jobId?: string | null;
  runId?: string | null;
  status?: number;
  subscriptionTier?: string | null;
}): void {
  captureJobFeedEvent({
    distinctId: params.userId,
    event: 'job_feed_action_rejected',
    logLevel: 'warn',
    properties: {
      route: params.route,
      action: params.action,
      reason: params.reason,
      job_id: params.jobId,
      feed_run_id: params.runId,
      status: params.status,
      subscription_tier: params.subscriptionTier,
    },
  });
}
