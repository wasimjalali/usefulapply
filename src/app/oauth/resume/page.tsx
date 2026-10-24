'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { OAUTH_RESUME_KEY } from '@/lib/mcp/oauth-resume';

/**
 * Landing point after Google sign-in for a user an MCP client sent to log in.
 * Replays the signed /oauth2/authorize query saved by the login page, which
 * now finds a session and goes on to the consent screen. With nothing saved
 * (a stale tab, private mode) the user lands on the dashboard.
 */
export default function OAuthResumePage() {
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(OAUTH_RESUME_KEY);
      sessionStorage.removeItem(OAUTH_RESUME_KEY);
    } catch {
      saved = null;
    }
    if (saved && saved.startsWith('?')) {
      window.location.replace(`/api/auth/oauth2/authorize${saved}`);
    } else {
      window.location.replace('/dashboard');
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-brand" />
        <p className="text-ink-muted">Continuing...</p>
      </div>
    </div>
  );
}
