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
        className="z-50 rounded-2xl border border-cream-200 bg-cream-50 p-3 shadow-md focus:outline-none"
      >
        <p className="text-[13px] font-semibold text-navy-800">{label}</p>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-full border border-cream-200 bg-cream-50 px-3.5 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold text-red-600 transition-colors duration-200 hover:bg-cream-100 disabled:cursor-not-allowed disabled:text-warm-gray cursor-pointer"
          >
            {busy ? 'Deleting' : 'Delete'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
