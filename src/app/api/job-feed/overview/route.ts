import { NextRequest, NextResponse } from 'next/server';
import { readRunsLeftToday } from '@/lib/services/feed/run';
import { getCurrentUser } from '@/auth/server';
import { canAccessJobFeed, canViewJobFeed, getJobFeedOverviewState, getLocalDateKey } from '@/lib/job-feed/helpers';
import { getJobFeedTierLimits, JOB_FEED_MIRRORED_ROLE_LIMIT } from '@/lib/job-feed/constants';
import {
  getJobFeedRunDiagnostics,
  getLatestManualCompletedJobFeedRunAdmin,
  listJobFeedInboxPageAdmin,
  resolveJobFeedRunForFeedAdmin,
} from '@/lib/job-feed/server';
import { JOB_FEED_INBOX_PAGE_SIZE } from '@/lib/job-feed/constants';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { isCurrentCareerProfile, type CareerProfile } from '@/lib/job-feed/career-profile';
import type { JobFeedRun } from '@/db/types';
import { getProfile } from '@/db/repos/profiles';
import { getDocumentByType } from '@/db/repos/documents';
import { getCareerProfileRow, getLatestRun, getSettings } from '@/db/repos/jobFeed';

export const runtime = 'nodejs';

const STALE_OVERVIEW_RUN_MS = 15 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-overview:${user.id}`, RATE_LIMITS['job-feed-overview']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
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
        jobsMatchedCount: 0,
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
    const [feedRun, firstPage, latestManualRun] = await Promise.all([
      // Only the run is needed here. Building the item list too would join
      // every ranked row in the window and throw it away, on a payload the
      // client polls every 10s while a run is generating.
      latestRun
        ? resolveJobFeedRunForFeedAdmin({ userId: user.id, latestRun })
        : Promise.resolve(null),
      listJobFeedInboxPageAdmin({
        userId: user.id,
        offset: 0,
        limit: JOB_FEED_INBOX_PAGE_SIZE,
      }),
      getLatestManualCompletedJobFeedRunAdmin(user.id),
    ]);
    const runAllowance = await readRunsLeftToday(user.id);

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
    const runForState = latestRun && isStaleOverviewRun(latestRun) && feedRun
      ? feedRun
      : latestRun;
    // Ranked count from today's run, before the free-tier list cap. Paid
    // users already see every ranked row, so the two numbers match. A run
    // from another day must not become "matched today".
    const todayKey = getLocalDateKey(
      new Date(),
      settings?.user_timezone || latestRun?.local_timezone || 'UTC',
    );
    const rankedToday = latestRun?.local_date === todayKey
      ? latestRun.ranked_jobs_count
      : 0;
    const jobsMatchedCount = Math.max(
      0,
      typeof rankedToday === 'number' && Number.isFinite(rankedToday)
        ? rankedToday
        : rawTodayCount,
    );

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
      runsLeftToday: runAllowance.runsLeftToday,
      runsPerDay: runAllowance.runsPerDay,
      feedRun,
      latestRunDiagnostics: getJobFeedRunDiagnostics(latestRun ?? null),
      jobs,
      jobsTotalCount: totalCount,
      jobsMatchedCount,
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

  // Same dedupe casing and same slice as the settings writer, otherwise the
  // lengths never match and this reads as drift on every save.
  const profileRoles = profile.inferredTitles
    .map((title) => title.canonical.trim().toLowerCase())
    .filter((v, i, a) => v.length > 0 && a.indexOf(v) === i)
    .slice(0, JOB_FEED_MIRRORED_ROLE_LIMIT)
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
