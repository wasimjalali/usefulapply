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
import {
  deriveApplicationStatus,
  statusPillClass,
} from '@/components/shell/application-status';

interface SidebarProps {
  isWorking?: boolean;
}

const SEARCH_DIALOG_FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function Sidebar({ isWorking = false }: SidebarProps) {
  const requestNewApplication = useUIStore((s) => s.requestNewApplication);
  const { user, profile } = useAuth();
  const allSessions = useSessionStore((s) => s.sessions);
  const currentSession = useSessionStore((s) => s.currentSession);
  // Chat-only conversations are not applications, so they never get a row
  // here. They appear the moment a job ad lands in them.
  const sessions = useMemo(() => allSessions.filter(isApplicationSession), [allSessions]);

  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const jobFeedBadge = useJobFeedBadge(Boolean(user), user?.id ?? null);
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

  return (
    <>
    <aside className="flex h-full w-[224px] flex-shrink-0 flex-col border-r border-cream-200 bg-cream-100 px-2.5 pb-2.5 pt-3">
      <div className="px-2 py-1">
        <button
          type="button"
          onClick={() => setActiveTab('cv')}
          className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          aria-label="Go to Application Kit"
        >
          <BrandLogo variant="full" size="xs" theme="light" />
        </button>
      </div>

      {/* Compact global rail: one primary action, then quiet navigation controls. */}
      <nav className="mt-3 flex flex-col gap-0.5" aria-label="Workspace">
        <button
          type="button"
          onClick={requestNewApplication}
          className="flex h-10 items-center gap-2 rounded-lg border border-cream-200 bg-cream-50 px-2.5 text-[13px] font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New application
        </button>

        <button
          ref={searchButtonRef}
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-charcoal transition-colors duration-200 hover:bg-cream-50"
        >
          <Search className="h-3.5 w-3.5 text-warm-gray" />
          Search
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('jobs');
            jobFeedBadge.acknowledge();
          }}
          aria-current={activeTab === 'jobs' ? 'page' : undefined}
          aria-label={`Today's feed. ${feedLabel}`}
          title={feedLabel}
          className={`flex h-10 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-200 ${
            activeTab === 'jobs'
              ? 'bg-cream-50 text-navy-800 shadow-sm'
              : 'text-charcoal hover:bg-cream-50'
          }`}
        >
          <Briefcase className="h-3.5 w-3.5 text-warm-gray" />
          <span className="min-w-0 flex-1 truncate text-left">Today&apos;s feed</span>
          {feedCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {feedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tracker')}
          aria-current={activeTab === 'tracker' ? 'page' : undefined}
          className={`flex h-10 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-200 ${
            activeTab === 'tracker'
              ? 'bg-cream-50 text-navy-800 shadow-sm'
              : 'text-charcoal hover:bg-cream-50'
          }`}
        >
          <ClipboardList className="h-3.5 w-3.5 text-warm-gray" />
          Tracker table
        </button>
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <p className="px-2 pb-1 text-xs font-medium text-warm-gray">Applications</p>
        {sessions.length === 0 && (
          <p className="px-2 py-1 text-xs text-warm-gray">No applications yet.</p>
        )}
        {sessions.map((session) => {
          const isCurrent = currentSession?.id === session.id && activeTab !== 'jobs' && activeTab !== 'tracker';
          const status = deriveApplicationStatus(session, {
            isCurrent,
            isWorking: isCurrent && isWorking,
          });
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => {
                void openStoredSession(session.id).then((opened) => {
                  if (opened) setActiveTab('cv');
                });
              }}
              aria-current={isCurrent ? 'page' : undefined}
              className={`flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left transition-colors duration-200 ${
                isCurrent
                  ? 'bg-cream-50 shadow-sm'
                  : 'hover:bg-cream-50'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-navy-800">
                  {session.company || 'New application'}
                </span>
                <span className={`inline-flex h-[22px] flex-shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${statusPillClass(status)}`}>
                  {status}
                </span>
              </span>
              <span className="truncate text-xs text-warm-gray">
                {session.jobTitle || 'Role not set'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="my-2 h-px bg-cream-200" />

      <div className="flex items-center gap-2 px-1 py-1">
        <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-600 text-[11px] font-semibold text-white">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-navy-800">{displayName}</p>
          <p className="text-[11px] text-warm-gray">{planLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => openSettings('general')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-warm-gray transition-colors duration-200 hover:bg-cream-50 hover:text-navy-800"
          aria-label="Open settings"
        >
          <Settings className="h-3.5 w-3.5" />
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
          className="absolute inset-0 h-full w-full cursor-default bg-cream-100/90"
        />
        {/* Modal keeps all interaction states in one solid document-role surface. */}
        <div
          ref={searchDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="application-search-title"
          className="relative flex max-h-[68vh] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl bg-cream-50 shadow-lg"
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2
              id="application-search-title"
              className="text-lg font-semibold tracking-tight text-charcoal"
            >
              Search applications
            </h2>
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close application search"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-warm-gray transition-colors duration-200 hover:bg-cream-100 hover:text-navy-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 pb-4">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-cream-200 bg-cream-50 px-3 focus-within:border-gold-400">
              <Search className="h-4 w-4 flex-shrink-0 text-warm-gray" />
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
                className="min-w-0 flex-1 bg-transparent text-sm text-charcoal outline-none placeholder:text-warm-gray"
              />
            </div>
          </div>

          <div
            id="application-search-results"
            className="min-h-0 overflow-y-auto border-t border-cream-200 px-3 py-3"
          >
            <p className="sr-only" role="status" aria-live="polite">
              {filteredSessions.length} application{filteredSessions.length === 1 ? '' : 's'} found
            </p>
            {searchError && (
              <p className="px-2 py-3 text-sm text-rose-700" role="alert">{searchError}</p>
            )}
            {filteredSessions.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-warm-gray">
                {sessions.length === 0
                  ? 'No applications yet.'
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
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-200 hover:bg-cream-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cream-100 text-navy-600">
                    {isOpening
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Briefcase className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-charcoal">
                      {session.company || 'New application'}
                    </span>
                    <span className="block truncate text-xs text-warm-gray">
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
