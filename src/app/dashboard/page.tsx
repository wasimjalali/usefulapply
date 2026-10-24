'use client';

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { MobileFeed } from '@/components/job-feed/MobileFeed';
import { TrackerCanvas } from '@/components/tracker/TrackerCanvas';
import { AppShell, GuidedLine } from '@/components/shell';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useAppStore } from '@/store/useAppStore';
import { openStoredSession } from '@/lib/open-session';
import { useUIStore } from '@/store/useUIStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { useJobFeedBadge } from '@/hooks/useJobFeedBadge';
import { sessionHasKit } from '@/components/shell/application-status';
import BrandLogo, { BrandIcon } from '@/components/BrandLogo';
import { getJobFeedPreviewMode } from '@/components/job-feed/preview-utils';
import { Briefcase, ClipboardList, Loader2 } from 'lucide-react';

type ApplicationTab = 'cv' | 'cover-letter' | 'email';
type Workspace = 'application-kit' | 'job-feed' | 'tracker';
type MobileView = 'desktop-required' | 'job-feed' | 'tracker';

/** Never fires: the value only has to differ between server and client. */
const subscribeToNothing = () => () => {};

function readDashboardQuery() {
  if (typeof window === 'undefined') {
    return {
      workspace: null,
      session: null,
      tab: null,
      autostart: null,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  return {
    workspace: searchParams.get('workspace'),
    session: searchParams.get('session'),
    tab: searchParams.get('tab'),
    autostart: searchParams.get('autostart'),
  };
}

export default function Dashboard() {
  const {
    activeTab,
    setActiveTab,
    currentSession,
    sessions,
  } = useAppStore();
  const { user, isLoading, storesReadyFor } = useAuth();
  const { sessionsHydrated, documentsHydrated, hydrationError, retryHydration } = useSupabaseSync();
  const jobFeedBadge = useJobFeedBadge(Boolean(user), user?.id ?? null);

  const [mobileView, setMobileView] = useState<MobileView>(() => {
    const requested = readDashboardQuery();
    if (requested.workspace === 'job-feed') return 'job-feed';
    if (requested.workspace === 'tracker') return 'tracker';
    return 'desktop-required';
  });
  const [isNarrow, setIsNarrow] = useState(false);
  // The server always renders the spinner: it has no session and no query
  // string. On the client the session store can already be resolved on the
  // first render, and `mobileView` reads window.location.search, so the two
  // trees disagreed and React threw away the server HTML (#418). Any click
  // landing in that window was lost, which is why the first click on the
  // sidebar did nothing. Hold the spinner until after mount so the first
  // client render matches the server exactly.
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  // Dev-only job-feed preview must not wait on Better Auth. get-session can
  // 500 in a local env with no bindings, and the spinner would hide the
  // preview forever. Production always reports preview mode as off.
  const previewingFeed = useSyncExternalStore(
    subscribeToNothing,
    () => getJobFeedPreviewMode() !== 'off',
    () => false,
  );
  const lastApplicationTabRef = useRef<ApplicationTab>('cv');
  const processedWorkspaceRef = useRef<string | null>(null);
  const hasKit = sessions.some(sessionHasKit) || sessionHasKit(currentSession);

  const isApplicationTab = activeTab === 'cv' || activeTab === 'cover-letter' || activeTab === 'email';
  const activeWorkspace: Workspace = activeTab === 'jobs'
    ? 'job-feed'
    : activeTab === 'tracker'
      ? 'tracker'
      : 'application-kit';

  useEffect(() => {
    if (isApplicationTab) {
      lastApplicationTabRef.current = activeTab;
    }
  }, [activeTab, isApplicationTab]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    // Hold the deep link until AuthContext has settled the session and run
    // its store reset. That reset puts the workspace back to the CV when a
    // signed-in user loads a browser with no stored user id, and would undo
    // the link if it ran after it.
    // Readiness belongs to the current identity: after an anonymous load
    // then a sign-in, the flag still names 'anon' until the new user's reset
    // has run.
    const identity = user?.id ?? 'anon';
    if (storesReadyFor !== identity && !previewingFeed) return;
    let cancelled = false;
    const run = async () => {
      const {
        workspace: requestedWorkspace,
        session: requestedSessionId,
        tab: requestedTab,
        autostart,
      } = readDashboardQuery();

      if (!requestedWorkspace && !requestedSessionId && !requestedTab && !autostart) {
        return;
      }

      // Wait until the requested session is current before one-shot tab
      // handling. A miss still switches workspace, otherwise a dead session
      // id would pin the user on the wrong pane.
      if (requestedSessionId && currentSession?.id !== requestedSessionId) {
        const opened = await openStoredSession(requestedSessionId);
        if (cancelled) return;
        if (opened) return;
      }

      if (cancelled) return;

      const navKey = `${identity}|${requestedWorkspace ?? ''}|${requestedSessionId ?? ''}|${requestedTab ?? ''}|${autostart ?? ''}`;
      if (processedWorkspaceRef.current === navKey) {
        return;
      }
      // Identity is in the key so a link re-applies for a new user. A visitor
      // who just signed out must not get it back: only the first anonymous
      // load applies it, as before.
      if (identity === 'anon' && processedWorkspaceRef.current !== null) return;
      processedWorkspaceRef.current = navKey;

      const resolvedTab: ApplicationTab = requestedTab === 'cover-letter' || requestedTab === 'email'
        ? requestedTab
        : 'cv';

      if (requestedWorkspace === 'application-kit') {
        setActiveTab(resolvedTab);
        lastApplicationTabRef.current = resolvedTab;
        return;
      }

      if (requestedWorkspace === 'job-feed') {
        setActiveTab('jobs');
        return;
      }

      if (requestedWorkspace === 'tracker') {
        setActiveTab('tracker');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    currentSession?.id,
    sessions.length,
    setActiveTab,
    storesReadyFor,
    user?.id,
    previewingFeed,
  ]);

  const handleMobileViewChange = useCallback((view: MobileView) => {
    setMobileView(view);
    if (view === 'job-feed') {
      setActiveTab('jobs');
      // Same as the sidebar: opening the feed is what clears the badge.
      jobFeedBadge.acknowledge();
      return;
    }
    if (view === 'tracker') {
      setActiveTab('tracker');
    }
  }, [setActiveTab, jobFeedBadge]);

  // The line owns every step until a kit exists. A session with a job but no
  // kit is still on the line (fit running, verdict shown, sign-up pending).
  const showGuidedLine = !hasKit && activeWorkspace === 'application-kit';

  // The third clause stops the guided line from flashing at a signed-in
  // user whose sessions have not loaded yet: with no kit visible locally,
  // hold the spinner until the first sessions load settles the question.
  // Anonymous visitors and users with a persisted kit skip the wait.
  if (
    !mounted
    || (!previewingFeed && isLoading)
    || (!previewingFeed && user && !hasKit && (!sessionsHydrated || !documentsHydrated) && !hydrationError)
  ) {
    return (
      <div className="h-dvh flex items-center justify-center bg-canvas">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  if (user && hydrationError === 'sessions') {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <p className="text-sm font-medium text-ink-body">We couldn&apos;t load your account data.</p>
        <button
          type="button"
          onClick={retryHydration}
          className="h-9 rounded-pill bg-brand px-4 text-sm font-semibold text-brand-ink shadow-resting transition-colors hover:bg-brand-strong"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-canvas">
      {/* The gear opens this over whatever is on screen, guided line included. */}
      <SettingsModal />
      {!isNarrow && (
      <div className="hidden md:flex flex-1 overflow-hidden">
        {showGuidedLine ? (
          <GuidedLine onKitReady={() => useUIStore.getState().setActiveTab('cv')} />
        ) : (
          <AppShell />
        )}
      </div>
      )}

      {isNarrow && (
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center px-3 py-1.5 bg-surface border-b border-border flex-shrink-0">
          <BrandLogo variant="full" size="xs" theme="light" />
        </div>
        <div className="flex-1 overflow-auto">
          {mobileView === 'tracker' ? (
            <TrackerCanvas />
          ) : mobileView === 'job-feed' ? (
            <MobileFeed />
          ) : (
            <div className="flex items-center justify-center h-full p-6">
              <div className="max-w-sm w-full text-center">
                <div className="inline-flex mb-5">
                  <BrandIcon size="md" theme="light" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-ink-body mb-2">Best on desktop</h2>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                  Useful Apply&apos;s Application Kit works best on a laptop or tablet. Open it on a larger screen to upload your CV and generate tailored applications.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleMobileViewChange('job-feed')}
                    className="w-full flex items-center justify-center gap-2 rounded-pill bg-accent text-accent-ink px-5 py-3 text-sm font-semibold shadow-resting hover:bg-accent-strong transition-colors cursor-pointer"
                  >
                    <Briefcase className="w-4 h-4" />
                    Open Job Feed
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMobileViewChange('tracker')}
                    className="w-full flex items-center justify-center gap-2 rounded-pill border border-border bg-surface text-ink-body px-5 py-3 text-sm font-semibold hover:bg-surface-raised transition-colors cursor-pointer"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Open Tracker
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 bg-surface border-t border-border px-2 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around py-1.5">
            <button
              type="button"
              onClick={() => handleMobileViewChange('job-feed')}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-control cursor-pointer min-w-[52px] ${
                mobileView === 'job-feed' ? 'text-ink-accent' : 'text-ink-muted'
              }`}
            >
              <Briefcase className="w-5 h-5" />
              <span className="text-[10px] font-medium">Feed</span>
              {jobFeedBadge.hasNewRun && (
                <span className="absolute top-0 right-1 inline-flex min-w-[16px] items-center justify-center rounded-pill bg-accent-strong px-1 py-0.5 text-[9px] font-semibold leading-none text-accent-ink">
                  {jobFeedBadge.jobCount > 99 ? '99+' : jobFeedBadge.jobCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleMobileViewChange('tracker')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-control cursor-pointer min-w-[52px] ${
                mobileView === 'tracker' ? 'text-ink-accent' : 'text-ink-muted'
              }`}
            >
              <ClipboardList className="w-5 h-5" />
              <span className="text-[10px] font-medium">Tracker</span>
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
