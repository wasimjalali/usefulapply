'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { ConversationColumn } from '@/components/shell/ConversationColumn';
import { CanvasColumn } from '@/components/shell/CanvasColumn';
import { useUIStore } from '@/store/useUIStore';

interface AppShellProps {
  onOpenAts: () => void;
}

export function AppShell({ onOpenAts }: AppShellProps) {
  const isAgentWorking = useUIStore((s) => s.isAgentWorking);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const [canvasCollapsed, setCanvasCollapsed] = useState(false);
  const [toolbarNode, setToolbarNode] = useState<HTMLDivElement | null>(null);

  const handleTabChange = (tab: 'cv' | 'cover-letter' | 'email') => {
    if (activeTab === 'jobs' || activeTab === 'tracker') return;
    setActiveTab(tab);
  };

  return (
    <div className="flex h-full min-h-0 bg-cream-100">
      <Sidebar isWorking={isAgentWorking} />
      <ConversationColumn onTabChange={handleTabChange} />
      <CanvasColumn
        collapsed={canvasCollapsed}
        onToggleCollapsed={() => setCanvasCollapsed((v) => !v)}
        toolbarNode={toolbarNode}
        setToolbarNode={setToolbarNode}
        onOpenAts={onOpenAts}
      />
    </div>
  );
}
