'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { CVPanel } from '@/components/CVPanel';
import { CoverLetterPanel } from '@/components/CoverLetterPanel';
import { EmailPanel } from '@/components/EmailPanel';
import { ATSScorePanel } from '@/components/ATSScorePanel';
import { DocumentsPanel } from '@/components/DocumentsPanel';
import { TrackerPanel } from '@/components/TrackerPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { FileUpload } from '@/components/FileUpload';
import { useAppStore, useCVStore } from '@/store/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { uploadCVFile, saveDocument } from '@/lib/supabase';
import { FileText, Mail, Send, FolderOpen, ClipboardList, Settings, Target, User, Loader2, MessageCircle, MoreHorizontal, AlertCircle, ArrowRight, PanelRightClose, PanelRightOpen, ArrowUpRight } from 'lucide-react';
import KarkoLogo, { KarkoIcon } from '@/components/KarkoLogo';
import Link from 'next/link';
import { CreditIndicator } from '@/components/ui/CreditIndicator';
import { useDashboardTour } from '@/hooks/useDashboardTour';
import type { ParsedCV } from '@/lib/types';

export default function Dashboard() {
  const {
    activeTab,
    setActiveTab,
    isAgentWorking,
    currentCV,
    setCurrentCV,
    setStructuredCV,
  } = useAppStore();

  const { user, profile, isLoading } = useAuth();

  // Sync sessions with Supabase in background
  useSupabaseSync();

  // First-time onboarding tour
  useDashboardTour();

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
          body: JSON.stringify({ storagePath, fileName: file.name }),
        });
      } else {
        const formData = new FormData();
        formData.append('file', file);
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
      if (result.success && result.rawText) {
        const parsedCV: ParsedCV = {
          rawText: result.rawText,
          sections: {
            contactInfo: result.structuredCV?.personal
              ? `${result.structuredCV.personal.fullName || ''}\n${result.structuredCV.personal.email || ''}\n${result.structuredCV.personal.phone || ''}` : '',
            summary: result.structuredCV?.summary || '',
            experience: result.structuredCV?.experience?.map((e: any) =>
              `${e.position} at ${e.company}\n${e.bullets?.join('\n') || ''}`
            ).join('\n\n') || '',
            education: result.structuredCV?.education?.map((e: any) =>
              `${e.degree} - ${e.institution}`
            ).join('\n') || '',
            skills: result.structuredCV?.skills?.map((s: any) =>
              `${s.category}: ${s.skills?.join(', ') || ''}`
            ).join('\n') || '',
          },
          fileName: file.name,
          fileType: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'txt',
        };

        setCurrentCV(parsedCV);
        if (result.structuredCV) {
          setStructuredCV(result.structuredCV);
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
            structured_data: result.structuredCV,
          });
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
  const lastResizeClickRef = { current: 0 };
  const MIN_CHAT_WIDTH = 360;
  const MAX_CHAT_WIDTH = 650;
  const COLLAPSED_WIDTH = 48;

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

  const handleTabChange = useCallback((tab: 'cv' | 'cover-letter' | 'email' | 'documents') => {
    setActiveTab(tab);
  }, [setActiveTab]);

  // Track the previous chat-collapsed state so we can restore it when leaving tracker
  const chatCollapsedBeforeTrackerRef = useRef(false);

  // Auto-collapse chat when entering tracker, restore when leaving
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    const prevTab = prevActiveTabRef.current;
    prevActiveTabRef.current = activeTab;

    if (activeTab === 'tracker' && prevTab !== 'tracker') {
      // Entering tracker — remember current collapsed state and collapse chat
      chatCollapsedBeforeTrackerRef.current = isChatCollapsed;
      setIsChatCollapsed(true);
    } else if (activeTab !== 'tracker' && prevTab === 'tracker') {
      // Leaving tracker — restore previous collapsed state
      setIsChatCollapsed(chatCollapsedBeforeTrackerRef.current);
    }
  }, [activeTab, isChatCollapsed]);

  // Mobile tab state — must be before any early returns (Rules of Hooks)
  const [mobileTab, setMobileTab] = useState<'chat' | 'cv' | 'ats-score' | 'cover-letter' | 'email' | 'documents' | 'tracker'>('chat');
  const [showMobileMore, setShowMobileMore] = useState(false);

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

  // Show loading state while checking auth (brief — just to resolve user state)
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-cream-100">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  // Sync mobile tab with active tab on desktop
  const handleMobileTabChange = (tab: 'chat' | 'cv' | 'ats-score' | 'cover-letter' | 'email' | 'documents' | 'tracker') => {
    setMobileTab(tab);
    if (tab !== 'chat') {
      setActiveTab(tab);
    }
    setShowMobileMore(false);
  };

  return (
    <div className="h-screen flex flex-col bg-cream-100">
      {/* ═══ TIER 1: Global Nav + Document Tabs ═══ */}
      <div className="hidden md:flex items-center px-4 py-1.5 bg-white/95 backdrop-blur-sm border-b border-cream-200 flex-shrink-0 z-50">
        <Link href="/" className="flex items-center">
          <KarkoLogo variant="full" size="xs" theme="light" />
        </Link>

        {/* Document Tabs — CV, ATS Score, Cover Letter, Email */}
        <div id="tour-doc-tabs" className="flex items-center bg-cream-100/80 rounded-xl p-0.5 ml-4">
          <button
            type="button"
            onClick={() => setActiveTab('cv')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'cv'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <FileText className={`w-3.5 h-3.5 ${activeTab === 'cv' ? 'text-gold-500' : ''}`} />
            CV
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ats-score')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ats-score'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <Target className={`w-3.5 h-3.5 ${activeTab === 'ats-score' ? 'text-gold-500' : ''}`} />
            ATS Score
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cover-letter')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'cover-letter'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <Mail className={`w-3.5 h-3.5 ${activeTab === 'cover-letter' ? 'text-gold-500' : ''}`} />
            Cover Letter
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'email'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <Send className={`w-3.5 h-3.5 ${activeTab === 'email' ? 'text-gold-500' : ''}`} />
            Email
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-cream-300 mx-1" />

          {/* Tracker — inline panel */}
          <button
            id="tour-tracker"
            type="button"
            onClick={() => setActiveTab('tracker')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'tracker'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <ClipboardList className={`w-3.5 h-3.5 ${activeTab === 'tracker' ? 'text-gold-500' : ''}`} />
            Tracker
          </button>

          {/* Documents — tab panel */}
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'documents'
                ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                : 'text-warm-gray hover:text-navy-600'
            }`}
          >
            <FolderOpen className={`w-3.5 h-3.5 ${activeTab === 'documents' ? 'text-gold-500' : ''}`} />
            Documents
          </button>
        </div>

        <div className="flex-1" />

        {/* Upgrade CTA — shown for free and plus plans */}
        {user && profile && (profile.subscription_tier === 'free' || profile.subscription_tier === 'starter') && (
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 hover:from-gold-500 hover:to-gold-600 rounded-lg transition-all shadow-sm hover:shadow-md mr-2"
          >
            Upgrade to Plus
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        )}
        {user && profile?.subscription_tier === 'plus' && (
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-navy-600 to-navy-700 hover:from-navy-700 hover:to-navy-800 rounded-lg transition-all shadow-sm hover:shadow-md mr-2"
          >
            Upgrade to Max
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        )}

        {/* Credit Indicator */}
        {user && (
          <div className="flex items-center">
            <CreditIndicator />
          </div>
        )}

        {/* Divider between credits and action buttons */}
        {user && <div className="w-px h-5 bg-cream-300 mx-1.5" />}

        {/* Chat nav portal slot — ChatPanel portals History + New Application buttons here */}
        <div ref={setChatNavNode} className="flex items-center" />

        {/* Chat collapse toggle */}
        {!isChatCollapsed && (
          <button
            onClick={() => setIsChatCollapsed(true)}
            className="p-2 rounded-lg text-warm-gray hover:bg-cream-100 hover:text-navy-600 transition-all cursor-pointer"
            title="Collapse chat (⌘⇧C)"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}

        {/* Avatar with tier badge (also links to settings) */}
        {user ? (
          <Link
            href="/settings"
            className="flex items-center ml-1 cursor-pointer"
            title="Profile"
          >
            <div className="relative">
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br from-navy-500 to-navy-700 flex items-center justify-center overflow-hidden ring-2 ring-offset-1 ring-offset-white/80 ${
                profile?.subscription_tier === 'max' || profile?.subscription_tier === 'pro'
                  ? 'ring-navy-600'
                  : profile?.subscription_tier === 'plus'
                    ? 'ring-gold-400'
                    : 'ring-gray-300'
              }`}>
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-3.5 h-3.5 text-white" />
                )}
              </div>
              <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${
                profile?.subscription_tier === 'max' || profile?.subscription_tier === 'pro'
                  ? 'bg-navy-600 text-white'
                  : profile?.subscription_tier === 'plus'
                    ? 'bg-gold-400 text-white'
                    : 'bg-cream-100 text-warm-gray border border-cream-200'
              }`}>
                {profile?.subscription_tier === 'max' || profile?.subscription_tier === 'pro'
                  ? 'MAX'
                  : profile?.subscription_tier === 'plus'
                    ? 'PLUS'
                    : 'FREE'}
              </span>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-2 ml-2">
            <Link
              href="/auth/signup"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-navy-700 bg-white rounded-xl hover:bg-cream-50 transition-all shadow-sm cursor-pointer border border-navy-200"
            >
              <User className="w-3.5 h-3.5" />
              Sign Up
            </Link>
            <Link
              href="/auth/login"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-sm cursor-pointer"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>

      {/* ═══ MOBILE: Slim top bar (logo + avatar only) ═══ */}
      <div className="md:hidden flex items-center px-3 py-2 bg-white/95 backdrop-blur-sm border-b border-cream-200 flex-shrink-0 z-50">
        <Link href="/" className="flex items-center">
          <KarkoLogo variant="full" size="xs" theme="light" />
        </Link>
        <div className="flex-1" />
        {/* Mobile Upgrade CTA */}
        {user && profile && (profile.subscription_tier === 'free' || profile.subscription_tier === 'starter') && (
          <Link
            href="/pricing"
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 rounded-md mr-1.5"
          >
            Upgrade
            <ArrowUpRight className="w-2.5 h-2.5" />
          </Link>
        )}
        {user && profile?.subscription_tier === 'plus' && (
          <Link
            href="/pricing"
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-gradient-to-r from-navy-600 to-navy-700 rounded-md mr-1.5"
          >
            Go Max
            <ArrowUpRight className="w-2.5 h-2.5" />
          </Link>
        )}
        {user && (
          <div className="flex items-center mr-1">
            <CreditIndicator compact />
          </div>
        )}
        {user ? (
          <Link href="/settings" className="cursor-pointer">
            <div className="relative">
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br from-navy-500 to-navy-700 flex items-center justify-center overflow-hidden ring-2 ring-offset-1 ring-offset-white/80 ${
                profile?.subscription_tier === 'max' || profile?.subscription_tier === 'pro'
                  ? 'ring-navy-600'
                  : profile?.subscription_tier === 'plus'
                    ? 'ring-gold-400'
                    : 'ring-gray-300'
              }`}>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-3.5 h-3.5 text-white" />
                )}
              </div>
              <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${
                profile?.subscription_tier === 'max' || profile?.subscription_tier === 'pro'
                  ? 'bg-navy-600 text-white'
                  : profile?.subscription_tier === 'plus'
                    ? 'bg-gold-400 text-white'
                    : 'bg-cream-100 text-warm-gray border border-cream-200'
              }`}>
                {profile?.subscription_tier === 'max' || profile?.subscription_tier === 'pro'
                  ? 'MAX'
                  : profile?.subscription_tier === 'plus'
                    ? 'PLUS'
                    : 'FREE'}
              </span>
            </div>
          </Link>
        ) : (
          <Link
            href="/auth/login"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 rounded-xl cursor-pointer"
          >
            Sign In
          </Link>
        )}
      </div>

      {/* ═══ DESKTOP LAYOUT ═══ */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Left Panel - Results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ═══ TIER 2: Panel Toolbar (controls only, no tabs) ═══ */}
          <div className="relative z-40 glass-toolbar px-3 sm:px-5 py-1.5">
            <div className="flex items-center gap-1.5">
              {/* Panel toolbar slot — each panel renders its controls here via portal */}
              <div ref={setToolbarNode} className="flex items-center gap-1.5" />
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'tracker' ? (
              <TrackerPanel />
            ) : activeTab === 'documents' ? (
              <DocumentsPanel />
            ) : !currentCV ? (
              /* ═══ Onboarding: Upload CV to get started ═══ */
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
                      <p className="text-xs text-navy-500">This may take 30–60 seconds</p>
                    </div>
                  ) : (
                    <FileUpload
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
                      onClick={() => setActiveTab('documents')}
                      className="inline-flex items-center gap-1.5 text-xs text-warm-gray hover:text-navy-600 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Go to Documents for more options
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'cv' && <CVPanel toolbarPortal={toolbarNode} />}
                {activeTab === 'ats-score' && <ATSScorePanel />}
                {activeTab === 'cover-letter' && <CoverLetterPanel toolbarPortal={toolbarNode} />}
                {activeTab === 'email' && <EmailPanel toolbarPortal={toolbarNode} />}
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Chat (Desktop: resizable side panel) */}
        <div className="relative flex-shrink-0 transition-[width] duration-200" style={{ width: isChatCollapsed ? COLLAPSED_WIDTH : chatPanelWidth }}>
          {/* Resize Handle — wider hit target (10px) with always-visible grip */}
          {!isChatCollapsed && (
            <div
              onMouseDown={handleMouseDown}
              className="absolute left-0 top-0 bottom-0 w-2.5 -ml-1 cursor-col-resize z-10 group/resize"
              title="Drag to resize · Double-click to collapse"
            >
              {/* Visible track */}
              <div className={`absolute left-1 top-0 bottom-0 w-px transition-colors ${
                isResizing ? 'bg-gold-400' : 'bg-cream-200 group-hover/resize:bg-gold-300'
              }`} />
              {/* Grip dots — always visible */}
              <div className="absolute left-0.5 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                <div className={`w-1 h-1 rounded-full transition-colors ${isResizing ? 'bg-gold-500' : 'bg-cream-400 group-hover/resize:bg-gold-400'}`} />
                <div className={`w-1 h-1 rounded-full transition-colors ${isResizing ? 'bg-gold-500' : 'bg-cream-400 group-hover/resize:bg-gold-400'}`} />
                <div className={`w-1 h-1 rounded-full transition-colors ${isResizing ? 'bg-gold-500' : 'bg-cream-400 group-hover/resize:bg-gold-400'}`} />
              </div>
            </div>
          )}

          {isChatCollapsed ? (
            /* Collapsed state — thin icon strip */
            <div className="h-full flex flex-col items-center py-3 bg-cream-50 border-l border-cream-200">
              <button
                onClick={() => setIsChatCollapsed(false)}
                className="p-2 rounded-lg text-warm-gray hover:text-navy-600 hover:bg-cream-100 transition-colors cursor-pointer"
                title="Expand chat (⌘⇧C)"
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
              <div className="mt-3 flex flex-col items-center">
                <KarkoIcon size="xs" theme="light" />
              </div>
            </div>
          ) : (
            <div id="tour-chat-panel" className="flex-1 h-full overflow-hidden">
              <ChatPanel
                onTabChange={handleTabChange}
                navBarPortal={chatNavNode}
              />
            </div>
          )}
        </div>
      </div>

      {/* ═══ MOBILE LAYOUT ═══ */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        {/* Mobile Content — full screen per tab */}
        <div className="flex-1 overflow-auto">
          {mobileTab === 'tracker' ? (
            <TrackerPanel />
          ) : mobileTab === 'documents' ? (
            <DocumentsPanel />
          ) : !currentCV && mobileTab !== 'chat' ? (
            /* Mobile onboarding */
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
                    <p className="text-xs text-navy-500">This may take 30–60 seconds</p>
                  </div>
                ) : (
                  <FileUpload
                    onFileSelect={handleOnboardingCVUpload}
                    onError={(msg) => setUploadError(msg)}
                    label="Upload your CV"
                    description="PDF, DOCX, TXT, or MD (max 10 MB)"
                  />
                )}

                <div className="mt-4 flex items-center justify-center">
                  <button
                    onClick={() => handleMobileTabChange('documents')}
                    className="inline-flex items-center gap-1.5 text-sm text-warm-gray hover:text-navy-600 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    More options
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {mobileTab === 'chat' && (
                <ChatPanel
                  onTabChange={(tab) => handleMobileTabChange(tab)}
                  isMobileDrawer={false}
                />
              )}
              {mobileTab === 'cv' && <CVPanel />}
              {mobileTab === 'ats-score' && <ATSScorePanel />}
              {mobileTab === 'cover-letter' && <CoverLetterPanel />}
              {mobileTab === 'email' && <EmailPanel />}
            </>
          )}
        </div>

        {/* Mobile Bottom Tab Bar */}
        <div className="flex-shrink-0 bg-white border-t border-cream-200 px-2 pb-[env(safe-area-inset-bottom)] z-50">
          <div className="flex items-center justify-around py-1.5">
            <button
              type="button"
              onClick={() => handleMobileTabChange('chat')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                mobileTab === 'chat' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <MessageCircle className={`w-5 h-5 ${mobileTab === 'chat' ? 'text-gold-500' : ''}`} />
              <span className="text-[10px] font-medium">Chat</span>
              {isAgentWorking && mobileTab !== 'chat' && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-gold-500 rounded-full animate-pulse" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleMobileTabChange('cv')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                mobileTab === 'cv' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <FileText className={`w-5 h-5 ${mobileTab === 'cv' ? 'text-gold-500' : ''}`} />
              <span className="text-[10px] font-medium">CV</span>
            </button>
            <button
              type="button"
              onClick={() => handleMobileTabChange('cover-letter')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                mobileTab === 'cover-letter' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <Mail className={`w-5 h-5 ${mobileTab === 'cover-letter' ? 'text-gold-500' : ''}`} />
              <span className="text-[10px] font-medium">Letter</span>
            </button>
            <button
              type="button"
              onClick={() => handleMobileTabChange('email')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                mobileTab === 'email' ? 'text-gold-600' : 'text-warm-gray'
              }`}
            >
              <Send className={`w-5 h-5 ${mobileTab === 'email' ? 'text-gold-500' : ''}`} />
              <span className="text-[10px] font-medium">Email</span>
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMobileMore(!showMobileMore)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-[52px] ${
                  showMobileMore ? 'text-gold-600' : 'text-warm-gray'
                }`}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
              {/* More menu popover */}
              {showMobileMore && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMobileMore(false)} />
                  <div className="absolute bottom-full right-0 mb-2 w-52 bg-white rounded-xl shadow-lg border border-cream-200 py-1.5 z-50">
                    <button
                      type="button"
                      onClick={() => handleMobileTabChange('ats-score')}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${mobileTab === 'ats-score' ? 'text-gold-600 bg-gold-50' : 'text-charcoal hover:bg-cream-50'}`}
                    >
                      <Target className="w-4 h-4 text-navy-500" />
                      ATS Score
                    </button>
                    {user && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleMobileTabChange('tracker')}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${mobileTab === 'tracker' ? 'text-gold-600 bg-gold-50' : 'text-charcoal hover:bg-cream-50'}`}
                        >
                          <ClipboardList className="w-4 h-4 text-navy-500" />
                          Tracker
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMobileTabChange('documents')}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${mobileTab === 'documents' ? 'text-gold-600 bg-gold-50' : 'text-charcoal hover:bg-cream-50'}`}
                        >
                          <FolderOpen className="w-4 h-4 text-navy-500" />
                          Documents
                        </button>
                        <Link
                          href="/settings"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-cream-50 transition-colors"
                          onClick={() => setShowMobileMore(false)}
                        >
                          <Settings className="w-4 h-4 text-navy-500" />
                          Settings
                        </Link>
                      </>
                    )}
                    {!user && (
                      <>
                        <Link
                          href="/auth/signup"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-cream-50 transition-colors"
                          onClick={() => setShowMobileMore(false)}
                        >
                          <User className="w-4 h-4 text-navy-500" />
                          Sign Up
                        </Link>
                        <Link
                          href="/auth/login"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-cream-50 transition-colors"
                          onClick={() => setShowMobileMore(false)}
                        >
                          <User className="w-4 h-4 text-gold-500" />
                          Sign In
                        </Link>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
