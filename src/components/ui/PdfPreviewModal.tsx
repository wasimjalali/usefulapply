'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface PdfPreviewModalProps {
  /** An object URL of the rendered PDF. The caller revokes it. */
  url: string;
  title: string;
  onClose: () => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])';

/**
 * Shows the PDF the server would export, so people see real page breaks and the
 * letter layout before they download. A modal dialog: Escape closes it, Tab
 * stays inside it, and focus goes back to what opened it.
 */
export function PdfPreviewModal({ url, title, onClose }: PdfPreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-navy-950/45 p-4 backdrop-blur-[2px]" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-[92vh] w-full max-w-[900px] flex-col overflow-hidden rounded-[24px] border border-cream-200 bg-cream-100 shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-charcoal">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cream-200 bg-white text-warm-gray transition-colors duration-200 hover:border-navy-200 hover:text-navy-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <iframe src={url} title={title} className="h-full w-full flex-1 bg-white" />
      </div>
    </div>,
    document.body,
  );
}
