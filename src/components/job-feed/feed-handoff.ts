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
import { mergeFeedSession, toStoreApplicationSession } from './feed-session-mapper';
import { buildJobHandoffLine, escapeMarkdown } from './feed-format';

export type FeedHandoffMode = 'analyze' | 'apply';

export type FeedHandoffResult =
  | { ok: true; sessionId: string; autostarted: boolean }
  | { ok: false; error: string };

export async function startFeedHandoff(
  job: JobFeedFeedItem,
  mode: FeedHandoffMode,
  options: { hasCV: boolean; runId?: string | null },
): Promise<FeedHandoffResult> {
  if (!options.hasCV) {
    return {
      ok: false,
      error: 'I need your CV before I can check a fit. Upload it on the CV tab and come back to the feed.',
    };
  }

  // A role checked from Saved may have been ranked days ago, so today's run id
  // would mis-attribute it. Null lets the server resolve the job's own run.
  // Which tab is open only says that for a click on a card, so a caller that
  // knows better (the chat, where the role can come from anywhere) passes it.
  const feedState = useFeedStore.getState();
  const runId = options.runId !== undefined
    ? options.runId
    : (feedState.listTab === 'saved' ? null : (feedState.overview?.feedRun?.id ?? null));
  const created = await createFeedApplication(job, runId, mode);
  if (!created.ok) return created;

  const payload = created.data;
  const mapped = toStoreApplicationSession(payload.session, payload.generation);
  const sessionStore = useSessionStore.getState();
  const existing = sessionStore.sessions.find((item) => item.id === mapped.id)
    ?? (sessionStore.currentSession?.id === mapped.id ? sessionStore.currentSession : undefined);
  const merged = mergeFeedSession(mapped, existing);
  sessionStore.setSessions([
    merged,
    ...sessionStore.sessions.filter((item) => item.id !== merged.id),
  ]);
  sessionStore.loadSession(merged.id);

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
  const line = escapeMarkdown(buildJobHandoffLine(job));
  const source = line ? `From today's feed · ${line}` : "From today's feed";
  return `**${escapeMarkdown(job.title)}** · ${escapeMarkdown(job.company)}\n\n${source}`;
}
