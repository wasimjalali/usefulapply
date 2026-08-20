import { canAccessJobFeed, canViewJobFeed } from '@/lib/job-feed/helpers';
import { getProfile } from '@/db/repos/profiles';

interface JobFeedAccessOk {
  ok: true;
  profile: { subscription_tier: string };
}

interface JobFeedAccessDenied {
  ok: false;
  status: 403 | 500;
  error: string;
}

export type JobFeedAccessResult = JobFeedAccessOk | JobFeedAccessDenied;

/**
 * Check that the authenticated user is on a plan that includes Job Feed.
 * Returns { ok: true, profile } on success, or { ok: false, status, error }
 * for 403 (plan gate) and 500 (profile load failure).
 *
 * Usage:
 *   const access = await requireJobFeedAccess(user);
 *   if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
 */
export async function requireJobFeedAccess(user: { id: string }): Promise<JobFeedAccessResult> {
  const profile = await getProfile(user.id);

  if (!profile) {
    return { ok: false, status: 500, error: 'Account setup incomplete.' };
  }

  if (!canAccessJobFeed(profile.subscription_tier)) {
    return { ok: false, status: 403, error: 'Plan upgrade required.' };
  }

  return { ok: true, profile };
}

/**
 * Discovery access: free, plus or max. Same missing-profile distinction as
 * requireJobFeedAccess, so a missing row is not reported as a plan gate.
 */
export async function requireJobFeedView(user: { id: string }): Promise<JobFeedAccessResult> {
  const profile = await getProfile(user.id);

  if (!profile) {
    return { ok: false, status: 500, error: 'Account setup incomplete.' };
  }

  if (!canViewJobFeed(profile.subscription_tier)) {
    return { ok: false, status: 403, error: 'Job Feed is not available for this account.' };
  }

  return { ok: true, profile };
}
