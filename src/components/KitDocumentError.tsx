'use client';

import { useSyncExternalStore } from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import {
  REGEN_META,
  isRegenInFlight,
  regenerateDocument,
  subscribeRegenInFlight,
  type RegenTarget,
} from '@/lib/regenerate-client';
import { generateRequestId } from '@/lib/utils/requestId';
import { useSessionStore } from '@/store/useSessionStore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from './ui/Toast';

interface KitDocumentErrorProps {
  /** "panel" fills an empty tab; "card" takes one document's slot in a tab that shows several. */
  variant: 'panel' | 'card';
  title: string;
  /** The single-document regenerate for this document. */
  target: RegenTarget;
}

/**
 * The calm state a kit tab shows when its document failed while the rest of
 * the kit was delivered. Retry runs the existing per-document regenerate
 * (the same route and price as a rewrite from the chat), so the other tabs
 * are never touched.
 *
 * Whether a retry is running comes from regenerate-client, not from this
 * component: a tab switch remounts it, and the guard has to survive that and
 * cover a rewrite started from the chat for the same document.
 */
export function KitDocumentError({ variant, title, target }: KitDocumentErrorProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const sessionId = useSessionStore((s) => s.currentSession?.id ?? null);
  const isRetrying = useSyncExternalStore(
    subscribeRegenInFlight,
    () => isRegenInFlight(sessionId, target),
    () => false,
  );
  const meta = REGEN_META[target];

  const retry = async () => {
    if (isRetrying) return;
    const result = await regenerateDocument(target, generateRequestId(), undefined, sessionId);
    if (result.ok) {
      toast.success(`Your ${meta.noun} is ready.`);
    } else if (result.code === 'INSUFFICIENT_CREDITS') {
      toast.error(`You need ${result.required} credits for this and have ${result.available}.`);
    } else if (result.code === 'SIGNED_OUT') {
      toast.error(user ? 'Sign in again to try this.' : 'Sign in to try this.');
    } else if (result.code === 'REQUEST_IN_PROGRESS') {
      toast.error('That request is still running.');
    } else if (result.code === 'NO_CONTEXT') {
      toast.error('Open this application again, then try once more.');
    } else {
      toast.error(`We couldn't write the ${meta.noun}. Try again.`);
    }
  };

  const button = (
    <button
      type="button"
      onClick={retry}
      disabled={isRetrying}
      className="inline-flex h-9 items-center gap-2 rounded-pill bg-brand px-4 text-sm font-semibold text-brand-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-brand-strong disabled:cursor-wait disabled:opacity-70 cursor-pointer"
    >
      {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      {isRetrying ? 'Writing...' : `Try again (${meta.cost} credits)`}
    </button>
  );

  if (variant === 'card') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-5 shadow-resting">
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-ink-muted" />
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</p>
        {button}
      </div>
    );
  }

  return (
    <div role="alert" className="h-full flex items-center justify-center bg-canvas p-8">
      <div className="max-w-sm rounded-card border border-border bg-surface p-8 text-center shadow-resting">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-canvas">
          <AlertCircle className="h-6 w-6 text-ink-muted" />
        </div>
        <h3 className="mb-5 text-lg font-semibold tracking-tight text-ink-body">{title}</h3>
        {button}
      </div>
    </div>
  );
}
