'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { MobileFeed } from '@/components/job-feed/MobileFeed';
import { TrackerCanvas } from '@/components/tracker/TrackerCanvas';
import { AppShell, GuidedLine } from '@/components/shell';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useAppStore } from '@/store/useAppStore';
import { useUIStore } from '@/store/useUIStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { useJobFeedBadge } from '@/hooks/useJobFeedBadge';
import { sessionHasKit } from '@/components/shell/application-status';
import BrandLogo, { BrandIcon } from '@/components/BrandLogo';
import { Briefcase, ClipboardList, Loader2 } from 'lucide-react';

type ApplicationTab = 'cv' | 'cover-letter' | 'email';
type Workspace = 'application-kit' | 'job-feed' | 'tracker';
type MobileView = 'desktop-required' | 'job-feed' | 'tracker';

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
    loadSession,
  } = useAppStore();
  const { user, isLoading } = useAuth();
  useSupabaseSync();
  const jobFeedBadge = useJobFeedBadge(Boolean(user), user?.id ?? null);

  const [mobileView, setMobileView] = useState<MobileView>(() => {
    const requested = readDashboardQuery();
    if (requested.workspace === 'job-feed') return 'job-feed';
    if (requested.workspace === 'tracker') return 'tracker';
    return 'desktop-required';
  });
  const [isNarrow, setIsNarrow] = useState(false);
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
    const {
      workspace: requestedWorkspace,
      session: requestedSessionId,
      tab: requestedTab,
      autostart,
    } = readDashboardQuery();

    if (!requestedWorkspace && !requestedSessionId && !requestedTab && !autostart) {
      return;
    }

    const navKey = `${requestedWorkspace ?? ''}|${requestedSessionId ?? ''}|${requestedTab ?? ''}|${autostart ?? ''}`;
    if (processedWorkspaceRef.current === navKey) {
      return;
    }
    processedWorkspaceRef.current = navKey;

    if (requestedSessionId && currentSession?.id !== requestedSessionId && sessions.some((session) => session.id === requestedSessionId)) {
      loadSession(requestedSessionId);
    }

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
  }, [
    currentSession?.id,
    loadSession,
    sessions,
    setActiveTab,
  ]);

  const handleMobileViewChange = useCallback((view: MobileView) => {
    setMobileView(view);
    if (view === 'job-feed') {
      setActiveTab('jobs');
      return;
    }
    if (view === 'tracker') {
      setActiveTab('tracker');
    }
  }, [setActiveTab]);

  // The line owns every step until a kit exists. A session with a job but no
  // kit is still on the line (fit running, verdict shown, sign-up pending).
  const showGuidedLine = !hasKit && activeWorkspace === 'application-kit';

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-cream-100">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-cream-100">
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
        <div className="flex items-center px-3 py-1.5 bg-cream-50 border-b border-cream-200 flex-shrink-0">
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
                <h2 className="text-xl font-semibold tracking-tight text-charcoal mb-2">Best on desktop</h2>
                <p className="text-sm text-warm-gray leading-relaxed mb-6">
                  Useful Apply&apos;s Application Kit works best on a laptop or tablet. Open it on a larger screen to upload your CV and generate tailored applications.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleMobileViewChange('job-feed')}
                    className="w-full flex items-center justify-center gap-2 rounded-full bg-gold-400 text-white px-5 py-3 text-sm font-semibold shadow-sm hover:bg-gold-500 transition-colors cursor-pointer"
                  >
                    <Briefcase className="w-4 h-4" />
                    Open Job Feed
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMobileViewChange('tracker')}
                    className="w-full flex items-center justify-center gap-2 rounded-full border border-cream-200 bg-cream-50 text-charcoal px-5 py-3 text-sm font-semibold hover:bg-white transition-colors cursor-pointer"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Open Tracker
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 bg-cream-50 border-t border-cream-200 px-2 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around py-1.5">
            <button
              type="button"
              onClick={() => handleMobileViewChange('job-feed')}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg cursor-pointer min-w-[52px] ${
                mobileView === 'job-feed' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <Briefcase className="w-5 h-5" />
              <span className="text-[10px] font-medium">Feed</span>
              {jobFeedBadge.hasPending && (
                <span className="absolute top-0 right-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-gold-500 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                  {jobFeedBadge.unprocessedCount > 99 ? '99+' : jobFeedBadge.unprocessedCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleMobileViewChange('tracker')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg cursor-pointer min-w-[52px] ${
                mobileView === 'tracker' ? 'text-gold-600' : 'text-warm-gray'
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
