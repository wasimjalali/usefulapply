'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { REGEN_META, regenerateDocument, type RegenTarget } from '@/lib/regenerate-client';
import { generateRequestId } from '@/lib/utils/requestId';
import { useSessionStore } from '@/store/useSessionStore';
import { useToast } from './ui/Toast';

interface KitDocumentErrorProps {
  /** "panel" fills an empty tab; "card" takes one document's slot in a tab that shows several. */
  variant: 'panel' | 'card';
  title: string;
  /** The single-document regenerate for this document. Omitted when none exists (the CV). */
  target?: RegenTarget;
  /** One short line, only where it prevents a mistake. */
  note?: string;
}

/**
 * The calm state a kit tab shows when its document failed while the rest of
 * the kit was delivered. Retry runs the existing per-document regenerate
 * (the same route and price as a rewrite from the chat), so the other tabs
 * are never touched.
 */
export function KitDocumentError({ variant, title, target, note }: KitDocumentErrorProps) {
  const { toast } = useToast();
  const [isRetrying, setIsRetrying] = useState(false);
  const meta = target ? REGEN_META[target] : null;

  const retry = async () => {
    if (!target || !meta || isRetrying) return;
    const sessionId = useSessionStore.getState().currentSession?.id ?? null;
    setIsRetrying(true);
    try {
      const result = await regenerateDocument(target, generateRequestId(), undefined, sessionId);
      if (result.ok) {
        toast.success(`Your ${meta.noun} is ready.`);
      } else if (result.code === 'INSUFFICIENT_CREDITS') {
        toast.error(`You need ${result.required} credits for this and have ${result.available}.`);
      } else if (result.code === 'SIGNED_OUT') {
        toast.error('Sign in again to try this.');
      } else if (result.code === 'REQUEST_IN_PROGRESS') {
        toast.error('That request is still running.');
      } else if (result.code === 'NO_CONTEXT') {
        toast.error('Open this application again, then try once more.');
      } else {
        toast.error(`We couldn't write the ${meta.noun}. Try again.`);
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const button = meta ? (
    <button
      type="button"
      onClick={retry}
      disabled={isRetrying}
      className="inline-flex h-9 items-center gap-2 rounded-full bg-navy-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-navy-700 disabled:cursor-wait disabled:opacity-70 cursor-pointer"
    >
      {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      {isRetrying ? 'Writing...' : `Try again (${meta.cost} credits)`}
    </button>
  ) : null;

  if (variant === 'card') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-cream-200 bg-cream-50 p-5 shadow-sm">
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-warm-gray" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-800">{title}</p>
          {note && <p className="mt-0.5 text-[13px] text-warm-gray">{note}</p>}
        </div>
        {button}
      </div>
    );
  }

  return (
    <div role="alert" className="h-full flex items-center justify-center bg-cream-100 p-8">
      <div className="max-w-sm rounded-2xl border border-cream-200 bg-cream-50 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cream-100">
          <AlertCircle className="h-6 w-6 text-warm-gray" />
        </div>
        <h3 className="mb-1 text-lg font-semibold tracking-tight text-charcoal">{title}</h3>
        {note && <p className="mb-5 text-sm leading-relaxed text-warm-gray">{note}</p>}
        {button && <div className={note ? '' : 'mt-5'}>{button}</div>}
      </div>
    </div>
  );
}
