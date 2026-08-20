'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { ConversationColumn } from '@/components/shell/ConversationColumn';
import { CanvasColumn } from '@/components/shell/CanvasColumn';
import { KitExportHost } from '@/components/kit/KitExportHost';
import { CreditsContext, useCreditsBalanceState } from '@/hooks/useCreditsBalance';
import { useUIStore, type KitTab } from '@/store/useUIStore';

function CreditsProvider({ children }: { children: ReactNode }) {
  const value = useCreditsBalanceState();
  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function AppShell() {
  const isAgentWorking = useUIStore((s) => s.isAgentWorking);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const setConversationCollapsed = useUIStore((s) => s.setConversationCollapsed);
  const canvasCollapsed = useUIStore((s) => s.canvasCollapsed);
  const setCanvasCollapsed = useUIStore((s) => s.setCanvasCollapsed);
  const [toolbarNode, setToolbarNode] = useState<HTMLDivElement | null>(null);

  // Below this the 224px sidebar and the 520px conversation leave the canvas
  // nothing to draw in, and the tracker table is the widest thing in it. Fold
  // the conversation on the way down, restore it on the way back up, and leave
  // the user's own choice alone in between.
  const wasNarrowRef = useRef<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const sync = () => {
      if (wasNarrowRef.current === media.matches) return;
      wasNarrowRef.current = media.matches;
      setConversationCollapsed(media.matches);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [setConversationCollapsed]);

  const handleTabChange = (tab: KitTab) => {
    if (activeTab === 'jobs' || activeTab === 'tracker') return;
    setActiveTab(tab);
  };

  return (
    <CreditsProvider>
      <div className="relative flex h-full w-full min-w-0 min-h-0 bg-cream-100">
        <KitExportHost />
        <Sidebar isWorking={isAgentWorking} />
        <ConversationColumn onTabChange={handleTabChange} />
        <CanvasColumn
          collapsed={canvasCollapsed}
          onToggleCollapsed={() => setCanvasCollapsed(!canvasCollapsed)}
          toolbarNode={toolbarNode}
          setToolbarNode={setToolbarNode}
        />
      </div>
    </CreditsProvider>
  );
}
