'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeedStore } from '@/store/useFeedStore';
import { FeedCanvas } from './FeedCanvas';
import { loadFeedOverview } from './feed-actions';
import { getJobFeedPreviewMode } from './preview-utils';

/**
 * The feed on a phone: today's list and the ad, read-only. The desktop shell
 * pairs the same canvas with the feed conversation, which is where setup and
 * steering live.
 */
export function MobileFeed() {
  const { user } = useAuth();
  const [previewMode] = useState(() => getJobFeedPreviewMode());
  const overviewLoaded = useFeedStore((state) => state.overview !== null);

  useEffect(() => {
    if (previewMode !== 'off') return;
    if (!user) return;
    // The desktop shell renders in the same document (hidden at this width)
    // and loads the same feed, so only fetch when nothing has yet.
    if (overviewLoaded) return;
    void loadFeedOverview();
    // Loading once is the point; re-running when the overview lands would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, user]);

  return <FeedCanvas readOnly />;
}
