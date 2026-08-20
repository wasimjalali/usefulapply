'use client';

import { PanelLeftOpen } from 'lucide-react';
import { ChatPanel } from '@/components/ChatPanel';
import { FeedConversation } from '@/components/job-feed/FeedConversation';
import { TrackerConversation } from '@/components/tracker/TrackerConversation';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore, type KitTab } from '@/store/useUIStore';
import { deriveApplicationStatus } from '@/components/shell/application-status';

interface ConversationColumnProps {
  onTabChange: (tab: KitTab) => void;
}

export function ConversationColumn({ onTabChange }: ConversationColumnProps) {
  const currentSession = useSessionStore((s) => s.currentSession);
  const isAgentWorking = useUIStore((s) => s.isAgentWorking);
  const activeTab = useUIStore((s) => s.activeTab);
  const collapsed = useUIStore((s) => s.conversationCollapsed);
  const setCollapsed = useUIStore((s) => s.setConversationCollapsed);
  const canvasCollapsed = useUIStore((s) => s.canvasCollapsed);

  // The feed and the tracker each have their own conversation. The
  // application's conversation is hidden rather than unmounted underneath
  // them: a generation in flight owns an SSE stream in ChatPanel and must
  // survive a trip to either one.
  const showFeed = activeTab === 'jobs';
  const showTracker = activeTab === 'tracker';

  // The right border divides this column from the canvas. With the canvas
  // folded there is nothing to divide, and it reads as a stray rule.
  const readingWidth = canvasCollapsed ? 'w-full' : 'w-full border-r border-cream-200';

  const title = currentSession
    ? [currentSession.company, currentSession.jobTitle].filter(Boolean).join(', ') || 'New application'
    : 'New application';

  const status = currentSession
    ? deriveApplicationStatus(currentSession, {
        isCurrent: true,
        isWorking: isAgentWorking,
      })
    : 'Now';

  const statusLabel = currentSession?.createdAt && status === 'Now'
    ? 'Started just now'
    : status;

  // Folded, the column is a rail with one way back. The canvas needs the room
  // below roughly 1100px, and the tracker table is the widest thing in it.
  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-shrink-0 flex-col items-center border-r border-cream-200 bg-cream-100 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="rounded-lg p-1.5 text-warm-gray hover:bg-cream-50 hover:text-navy-700 cursor-pointer"
          aria-label="Show the conversation"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full min-h-0 ${
        canvasCollapsed ? 'min-w-0 flex-1' : 'w-[520px] flex-shrink-0'
      }`}
    >
      {/* Hidden rather than unmounted, like the application conversation below:
          unmounting tears down the feed's run poller and refires a full
          overview load on every visit, which flashes the loading state over a
          feed that is already on screen. */}
      <div className={`h-full min-w-0 ${readingWidth} ${showFeed ? 'flex' : 'hidden'}`}>
        <FeedConversation />
      </div>
      {showTracker && (
        <div className={`flex h-full min-w-0 ${readingWidth}`}>
          <TrackerConversation />
        </div>
      )}
      <section
        className={`h-full min-w-0 flex-col bg-cream-50 ${readingWidth} ${
          showFeed || showTracker ? 'hidden' : 'flex'
        }`}
      >
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-cream-200 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-serif text-base font-semibold text-navy-800">{title}</h2>
            <p className="text-xs text-warm-gray">{statusLabel}</p>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <ChatPanel
            onTabChange={onTabChange}
            docked
            spine
          />
        </div>
      </section>
    </div>
  );
}
