/**
 * Every network call the feed conversation and the feed canvas make. Kept out
 * of the components so both columns can trigger the same work and read the
 * same result from useFeedStore.
 *
 * Each function returns a plain result the caller turns into a chat line,
 * nothing here writes conversation copy.
 */

import { JOB_FEED_INBOX_PAGE_SIZE } from '@/lib/job-feed/constants';
import type {
  JobFeedApplyResponse,
  JobFeedFeedItem,
  JobFeedFeedbackResponse,
  JobFeedOverviewResponse,
  JobFeedSettingsInput,
} from '@/lib/job-feed/types';
import type { SearchStrategy } from '@/lib/job-feed/search-strategy';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import { useFeedStore } from '@/store/useFeedStore';
import { notifyJobFeedBadgeRefresh } from '@/hooks/useJobFeedBadge';

export type FeedResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorFrom(payload: Record<string, unknown>, fallback: string): string {
  const value = payload.error ?? payload.detail;
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

export async function loadFeedOverview(options?: { quiet?: boolean }): Promise<FeedResult<JobFeedOverviewResponse>> {
  const store = useFeedStore.getState();
  if (!options?.quiet) store.setStatus('loading');

  try {
    const response = await fetch('/api/job-feed/overview', { method: 'GET', cache: 'no-store' });
    const payload = await readJson(response);
    if (!response.ok) {
      const message = errorFrom(payload, 'Your feed did not load.');
      useFeedStore.getState().setStatus('error', message);
      return { ok: false, error: message };
    }
    const overview = payload as unknown as JobFeedOverviewResponse;
    const next = useFeedStore.getState();
    next.setOverview(overview);
    next.setStatus('ready');
    return { ok: true, data: overview };
  } catch {
    const message = 'Your feed did not load. Check your connection and try again.';
    useFeedStore.getState().setStatus('error', message);
    return { ok: false, error: message };
  }
}

export async function loadSavedFeedJobs(): Promise<FeedResult<JobFeedFeedItem[]>> {
  const store = useFeedStore.getState();
  store.setLoadingSaved(true);
  store.setSavedError(null);
  const fail = (message: string): FeedResult<JobFeedFeedItem[]> => {
    // Leave savedJobs null: an empty array here would render as "nothing
    // saved yet", which is a different and untrue thing.
    useFeedStore.getState().setSavedError(message);
    return { ok: false, error: message };
  };
  try {
    const response = await fetch('/api/job-feed/saved', { method: 'GET', cache: 'no-store' });
    const payload = await readJson(response);
    if (!response.ok) {
      return fail(errorFrom(payload, 'Your saved roles did not load. Try the Saved tab again in a moment.'));
    }
    const jobs = (payload.jobs ?? []) as JobFeedFeedItem[];
    useFeedStore.getState().setSavedJobs(jobs);
    return { ok: true, data: jobs };
  } catch {
    return fail('Your saved roles did not load. Try the Saved tab again in a moment.');
  } finally {
    useFeedStore.getState().setLoadingSaved(false);
  }
}

export async function loadMoreFeedJobs(): Promise<FeedResult<JobFeedFeedItem[]>> {
  const store = useFeedStore.getState();
  const overview = store.overview;
  if (!overview || store.loadingMore) return { ok: true, data: [] };
  const already = overview.jobs.length + store.extraJobs.length;
  if (already >= (overview.jobsTotalCount ?? 0)) return { ok: true, data: [] };

  store.setLoadingMore(true);
  try {
    const response = await fetch(
      `/api/job-feed/inbox?offset=${already}&limit=${JOB_FEED_INBOX_PAGE_SIZE}`,
      { method: 'GET', cache: 'no-store' },
    );
    const payload = await readJson(response);
    if (!response.ok) {
      return { ok: false, error: errorFrom(payload, 'More roles did not load.') };
    }
    const items = (payload.items ?? []) as JobFeedFeedItem[];
    useFeedStore.getState().appendExtraJobs(items);
    return { ok: true, data: items };
  } catch {
    return { ok: false, error: 'More roles did not load.' };
  } finally {
    useFeedStore.getState().setLoadingMore(false);
  }
}

/** The queries the next run will use, with the ranker's rationale for each. */
export async function loadSearchStrategy(): Promise<SearchStrategy | null> {
  try {
    const response = await fetch('/api/job-feed/search-strategy', { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await readJson(response);
    const strategy = (payload.strategy ?? null) as SearchStrategy | null;
    useFeedStore.getState().setStrategy(strategy);
    return strategy;
  } catch {
    return null;
  }
}

/** What the product read from the CV. Paid plans only; null otherwise. */
export async function loadCareerProfile(): Promise<CareerProfile | null> {
  try {
    const response = await fetch('/api/job-feed/career-profile', { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await readJson(response);
    const profile = (payload.profile ?? null) as CareerProfile | null;
    useFeedStore.getState().setCareerProfile(profile);
    return profile;
  } catch {
    return null;
  }
}

export interface FeedRunOutcome {
  skipped: boolean;
  cooldown: boolean;
  nextRunAt: string | null;
  rankedJobsCount: number | null;
  duplicateCount: number | null;
}

export async function runFeed(): Promise<FeedResult<FeedRunOutcome>> {
  useFeedStore.getState().setIsRunning(true);
  try {
    const response = await fetch('/api/job-feed/run', { method: 'POST' });
    const payload = await readJson(response);
    if (!response.ok) {
      return { ok: false, error: errorFrom(payload, "Today's run did not go through.") };
    }
    return {
      ok: true,
      data: {
        skipped: Boolean(payload.skipped),
        cooldown: Boolean(payload.cooldown),
        nextRunAt: typeof payload.nextRunAt === 'string' ? payload.nextRunAt : null,
        rankedJobsCount: typeof payload.rankedJobsCount === 'number' ? payload.rankedJobsCount : null,
        duplicateCount: typeof payload.duplicateCount === 'number' ? payload.duplicateCount : null,
      },
    };
  } catch {
    return { ok: false, error: "Today's run did not go through. Try again in a moment." };
  } finally {
    useFeedStore.getState().setIsRunning(false);
  }
}

/**
 * Save the feed settings. On a first save the career profile has to exist
 * first, because the settings route mirrors target roles off it and rejects a
 * payload that would end up with none.
 */
export async function saveFeedSettings(
  input: JobFeedSettingsInput,
  options?: { firstTime?: boolean },
): Promise<FeedResult<null>> {
  useFeedStore.getState().setIsSavingSettings(true);
  try {
    if (options?.firstTime) {
      const profileResponse = await fetch('/api/job-feed/career-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const profilePayload = await readJson(profileResponse);
      if (!profileResponse.ok || profilePayload.status === 'no_cv') {
        return {
          ok: false,
          error: profilePayload.status === 'no_cv'
            ? 'I need your CV before I can build the feed. Upload it on the CV tab and come back.'
            : errorFrom(profilePayload, 'I could not read your CV into a search profile. Try again in a moment.'),
        };
      }
      useFeedStore.getState().patchBuild({ profileDone: true });
    }

    const response = await fetch('/api/job-feed/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return { ok: false, error: errorFrom(payload, 'Your feed settings did not save.') };
    }

    // Cache-aware: only regenerates when the profile or the settings changed.
    // A failure here is not fatal, the next run regenerates the strategy.
    try {
      await fetch('/api/job-feed/search-strategy', { method: 'POST' });
    } catch {
      // Non-fatal, see above.
    }
    useFeedStore.getState().patchBuild({ strategyDone: true });

    return { ok: true, data: null };
  } catch {
    return { ok: false, error: 'Your feed settings did not save. Try again in a moment.' };
  } finally {
    useFeedStore.getState().setIsSavingSettings(false);
  }
}

export async function recordFeedFeedback(
  job: JobFeedFeedItem,
  action: 'opened' | 'saved' | 'dismissed' | 'rated_helpful' | 'rated_not_relevant',
  runId: string | null,
): Promise<FeedResult<JobFeedFeedbackResponse['feedback']>> {
  try {
    const response = await fetch('/api/job-feed/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, action, runId }),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return { ok: false, error: errorFrom(payload, 'That did not save.') };
    }
    const typed = payload as unknown as JobFeedFeedbackResponse;
    useFeedStore.getState().patchJobFeedback(job.id, typed.feedback);
    notifyJobFeedBadgeRefresh();
    return { ok: true, data: typed.feedback };
  } catch {
    return { ok: false, error: 'That did not save. Try again in a moment.' };
  }
}

/** Create (or reuse) the application session behind a feed job. */
export async function createFeedApplication(
  job: JobFeedFeedItem,
  runId: string | null,
): Promise<FeedResult<JobFeedApplyResponse>> {
  try {
    const response = await fetch('/api/job-feed/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, runId }),
    });
    if (!response.ok) {
      // The route's own strings are operator-facing ("Failed to start the
      // application handoff"), so the conversation says it in its own voice.
      return { ok: false, error: applyErrorFor(response.status) };
    }
    const payload = await readJson(response);
    const typed = payload as unknown as JobFeedApplyResponse;
    useFeedStore.getState().patchJobFeedback(job.id, typed.feedback);
    return { ok: true, data: typed };
  } catch {
    return { ok: false, error: 'I could not open an application for this role. Try again in a moment.' };
  }
}

function applyErrorFor(status: number): string {
  switch (status) {
    case 401:
      return 'Your session expired. Sign in again and pick the role once more.';
    case 403:
      return 'Checking a fit needs an account with credits. Upgrade and I\'ll pick up here.';
    case 404:
      return 'That role is no longer in your feed. Refresh and pick another one.';
    case 409:
      return "That role's application already moved on. Open it from the sidebar.";
    case 429:
      return 'Too many requests just now. Give it a minute and try again.';
    default:
      return "I couldn't open an application for that role. Try again in a moment.";
  }
}
