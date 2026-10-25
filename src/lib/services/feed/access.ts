import { requireJobFeedAccess, requireJobFeedView } from '@/lib/job-feed/auth';
import { FeedError } from './errors';

/** Free, Plus or Max. The same gate the viewer-level routes (career profile, search strategy) apply. */
export async function requireFeedViewer(userId: string): Promise<{ subscription_tier: string }> {
  const access = await requireJobFeedView({ id: userId });
  if (!access.ok) throw new FeedError(access.status, access.error, access.status === 403 ? 'plan_not_allowed' : 'account_incomplete');
  return access.profile;
}

/** Plus or Max: the gate of the routes that change the feed (POST career profile, settings). */
export async function requireFeedEditor(userId: string): Promise<void> {
  const access = await requireJobFeedAccess({ id: userId });
  if (!access.ok) throw new FeedError(access.status, access.error, access.status === 403 ? 'plan_not_allowed' : 'account_incomplete');
}
