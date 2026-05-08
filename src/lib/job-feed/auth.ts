import type { SupabaseClient, User } from '@supabase/supabase-js';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';

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
 *   const access = await requireJobFeedAccess(supabase, user);
 *   if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase generated types don't cover all job-feed tables yet.
export async function requireJobFeedAccess(supabase: SupabaseClient | any, user: User): Promise<JobFeedAccessResult> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return { ok: false, status: 500, error: 'Account setup incomplete.' };
  }

  if (!canAccessJobFeed(profile.subscription_tier)) {
    return { ok: false, status: 403, error: 'Plan upgrade required.' };
  }

  return { ok: true, profile };
}
