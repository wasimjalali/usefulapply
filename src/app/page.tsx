'use client';

import { useState, useCallback, useEffect } from 'react';
import { CVPanel } from '@/components/CVPanel';
import { CoverLetterPanel } from '@/components/CoverLetterPanel';
import { EmailPanel } from '@/components/EmailPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { StorageCleaner } from '@/components/StorageCleaner';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Mail, Send, FolderOpen, Settings, User } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const {
    activeTab,
    setActiveTab,
  } = useAppStore();

  const { profile } = useAuth();

  // Resizable chat panel state
  const [chatPanelWidth, setChatPanelWidth] = useState(440); // Increased default width for better readability
  const [isResizing, setIsResizing] = useState(false);
  const MIN_CHAT_WIDTH = 360;
  const MAX_CHAT_WIDTH = 650;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

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

  const handleTabChange = (tab: 'cv' | 'cover-letter' | 'email') => {
    setActiveTab(tab);
  };

  return (
    <div className="h-screen flex flex-col bg-cream-100">
      <StorageCleaner />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="bg-cream-50 border-b border-cream-300 px-4">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('cv')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'cv'
                    ? 'border-navy-600 text-navy-600'
                    : 'border-transparent text-warm-gray hover:text-charcoal'
                }`}
              >
                <FileText className="w-4 h-4" />
                CV
              </button>
              <button
                onClick={() => setActiveTab('cover-letter')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'cover-letter'
                    ? 'border-navy-600 text-navy-600'
                    : 'border-transparent text-warm-gray hover:text-charcoal'
                }`}
              >
                <Mail className="w-4 h-4" />
                Cover Letter
              </button>
              <button
                onClick={() => setActiveTab('email')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'email'
                    ? 'border-navy-600 text-navy-600'
                    : 'border-transparent text-warm-gray hover:text-charcoal'
                }`}
              >
                <Send className="w-4 h-4" />
                Email
              </button>
              
              {/* Documents Link */}
              <Link
                href="/documents"
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-transparent text-warm-gray hover:text-charcoal transition-colors ml-auto cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                Documents
              </Link>

              {/* Settings/Profile Link */}
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 border-transparent text-warm-gray hover:text-charcoal transition-colors cursor-pointer"
                title="Settings & Profile"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-500 to-navy-600 flex items-center justify-center overflow-hidden">
                  {profile?.avatar_url ? (
                    <img 
                      src={profile.avatar_url} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
              </Link>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'cv' && <CVPanel />}
            {activeTab === 'cover-letter' && <CoverLetterPanel />}
            {activeTab === 'email' && <EmailPanel />}
          </div>
        </div>

        {/* Right Panel - Chat (Resizable) */}
        <div className="relative flex" style={{ width: chatPanelWidth }}>
          {/* Resize Handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-navy-400 transition-colors ${
              isResizing ? 'bg-navy-400' : 'bg-transparent hover:bg-navy-200'
            }`}
            title="Drag to resize"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-cream-400 opacity-0 hover:opacity-100 transition-opacity" />
          </div>
          
          <div className="flex-1 overflow-hidden">
            <ChatPanel 
              onTabChange={handleTabChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
