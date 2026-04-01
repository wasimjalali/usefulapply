'use client';

import { useState, useCallback, useEffect } from 'react';
import { CVPanel } from '@/components/CVPanel';
import { CoverLetterPanel } from '@/components/CoverLetterPanel';
import { EmailPanel } from '@/components/EmailPanel';
import { ATSScorePanel } from '@/components/ATSScorePanel';
import { ChatPanel } from '@/components/ChatPanel';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { FileText, Mail, Send, FolderOpen, ClipboardList, Settings, Target, User, Loader2, MessageCircle, MoreHorizontal } from 'lucide-react';
import KarkoLogo from '@/components/KarkoLogo';
import Link from 'next/link';
import { CreditIndicator } from '@/components/ui/CreditIndicator';

export default function Dashboard() {
  const {
    activeTab,
    setActiveTab,
    isAgentWorking,
  } = useAppStore();

  const { user, profile, isLoading } = useAuth();

  // Sync sessions with Supabase in background
  useSupabaseSync();

  // Toolbar portal: panels render their controls into this slot in the tab bar
  const [toolbarNode, setToolbarNode] = useState<HTMLDivElement | null>(null);

  // Chat nav portal: ChatPanel renders History + New Application buttons into this slot in the nav bar
  const [chatNavNode, setChatNavNode] = useState<HTMLDivElement | null>(null);

  // Resizable chat panel state - ALL HOOKS MUST BE BEFORE EARLY RETURNS
  const [chatPanelWidth, setChatPanelWidth] = useState(440);
  const [isResizing, setIsResizing] = useState(false);
  const MIN_CHAT_WIDTH = 360;
  const MAX_CHAT_WIDTH = 650;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleTabChange = useCallback((tab: 'cv' | 'cover-letter' | 'email') => {
    setActiveTab(tab);
  }, [setActiveTab]);

  // Mobile tab state — must be before any early returns (Rules of Hooks)
  const [mobileTab, setMobileTab] = useState<'chat' | 'cv' | 'ats-score' | 'cover-letter' | 'email'>('chat');
  const [showMobileMore, setShowMobileMore] = useState(false);

  // Resize effect (desktop only)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      setChatPanelWidth(Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, newWidth)));
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

  // Show loading state while checking auth (brief — just to resolve user state)
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-cream-100">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
      </div>
    );
  }

  // Sync mobile tab with active tab on desktop
  const handleMobileTabChange = (tab: 'chat' | 'cv' | 'ats-score' | 'cover-letter' | 'email') => {
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
        <div className="flex items-center bg-cream-100/80 rounded-xl p-0.5 ml-4">
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

          {/* Tracker — navigates to /applications */}
          <Link
            href="/applications"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap text-warm-gray hover:text-navy-600 hover:bg-white/60"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Tracker
          </Link>

          {/* Documents — navigates to /documents */}
          <Link
            href="/documents"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap text-warm-gray hover:text-navy-600 hover:bg-white/60"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Documents
          </Link>
        </div>

        <div className="flex-1" />

        {/* Chat nav portal slot — ChatPanel portals History + New Application buttons here */}
        <div ref={setChatNavNode} className="flex items-center" />

        {/* Credit Indicator */}
        {user && (
          <div className="flex items-center mr-1">
            <CreditIndicator />
          </div>
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
            {activeTab === 'cv' && <CVPanel toolbarPortal={toolbarNode} />}
            {activeTab === 'ats-score' && <ATSScorePanel />}
            {activeTab === 'cover-letter' && <CoverLetterPanel toolbarPortal={toolbarNode} />}
            {activeTab === 'email' && <EmailPanel toolbarPortal={toolbarNode} />}
          </div>
        </div>

        {/* Right Panel - Chat (Desktop: resizable side panel) */}
        <div className="relative" style={{ width: chatPanelWidth }}>
          {/* Resize Handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 transition-colors ${
              isResizing ? 'bg-gold-400' : 'bg-cream-200 hover:bg-gold-300'
            }`}
            title="Drag to resize"
          >
            <div className={`absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-16 rounded-full transition-opacity ${
              isResizing ? 'bg-gold-500 opacity-100' : 'bg-cream-400 opacity-0 hover:opacity-100'
            }`} />
          </div>

          <div className="flex-1 h-full overflow-hidden">
            <ChatPanel
              onTabChange={handleTabChange}
              navBarPortal={chatNavNode}
            />
          </div>
        </div>
      </div>

      {/* ═══ MOBILE LAYOUT ═══ */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        {/* Mobile Content — full screen per tab */}
        <div className="flex-1 overflow-auto">
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
                        <Link
                          href="/applications"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-cream-50 transition-colors"
                          onClick={() => setShowMobileMore(false)}
                        >
                          <ClipboardList className="w-4 h-4 text-navy-500" />
                          Tracker
                        </Link>
                        <Link
                          href="/documents"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-cream-50 transition-colors"
                          onClick={() => setShowMobileMore(false)}
                        >
                          <FolderOpen className="w-4 h-4 text-navy-500" />
                          Documents
                        </Link>
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
