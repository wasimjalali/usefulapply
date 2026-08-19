'use client';

import { ChatPanel } from '@/components/ChatPanel';
import { FeedConversation } from '@/components/job-feed/FeedConversation';
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

  // The feed is its own conversation. The application's conversation is
  // hidden rather than unmounted underneath it: a generation in flight owns
  // an SSE stream in ChatPanel and must survive a trip to the feed.
  const showFeed = activeTab === 'jobs';

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

  return (
    <>
      {showFeed && <FeedConversation />}
      <section
        className={`h-full w-[520px] flex-shrink-0 flex-col border-r border-cream-200 bg-cream-50 ${
          showFeed ? 'hidden' : 'flex'
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
    </>
  );
}
