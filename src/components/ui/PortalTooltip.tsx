'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Portal-based tooltip that renders at <body> level to escape all stacking contexts
// (backdrop-filter, overflow:hidden, etc.)
export function PortalTooltip({ children, text }: { children: React.ReactElement; text: string }) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxRight: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Find the left panel boundary (the panel that contains this button)
    const panel = triggerRef.current.closest('.flex-1.flex.flex-col.overflow-hidden');
    const panelRight = panel ? panel.getBoundingClientRect().right : window.innerWidth;
    setPos({
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2,
      maxRight: panelRight - 12,
    });
  }, []);

  useEffect(() => {
    if (show) updatePosition();
  }, [show, updatePosition]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="flex-shrink-0"
      >
        {children}
      </div>
      {show && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed px-3 py-2 rounded-lg text-xs shadow-lg pointer-events-none text-center"
          style={{
            top: pos.top,
            left: Math.min(pos.left, pos.maxRight - 120),
            transform: 'translateX(-50%)',
            maxWidth: Math.min(260, pos.maxRight - 24),
            backgroundColor: '#1a2744',
            color: '#f5f0e8',
            border: '1px solid #c9a84c',
            zIndex: 99999,
          }}
        >
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2"
            style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid #c9a84c' }}
          />
          {text}
        </div>,
        document.body
      )}
    </>
  );
}
