'use client';

import { MessageSquare, ArrowRight } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';

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
}

function StatusDot({ hasGeneratedCV, hasFitAnalysis }: { hasGeneratedCV?: boolean; hasFitAnalysis?: boolean }) {
  if (hasGeneratedCV) {
    return <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Completed" />;
  }
  if (hasFitAnalysis) {
    return <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Analysis only" />;
  }
  return <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" title="Draft" />;
}

export function ChatHistory({ sessions, currentSessionId, onSelectSession, onClose }: ChatHistoryProps) {
  if (sessions.length === 0) {
    return (
      <>
        {/* Backdrop */}
        <div className="absolute inset-0 z-10" onClick={onClose} />
        <div className="absolute top-0 left-0 right-0 z-20 bg-white rounded-b-xl shadow-lg border border-cream-200 border-t-0">
          <div className="p-3">
            <p className="text-xs font-medium text-warm-gray mb-2">Recent Applications</p>
            <p className="text-xs text-warm-gray py-2">No applications yet</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop — click outside to close */}
      <div className="absolute inset-0 z-10" onClick={onClose} />
      <div className="absolute top-0 left-0 right-0 z-20 bg-white rounded-b-xl shadow-lg border border-cream-200 border-t-0 max-h-72 overflow-auto">
        <div className="p-3">
          <p className="text-xs font-medium text-warm-gray mb-2">Recent Applications</p>
          <div className="space-y-0.5">
            {sessions.slice(0, 10).map((session) => (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-cream-100 transition-colors cursor-pointer ${
                  currentSessionId === session.id ? 'bg-cream-100 ring-1 ring-cream-300' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <StatusDot hasGeneratedCV={session.hasGeneratedCV} hasFitAnalysis={session.hasFitAnalysis} />
                  <p className="font-medium text-charcoal truncate flex-1">
                    {session.company || session.jobTitle || 'Untitled'}
                  </p>
                </div>
                <p className="text-xs text-warm-gray flex items-center gap-1 ml-4">
                  <MessageSquare className="w-3 h-3" />
                  {new Date(session.updatedAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              useUIStore.getState().setActiveTab('tracker');
              onClose();
            }}
            className="w-full flex items-center justify-center gap-1 mt-2 px-3 py-2 text-xs font-medium text-navy-600 hover:text-navy-800 hover:bg-cream-100 rounded-lg transition-colors cursor-pointer"
          >
            View All Applications
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </>
  );
}
