'use client';

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Sidebar } from '@/components/shell/Sidebar';
import { COMPACT_MAX_WIDTH, SIDEBAR_WIDTH } from '@/components/shell/dimensions';
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

/**
 * Whether the shell last saw a compact window. Module scope outlives a
 * remount: below 768px the page swaps the shell for the phone layout, and a
 * window that comes back wide from there has still left compact behind.
 */
let lastSawCompact = false;

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

  // At COMPACT_MAX_WIDTH and below, the sidebar, the conversation floor and
  // the canvas floor no longer fit side by side, so the two take turns: one
  // gets the row and the other folds to its rail. Both come back on the way up.
  // A layout effect, so a first render at tablet width never paints the
  // squeezed row before the fold. The shell only ever renders on the client.
  const [compact, setCompact] = useState(false);
  const wasNarrowRef = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    const media = window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH}px)`);
    const sync = () => {
      if (wasNarrowRef.current === media.matches) return;
      const widening = (wasNarrowRef.current ?? lastSawCompact) === true;
      wasNarrowRef.current = media.matches;
      lastSawCompact = media.matches;
      setCompact(media.matches);
      if (!media.matches) {
        setConversationCollapsed(false);
        if (widening) setCanvasCollapsed(false);
      }
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [setConversationCollapsed, setCanvasCollapsed]);

  // Compact, only one of the two may be open. With both open the canvas takes
  // the row: on the way down, on a cold load, or from any future caller that
  // opens one without folding the other. A chat-only view the user already
  // chose is left as it is, so narrowing or a remount never flips it.
  useLayoutEffect(() => {
    if (compact && !canvasCollapsed && !conversationCollapsed) setConversationCollapsed(true);
  }, [compact, canvasCollapsed, conversationCollapsed, setConversationCollapsed]);

  // Starting an application resets the workspace inside ChatPanel, and its
  // job ad field lives in the chat. Compact, with the chat folded, the reset
  // would land behind the rail and leave an empty canvas, so bring it forward.
  const newApplicationRequest = useUIStore((s) => s.newApplicationRequest);
  const seenNewApplicationRef = useRef(newApplicationRequest);
  useLayoutEffect(() => {
    if (newApplicationRequest === seenNewApplicationRef.current) return;
    seenNewApplicationRef.current = newApplicationRequest;
    if (compact && conversationCollapsed) setCanvasCollapsed(true);
  }, [newApplicationRequest, compact, conversationCollapsed, setCanvasCollapsed]);

  // Compact, opening the canvas has to fold the conversation in the same
  // update, or the two squeeze into a row too narrow for either. The button
  // that was clicked unmounts with the switch, so focus moves to the control
  // that switches back, and a keyboard user keeps their place.
  const toggleCanvas = (event: MouseEvent<HTMLButtonElement>) => {
    const hadFocus = document.activeElement === event.currentTarget;
    flushSync(() => {
      if (!canvasCollapsed) setCanvasCollapsed(true);
      else if (compact) setConversationCollapsed(true);
      else setCanvasCollapsed(false);
    });
    if (hadFocus) {
      const next = compact && canvasCollapsed ? 'conversation' : 'canvas';
      document.querySelector<HTMLElement>(`[data-shell-toggle="${next}"]`)?.focus();
    }
  };

  const handleTabChange = (tab: KitTab) => {
    if (activeTab === 'jobs' || activeTab === 'tracker') return;
    setActiveTab(tab);
  };

  return (
    <CreditsProvider>
      <div className="relative flex h-full w-full min-w-0 min-h-0 bg-canvas">
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
