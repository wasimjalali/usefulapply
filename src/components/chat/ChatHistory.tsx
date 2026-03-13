'use client';

import { MessageSquare, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export interface SessionSummary {
  id: string;
  company?: string;
  jobTitle?: string;
  updatedAt: string;
}

interface ChatHistoryProps {
  sessions: SessionSummary[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
}

export function ChatHistory({ sessions, currentSessionId, onSelectSession }: ChatHistoryProps) {
  if (sessions.length === 0) {
    return (
      <div className="border-b border-cream-300 bg-white">
        <div className="p-3">
          <p className="text-xs font-medium text-warm-gray mb-2">Recent Applications</p>
          <p className="text-xs text-warm-gray py-2">No applications yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-cream-300 bg-white max-h-60 overflow-auto">
      <div className="p-3">
        <p className="text-xs font-medium text-warm-gray mb-2">Recent Applications</p>
        <div className="space-y-1">
          {sessions.slice(0, 10).map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-cream-100 transition-colors cursor-pointer ${
                currentSessionId === session.id ? 'bg-cream-200' : ''
              }`}
            >
              <p className="font-medium text-charcoal truncate">
                {session.company || session.jobTitle || 'Untitled'}
              </p>
              <p className="text-xs text-warm-gray flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {new Date(session.updatedAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
        <Link
          href="/applications"
          className="flex items-center justify-center gap-1 mt-2 px-3 py-2 text-xs font-medium text-navy-600 hover:text-navy-800 hover:bg-cream-100 rounded-lg transition-colors"
        >
          View All Applications
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
