'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface PdfPreviewModalProps {
  /** An object URL of the rendered PDF. The caller revokes it. */
  url: string;
  title: string;
  onClose: () => void;
  /**
   * What had focus when the preview was asked for. The button is disabled while the PDF builds, which drops
   * its focus, so by the time the modal mounts `document.activeElement` is already the page body.
   */
  returnFocusTo?: HTMLElement | null;
}

const FOCUSABLE = 'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])';

/**
 * Shows the PDF the server would export, so people see real page breaks and the
 * letter layout before they download. A modal dialog: Escape closes it, Tab
 * stays inside it, and focus goes back to what opened it.
 */
export function PdfPreviewModal({ url, title, onClose, returnFocusTo }: PdfPreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = returnFocusTo ?? (document.activeElement as HTMLElement | null);
    closeRef.current?.focus();
    // Focus inside a PDF viewer iframe cannot be trapped by a key handler, so everything behind the dialog is made
    // inert: Tab can only go to the dialog (or out of the page), never to the app underneath.
    const inerted = Array.from(document.body.children).filter((el) => el !== overlayRef.current && !el.hasAttribute('inert'));
    inerted.forEach((el) => el.setAttribute('inert', ''));
    return () => {
      inerted.forEach((el) => el.removeAttribute('inert'));
      opener?.focus?.();
    };
    // Only on mount and unmount: the opener is fixed for the life of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div ref={overlayRef} className="fixed inset-0 z-[220] flex items-center justify-center bg-navy-950/45 p-4 backdrop-blur-[2px]" onKeyDown={onKeyDown}>
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
        <iframe
          src={url}
          title={title}
          className="h-full w-full flex-1 bg-white"
          onLoad={(event) => {
            // The PDF is a same-origin blob, so its window is reachable and a key press inside it can close the dialog.
            // Chrome's own PDF viewer runs in a separate process and does not hand its key presses to the page, so
            // Escape may not arrive from inside the viewer. Close is the first thing Tab reaches and has focus on open.
            try {
              event.currentTarget.contentWindow?.addEventListener('keydown', (keyEvent) => {
                if (keyEvent.key === 'Escape') onCloseRef.current();
              });
            } catch {
              // Not reachable: Close and Escape on the dialog still work.
            }
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
