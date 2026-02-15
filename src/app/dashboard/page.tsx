'use client';

import { useState, useCallback, useEffect } from 'react';
import { CVPanel } from '@/components/CVPanel';
import { CoverLetterPanel } from '@/components/CoverLetterPanel';
import { EmailPanel } from '@/components/EmailPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { FileText, Mail, Send, FolderOpen, Settings, User, Loader2, Sparkles, MessageCircle, X } from 'lucide-react';
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

  // Resizable chat panel state - ALL HOOKS MUST BE BEFORE EARLY RETURNS
  const [chatPanelWidth, setChatPanelWidth] = useState(440);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const MIN_CHAT_WIDTH = 360;
  const MAX_CHAT_WIDTH = 650;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleTabChange = useCallback((tab: 'cv' | 'cover-letter' | 'email') => {
    setActiveTab(tab);
    // On mobile, auto-close chat drawer when switching to a content tab
    setIsMobileChatOpen(false);
  }, [setActiveTab]);

  // No longer redirecting - anonymous users can access the dashboard for one free generation

  // Auto-close mobile chat drawer when agent finishes working
  const [wasAgentWorking, setWasAgentWorking] = useState(false);
  useEffect(() => {
    if (wasAgentWorking && !isAgentWorking) {
      // Agent just finished — close chat drawer so user sees results
      setIsMobileChatOpen(false);
    }
    setWasAgentWorking(isAgentWorking);
  }, [isAgentWorking, wasAgentWorking]);

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

  // Lock body scroll when mobile chat drawer is open
  useEffect(() => {
    if (isMobileChatOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileChatOpen]);

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
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Results (full width on mobile) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs - Premium Frosted Glass Header */}
          <div className="relative z-50 glass-header px-3 sm:px-5">
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Main Tabs - Pill segment style */}
              <div className="flex items-center bg-cream-100/80 rounded-xl p-0.5 my-2">
                <button
                  onClick={() => setActiveTab('cv')}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'cv'
                      ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                      : 'text-warm-gray hover:text-navy-600'
                  }`}
                >
                  <FileText className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === 'cv' ? 'text-gold-500' : ''}`} />
                  CV
                </button>
                <button
                  onClick={() => setActiveTab('cover-letter')}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'cover-letter'
                      ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                      : 'text-warm-gray hover:text-navy-600'
                  }`}
                >
                  <Mail className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === 'cover-letter' ? 'text-gold-500' : ''}`} />
                  <span className="hidden sm:inline">Cover Letter</span>
                  <span className="sm:hidden">Letter</span>
                </button>
                <button
                  onClick={() => setActiveTab('email')}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'email'
                      ? 'bg-white text-navy-700 shadow-sm font-semibold ring-1 ring-cream-200/80'
                      : 'text-warm-gray hover:text-navy-600'
                  }`}
                >
                  <Send className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === 'email' ? 'text-gold-500' : ''}`} />
                  Email
                </button>
              </div>
              
              {/* Spacer */}
              <div className="flex-1" />
              
              {/* Credit Indicator — only for authenticated users */}
              {user && (
                <div className="flex items-center">
                  <CreditIndicator />
                </div>
              )}

              {/* Documents Link — only for authenticated users */}
              {user && (
                <Link
                  href="/documents"
                  className="flex items-center gap-2 px-2 sm:px-3 py-2 text-sm font-medium text-warm-gray hover:text-navy-600 transition-colors cursor-pointer rounded-lg hover:bg-cream-100/60"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span className="hidden lg:inline">Documents</span>
                </Link>
              )}

              {/* Settings/Profile Link (authenticated) OR Sign In/Sign Up buttons (anonymous) */}
              {user ? (
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-1 sm:px-2 py-1.5 cursor-pointer"
                  title="Settings & Profile"
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-navy-500 to-navy-700 flex items-center justify-center overflow-hidden ring-2 ring-gold-300/40 ring-offset-1 ring-offset-white/80">
                    {profile?.avatar_url ? (
                      <img 
                        src={profile.avatar_url} 
                        alt="Profile" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    )}
                  </div>
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/auth/signup"
                    className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-semibold text-navy-700 bg-white rounded-xl hover:bg-cream-50 transition-all shadow-sm cursor-pointer border border-navy-200"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sign Up</span>
                  </Link>
                  <Link
                    href="/auth/login"
                    className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-sm cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sign In</span>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'cv' && <CVPanel />}
            {activeTab === 'cover-letter' && <CoverLetterPanel />}
            {activeTab === 'email' && <EmailPanel />}
          </div>
        </div>

        {/* Right Panel - Chat (Desktop: resizable side panel) */}
        <div className="hidden md:flex relative" style={{ width: chatPanelWidth }}>
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
          
          <div className="flex-1 overflow-hidden">
            <ChatPanel 
              onTabChange={handleTabChange}
            />
          </div>
        </div>
      </div>

      {/* Mobile Chat Drawer Overlay */}
      {isMobileChatOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={() => setIsMobileChatOpen(false)}
        />
      )}

      {/* Mobile Chat Drawer */}
      <div 
        className={`md:hidden fixed inset-y-0 right-0 w-full max-w-md z-50 transform transition-transform duration-300 ease-in-out ${
          isMobileChatOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col bg-cream-50 shadow-2xl">
          {/* Mobile Chat Header with Close Button */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-cream-200 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold-400" />
              <span className="text-sm font-semibold text-navy-700">KarKo AI Chat</span>
            </div>
            <button
              onClick={() => setIsMobileChatOpen(false)}
              className="p-2 rounded-lg text-warm-gray hover:bg-cream-100 hover:text-navy-600 transition-all cursor-pointer"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel 
              onTabChange={handleTabChange}
              isMobileDrawer={true}
            />
          </div>
        </div>
      </div>

      {/* Mobile Floating Chat Toggle Button */}
      <button
        onClick={() => setIsMobileChatOpen(!isMobileChatOpen)}
        className={`md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer ${
          isMobileChatOpen
            ? 'bg-navy-600 text-white scale-0 opacity-0'
            : 'bg-gradient-to-r from-gold-400 to-gold-500 text-white scale-100 opacity-100 hover:shadow-xl hover:from-gold-500 hover:to-gold-600 active:scale-95'
        }`}
        aria-label="Open chat"
      >
        <MessageCircle className="w-6 h-6" />
        {isAgentWorking && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>
    </div>
  );
}
