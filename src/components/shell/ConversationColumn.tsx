'use client';

import { ChatPanel } from '@/components/ChatPanel';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
import { deriveApplicationStatus } from '@/components/shell/application-status';

interface ConversationColumnProps {
  onTabChange: (tab: 'cv' | 'cover-letter' | 'email') => void;
}

export function ConversationColumn({ onTabChange }: ConversationColumnProps) {
  const currentSession = useSessionStore((s) => s.currentSession);
  const isAgentWorking = useUIStore((s) => s.isAgentWorking);

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
    <section className="flex h-full w-[520px] flex-shrink-0 flex-col border-r border-cream-200 bg-cream-50">
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
  );
}
