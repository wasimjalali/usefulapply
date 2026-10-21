/**
 * The job feed inbox and the saved list, as the web routes serve them
 * (/api/job-feed/inbox, /api/job-feed/saved) and the MCP `get_job_feed` tool reads them.
 */

import { getProfile } from '@/db/repos/profiles';
import { getJobFeedTierLimits } from '@/lib/job-feed/constants';
import { canAccessJobFeed, canViewJobFeed } from '@/lib/job-feed/helpers';
import { listJobFeedInboxPageAdmin, listSavedJobFeedItemsAdmin } from '@/lib/job-feed/server';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { FeedError } from './errors';

export interface InboxPage {
  items: JobFeedFeedItem[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

/** `offset` and `limit` are already clamped by the caller (the route clamps its query string, the tool its schema). */
export async function loadInboxPage(userId: string, offset: number, limit: number): Promise<InboxPage> {
  const profile = await getProfile(userId);

  if (!profile || !canViewJobFeed(profile.subscription_tier)) {
    throw new FeedError(403, 'Job Feed is not available for this account.', 'plan_not_allowed');
  }

  // Free users can only see up to their tier visibleCount (5) across the
  // inbox. Premium (plus/max) users paginate without a tier cap here.
  const isPremium = canAccessJobFeed(profile.subscription_tier);
  const tierLimits = getJobFeedTierLimits(profile.subscription_tier);

  const page = await listJobFeedInboxPageAdmin({ userId, offset, limit });

  if (!page) {
    return { items: [], totalCount: 0, hasMore: false, offset, limit };
  }

  // Cap free users to their visibleCount across all inbox pages so they
  // cannot paginate beyond what the tier allows even via direct API calls.
  const visibleCap = isPremium ? page.totalCount : tierLimits.visibleCount;
  const cappedItems = page.items.slice(0, Math.max(0, visibleCap - offset));
  const cappedTotal = Math.min(page.totalCount, visibleCap);
  const cappedHasMore = isPremium ? page.hasMore : offset + cappedItems.length < cappedTotal;

  return { items: cappedItems, totalCount: cappedTotal, hasMore: cappedHasMore, offset, limit };
}

export async function loadSavedJobs(userId: string): Promise<JobFeedFeedItem[]> {
  const profile = await getProfile(userId);

  if (!profile) {
    console.error('[job-feed/saved] profile load error: profile not found');
    throw new FeedError(500, 'Failed to load saved jobs.', 'profile_missing');
  }

  if (!canViewJobFeed(profile.subscription_tier)) {
    throw new FeedError(403, 'Job Feed is not available for this account.', 'plan_not_allowed');
  }

  return listSavedJobFeedItemsAdmin({ userId });
}
