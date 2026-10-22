'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { ConversationColumn } from '@/components/shell/ConversationColumn';
import { ColumnSash } from '@/components/shell/ColumnSash';
import { CanvasColumn } from '@/components/shell/CanvasColumn';
import { KitExportHost } from '@/components/kit/KitExportHost';
import { CreditsContext, useCreditsBalanceState } from '@/hooks/useCreditsBalance';
import { useUIStore, type KitTab } from '@/store/useUIStore';
import { clampConversationWidth, readConversationWidth, writeConversationWidth } from '@/lib/shell/conversation-width';

function CreditsProvider({ children }: { children: ReactNode }) {
  const value = useCreditsBalanceState();
  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

/** The sidebar is a fixed column; the sash needs it to know its drag range. */
const SIDEBAR_WIDTH = 225;

export function AppShell() {
  const isAgentWorking = useUIStore((s) => s.isAgentWorking);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const conversationCollapsed = useUIStore((s) => s.conversationCollapsed);
  const setConversationCollapsed = useUIStore((s) => s.setConversationCollapsed);
  const canvasCollapsed = useUIStore((s) => s.canvasCollapsed);
  const setCanvasCollapsed = useUIStore((s) => s.setCanvasCollapsed);
  const [toolbarNode, setToolbarNode] = useState<HTMLDivElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const setConversationWidth = useUIStore((s) => s.setConversationWidth);
  const conversationWidth = useUIStore((s) => s.conversationWidth);

  // The store is not persisted, so the dragged width is read back on mount.
  useEffect(() => {
    const saved = readConversationWidth();
    if (saved !== null) setConversationWidth(saved);
  }, [setConversationWidth]);

  // A width that fitted a wide window can starve the canvas on a narrow one,
  // so it is re-clamped whenever the window changes.
  useEffect(() => {
    if (conversationWidth === null) return;
    const onResize = () => {
      const next = clampConversationWidth(conversationWidth, window.innerWidth, SIDEBAR_WIDTH);
      if (next !== conversationWidth) {
        setConversationWidth(next);
        writeConversationWidth(next);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [conversationWidth, setConversationWidth]);

  // Below this the 225px sidebar, the 400px conversation floor and the 480px
  // canvas floor no longer fit side by side, so the two take turns: one gets
  // the row and the other folds to its rail. The canvas wins on the way down,
  // and both come back on the way up. In between, the user's choice stands.
  const [compact, setCompact] = useState(false);
  // A layout effect, so a first render at tablet width never paints the
  // squeezed row before the fold. The shell only ever renders on the client.
  const wasNarrowRef = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const sync = () => {
      if (wasNarrowRef.current === media.matches) return;
      const widening = wasNarrowRef.current === true;
      wasNarrowRef.current = media.matches;
      setCompact(media.matches);
      setConversationCollapsed(media.matches);
      if (widening) setCanvasCollapsed(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [setConversationCollapsed, setCanvasCollapsed]);

  // Compact, opening the canvas has to fold the conversation in the same
  // update, or the two squeeze into a row too narrow for either.
  const toggleCanvas = () => {
    if (!canvasCollapsed) setCanvasCollapsed(true);
    else if (compact) setConversationCollapsed(true);
    else setCanvasCollapsed(false);
  };

  const handleTabChange = (tab: KitTab) => {
    if (activeTab === 'jobs' || activeTab === 'tracker') return;
    setActiveTab(tab);
  };

  return (
    <CreditsProvider>
      <div className="relative flex h-full w-full min-w-0 min-h-0 bg-cream-100">
        <KitExportHost />
        <Sidebar isWorking={isAgentWorking} />
        <ConversationColumn onTabChange={handleTabChange} columnRef={conversationRef} compact={compact} />
        {/* Nothing to resize while either side is a rail. */}
        {!canvasCollapsed && !conversationCollapsed && (
          <ColumnSash
            getConversationWidth={() => conversationRef.current?.getBoundingClientRect().width ?? 0}
            sidebarWidth={SIDEBAR_WIDTH}
          />
        )}
        <CanvasColumn
          collapsed={canvasCollapsed}
          compact={compact}
          onToggleCollapsed={toggleCanvas}
          toolbarNode={toolbarNode}
          setToolbarNode={setToolbarNode}
        />
      </div>
    </CreditsProvider>
  );
}
