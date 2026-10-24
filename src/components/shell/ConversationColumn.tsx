'use client';

import { flushSync } from 'react-dom';
import { PanelLeftOpen } from 'lucide-react';
import { ChatPanel } from '@/components/ChatPanel';
import { CANVAS_PAGE_WIDTH, CONVERSATION_FLOOR, RAIL_WIDTH, SIDEBAR_WIDTH } from '@/components/shell/dimensions';
import { FeedConversation } from '@/components/job-feed/FeedConversation';
import { TrackerConversation } from '@/components/tracker/TrackerConversation';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore, type KitTab } from '@/store/useUIStore';
import { deriveApplicationStatus } from '@/components/shell/application-status';

interface ConversationColumnProps {
  /** Set by the shell so the sash can measure and drag this column. */
  columnRef?: React.RefObject<HTMLDivElement | null>;
  /** Compact (see COMPACT_MAX_WIDTH), the conversation and the canvas take turns for the row. */
  compact: boolean;
  onTabChange: (tab: KitTab) => void;
}

export function ConversationColumn({ onTabChange, columnRef, compact }: ConversationColumnProps) {
  const currentSession = useSessionStore((s) => s.currentSession);
  const isAgentWorking = useUIStore((s) => s.isAgentWorking);
  // A width the user dragged to wins over the responsive default until they
  // double-click the sash to hand it back.
  const draggedWidth = useUIStore((s) => s.conversationWidth);
  const activeTab = useUIStore((s) => s.activeTab);
  const collapsed = useUIStore((s) => s.conversationCollapsed);
  const setCollapsed = useUIStore((s) => s.setConversationCollapsed);
  const canvasCollapsed = useUIStore((s) => s.canvasCollapsed);
  const setCanvasCollapsed = useUIStore((s) => s.setCanvasCollapsed);

  // The feed and the tracker each have their own conversation. The
  // application's conversation is hidden rather than unmounted underneath
  // them: a generation in flight owns an SSE stream in ChatPanel and must
  // survive a trip to either one.
  const showFeed = activeTab === 'jobs';
  const showTracker = activeTab === 'tracker';

  // The right border divides this column from the canvas. With the canvas
  // folded there is nothing to divide, and it reads as a stray rule.
  // Behind its rail the column has nothing beside it either, and it has to
  // lay out at the width it will show at.
  const readingWidth = canvasCollapsed || collapsed ? 'w-full' : 'w-full border-r border-border';

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

  // Folded, the column is a rail with one way back. Compact, there is only
  // room for one of the two, so coming back folds the canvas to its rail.
  // This button unmounts with the switch, so focus moves to the canvas rail's
  // toggle, the way back.
  const showConversation = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!compact) {
      setCollapsed(false);
      return;
    }
    const hadFocus = document.activeElement === event.currentTarget;
    flushSync(() => setCanvasCollapsed(true));
    if (hadFocus) document.querySelector<HTMLElement>('[data-shell-toggle="canvas"]')?.focus();
  };

  const rail = collapsed && (
    <div style={{ width: RAIL_WIDTH }} className="flex h-full flex-shrink-0 flex-col items-center border-r border-border bg-canvas py-3">
      <button
        type="button"
        onClick={showConversation}
        data-shell-toggle="conversation"
        className="rounded-pill border border-border bg-surface p-1.5 text-ink-muted shadow-resting hover:text-brand-strong cursor-pointer"
        aria-label="Show the conversation"
        title="Show the conversation"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>
    </div>
  );

  const useDraggedWidth = !collapsed && !canvasCollapsed && draggedWidth !== null;

  return (
    <>
      {rail}
      <div
        ref={columnRef}
        style={
          collapsed
            ? { left: SIDEBAR_WIDTH, right: RAIL_WIDTH }
            : canvasCollapsed
              ? undefined
              : useDraggedWidth
                ? { width: `${draggedWidth}px` }
                // The canvas only ever needs one CV page plus its margins, and
                // the sidebar takes its own width. Everything past that is
                // surplus, so the chat takes it instead of leaving it as dead
                // cream either side of the page. calc goes negative on small
                // screens, where the floor takes over and the canvas keeps
                // every pixel it can get.
                : { width: `clamp(${CONVERSATION_FLOOR}px, calc(100vw - ${CANVAS_PAGE_WIDTH + SIDEBAR_WIDTH}px), 1000px)` }
        }
        // Behind its rail the column stays mounted and laid out, out of sight,
        // over the canvas at the exact width it will show at (the row less
        // the sidebar and the canvas rail). display:none would drop the
        // message list's scroll offset, so the chat came back at the top.
        // Opacity rather than visibility: the composer transitions all its
        // properties, so an inherited visibility lingered for 200ms over the
        // canvas. inert keeps it out of the tab order and the a11y tree.
        inert={collapsed}
        className={`h-full min-h-0 ${
          collapsed ? 'pointer-events-none absolute inset-y-0 flex opacity-0' : 'relative flex'
        } ${collapsed ? '' : canvasCollapsed ? 'min-w-0 flex-1' : 'flex-shrink-0'}`}
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
          className={`h-full min-w-0 flex-col bg-surface ${readingWidth} ${
            showFeed || showTracker ? 'hidden' : 'flex'
          }`}
        >
          <header className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
              <p className="text-[11px] text-ink-muted">{statusLabel}</p>
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
    </>
  );
}
