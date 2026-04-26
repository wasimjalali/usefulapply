'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CVPanel } from '@/components/CVPanel';
import { CoverLetterPanel } from '@/components/CoverLetterPanel';
import { EmailPanel } from '@/components/EmailPanel';
import { ATSScorePanel } from '@/components/ATSScorePanel';
import { TrackerPanel } from '@/components/TrackerPanel';
import { JobBoardPanel } from '@/components/JobBoardPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { CVInputZone } from '@/components/CVInputZone';
import { useAppStore, useCVStore } from '@/store/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { uploadCVFile, saveDocument } from '@/lib/supabase';
import { FileText, Mail, Send, FolderOpen, ClipboardList, Target, User, Loader2, MessageCircle, AlertCircle, ArrowRight, PanelRightClose, PanelRightOpen, ArrowUpRight, Briefcase, ChevronDown, CreditCard, Bell, Shield, LogOut, X } from 'lucide-react';
import KarkoLogo, { KarkoIcon } from '@/components/KarkoLogo';
import Link from 'next/link';
import { CreditIndicator } from '@/components/ui/CreditIndicator';
import { useDashboardTour } from '@/hooks/useDashboardTour';
import { useJobFeedBadge } from '@/hooks/useJobFeedBadge';
import type { ParsedCV } from '@/lib/types';
import type { StructuredCV } from '@/lib/types/cv-schema';

type ApplicationTab = 'cv' | 'cover-letter' | 'email';
type Workspace = 'application-kit' | 'job-feed' | 'tracker';
type MobileView = 'chat' | Workspace;

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

interface DashboardProfileMenuProps {
  profile: {
    avatar_url?: string | null;
    subscription_tier?: string | null;
    full_name?: string | null;
    email?: string | null;
  } | null;
  onSignOut: () => Promise<void> | void;
}

function DashboardProfileMenu({ profile, onSignOut }: DashboardProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  const menuItems = [
    { href: '/profile', label: 'Profile', description: 'Personal details', icon: User },
    { href: '/account', label: 'Account', description: 'Security and login', icon: Shield },
    { href: '/subscription', label: 'Subscription', description: 'Plan and billing', icon: CreditCard },
    { href: '/notifications', label: 'Notifications', description: 'Email preferences', icon: Bell },
    { href: '/documents', label: 'Documents', description: 'Manage uploaded files', icon: FolderOpen },
  ];

  const subscriptionTier = profile?.subscription_tier;
  const tierBadge = subscriptionTier === 'max' || subscriptionTier === 'pro'
    ? 'MAX'
    : subscriptionTier === 'plus'
      ? 'PLUS'
      : 'FREE';

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="group flex items-center gap-1.5 rounded-full border border-cream-200 bg-white/90 px-1.5 py-1 shadow-sm transition-all hover:border-gold-200 hover:shadow-md cursor-pointer"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <div className="relative">
          <div className={`w-[30px] h-[30px] rounded-full bg-gradient-to-br from-navy-500 to-navy-700 flex items-center justify-center overflow-hidden ring-2 ring-offset-1 ring-offset-white/90 ${
            subscriptionTier === 'max' || subscriptionTier === 'pro'
              ? 'ring-navy-600'
              : subscriptionTier === 'plus'
                ? 'ring-gold-400'
                : 'ring-gray-300'
          }`}>
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Remote avatar URLs come from user profile storage and are already sized to this tiny menu slot.
              <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-3.5 h-3.5 text-white" />
            )}
          </div>
          <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${
            subscriptionTier === 'max' || subscriptionTier === 'pro'
              ? 'bg-navy-600 text-white'
              : subscriptionTier === 'plus'
                ? 'bg-gold-400 text-white'
                : 'bg-cream-100 text-warm-gray border border-cream-200'
          }`}>
            {tierBadge}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-warm-gray transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-3 w-[280px] rounded-[28px] border border-cream-200 bg-white/95 p-2 shadow-[0_24px_70px_-32px_rgba(30,58,95,0.35)] backdrop-blur-md z-[80]"
          role="menu"
        >
          <div className="px-3 py-3 border-b border-cream-200">
            <p className="text-sm font-semibold text-charcoal">{profile?.full_name || 'Your account'}</p>
            <p className="text-xs text-warm-gray mt-1">{profile?.email || 'Manage profile and documents'}</p>
          </div>

          <div className="py-2">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-start gap-3 rounded-2xl px-3 py-3 text-charcoal transition-colors hover:bg-cream-50"
                onClick={() => setIsOpen(false)}
              >
                <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-navy-50 text-navy-600 border border-navy-100">
                  <item.icon className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-warm-gray mt-0.5">{item.description}</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="border-t border-cream-200 pt-2">
            <button
              type="button"
              onClick={async () => {
                setIsOpen(false);
                await onSignOut();
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 cursor-pointer"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-red-50 text-red-500 border border-red-100">
                <LogOut className="w-4 h-4" />
              </span>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardUpgradeButton({
  tier,
  mobile = false,
}: {
  tier: 'plus' | 'max';
  mobile?: boolean;
}) {
  const isPlus = tier === 'plus';

  return (
    <Link
      href="/pricing"
      aria-label={mobile ? (isPlus ? 'Upgrade to Plus' : 'Upgrade to Max') : undefined}
      className={[
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        mobile
          ? 'h-8 gap-1.5 rounded-full px-3 text-xs mr-1.5'
          : 'h-11 gap-2 rounded-full px-4 text-sm mr-2',
        isPlus
          ? 'border border-gold-300/70 bg-gradient-to-r from-gold-400 to-gold-500 hover:from-gold-500 hover:to-gold-600'
          : 'border border-navy-500/70 bg-gradient-to-r from-navy-600 to-navy-700 hover:from-navy-700 hover:to-navy-800',
      ].join(' ')}
    >
      {mobile ? (isPlus ? 'Upgrade' : 'Go Max') : isPlus ? 'Upgrade to Plus' : 'Upgrade to Max'}
      <ArrowUpRight className={mobile ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
    </Link>
  );
}
export default function Dashboard() {
  const router = useRouter();
  const {
    activeTab,
    setActiveTab,
    isAgentWorking,
    currentCV,
    currentSession,
    sessions,
    loadSession,
    setCurrentCV,
    setStructuredCV,
  } = useAppStore();

  const { user, profile, isLoading, signOut } = useAuth();

  // Sync sessions with Supabase in background
  useSupabaseSync();

  // First-time onboarding tour
  useDashboardTour();

  // Job Feed nav badge + first-open popup. We only poll once per dashboard
  // mount; acknowledge() clears the signal until the next daily run lands.
  const jobFeedBadge = useJobFeedBadge(Boolean(user));
  const [showJobFeedPopup, setShowJobFeedPopup] = useState(false);
  useEffect(() => {
    if (jobFeedBadge.hasNewRun && activeTab !== 'jobs') {
      setShowJobFeedPopup(true);
    }
  }, [jobFeedBadge.hasNewRun, activeTab]);
  // Acknowledge as soon as the user actually lands on the Job Feed tab
  // (covers click, URL nav, autostart flows — not just the button onClick).
  useEffect(() => {
    if (activeTab === 'jobs' && jobFeedBadge.hasNewRun) {
      jobFeedBadge.acknowledge();
      setShowJobFeedPopup(false);
    }
  }, [activeTab, jobFeedBadge]);

  // Onboarding CV upload state
  const [isUploadingCV, setIsUploadingCV] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleOnboardingCVUpload = useCallback(async (file: File) => {
    setIsUploadingCV(true);
    setUploadError(null);
    try {
      const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`);
      }

      // Upload to Supabase Storage first if authenticated
      let storagePath: string | undefined;
      if (user) {
        const uploadResult = await uploadCVFile(user.id, 'primary_cv', file);
        storagePath = uploadResult.path || undefined;
      }

      // Parse the CV
      let response: Response;
      if (storagePath) {
        response = await fetch('/api/parse-cv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, fileName: file.name, documentType: 'primary_cv' }),
        });
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('documentType', 'primary_cv');
        response = await fetch('/api/parse-cv', { method: 'POST', body: formData });
      }

      if (!response.ok) {
        let errorMessage = 'Failed to parse CV';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (response.status === 413) errorMessage = 'File is too large. Please try a smaller file.';
          else if (response.status === 429) errorMessage = 'Too many requests. Please wait a moment and try again.';
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const structuredCV = result.structuredCV as {
        personal?: { fullName?: string; email?: string; phone?: string };
        summary?: string;
        experience?: Array<{ position?: string; company?: string; bullets?: string[] }>;
        education?: Array<{ degree?: string; institution?: string }>;
        skills?: Array<{ category?: string; skills?: string[] }>;
      } | undefined;

      if (result.success && result.rawText) {
        const parsedCV: ParsedCV = {
          rawText: result.rawText,
          sections: {
            contactInfo: structuredCV?.personal
              ? `${structuredCV.personal.fullName || ''}\n${structuredCV.personal.email || ''}\n${structuredCV.personal.phone || ''}` : '',
            summary: structuredCV?.summary || '',
            experience: structuredCV?.experience?.map((e) =>
              `${e.position} at ${e.company}\n${e.bullets?.join('\n') || ''}`
            ).join('\n\n') || '',
            education: structuredCV?.education?.map((e) =>
              `${e.degree} - ${e.institution}`
            ).join('\n') || '',
            skills: structuredCV?.skills?.map((s) =>
              `${s.category}: ${s.skills?.join(', ') || ''}`
            ).join('\n') || '',
          },
          fileName: file.name,
          fileType: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'txt',
        };

        setCurrentCV(parsedCV);
        if (result.structuredCV) {
          setStructuredCV(result.structuredCV as StructuredCV);
        }
        useCVStore.getState().setEditedOriginalCVData(null);

        // Save to Supabase
        if (user) {
          await saveDocument(user.id, 'primary_cv', {
            file_name: file.name,
            file_type: parsedCV.fileType,
            file_size: file.size,
            storage_path: storagePath,
            raw_text: parsedCV.rawText,
            sections: parsedCV.sections,
            structured_data: structuredCV,
          });

          if (structuredCV) {
            fetch('/api/job-feed/settings/suggest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ structured_data: structuredCV }),
            }).catch(() => {});
          }
        }
      } else {
        throw new Error('CV was parsed but no content was extracted. The file may be empty or image-based.');
      }
    } catch (error) {
      console.error('CV upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploadingCV(false);
    }
  }, [user, setCurrentCV, setStructuredCV]);

  // Toolbar portal: panels render their controls into this slot in the tab bar
  const [toolbarNode, setToolbarNode] = useState<HTMLDivElement | null>(null);

  // Chat nav portal: ChatPanel renders History + New Application buttons into this slot in the nav bar
  const [chatNavNode, setChatNavNode] = useState<HTMLDivElement | null>(null);

  // Resizable chat panel state - ALL HOOKS MUST BE BEFORE EARLY RETURNS
  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('karko_chat_width');
      return saved ? Math.max(360, Math.min(650, Number(saved))) : 440;
    }
    return 440;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [showATSModal, setShowATSModal] = useState(false);
  const lastResizeClickRef = useRef(0);
  const MIN_CHAT_WIDTH = 360;
  const MAX_CHAT_WIDTH = 650;
  const COLLAPSED_WIDTH = 48;
  const lastApplicationTabRef = useRef<ApplicationTab>('cv');

  const isApplicationTab = activeTab === 'cv' || activeTab === 'cover-letter' || activeTab === 'email';
  const activeWorkspace: Workspace = activeTab === 'jobs'
    ? 'job-feed'
    : activeTab === 'tracker'
      ? 'tracker'
      : 'application-kit';
  const isSignedOutJobFeedMode = !user && activeWorkspace === 'job-feed';
  const atsScore = currentSession?.optimizedCVData?.analysis?.ats_compatibility ?? null;
  const hasATSInsights = Boolean(currentSession?.optimizedCVData?.analysis || currentSession?.generatedCV?.changes?.length);
  const showATSControl = atsScore !== null || hasATSInsights || isAgentWorking;

  const atsControl = showATSControl ? (
    <button
      type="button"
      onClick={() => {
        if (hasATSInsights || atsScore !== null) {
          setShowATSModal(true);
        }
      }}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all sm:px-3.5 sm:py-2 sm:text-sm ${
        hasATSInsights || atsScore !== null
          ? 'border-gold-200 bg-white text-navy-700 shadow-sm hover:-translate-y-0.5 hover:shadow-md cursor-pointer'
          : 'border-cream-200 bg-cream-50 text-warm-gray cursor-default'
      }`}
    >
      <Target className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${atsScore !== null ? 'text-gold-500' : 'text-warm-gray'}`} />
      {atsScore !== null ? `${atsScore}% ATS Score` : isAgentWorking ? 'Scoring...' : 'ATS Insights'}
    </button>
  ) : null;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Double-click to toggle collapse
    const now = Date.now();
    if (now - lastResizeClickRef.current < 300) {
      setIsChatCollapsed(prev => !prev);
      lastResizeClickRef.current = 0;
      return;
    }
    lastResizeClickRef.current = now;
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleTabChange = useCallback((tab: ApplicationTab) => {
    setActiveTab(tab);
    lastApplicationTabRef.current = tab;
  }, [setActiveTab]);

  const handleWorkspaceChange = useCallback((workspace: Workspace) => {
    if (workspace === 'application-kit') {
      setActiveTab(lastApplicationTabRef.current);
      return;
    }

    setActiveTab(workspace === 'job-feed' ? 'jobs' : 'tracker');
  }, [setActiveTab]);

  // Track the previous chat-collapsed state so we can restore it when leaving full-width tabs
  const chatCollapsedBeforeFullWidthRef = useRef(false);

  // Auto-collapse chat when entering tracker or jobs, restore when leaving
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    const prevTab = prevActiveTabRef.current;
    prevActiveTabRef.current = activeTab;

    // Only Tracker auto-collapses the chat. Job Feed keeps the chat open so
    // users can paste / continue a generation while browsing jobs — the chat
    // only closes if they collapse it manually.
    const isFullWidthTab = activeTab === 'tracker';
    const wasFullWidthTab = prevTab === 'tracker';
    const enteringFullWidth = isFullWidthTab && !wasFullWidthTab;
    const leavingFullWidth = !isFullWidthTab && wasFullWidthTab;

    if (enteringFullWidth) {
      // Entering full-width tab — remember current collapsed state and collapse chat
      chatCollapsedBeforeFullWidthRef.current = isChatCollapsed;
      setIsChatCollapsed(true);
    } else if (leavingFullWidth) {
      // Leaving full-width tab — restore previous collapsed state
      setIsChatCollapsed(chatCollapsedBeforeFullWidthRef.current);
    }
  }, [activeTab, isChatCollapsed]);

  // Mobile tab state — must be before any early returns (Rules of Hooks)
  const [mobileView, setMobileView] = useState<MobileView>('chat');
  const [mobileApplicationTab, setMobileApplicationTab] = useState<ApplicationTab>('cv');

  // Resize effect (desktop only)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      const clamped = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, newWidth));
      setChatPanelWidth(clamped);
      localStorage.setItem('karko_chat_width', String(clamped));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Keyboard shortcut: Cmd+Shift+C to toggle chat collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        setIsChatCollapsed(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isApplicationTab) {
      lastApplicationTabRef.current = activeTab;
      setMobileApplicationTab(activeTab);
    }
  }, [activeTab, isApplicationTab]);

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

    if (requestedSessionId && currentSession?.id !== requestedSessionId && sessions.some((session) => session.id === requestedSessionId)) {
      loadSession(requestedSessionId);
    }

    const resolvedTab: ApplicationTab = requestedTab === 'cover-letter' || requestedTab === 'email'
      ? requestedTab
      : 'cv';

    if (requestedWorkspace === 'application-kit') {
      setActiveTab(resolvedTab);
      lastApplicationTabRef.current = resolvedTab;
      setMobileApplicationTab(resolvedTab);

      if (autostart === 'job-feed-apply') {
        setMobileView('chat');
        setIsChatCollapsed(false);
        // Ensure the leaving-full-width effect also keeps chat open, so the
        // autostart flow never races a collapse from an earlier jobs-tab visit.
        chatCollapsedBeforeFullWidthRef.current = false;
      } else {
        setMobileView('application-kit');
      }

      return;
    }

    if (requestedWorkspace === 'job-feed') {
      setActiveTab('jobs');
      setMobileView('job-feed');
      return;
    }

    if (requestedWorkspace === 'tracker') {
      setActiveTab('tracker');
      setMobileView('tracker');
    }
  }, [
    currentSession?.id,
    loadSession,
    sessions,
    setActiveTab,
  ]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/auth/login');
  }, [router, signOut]);

  const handleMobileViewChange = useCallback((view: MobileView) => {
    setMobileView(view);

    if (view === 'application-kit') {
      setActiveTab(mobileApplicationTab);
      return;
    }

    if (view === 'job-feed') {
      setActiveTab('jobs');
      return;
    }

    if (view === 'tracker') {
      setActiveTab('tracker');
    }
  }, [mobileApplicationTab, setActiveTab]);

  const handleMobileApplicationTabChange = useCallback((tab: ApplicationTab) => {
    setMobileApplicationTab(tab);
    setMobileView('application-kit');
    setActiveTab(tab);
    lastApplicationTabRef.current = tab;
  }, [setActiveTab]);

  // Show loading state while checking auth (brief — just to resolve user state)
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-cream-100">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-cream-100">
      <div className="hidden md:flex items-center gap-3 px-4 py-1.5 bg-white/95 backdrop-blur-sm border-b border-cream-200 flex-shrink-0 z-50">
        <button
          type="button"
          onClick={() => handleWorkspaceChange('application-kit')}
          className="flex items-center cursor-pointer"
          aria-label="Go to Application Kit"
          title="Go to Application Kit"
        >
          <KarkoLogo variant="full" size="xs" theme="light" />
        </button>

        <div className="flex items-center bg-cream-100/80 rounded-full p-0.5">
          <button
            type="button"
            onClick={() => handleWorkspaceChange('application-kit')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
              activeWorkspace === 'application-kit'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <FileText className={`w-4 h-4 ${activeWorkspace === 'application-kit' ? 'text-gold-500' : ''}`} />
            Application Kit
          </button>
          <button
            type="button"
            onClick={() => {
              handleWorkspaceChange('job-feed');
              jobFeedBadge.acknowledge();
              setShowJobFeedPopup(false);
            }}
            className={`relative flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
              activeWorkspace === 'job-feed'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <Briefcase className={`w-4 h-4 ${activeWorkspace === 'job-feed' ? 'text-gold-500' : ''}`} />
            Job Feed
            {jobFeedBadge.hasNewRun && jobFeedBadge.jobCount > 0 && (
              <span
                aria-label={`${jobFeedBadge.jobCount} new jobs today`}
                className="ml-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
              >
                {jobFeedBadge.jobCount > 99 ? '99+' : jobFeedBadge.jobCount}
              </span>
            )}
          </button>
          <button
            id="tour-tracker"
            type="button"
            onClick={() => handleWorkspaceChange('tracker')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
              activeWorkspace === 'tracker'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <ClipboardList className={`w-4 h-4 ${activeWorkspace === 'tracker' ? 'text-gold-500' : ''}`} />
            Tracker
          </button>
        </div>

        <div className="flex-1" />

        {/* Upgrade CTA — shown for free and plus plans */}
        {user && profile && (profile.subscription_tier === 'free' || profile.subscription_tier === 'starter') && (
          <DashboardUpgradeButton tier="plus" />
        )}
        {user && profile?.subscription_tier === 'plus' && (
          <DashboardUpgradeButton tier="max" />
        )}

        {/* Credit Indicator */}
        {!isSignedOutJobFeedMode && user && (
          <div className="flex items-center">
            <CreditIndicator />
          </div>
        )}

        {!isSignedOutJobFeedMode && user && <div className="w-px h-5 bg-cream-300 mx-1.5" />}

        {!isSignedOutJobFeedMode && <div ref={setChatNavNode} className="flex items-center gap-2" />}

        {!isSignedOutJobFeedMode && !isChatCollapsed && (
          <button
            onClick={() => setIsChatCollapsed(true)}
            className="p-1.5 rounded-full text-warm-gray hover:bg-cream-100 hover:text-navy-600 transition-all cursor-pointer"
            title="Collapse chat (⌘⇧C)"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}

        {user ? (
          <DashboardProfileMenu profile={profile} onSignOut={handleSignOut} />
        ) : null}
      </div>

      <div className="md:hidden flex items-center px-3 py-1.5 bg-white/95 backdrop-blur-sm border-b border-cream-200 flex-shrink-0 z-50">
        <button
          type="button"
          onClick={() => handleWorkspaceChange('application-kit')}
          className="flex items-center cursor-pointer"
          aria-label="Go to Application Kit"
          title="Go to Application Kit"
        >
          <KarkoLogo variant="full" size="xs" theme="light" />
        </button>
        <div className="flex-1" />
        {user && profile && (profile.subscription_tier === 'free' || profile.subscription_tier === 'starter') && (
          <DashboardUpgradeButton tier="plus" mobile />
        )}
        {user && profile?.subscription_tier === 'plus' && (
          <DashboardUpgradeButton tier="max" mobile />
        )}
        {user && (
          <div className="flex items-center mr-1">
            <CreditIndicator compact />
          </div>
        )}
        {user ? (
          <DashboardProfileMenu profile={profile} onSignOut={handleSignOut} />
        ) : null}
      </div>

      <div className="hidden md:flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeWorkspace === 'application-kit' && currentCV && (
            <>
              <div className="bg-white/90 border-b border-cream-200 px-4 sm:px-5 py-2.5">
                <div id="tour-doc-tabs" className="inline-flex items-center bg-cream-100/80 rounded-[18px] p-0.5">
                  <button
                    type="button"
                    onClick={() => handleTabChange('cv')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-[14px] transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'cv'
                        ? 'bg-white text-navy-700 shadow-sm font-semibold'
                        : 'text-warm-gray hover:text-navy-600'
                    }`}
                  >
                    <FileText className={`w-4 h-4 ${activeTab === 'cv' ? 'text-gold-500' : ''}`} />
                    CV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('cover-letter')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-[14px] transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'cover-letter'
                        ? 'bg-white text-navy-700 shadow-sm font-semibold'
                        : 'text-warm-gray hover:text-navy-600'
                    }`}
                  >
                    <Mail className={`w-4 h-4 ${activeTab === 'cover-letter' ? 'text-gold-500' : ''}`} />
                    Cover Letter
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('email')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-[14px] transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'email'
                        ? 'bg-white text-navy-700 shadow-sm font-semibold'
                        : 'text-warm-gray hover:text-navy-600'
                    }`}
                  >
                    <Send className={`w-4 h-4 ${activeTab === 'email' ? 'text-gold-500' : ''}`} />
                    Email
                  </button>
                </div>
              </div>

              <div className="relative z-40 glass-toolbar px-3 sm:px-5 py-2.5">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                  <div ref={setToolbarNode} className="flex items-center gap-2" />
                </div>
              </div>
            </>
          )}

          <div className="flex-1 overflow-auto">
            {activeWorkspace === 'tracker' ? (
              <TrackerPanel />
            ) : activeWorkspace === 'job-feed' ? (
              <JobBoardPanel />
            ) : !currentCV ? (
              <div className="flex items-center justify-center h-full p-8">
                <div id="tour-cv-upload" className="max-w-lg w-full">
                  <div className="text-center mb-8">
                    <div className="inline-flex mb-5">
                      <KarkoIcon size="lg" theme="light" />
                    </div>
                    <h2 className="text-2xl font-bold text-charcoal mb-2">Welcome to Karko AI</h2>
                    <p className="text-warm-gray max-w-sm mx-auto">
                      Upload your CV to get started. We&apos;ll tailor it for every job you apply to.
                    </p>
                  </div>

                  {uploadError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-600">{uploadError}</p>
                    </div>
                  )}

                  {isUploadingCV ? (
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-navy-300 rounded-2xl bg-navy-50/50">
                      <div className="flex items-center gap-3 mb-2">
                        <Loader2 className="w-5 h-5 animate-spin text-navy-600" />
                        <p className="text-sm text-navy-600 font-medium">Parsing your CV...</p>
                      </div>
                      <p className="text-xs text-navy-500">This may take 30-60 seconds</p>
                    </div>
                  ) : (
                    <CVInputZone
                      onFileSelect={handleOnboardingCVUpload}
                      onError={(msg) => setUploadError(msg)}
                      label="Upload your CV"
                      description="PDF, DOCX, TXT, or MD (max 10 MB)"
                    />
                  )}

                  {/* Feature highlights */}
                  <div className="mt-8 grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="inline-flex p-2 bg-navy-50 rounded-xl mb-2">
                        <FileText className="w-4 h-4 text-navy-600" />
                      </div>
                      <p className="text-xs font-medium text-charcoal">ATS-Optimized CV</p>
                      <p className="text-[10px] text-warm-gray mt-0.5">Tailored to each job description</p>
                    </div>
                    <div className="text-center">
                      <div className="inline-flex p-2 bg-navy-50 rounded-xl mb-2">
                        <Mail className="w-4 h-4 text-navy-600" />
                      </div>
                      <p className="text-xs font-medium text-charcoal">Cover Letter</p>
                      <p className="text-[10px] text-warm-gray mt-0.5">Professional, role-specific</p>
                    </div>
                    <div className="text-center">
                      <div className="inline-flex p-2 bg-navy-50 rounded-xl mb-2">
                        <Send className="w-4 h-4 text-navy-600" />
                      </div>
                      <p className="text-xs font-medium text-charcoal">Application Email</p>
                      <p className="text-[10px] text-warm-gray mt-0.5">Ready to send in seconds</p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-center">
                    <button
                      onClick={() => router.push('/documents')}
                      className="inline-flex items-center gap-1.5 text-xs text-warm-gray hover:text-navy-600 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Open Documents Library
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'cv' && <CVPanel toolbarPortal={toolbarNode} atsControl={atsControl} />}
                {activeTab === 'cover-letter' && <CoverLetterPanel toolbarPortal={toolbarNode} />}
                {activeTab === 'email' && <EmailPanel toolbarPortal={toolbarNode} />}
              </>
            )}
          </div>
        </div>

        {!isSignedOutJobFeedMode && (
          <div className="relative h-full flex-shrink-0 transition-[width] duration-300 ease-in-out" style={{ width: isChatCollapsed ? COLLAPSED_WIDTH : chatPanelWidth }}>
            {!isChatCollapsed && (
              <div
                onMouseDown={handleMouseDown}
                className="absolute left-0 top-0 bottom-0 w-3 -ml-1.5 cursor-col-resize z-10 group/resize"
                title="Drag to resize · Double-click to collapse"
              >
                <div className={`absolute left-1.5 top-0 bottom-0 w-px transition-all duration-200 ${
                  isResizing ? 'bg-gold-400 opacity-100' : 'bg-gold-300 opacity-0 group-hover/resize:opacity-100'
                }`} />
                <div className={`absolute left-0.5 top-1/2 -translate-y-1/2 flex flex-col gap-1 transition-opacity duration-200 ${
                  isResizing ? 'opacity-100' : 'opacity-0 group-hover/resize:opacity-100'
                }`}>
                  <div className={`w-1 h-1 rounded-full ${isResizing ? 'bg-gold-500' : 'bg-gold-400'}`} />
                  <div className={`w-1 h-1 rounded-full ${isResizing ? 'bg-gold-500' : 'bg-gold-400'}`} />
                  <div className={`w-1 h-1 rounded-full ${isResizing ? 'bg-gold-500' : 'bg-gold-400'}`} />
                </div>
              </div>
            )}

            <div className={`absolute inset-y-2 right-2 left-2 flex flex-col items-center justify-start py-2.5 border border-gold-300/90 bg-cream-50/96 rounded-[16px] shadow-[0_18px_36px_-30px_rgba(30,58,95,0.22)] transition-opacity duration-200 ${
              isChatCollapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}>
              <button
                onClick={() => setIsChatCollapsed(false)}
                className="p-1.5 rounded-lg text-warm-gray hover:text-navy-600 hover:bg-cream-100 transition-colors cursor-pointer"
                title="Expand chat (⌘⇧C)"
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
              <div className="mt-3 flex flex-col items-center">
                <KarkoIcon size="xs" theme="light" />
              </div>
            </div>

            <div id="tour-chat-panel" className={`absolute inset-y-2 right-2 left-2 overflow-hidden rounded-[16px] border border-gold-300/90 bg-cream-50/96 backdrop-blur-[6px] shadow-[0_24px_54px_-40px_rgba(30,58,95,0.28)] transition-opacity duration-200 ${
              isChatCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
            }`}>
              <ChatPanel
                onTabChange={handleTabChange}
                navBarPortal={chatNavNode}
              />
            </div>
          </div>
        )}
      </div>

      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        {mobileView === 'application-kit' && currentCV && (
          <div className="bg-white/90 border-b border-cream-200 px-3 py-2.5">
            <div className="inline-flex items-center bg-cream-100/80 rounded-[18px] p-0.5 overflow-x-auto scrollbar-hide">
              <button
                type="button"
                onClick={() => handleMobileApplicationTabChange('cv')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-[14px] transition-all whitespace-nowrap ${
                  mobileApplicationTab === 'cv'
                    ? 'bg-white text-navy-700 shadow-sm font-semibold'
                    : 'text-warm-gray'
                }`}
              >
                <FileText className={`w-4 h-4 ${mobileApplicationTab === 'cv' ? 'text-gold-500' : ''}`} />
                CV
              </button>
              <button
                type="button"
                onClick={() => handleMobileApplicationTabChange('cover-letter')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-[14px] transition-all whitespace-nowrap ${
                  mobileApplicationTab === 'cover-letter'
                    ? 'bg-white text-navy-700 shadow-sm font-semibold'
                    : 'text-warm-gray'
                }`}
              >
                <Mail className={`w-4 h-4 ${mobileApplicationTab === 'cover-letter' ? 'text-gold-500' : ''}`} />
                Letter
              </button>
              <button
                type="button"
                onClick={() => handleMobileApplicationTabChange('email')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-[14px] transition-all whitespace-nowrap ${
                  mobileApplicationTab === 'email'
                    ? 'bg-white text-navy-700 shadow-sm font-semibold'
                    : 'text-warm-gray'
                }`}
              >
                <Send className={`w-4 h-4 ${mobileApplicationTab === 'email' ? 'text-gold-500' : ''}`} />
                Email
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {mobileView === 'tracker' ? (
            <TrackerPanel />
          ) : mobileView === 'job-feed' ? (
            <JobBoardPanel />
          ) : mobileView === 'chat' ? (
            <ChatPanel
              onTabChange={(tab) => handleMobileApplicationTabChange(tab)}
              isMobileDrawer={false}
            />
          ) : !currentCV ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="max-w-sm w-full">
                <div className="text-center mb-6">
                  <div className="inline-flex mb-4">
                    <KarkoIcon size="md" theme="light" />
                  </div>
                  <h2 className="text-xl font-bold text-charcoal mb-1.5">Upload your CV</h2>
                  <p className="text-sm text-warm-gray">
                    Get started by uploading your CV. We&apos;ll optimize it for every job.
                  </p>
                </div>

                {uploadError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600">{uploadError}</p>
                  </div>
                )}

                {isUploadingCV ? (
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-navy-300 rounded-2xl bg-navy-50/50">
                    <div className="flex items-center gap-3 mb-2">
                      <Loader2 className="w-5 h-5 animate-spin text-navy-600" />
                      <p className="text-sm text-navy-600 font-medium">Parsing your CV...</p>
                    </div>
                    <p className="text-xs text-navy-500">This may take 30-60 seconds</p>
                  </div>
                ) : (
                  <CVInputZone
                    onFileSelect={handleOnboardingCVUpload}
                    onError={(msg) => setUploadError(msg)}
                    label="Upload your CV"
                    description="PDF, DOCX, TXT, or MD (max 10 MB)"
                    compact
                  />
                )}

                <div className="mt-4 flex items-center justify-center">
                  <button
                    onClick={() => router.push('/documents')}
                    className="inline-flex items-center gap-1.5 text-sm text-warm-gray hover:text-navy-600 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open Documents
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {mobileApplicationTab === 'cv' && <CVPanel atsControl={atsControl} />}
              {mobileApplicationTab === 'cover-letter' && <CoverLetterPanel />}
              {mobileApplicationTab === 'email' && <EmailPanel />}
            </>
          )}
        </div>

        <div className="flex-shrink-0 bg-white border-t border-cream-200 px-2 pb-[env(safe-area-inset-bottom)] z-50">
          <div className="flex items-center justify-around py-1.5">
            <button
              type="button"
              onClick={() => handleMobileViewChange('chat')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                mobileView === 'chat' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <MessageCircle className={`w-5 h-5 ${mobileView === 'chat' ? 'text-gold-500' : ''}`} />
              <span className="text-[10px] font-medium">Chat</span>
              {isAgentWorking && mobileView !== 'chat' && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-gold-500 rounded-full animate-pulse" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleMobileViewChange('application-kit')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                mobileView === 'application-kit' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <FileText className={`w-5 h-5 ${mobileView === 'application-kit' ? 'text-gold-500' : ''}`} />
              <span className="text-[10px] font-medium">Kit</span>
            </button>
            <button
              type="button"
              onClick={() => handleMobileViewChange('job-feed')}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                mobileView === 'job-feed' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <Briefcase className={`w-5 h-5 ${mobileView === 'job-feed' ? 'text-gold-500' : ''}`} />
              <span className="text-[10px] font-medium">Feed</span>
              {jobFeedBadge.hasNewRun && jobFeedBadge.jobCount > 0 && (
                <span className="absolute top-0 right-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-gold-500 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                  {jobFeedBadge.jobCount > 99 ? '99+' : jobFeedBadge.jobCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleMobileViewChange('tracker')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                mobileView === 'tracker' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <ClipboardList className={`w-5 h-5 ${mobileView === 'tracker' ? 'text-gold-500' : ''}`} />
              <span className="text-[10px] font-medium">Tracker</span>
            </button>
          </div>
        </div>
      </div>

      {showATSModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setShowATSModal(false)}
            aria-label="Close ATS insights"
          />
          <div className="relative flex h-[90vh] w-full max-w-4xl min-h-0 max-h-[90vh] flex-col overflow-hidden rounded-[32px] border border-cream-200 bg-cream-50 shadow-[0_30px_90px_-30px_rgba(30,58,95,0.45)]">
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-cream-200 bg-white/90 backdrop-blur-sm">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-gold-50 px-3 py-1 text-xs font-semibold text-gold-700 border border-gold-100 mb-3">
                  <Target className="w-3.5 h-3.5" />
                  ATS Insights
                </div>
                <h2 className="text-xl font-semibold text-charcoal">CV optimization details</h2>
                <p className="text-sm text-warm-gray mt-1">
                  {atsScore !== null
                    ? `Review the ${atsScore}% ATS score, optimization strategy, and exact improvements applied to this CV.`
                    : 'Review the AI changes and ATS-focused improvements applied to this CV.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowATSModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cream-200 bg-white text-warm-gray hover:text-navy-700 hover:border-navy-200 transition-colors cursor-pointer"
                aria-label="Close ATS insights"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <ATSScorePanel />
            </div>
          </div>
        </div>
      )}

      {/* New-jobs popup. Shows once per daily run when the user has not yet
          visited the Job Feed tab; acknowledging stamps the run date into
          localStorage so it won't re-open until tomorrow's run lands. */}
      {showJobFeedPopup && jobFeedBadge.hasNewRun && (
        <div className="fixed bottom-6 right-6 z-[60] max-w-sm rounded-2xl border border-gold-300/80 bg-white p-4 shadow-[0_24px_48px_-20px_rgba(30,58,95,0.35)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
              <Briefcase className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-charcoal">
                {jobFeedBadge.jobCount === 1
                  ? '1 new job for you today'
                  : `${jobFeedBadge.jobCount} new jobs for you today`}
              </p>
              <p className="mt-1 text-xs leading-5 text-warm-gray">
                Your daily feed just landed. Open it to review your matches.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleWorkspaceChange('job-feed');
                    jobFeedBadge.acknowledge();
                    setShowJobFeedPopup(false);
                  }}
                  className="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gold-600"
                >
                  Open Job Feed
                </button>
                <button
                  type="button"
                  onClick={() => {
                    jobFeedBadge.acknowledge();
                    setShowJobFeedPopup(false);
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-warm-gray transition-colors hover:text-charcoal"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                jobFeedBadge.acknowledge();
                setShowJobFeedPopup(false);
              }}
              className="rounded-lg p-1 text-warm-gray transition-colors hover:bg-cream-100 hover:text-charcoal"
              aria-label="Dismiss new jobs notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
