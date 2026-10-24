'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PANEL_WIDTH = 244;
const PANEL_HEIGHT = 108;

interface DeleteConfirmProps {
  company: string;
  anchor: HTMLElement | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirm({
  company,
  anchor,
  busy,
  error,
  onClose,
  onConfirm,
}: DeleteConfirmProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const label = company.trim() ? `Delete ${company}?` : 'Delete this application?';

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const below = rect.bottom + 4;
      const flip = below + PANEL_HEIGHT > window.innerHeight;
      setPosition({
        top: flip ? Math.max(8, rect.top - PANEL_HEIGHT - 4) : below,
        left: Math.min(Math.max(8, rect.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - 8),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={label}
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          width: PANEL_WIDTH,
        }}
        className="z-50 origin-top-right rounded-card border border-border bg-surface p-3 shadow-elevated animate-pop-in focus:outline-none"
      >
        <p className="text-[13px] font-semibold text-ink">{label}</p>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-pill border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised cursor-pointer"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex h-9 items-center rounded-pill px-3.5 text-sm font-semibold text-danger transition-colors duration-(--duration-base) hover:bg-canvas disabled:cursor-not-allowed disabled:text-ink-muted cursor-pointer"
          >
            {busy ? 'Deleting' : 'Delete'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
