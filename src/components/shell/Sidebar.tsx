'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  ClipboardList,
  Loader2,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { useAuth } from '@/contexts/AuthContext';
import { isApplicationSession, useSessionStore } from '@/store/useSessionStore';
import { openStoredSession } from '@/lib/open-session';
import { useUIStore } from '@/store/useUIStore';
import { openSettings } from '@/store/useSettingsStore';
import { fileDisplayUrl } from '@/storage/paths';
import { useJobFeedBadge } from '@/hooks/useJobFeedBadge';
import { sessionHasKit } from '@/components/shell/application-status';
import { SIDEBAR_WIDTH } from '@/components/shell/dimensions';
import { useChatHistoryLoad } from '@/components/chat/chat-history-load';

/** One navigation row: icon and label, a tone on hover, a small raised card when it is the open page. */
const NAV_ROW =
  'flex h-10 w-full items-center gap-2.5 rounded-control px-2.5 text-[13px] font-medium text-ink transition-colors duration-(--duration-fast) hover:bg-surface aria-[current=page]:bg-surface-raised aria-[current=page]:shadow-resting cursor-pointer';

type ApplicationGroupLabel = 'Today' | 'Previous 7 days' | 'Older';

/**
 * Applications by the local day they were last worked on: Today, the seven days before, then Older.
 * Empty groups are left out and nothing is dropped; a time in the future (clock skew) counts as Today.
 */
function groupApplications<T extends { updatedAt: string }>(items: readonly T[], now: number): Array<{ label: ApplicationGroupLabel; items: T[] }> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();
  // Seven calendar days back, not 7 x 24 hours: a week that crosses a clock change is still seven days.
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const weekStart = startOfWeek.getTime();
  const buckets: Record<ApplicationGroupLabel, Array<{ item: T; at: number }>> = { Today: [], 'Previous 7 days': [], Older: [] };
  for (const item of items) {
    const parsed = Date.parse(item.updatedAt);
    const at = Number.isFinite(parsed) ? parsed : 0;
    const label: ApplicationGroupLabel = at >= todayStart ? 'Today' : at >= weekStart ? 'Previous 7 days' : 'Older';
    buckets[label].push({ item, at });
  }
  return (['Today', 'Previous 7 days', 'Older'] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label].sort((a, b) => b.at - a.at).map((entry) => entry.item) }));
}

interface SidebarProps {
  isWorking?: boolean;
}

const SEARCH_DIALOG_FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function Sidebar({ isWorking = false }: SidebarProps) {
  const requestNewApplication = useUIStore((s) => s.requestNewApplication);
  const { user, profile } = useAuth();
  // A signed-in user's list is empty until the first sessions load lands; saying "No applications yet" before then
  // is a claim the next frame takes back.
  const sessionsLoaded = useChatHistoryLoad((state) => state.sessionsLoaded);
  const sessionsKnown = !user || sessionsLoaded;
  const allSessions = useSessionStore((s) => s.sessions);
  const currentSession = useSessionStore((s) => s.currentSession);
  // Chat-only conversations are not applications, so they never get a row
  // here or in search. They appear the moment a job ad lands in them.
  const sessions = useMemo(() => allSessions.filter(isApplicationSession), [allSessions]);

  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const jobFeedBadge = useJobFeedBadge(Boolean(user), user?.id ?? null);
  // When the list was grouped by day: again whenever the window comes back into view, so a tab left open
  // overnight does not keep yesterday under Today.
  const [groupedAt, setGroupedAt] = useState(() => Date.now());
  useEffect(() => {
    const regroup = () => {
      if (document.visibilityState === 'visible') setGroupedAt(Date.now());
    };
    window.addEventListener('focus', regroup);
    document.addEventListener('visibilitychange', regroup);
    return () => {
      window.removeEventListener('focus', regroup);
      document.removeEventListener('visibilitychange', regroup);
    };
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDialogRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef(0);

  // The badge means "there is a run you have not opened". It used to count
  // roles the user had not saved, which disagreed with the canvas header the
  // moment they saved one and never cleared. Opening the feed acknowledges the
  // run, so the badge and the header are never on screen with two numbers.
  const feedCount = jobFeedBadge.hasNewRun ? jobFeedBadge.jobCount : 0;
  const feedLabel = feedCount > 0
    ? `${feedCount} new role${feedCount === 1 ? '' : 's'} for you`
    : 'You\u2019re up to date';

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => (
      `${session.company} ${session.jobTitle}`.toLocaleLowerCase().includes(query)
    ));
  }, [searchQuery, sessions]);

  const closeSearch = useCallback(() => {
    searchRequestRef.current += 1;
    setSearchOpen(false);
    setSearchQuery('');
    setOpeningSessionId(null);
    setSearchError(null);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const fallbackFocus = searchButtonRef.current;
    searchInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeSearch();
        return;
      }
      if (event.key !== 'Tab' || !searchDialogRef.current) return;

      const focusable = Array.from(
        searchDialogRef.current.querySelectorAll<HTMLElement>(SEARCH_DIALOG_FOCUSABLE),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !searchDialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      (previousFocus ?? fallbackFocus)?.focus();
    };
  }, [closeSearch, searchOpen]);

  const handleSearchSessionOpen = async (sessionId: string) => {
    const requestId = ++searchRequestRef.current;
    setOpeningSessionId(sessionId);
    setSearchError(null);
    const opened = await openStoredSession(sessionId);
    if (requestId !== searchRequestRef.current) return;
    if (!opened) {
      setOpeningSessionId(null);
      setSearchError('That application could not be opened. Try again.');
      return;
    }
    setActiveTab('cv');
    closeSearch();
  };

  const displayName = profile?.full_name || user?.name || user?.email || 'Your account';
  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  const planLabel = profile?.subscription_tier === 'max'
    ? 'Max plan'
    : profile?.subscription_tier === 'plus'
      ? 'Plus plan'
      : 'Free plan';

  const avatarUrl = fileDisplayUrl(profile?.avatar_url);

  const groups = useMemo(() => groupApplications(sessions, groupedAt), [groupedAt, sessions]);

  return (
    <>
    <aside style={{ width: SIDEBAR_WIDTH }} className="flex h-full flex-shrink-0 flex-col border-r border-border bg-canvas px-2.5 pb-2 pt-2.5">
      <div className="flex h-10 items-center px-2">
        <button
          type="button"
          onClick={() => setActiveTab('cv')}
          className="cursor-pointer rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label="Go to Application Kit"
        >
          <BrandLogo variant="full" size="xs" theme="light" />
        </button>
      </div>

      <nav className="mt-2.5 flex flex-col gap-px" aria-label="Workspace">
        <button type="button" onClick={requestNewApplication} className={NAV_ROW}>
          <Plus className="h-4 w-4 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-left">New application</span>
        </button>

        <button
          ref={searchButtonRef}
          type="button"
          onClick={() => setSearchOpen(true)}
          className={NAV_ROW}
        >
          <Search className="h-4 w-4 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-left">Search</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('jobs');
            jobFeedBadge.acknowledge();
          }}
          aria-current={activeTab === 'jobs' ? 'page' : undefined}
          aria-label={`Job Board. ${feedLabel}`}
          title={feedLabel}
          className={NAV_ROW}
        >
          <Briefcase className="h-4 w-4 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-left">Job Board</span>
          {feedCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-soft-strong px-1.5 text-[11px] font-semibold tabular-nums text-accent-soft-ink">
              {feedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tracker')}
          aria-current={activeTab === 'tracker' ? 'page' : undefined}
          className={NAV_ROW}
        >
          <ClipboardList className="h-4 w-4 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-left">Application Tracker</span>
        </button>
      </nav>

      {/* The inset gives the rows' focus outline room inside the scroll region, which would clip it. */}
      <div className="-mx-1 mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-1" role="region" aria-label="Applications">
        {sessions.length === 0 && sessionsKnown && (
          <p className="px-2.5 text-[13px] leading-5 text-ink-muted">Applications you start show up here.</p>
        )}
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <p className="px-2.5 pb-1.5 text-xs font-medium text-ink-muted">{group.label}</p>
            <ul className="flex flex-col gap-px">
              {group.items.map((session) => {
                const isCurrent = currentSession?.id === session.id && activeTab !== 'jobs' && activeTab !== 'tracker';
                // Still working while another workspace (the Job Board) is open.
                const working = currentSession?.id === session.id && isWorking;
                // A draft is an application without a kit, whichever workspace is open.
                const draft = !sessionHasKit(session);
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void openStoredSession(session.id).then((opened) => {
                          if (opened) setActiveTab('cv');
                        });
                      }}
                      aria-current={isCurrent ? 'page' : undefined}
                      className="flex min-h-10 w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left transition-colors duration-(--duration-fast) hover:bg-surface aria-[current=page]:bg-surface-raised aria-[current=page]:shadow-resting"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold leading-5 text-ink">
                          {session.company || 'New application'}
                        </span>
                        <span className="block truncate text-xs leading-4 text-ink-muted">
                          {session.jobTitle || 'Role not set'}
                        </span>
                      </span>
                      {working ? (
                        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-ink-muted" aria-label="Working" />
                      ) : draft ? (
                        <span className="flex-shrink-0 text-[11px] text-ink-muted">Draft</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-2 flex h-12 items-center gap-2.5 pl-2 pr-0.5">
        <span className="inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center overflow-hidden rounded-pill bg-brand-soft-strong text-[11px] font-semibold text-ink">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initials}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-4 text-ink">{displayName}</p>
          <p className="text-xs leading-4 text-ink-muted">{planLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => openSettings('general')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-pill text-ink-muted transition-colors duration-(--duration-fast) hover:bg-surface hover:text-ink"
          aria-label="Open settings"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </aside>

    {searchOpen && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[300] flex items-start justify-center px-4 pt-[14vh]">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close application search"
          onClick={closeSearch}
          className="absolute inset-0 h-full w-full cursor-default bg-canvas/90"
        />
        {/* Modal keeps all interaction states in one solid document-role surface. */}
        <div
          ref={searchDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="application-search-title"
          className="relative flex max-h-[68vh] w-full max-w-[580px] flex-col overflow-hidden rounded-card bg-surface shadow-floating"
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2
              id="application-search-title"
              className="text-lg font-semibold tracking-tight text-ink-body"
            >
              Search applications
            </h2>
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close application search"
              className="inline-flex h-10 w-10 items-center justify-center rounded-pill text-ink-muted transition-colors duration-(--duration-base) hover:bg-canvas hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 pb-4">
            <div className="flex h-10 items-center gap-2 rounded-control border border-border bg-surface px-3 focus-within:border-accent">
              <Search className="h-4 w-4 flex-shrink-0 text-ink-muted" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown' || filteredSessions.length === 0) return;
                  event.preventDefault();
                  searchDialogRef.current
                    ?.querySelector<HTMLButtonElement>('[data-search-result]')
                    ?.focus();
                }}
                type="search"
                aria-label="Search by company or role"
                aria-controls="application-search-results"
                placeholder="Search by company or role"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink-body outline-none placeholder:text-ink-muted"
              />
            </div>
          </div>

          <div
            id="application-search-results"
            className="min-h-0 overflow-y-auto border-t border-border px-3 py-3"
          >
            <p className="sr-only" role="status" aria-live="polite">
              {filteredSessions.length} application{filteredSessions.length === 1 ? '' : 's'} found
            </p>
            {searchError && (
              <p className="px-2 py-3 text-sm text-ink-error" role="alert">{searchError}</p>
            )}
            {filteredSessions.length === 0 && sessionsKnown && (
              <p className="px-2 py-8 text-center text-sm text-ink-muted">
                {sessions.length === 0
                  ? 'Applications you start show up here.'
                  : `No applications match “${searchQuery.trim()}”.`}
              </p>
            )}
            {filteredSessions.map((session) => {
              const isOpening = openingSessionId === session.id;
              return (
                <button
                  key={session.id}
                  data-search-result
                  type="button"
                  disabled={openingSessionId !== null}
                  onClick={() => void handleSearchSessionOpen(session.id)}
                  className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors duration-(--duration-base) hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-control bg-canvas text-brand">
                    {isOpening
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Briefcase className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-body">
                      {session.company || 'New application'}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {session.jobTitle || 'Role not set'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
