'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/store/useUIStore';
import { clampConversationWidth, writeConversationWidth } from '@/lib/shell/conversation-width';

interface ColumnSashProps {
  /** Measured so the drag starts from wherever the responsive width left it. */
  getConversationWidth: () => number;
  /** The sidebar is fixed, so the drag range is the rest of the window. */
  sidebarWidth: number;
}

const KEYBOARD_STEP = 24;

/**
 * The drag handle between the conversation and the canvas.
 *
 * It occupies a hairline in the layout and widens its hit area over the gap,
 * so grabbing it is easy without the columns shifting when it highlights.
 * Double-click hands the width back to the responsive default.
 */
export function ColumnSash({ getConversationWidth, sidebarWidth }: ColumnSashProps) {
  const setConversationWidth = useUIStore((s) => s.setConversationWidth);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, width: 0 });

  const apply = useCallback((width: number) => {
    const next = clampConversationWidth(width, window.innerWidth, sidebarWidth);
    setConversationWidth(next);
    return next;
  }, [setConversationWidth, sidebarWidth]);

  // While dragging, the pointer is often over the CV or the chat text, and a
  // drag across either would select it.
  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.body.style.userSelect = previous;
      document.body.style.cursor = '';
    };
  }, [dragging]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { x: event.clientX, width: getConversationWidth() };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    apply(startRef.current.width + (event.clientX - startRef.current.x));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    writeConversationWidth(apply(startRef.current.width + (event.clientX - startRef.current.x)));
  };

  const reset = () => {
    setConversationWidth(null);
    writeConversationWidth(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP;
    writeConversationWidth(apply(getConversationWidth() + delta));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the conversation and canvas columns"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={reset}
      onKeyDown={handleKeyDown}
      title="Drag to resize. Double-click to reset."
      className="group relative z-20 w-px flex-shrink-0 cursor-col-resize bg-border focus:outline-none"
    >
      {/* The grab area is wider than the line, and sits over the gap rather
          than in the layout, so hovering it never nudges either column. */}
      <span className="absolute inset-y-0 -left-2 -right-2 block" />
      <span
        className={`pointer-events-none absolute inset-y-0 left-1/2 block w-0.5 -translate-x-1/2 rounded-pill transition-colors duration-(--duration-base) ${
          dragging ? 'bg-accent' : 'bg-transparent group-hover:bg-accent-muted group-focus-visible:bg-accent'
        }`}
      />
    </div>
  );
}
