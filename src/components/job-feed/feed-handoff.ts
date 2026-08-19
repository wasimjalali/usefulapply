/**
 * Feed job → application conversation (J5). Creates or reuses the session,
 * puts it in the sidebar, hands the shell to it and leaves the autostart
 * signal ChatPanel picks up. Nothing here navigates: the feed and the
 * application kit are two columns of the same shell.
 */

import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
import { useFeedStore } from '@/store/useFeedStore';
import { createFeedApplication } from './feed-actions';
import { toStoreApplicationSession } from './feed-session-mapper';
import { buildJobHandoffLine } from './feed-format';

export type FeedHandoffMode = 'analyze' | 'apply';

export type FeedHandoffResult =
  | { ok: true; sessionId: string; autostarted: boolean }
  | { ok: false; error: string };

export async function startFeedHandoff(
  job: JobFeedFeedItem,
  mode: FeedHandoffMode,
  options: { hasCV: boolean },
): Promise<FeedHandoffResult> {
  if (!options.hasCV) {
    return {
      ok: false,
      error: 'I need your CV before I can check a fit. Upload it on the CV tab and come back to the feed.',
    };
  }

  const runId = useFeedStore.getState().overview?.feedRun?.id ?? null;
  const created = await createFeedApplication(job, runId);
  if (!created.ok) return created;

  const payload = created.data;
  const mapped = toStoreApplicationSession(payload.session, payload.generation);
  const sessionStore = useSessionStore.getState();
  sessionStore.setSessions([
    mapped,
    ...sessionStore.sessions.filter((item) => item.id !== mapped.id),
  ]);
  sessionStore.loadSession(mapped.id);

  const uiStore = useUIStore.getState();
  const autostarted = payload.generation.status === 'intent_created';
  if (autostarted) {
    uiStore.setPendingJobFeedAutostart({
      sessionId: payload.session.id,
      generationId: payload.generation.id,
      generationAttempt: payload.generation.attempt,
      mode,
      headline: buildHandoffHeadline(job),
      company: job.company,
    });
  }

  // The application conversation and its canvas are the CV tab of the shell.
  uiStore.setActiveTab('cv');

  return { ok: true, sessionId: payload.session.id, autostarted };
}

/** "**Product Manager, B2B SaaS** · Avetta" plus where it came from. */
export function buildHandoffHeadline(job: JobFeedFeedItem): string {
  const line = buildJobHandoffLine(job);
  const source = line ? `From today's feed · ${line}` : "From today's feed";
  return `**${job.title}** · ${job.company}\n\n${source}`;
}
