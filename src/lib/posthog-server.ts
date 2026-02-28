import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

// No-op PostHog client for when the API key is not configured
const noopPostHog = {
  capture: () => {},
  captureException: () => {},
  identify: () => {},
  flush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
} as unknown as PostHog;

export function getPostHogServer(): PostHog {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return noopPostHog;
  }
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
