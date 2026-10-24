'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import { openStoredSession } from '@/lib/open-session';
import { TRACKER_OVERVIEW_LIMIT } from '@/db/repos/sessions';
import { useUIStore } from '@/store/useUIStore';
import {
  selectRowsForCounts,
  selectVisibleRows,
  useTrackerStore,
} from '@/store/useTrackerStore';
import { DeleteConfirm } from './DeleteConfirm';
import { StatusPopover } from './StatusPopover';
import {
  STATUSES_WITH_DATE,
  TRACKER_STATUSES,
  TRACKER_STATUS_LABEL,
  countFollowUpsDueThisWeek,
  deriveNextStep,
  formatSavedDate,
  matchToneClass,
  statusPillClass,
  toTrackerStatus,
  type TrackerStatus,
} from './tracker-status';

/** The column needs real room even once the conversation is folded away. */
const SAVED_COLUMN_WIDTH = 760;

export function TrackerCanvas() {
  const { user, profile } = useAuth();
  const datePrefs = useDatePrefs();
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const requestNewApplication = useUIStore((s) => s.requestNewApplication);

  const allRows = useTrackerStore((s) => s.rows);
  const loading = useTrackerStore((s) => s.loading);
  const error = useTrackerStore((s) => s.error);
  const search = useTrackerStore((s) => s.search);
  const statusFilter = useTrackerStore((s) => s.statusFilter);
  const setSearch = useTrackerStore((s) => s.setSearch);
  const setStatusFilter = useTrackerStore((s) => s.setStatusFilter);
  const applyStatus = useTrackerStore((s) => s.applyStatus);
  const remove = useTrackerStore((s) => s.remove);

  const hideRejected = useTrackerStore((s) => s.hideRejected);
  const load = useTrackerStore((s) => s.load);
  const hydrateHideRejected = useTrackerStore((s) => s.hydrateHideRejected);

  // Both lists are filtered here, not inside a zustand selector. A selector
  // that returns a fresh array on every read never settles under
  // useSyncExternalStore, which took the whole tracker down with React #185.
  const rows = useMemo(
    () => selectVisibleRows({ rows: allRows, search, hideRejected, statusFilter }),
    [allRows, search, hideRejected, statusFilter],
  );
  const countRows = useMemo(
    () => selectRowsForCounts({ rows: allRows, search, hideRejected }),
    [allRows, search, hideRejected],
  );

  // The anchor rides in state: the panel is portalled to the body, so it needs
  // the element it was opened from to position itself.
  const conversationCollapsed = useUIStore((s) => s.conversationCollapsed);

  const [openRow, setOpenRow] = useState<{ id: string; mode: 'status' | 'when'; anchor: HTMLElement } | null>(null);
  const [deleteRow, setDeleteRow] = useState<{ id: string; company: string; anchor: HTMLElement } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hasRoom, setHasRoom] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // The canvas owns the fetch; the conversation reads the same store.
  useEffect(() => {
    if (!user) return;
    void load(user.id);
  }, [load, user]);

  // Once only. The profile object changes identity on any settings save, and
  // re-hydrating from it would undo a filter the user just set from the chat.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !profile) return;
    hydratedRef.current = true;
    const prefs = profile as Record<string, unknown>;
    hydrateHideRejected(prefs.hide_rejected === true || prefs.hide_rejected === 1);
  }, [hydrateHideRejected, profile]);

  // Hiding rejected while its pill is the active filter would leave an empty
  // table with no pill to click back out of.
  useEffect(() => {
    if (hideRejected && statusFilter === 'rejected') setStatusFilter('all');
  }, [hideRejected, setStatusFilter, statusFilter]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      setHasRoom(entries[0].contentRect.width >= SAVED_COLUMN_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const wide = conversationCollapsed && hasRoom;

  const counts = useMemo(() => {
    const base: Record<TrackerStatus | 'all', number> = {
      all: countRows.length,
      drafted: 0,
      applied: 0,
      follow_up: 0,
      interview: 0,
      accepted: 0,
      rejected: 0,
    };
    for (const row of countRows) base[toTrackerStatus(row.status)] += 1;
    return base;
  }, [countRows]);

  const dueThisWeek = useMemo(
    () =>
      countFollowUpsDueThisWeek(
        allRows.map((row) => ({
          status: toTrackerStatus(row.status),
          interviewAt: row.interview_at,
          followUpDueAt: row.follow_up_due_at,
          createdAt: row.created_at,
        })),
        new Date(),
        datePrefs,
      ),
    [allRows, datePrefs],
  );

  // The reminder columns are newer than the Profile type, so read them loosely
  // and treat a missing value as the column default (on).
  const remindersOn = (status: TrackerStatus) => {
    // An offer's respond-by date rides the follow-up toggle, which is why
    // Notifications names both.
    if (status !== 'interview' && status !== 'follow_up' && status !== 'accepted') return false;
    const prefs = (profile ?? {}) as Record<string, unknown>;
    const key = status === 'interview' ? 'notify_interview_tomorrow' : 'notify_follow_up_due';
    return prefs[key] !== false && prefs[key] !== 0;
  };

  const openApplication = (sessionId: string, tab: 'cv' | 'email' = 'cv') => {
    void openStoredSession(sessionId).then((opened) => {
      if (opened) setActiveTab(tab);
    });
  };

  const headerLine = [
    `${countRows.length} application${countRows.length === 1 ? '' : 's'}`,
    dueThisWeek > 0 ? `${dueThisWeek} follow-up${dueThisWeek === 1 ? '' : 's'} due this week` : null,
    allRows.length >= TRACKER_OVERVIEW_LIMIT
      ? `Showing the most recent ${TRACKER_OVERVIEW_LIMIT}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div ref={shellRef} className="flex h-full flex-col bg-canvas">
      <header className="flex-shrink-0 border-b border-border px-6 pb-4 pt-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-ink">Tracker</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">{headerLine}</p>
          </div>
          <label className="relative w-[228px] flex-shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Company or role"
              aria-label="Search applications"
              className="h-10 w-full rounded-pill border border-border bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-muted focus:bg-surface-raised focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <CountPill
            label="All"
            count={counts.all}
            on={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          {TRACKER_STATUSES.filter((status) => !(hideRejected && status === 'rejected')).map((status) => (
            <CountPill
              key={status}
              label={TRACKER_STATUS_LABEL[status]}
              count={counts[status]}
              on={statusFilter === status}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            />
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
        {loading && rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-card border border-border bg-surface px-5 py-10 text-center">
            <p className="text-sm text-ink-muted">
              {allRows.length === 0
                ? 'Nothing here yet. Your applications land here once a kit is ready.'
                : 'No application matches that.'}
            </p>
            {allRows.length === 0 && (
              <button
                type="button"
                onClick={requestNewApplication}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-pill bg-accent px-5 text-sm font-semibold text-accent-ink hover:bg-accent-strong cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                New Application
              </button>
            )}
          </div>
        ) : (
          <div className="min-w-[720px] overflow-hidden rounded-card border border-border bg-surface shadow-resting">
            {/* min-w matches the grid's fixed tracks (68+150+150+100/72+32 + gaps
                + padding): below ~720px the application column would collapse to
                0 and the headers would overlap. A starved canvas scrolls instead. */}
            <div
              className={`grid items-center gap-3 border-b border-border px-5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-ink-muted ${
                wide
                  ? 'grid-cols-[minmax(0,1fr)_68px_150px_150px_100px_32px]'
                  : 'grid-cols-[minmax(0,1fr)_68px_150px_150px_72px_32px]'
              }`}
            >
              <span>APPLICATION</span>
              <span>MATCH</span>
              <span>STATUS</span>
              <span>NEXT</span>
              <span className="text-right">{wide ? 'SAVED' : ''}</span>
              <span className="sr-only">Delete</span>
            </div>

            {rows.map((row) => {
              const status = toTrackerStatus(row.status);
              const next = deriveNextStep(
                {
                  status,
                  interviewAt: row.interview_at,
                  followUpDueAt: row.follow_up_due_at,
                  createdAt: row.created_at,
                },
                new Date(),
                datePrefs,
              );
              const isOpen = openRow?.id === row.id;
              const hasDateStep = STATUSES_WITH_DATE.includes(status);
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openApplication(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openApplication(row.id);
                    }
                  }}
                  className={`group relative grid cursor-pointer items-center gap-3 border-b border-border px-5 py-3 last:border-b-0 hover:bg-canvas ${
                    wide
                  ? 'grid-cols-[minmax(0,1fr)_68px_150px_150px_100px_32px]'
                  : 'grid-cols-[minmax(0,1fr)_68px_150px_150px_72px_32px]'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {row.company || 'New application'}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {row.job_title || 'Role not set'}
                    </span>
                  </div>

                  <span className={`text-[13px] font-semibold ${matchToneClass(row.match_score)}`}>
                    {row.match_score === null ? '–' : `${row.match_score}%`}
                  </span>

                  <div className="relative" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(event) =>
                        setOpenRow(isOpen ? null : { id: row.id, mode: 'status', anchor: event.currentTarget })
                      }
                      aria-haspopup="dialog"
                      aria-expanded={isOpen}
                      className={`inline-flex h-[26px] items-center gap-1.5 rounded-pill px-2.5 text-[12px] font-semibold cursor-pointer ${statusPillClass(status)} ${
                        isOpen ? 'ring-1 ring-border-accent' : ''
                      }`}
                    >
                      {TRACKER_STATUS_LABEL[status]}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {isOpen && (
                      <StatusPopover
                        status={status}
                        interviewAt={row.interview_at}
                        followUpDueAt={row.follow_up_due_at}
                        mode={openRow.mode}
                        anchor={openRow.anchor}
                        remindersOn={remindersOn}
                        onClose={() => setOpenRow(null)}
                        onSave={(nextStatus) => {
                          setOpenRow(null);
                          if (!user) return;
                          void applyStatus(user.id, row.id, nextStatus).catch(() => {});
                        }}
                      />
                    )}
                  </div>

                  <div className="min-w-0" onClick={(event) => event.stopPropagation()}>
                    {next.opens === 'emails' ? (
                      <button
                        type="button"
                        onClick={() => openApplication(row.id, 'email')}
                        className={`inline-flex items-center gap-1 text-[13px] font-medium cursor-pointer ${
                          next.tone === 'overdue'
                            ? 'font-semibold text-ink-accent hover:text-accent-soft-ink'
                            : 'text-ink hover:text-ink-accent'
                        }`}
                      >
                        {next.label}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    ) : next.opens === 'none' ? (
                      <span className="text-[13px] text-ink-muted">{next.label}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) =>
                          setOpenRow({
                            id: row.id,
                            mode: hasDateStep ? 'when' : 'status',
                            anchor: event.currentTarget,
                          })
                        }
                        className={`truncate text-left text-[13px] cursor-pointer hover:underline ${
                          next.tone === 'overdue'
                            ? 'font-semibold text-ink-accent'
                            : next.tone === 'muted'
                              ? 'text-ink-muted'
                              : 'text-ink'
                        }`}
                      >
                        {next.label}
                      </button>
                    )}
                  </div>

                  <span
                    className={`text-right text-xs text-ink-muted ${
                      wide ? '' : 'opacity-0 transition-opacity duration-(--duration-base) group-hover:opacity-100'
                    }`}
                  >
                    {formatSavedDate(row.created_at, datePrefs)}
                  </span>

                  <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      aria-label="Delete this application"
                      onClick={(event) => {
                        setOpenRow(null);
                        setDeleteError(null);
                        setDeleteRow({
                          id: row.id,
                          company: row.company ?? '',
                          anchor: event.currentTarget,
                        });
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-muted opacity-0 transition-opacity duration-(--duration-base) hover:bg-surface hover:text-ink group-hover:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {deleteRow && (
          <DeleteConfirm
            company={deleteRow.company}
            anchor={deleteRow.anchor}
            busy={deleteBusy}
            error={deleteError}
            onClose={() => {
              if (deleteBusy) return;
              setDeleteRow(null);
              setDeleteError(null);
            }}
            onConfirm={() => {
              if (!user || deleteBusy) return;
              setDeleteBusy(true);
              setDeleteError(null);
              void remove(user.id, deleteRow.id)
                .then(() => {
                  setDeleteRow(null);
                })
                .catch(() => {
                  setDeleteError('That application did not delete. Try again.');
                })
                .finally(() => {
                  setDeleteBusy(false);
                });
            }}
          />
        )}

      </div>
    </div>
  );
}

function CountPill({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] cursor-pointer ${
        on
          ? 'bg-surface font-semibold text-ink shadow-resting'
          : 'font-medium text-ink-muted hover:text-brand-strong'
      }`}
    >
      {label}
      <span className={on ? 'text-ink-accent' : 'text-ink-muted'}>{count}</span>
    </button>
  );
}
