import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { canAccessJobFeed, canViewJobFeed, getJobFeedOverviewState } from '@/lib/job-feed/helpers';
import { getJobFeedTierLimits } from '@/lib/job-feed/constants';
import {
  getJobFeedRunDiagnostics,
  getLatestManualCompletedJobFeedRunAdmin,
  listJobFeedInboxPageAdmin,
  listLatestJobFeedItemsAdmin,
} from '@/lib/job-feed/server';
import { JOB_FEED_INBOX_PAGE_SIZE } from '@/lib/job-feed/constants';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { isCurrentCareerProfile, type CareerProfile } from '@/lib/job-feed/career-profile';
import type { JobFeedRun } from '@/lib/supabase/types';
import { getProfile } from '@/db/repos/profiles';
import { getDocumentByType } from '@/db/repos/documents';
import { getCareerProfileRow, getLatestRun, getSettings } from '@/db/repos/jobFeed';

export const runtime = 'nodejs';

const STALE_OVERVIEW_RUN_MS = 15 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`job-feed-overview:${ip}`, RATE_LIMITS['job-feed-overview']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const profile = await getProfile(user.id);

    if (!profile) {
      console.error('[job-feed/overview] profile load error: profile not found');
      return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
    }

    const canAccess = canAccessJobFeed(profile.subscription_tier);
    const canView = canViewJobFeed(profile.subscription_tier);

    const tierLimits = getJobFeedTierLimits(profile.subscription_tier);

    if (!canView) {
      return NextResponse.json({
        canAccess: false,
        settings: null,
        latestRun: null,
        latestManualRun: null,
        feedRun: null,
        latestRunDiagnostics: null,
        jobs: [],
        jobsTotalCount: 0,
        jobsHasMore: false,
        jobsTodayCount: 0,
        jobsBacklogCount: 0,
        state: 'upgrade_required',
        foundationMode: true,
        feedCap: tierLimits.visibleCount,
        target_roles_outdated: false,
      });
    }

    // A read failure here throws out to the outer catch, which returns the same
    // 500 payload the per-query error branches used to return.
    const [settings, latestRun, careerProfileRow, primaryCvRow] = await Promise.all([
      getSettings(user.id),
      getLatestRun(user.id),
      getCareerProfileRow(user.id),
      // Free feeds are CV-driven. The career profile is synthesized on the
      // first run, so the real prerequisite is "has a primary CV", not "has a
      // synthesized profile" - gating on the profile would deadlock free users
      // (no_cv_required hides the run button that would create the profile).
      getDocumentByType(user.id, 'primary_cv'),
    ]);

    // Load the run metadata once; inbox pagination is a separate call so
    // we can keep the overview payload small even at scale.
    const [feedRunSummary, firstPage, latestManualRun] = await Promise.all([
      latestRun
        ? listLatestJobFeedItemsAdmin({
            userId: user.id,
            latestRun: latestRun ?? null,
          }).then((result) => ({ run: result.run }))
        : Promise.resolve({ run: null }),
      listJobFeedInboxPageAdmin({
        userId: user.id,
        offset: 0,
        limit: JOB_FEED_INBOX_PAGE_SIZE,
      }),
      getLatestManualCompletedJobFeedRunAdmin(user.id),
    ]);

    // For free users the visible inbox is capped to tierLimits.visibleCount (5).
    // We slice here rather than in the DB layer to keep server.ts tier-agnostic.
    const visibleCap = !canAccess ? tierLimits.visibleCount : Number.POSITIVE_INFINITY;
    const rawJobs = firstPage?.items ?? [];
    const jobs = rawJobs.slice(0, visibleCap);
    const rawTotalCount = firstPage?.totalCount ?? 0;
    const totalCount = Math.min(rawTotalCount, visibleCap);
    const hasMore = !canAccess ? false : (firstPage?.hasMore ?? false);
    // Both counts reflect what the user can still act on right now.
    // Acting on a job (dismiss / rate not relevant / successful apply)
    // removes it from the visible inbox and the corresponding count
    // drops after the next overview refetch.
    const rawTodayCount = firstPage?.todayVisibleCount ?? 0;
    const rawBacklogCount = firstPage?.backlogVisibleCount ?? 0;
    const jobsTodayCount = !canAccess ? Math.min(rawTodayCount, visibleCap) : rawTodayCount;
    const backlogVisibleCount = !canAccess
      ? Math.min(rawBacklogCount, Math.max(0, visibleCap - rawTodayCount))
      : rawBacklogCount;
    const runForState = latestRun && isStaleOverviewRun(latestRun) && feedRunSummary.run
      ? feedRunSummary.run
      : latestRun;

    // Compare saved target_roles in settings against AI-inferred titles in the
    // career profile. Flag drift so the editing card can surface a notice.
    const targetRolesOutdated = computeTargetRolesOutdated(
      (settings?.target_roles as string[] | null) ?? null,
      careerProfileRow?.profile ?? null,
    );

    return NextResponse.json({
      canAccess,
      settings: settings ?? null,
      latestRun: latestRun ?? null,
      latestManualRun: latestManualRun ?? null,
      feedRun: feedRunSummary.run,
      latestRunDiagnostics: getJobFeedRunDiagnostics(latestRun ?? null),
      jobs,
      jobsTotalCount: totalCount,
      jobsHasMore: hasMore,
      jobsTodayCount,
      jobsBacklogCount: backlogVisibleCount,
      state: getJobFeedOverviewState({
        canAccess: canView,
        settings: settings ?? null,
        latestRun: runForState ?? null,
        jobsCount: totalCount,
        isFreeUser: !canAccess,
        hasPrimaryCv: Boolean(primaryCvRow),
      }),
      foundationMode: true,
      feedCap: tierLimits.visibleCount,
      target_roles_outdated: targetRolesOutdated,
    });
  } catch (error) {
    console.error('[job-feed/overview] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load job feed overview.' }, { status: 500 });
  }
}

/**
 * Compare the saved settings.target_roles against the AI career profile's
 * inferred titles. Returns true when they differ (drift detected). Returns
 * false when either side is missing — only flag when both are present and
 * clearly mismatched so we don't show a spurious banner on first setup.
 */
function computeTargetRolesOutdated(
  savedRoles: string[] | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CareerProfile structure may vary; we do a safe read.
  rawProfile: any,
): boolean {
  if (!savedRoles || savedRoles.length === 0) return false;
  if (!rawProfile || !isCurrentCareerProfile(rawProfile)) return false;
  const profile = rawProfile as CareerProfile;

  const profileRoles = profile.inferredTitles
    .map((title) => title.canonical.trim().toLowerCase())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

  const normalized = savedRoles
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
    .sort();

  if (normalized.length !== profileRoles.length) return true;
  return normalized.some((role, idx) => role !== profileRoles[idx]);
}

function isStaleOverviewRun(run: JobFeedRun): boolean {
  if (run.status !== 'running' && run.status !== 'queued') {
    return false;
  }

  const referenceTime = run.started_at ?? run.created_at;
  const timestamp = referenceTime ? Date.parse(referenceTime) : Number.NaN;
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp > STALE_OVERVIEW_RUN_MS;
}
