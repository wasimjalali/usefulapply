'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { BrandIcon } from '@/components/BrandLogo';
import { MarkdownText } from '@/components/MarkdownText';
import { useAuth } from '@/contexts/AuthContext';
import { withGreeting } from '@/components/chat/ChatGreeting';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import type { DatePrefs } from '@/lib/utils/format-date';
import { openStoredSession } from '@/lib/open-session';
import { useUIStore } from '@/store/useUIStore';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { regenerateFollowUpForSession } from '@/lib/regenerate-client';
import {
  trackerMessageId,
  useTrackerStore,
  type TrackerChip,
  type TrackerMessage,
} from '@/store/useTrackerStore';
import type { TrackerApplicationRow } from '@/db/repos/sessions';
import {
  deriveNextStep,
  formatInterviewDate,
  parseDate,
  toTrackerStatus,
  type TrackerStatus,
} from './tracker-status';

interface TrackerAction {
  type: 'status' | 'follow_up' | 'prep' | 'hide_rejected' | 'show_rejected' | 'none';
  sessionId?: string;
  status?: TrackerStatus;
  dateTime?: string | null;
  company?: string | null;
}

export function TrackerConversation() {
  const { user, profile } = useAuth();
  const datePrefs = useDatePrefs();
  const rows = useTrackerStore((s) => s.rows);
  const messages = useTrackerStore((s) => s.messages);
  const thinking = useTrackerStore((s) => s.thinking);
  const hideRejected = useTrackerStore((s) => s.hideRejected);
  const addMessage = useTrackerStore((s) => s.addMessage);
  const setThinking = useTrackerStore((s) => s.setThinking);
  const applyStatus = useTrackerStore((s) => s.applyStatus);
  const setHideRejected = useTrackerStore((s) => s.setHideRejected);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  const loading = useTrackerStore((s) => s.loading);
  const loadedOnce = useTrackerStore((s) => s.loadedOnce);

  const [input, setInput] = useState('');
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const opening = useMemo(
    () => buildStateOfPlay(rows, hideRejected, new Date(), datePrefs),
    [rows, hideRejected, datePrefs],
  );

  // Written once the fetch has landed, empty or not. The messages live in the
  // store, so leaving the tracker and coming back must not write it again.
  useEffect(() => {
    if (!loadedOnce || loading || messages.length > 0) return;
    addMessage({ id: trackerMessageId('open'), role: 'assistant', text: withGreeting(opening.text, user?.name), chips: opening.chips });
  }, [addMessage, loadedOnce, loading, messages.length, opening, user?.name]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, thinking]);

  const say = useCallback(
    (text: string, chips?: TrackerChip[]) => {
      addMessage({ id: trackerMessageId('a'), role: 'assistant', text, chips });
    },
    [addMessage],
  );

  const runFollowUp = useCallback(
    async (sessionId: string) => {
      const row = rows.find((candidate) => candidate.id === sessionId);
      setThinking(true);
      const result = await regenerateFollowUpForSession(sessionId);
      setThinking(false);
      if (result.ok) {
        const opened = await openStoredSession(sessionId);
        say(`Your follow-up for ${row?.company ?? 'that role'} is ready. It's in the Emails tab.`);
        if (opened) setActiveTab('email');
        return;
      }
      if (result.code === 'INSUFFICIENT_CREDITS') {
        say(`You need ${result.required} credits for that and you have ${result.available}. Add credits in Usage and Billing.`);
        return;
      }
      if (result.code === 'NO_CONTEXT') {
        say('I could not find that application’s job description or your CV.');
        return;
      }
      if (result.code === 'SIGNED_OUT') {
        say('Your session expired. Sign in again to continue.');
        return;
      }
      if (result.code === 'REQUEST_IN_PROGRESS') {
        say('That follow-up is already being written. It lands in the Emails tab.');
        return;
      }
      say('That did not go through. Try again in a moment.');
    },
    [rows, say, setActiveTab, setThinking],
  );

  const handleChip = useCallback(
    async (chip: TrackerChip) => {
      if (!user) return;
      const action = chip.action;

      if (action.kind === 'hide_rejected' || action.kind === 'show_rejected') {
        const hidden = action.kind === 'hide_rejected';
        await setHideRejected(user.id, hidden);
        say(hidden ? 'Rejected applications are hidden.' : 'Rejected applications are back.');
        return;
      }

      if (action.kind === 'prep') {
        const opened = await openStoredSession(action.sessionId);
        if (!opened) {
          say('I could not open that application. Try from the row.');
          return;
        }
        setActiveTab('cv');
        say('Opened it. Ask for prep in that conversation and I’ll use the job description and your CV.');
        return;
      }

      if (action.kind === 'follow_up') {
        // The price goes on the control before the click.
        if (pendingFollowUp === action.sessionId) {
          setPendingFollowUp(null);
          await runFollowUp(action.sessionId);
          return;
        }
        setPendingFollowUp(action.sessionId);
        const row = rows.find((candidate) => candidate.id === action.sessionId);
        say(`I'll write the follow-up for ${row?.company ?? 'that role'} from the job description and your CV.`, [
          {
            id: trackerMessageId('confirm'),
            label: `Write it · ${CREDIT_COSTS.FOLLOW_UP_REGEN} credits`,
            primary: true,
            action: { kind: 'follow_up', sessionId: action.sessionId },
          },
        ]);
      }
    },
    [pendingFollowUp, rows, runFollowUp, say, setActiveTab, setHideRejected, user],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking || !user) return;
    setInput('');
    addMessage({ id: trackerMessageId('u'), role: 'user', text });
    setThinking(true);
    try {
      const response = await fetch('/api/tracker/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = (await response.json()) as { reply?: string; error?: string; action?: TrackerAction };
      if (!response.ok || !data.reply) {
        say(data.error ?? 'That did not go through. Try again.');
        return;
      }

      const action = data.action ?? { type: 'none' };
      if (action.type === 'status' && action.sessionId && action.status) {
        const isInterview = action.status === 'interview';
        await applyStatus(user.id, action.sessionId, {
          status: action.status,
          interviewAt: isInterview ? action.dateTime ?? null : null,
          followUpDueAt: !isInterview && action.dateTime ? action.dateTime : null,
        });
        const promise = remindsFor(profile, action.status) ? ' I’ll remind you the day before.' : '';
        say(
          `${data.reply}${promise}`,
          isInterview ? prepChip(action.sessionId, action.company ?? null) : undefined,
        );
        return;
      }

      if (action.type === 'follow_up' && action.sessionId) {
        setPendingFollowUp(action.sessionId);
        say(data.reply, [
          {
            id: trackerMessageId('confirm'),
            label: `Write it · ${CREDIT_COSTS.FOLLOW_UP_REGEN} credits`,
            primary: true,
            action: { kind: 'follow_up', sessionId: action.sessionId },
          },
        ]);
        return;
      }

      if (action.type === 'prep' && action.sessionId) {
        say(data.reply, prepChip(action.sessionId, action.company ?? null));
        return;
      }

      if (action.type === 'hide_rejected' || action.type === 'show_rejected') {
        await setHideRejected(user.id, action.type === 'hide_rejected');
        say(data.reply);
        return;
      }

      say(data.reply);
    } catch {
      say('That did not go through. Try again.');
    } finally {
      setThinking(false);
    }
  }, [addMessage, applyStatus, input, profile, say, setHideRejected, setThinking, thinking, user]);

  return (
    <section className="flex h-full w-full min-w-0 flex-col border-r border-border bg-surface">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink">Application Tracker</h2>
          <p className="text-xs text-ink-muted">
            {rows.length} application{rows.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 pb-3 pt-4">
        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[86%] rounded-card rounded-br-sm border border-border bg-surface-raised px-3.5 py-3 shadow-resting">
                <MarkdownText content={message.text} className="text-sm text-ink-body" />
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex gap-3">
              <div className="h-fit flex-shrink-0">
                <BrandIcon size="xs" theme="light" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <MarkdownText content={message.text} className="text-sm leading-relaxed text-ink-body" />
                {message.chips && message.chips.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {message.chips.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        disabled={thinking}
                        onClick={() => {
                          void handleChip(chip);
                        }}
                        className={`inline-flex h-10 max-w-full items-center gap-2 rounded-pill px-4 text-sm font-semibold transition-colors duration-(--duration-base) disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${
                          chip.primary
                            ? 'bg-accent text-accent-ink hover:bg-accent-strong'
                            : 'border border-border bg-surface text-ink shadow-resting hover:bg-surface-raised'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {thinking && (
          <div className="flex gap-3">
            <div className="h-fit flex-shrink-0">
              <BrandIcon size="xs" theme="light" />
            </div>
            <Loader2 className="mt-1 h-4 w-4 animate-spin text-ink-muted" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex-shrink-0 bg-surface px-5 pb-4 pt-2.5">
        <div className="flex items-end gap-2 rounded-card border border-border bg-surface-raised px-3.5 py-2.5 shadow-resting">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            disabled={thinking}
            placeholder={'"Avetta moved to interview", "what’s due this week?"'}
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-ink-body placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => {
              void handleSend();
            }}
            disabled={!input.trim() || thinking}
            aria-label="Send"
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-pill bg-accent text-accent-ink transition-colors duration-(--duration-base) hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Interviews, follow-ups and offer deadlines each have a sender behind them.
 * An offer rides the follow-up toggle, which is why Notifications names both.
 */
function remindsFor(profile: unknown, status: TrackerStatus): boolean {
  if (status !== 'interview' && status !== 'follow_up' && status !== 'accepted') return false;
  const prefs = (profile ?? {}) as Record<string, unknown>;
  const key = status === 'interview' ? 'notify_interview_tomorrow' : 'notify_follow_up_due';
  return prefs[key] !== false && prefs[key] !== 0;
}

function prepChip(sessionId: string, company: string | null): TrackerChip[] {
  return [
    {
      id: trackerMessageId('prep'),
      label: `Prep me for ${company ?? 'it'}`,
      primary: true,
      action: { kind: 'prep', sessionId },
    },
  ];
}

/**
 * The opening line is the state of play: what is happening, what is late and
 * what is sitting there unsent. Built from the same rows the table shows.
 */
export function buildStateOfPlay(
  rows: TrackerApplicationRow[],
  hideRejected: boolean,
  now: Date = new Date(),
  prefs?: DatePrefs,
): { text: string; chips: TrackerChip[] } {
  if (rows.length === 0) {
    return {
      text: 'Nothing to track yet. Your applications land here once a kit is ready.',
      chips: [],
    };
  }

  const withStatus = rows.map((row) => ({ row, status: toTrackerStatus(row.status) }));

  const interviews = withStatus
    .filter((entry) => entry.status === 'interview' && parseDate(entry.row.interview_at))
    .sort(
      (a, b) =>
        (parseDate(a.row.interview_at)?.getTime() ?? 0) - (parseDate(b.row.interview_at)?.getTime() ?? 0),
    );

  const overdue = withStatus.filter((entry) => {
    if (entry.status !== 'applied' && entry.status !== 'follow_up') return false;
    const next = deriveNextStep(
      {
        status: entry.status,
        interviewAt: entry.row.interview_at,
        followUpDueAt: entry.row.follow_up_due_at,
        createdAt: entry.row.created_at,
      },
      now,
      prefs,
    );
    return next.tone === 'overdue';
  });

  const drafted = withStatus.filter((entry) => entry.status === 'drafted');
  const rejected = withStatus.filter((entry) => entry.status === 'rejected');

  const parts: string[] = [];
  if (interviews.length > 0) {
    const first = interviews[0];
    const when = parseDate(first.row.interview_at);
    parts.push(
      `**${countWord(interviews.length)} interview${interviews.length === 1 ? '' : 's'}** (${first.row.company ?? 'one role'}${
        when ? `, ${formatInterviewDate(when, prefs)}` : ''
      })`,
    );
  }
  if (overdue.length > 0) {
    const names = nameList(overdue.map((entry) => entry.row.company ?? 'one role'));
    parts.push(`**${countWord(overdue.length)} follow-up${overdue.length === 1 ? '' : 's'} overdue** (${names})`);
  }
  if (drafted.length > 0) {
    const first = drafted[0].row.company ?? 'one kit';
    parts.push(
      drafted.length === 1
        ? `${first}'s kit is ready but not sent`
        : `${countWord(drafted.length)} kits are ready but not sent`,
    );
  }

  const text =
    parts.length === 0
      ? `Here's where things stand. Nothing is due right now across your ${rows.length} applications.`
      : `Here's where things stand. ${joinClauses(parts)}.`;

  const chips: TrackerChip[] = [];
  if (overdue.length > 0) {
    chips.push({
      id: trackerMessageId('chip'),
      label: `Draft the ${overdue[0].row.company ?? 'next'} follow-up`,
      action: { kind: 'follow_up', sessionId: overdue[0].row.id },
    });
  }
  if (interviews.length > 0) {
    chips.push({
      id: trackerMessageId('chip'),
      label: `Prep me for ${interviews[0].row.company ?? 'it'}`,
      action: { kind: 'prep', sessionId: interviews[0].row.id },
    });
  }
  if (rejected.length > 0) {
    chips.push({
      id: trackerMessageId('chip'),
      label: hideRejected ? 'Show rejected' : 'Hide rejected',
      action: hideRejected ? { kind: 'show_rejected' } : { kind: 'hide_rejected' },
    });
  }

  return { text, chips };
}

/**
 * "Ellucian", "Ellucian and Revalize", "Ellucian, Revalize and 2 more". Naming
 * two companies under a count of four reads as a miscount, so the rest get
 * accounted for rather than dropped.
 */
function nameList(names: string[], shown = 2): string {
  if (names.length === 1) return names[0];
  if (names.length <= shown + 1) {
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, shown).join(', ')} and ${names.length - shown} more`;
}

function countWord(count: number): string {
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
  return words[count] ?? String(count);
}

function joinClauses(parts: string[]): string {
  if (parts.length === 1) return capitalize(parts[0]);
  const last = parts[parts.length - 1];
  return `${capitalize(parts.slice(0, -1).join(', '))} and ${last}`;
}

function capitalize(text: string): string {
  // Skip any leading markdown so "**one interview**" still capitalises the O.
  const lead = text.startsWith('**') ? 2 : 0;
  return text.slice(0, lead) + text.charAt(lead).toUpperCase() + text.slice(lead + 1);
}

export type { TrackerMessage };
