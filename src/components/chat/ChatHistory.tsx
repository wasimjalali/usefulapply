'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import { formatDate } from '@/lib/utils/format-date';

export interface SessionSummary {
  id: string;
  company?: string;
  jobTitle?: string;
  updatedAt: string;
  /** Whether a full application was generated */
  hasGeneratedCV?: boolean;
  /** Whether a fit analysis was done (but no full app) */
  hasFitAnalysis?: boolean;
}

interface ChatHistoryProps {
  sessions: SessionSummary[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
  /** Header (or column) the panel hangs under. Escapes the message scroller. */
  anchor: HTMLElement | null;
}

function sessionLabel(session: SessionSummary): string {
  const title = session.jobTitle?.trim();
  const company = session.company?.trim();
  if (title && company) return `${title} · ${company}`;
  return title || company || 'Untitled';
}

function StatusDot({ hasGeneratedCV, hasFitAnalysis }: { hasGeneratedCV?: boolean; hasFitAnalysis?: boolean }) {
  if (hasGeneratedCV) {
    return <span className="w-2 h-2 rounded-pill bg-status-done flex-shrink-0" title="Completed" />;
  }
  if (hasFitAnalysis) {
    return <span className="w-2 h-2 rounded-pill bg-status-partial flex-shrink-0" title="Analysis only" />;
  }
  return <span className="w-2 h-2 rounded-pill bg-status-draft flex-shrink-0" title="Draft" />;
}

export function ChatHistory({ sessions, currentSessionId, onSelectSession, onClose, anchor }: ChatHistoryProps) {
  const datePrefs = useDatePrefs();
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      setBox({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
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

  if (typeof document === 'undefined') return null;

  const panel = (
    <div
      style={{
        position: 'fixed',
        top: box?.top ?? -9999,
        left: box?.left ?? 0,
        width: box?.width ?? 0,
      }}
      className="z-50 max-h-72 overflow-auto rounded-b-card border border-border border-t-0 bg-surface-raised shadow-floating"
    >
      <div className="p-3">
        <p className="text-xs font-medium text-ink-muted mb-2">Recent Applications</p>
        {sessions.length === 0 ? (
          <p className="text-xs text-ink-muted py-2">No applications yet</p>
        ) : (
          <div className="space-y-0.5">
            {sessions.slice(0, 10).map((session) => (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`w-full text-left px-3 py-2 rounded-control text-sm hover:bg-canvas transition-colors cursor-pointer ${
                  currentSessionId === session.id ? 'bg-canvas ring-1 ring-border-strong' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <StatusDot hasGeneratedCV={session.hasGeneratedCV} hasFitAnalysis={session.hasFitAnalysis} />
                  <p className="font-medium text-ink-body truncate flex-1">
                    {sessionLabel(session)}
                  </p>
                </div>
                <p className="text-xs text-ink-muted flex items-center gap-1 ml-4">
                  <MessageSquare className="w-3 h-3" />
                  {formatDate(new Date(session.updatedAt), datePrefs)}
                </p>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            useUIStore.getState().setActiveTab('tracker');
            onClose();
          }}
          className="w-full flex items-center justify-center gap-1 mt-2 px-3 py-2 text-xs font-medium text-brand hover:text-ink hover:bg-canvas rounded-control transition-colors cursor-pointer"
        >
          View All Applications
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      {panel}
    </>,
    document.body,
  );
}
