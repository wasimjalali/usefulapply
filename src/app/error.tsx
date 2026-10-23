'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

const CHUNK_RELOAD_KEY = 'usefulapply_chunk_reload';

function isChunkLoadError(error: Error): boolean {
  const name = error.name || '';
  const message = error.message || '';
  return (
    name === 'ChunkLoadError' ||
    message.includes('ChunkLoadError') ||
    message.includes('Loading chunk') ||
    message.includes('Failed to load chunk') ||
    message.includes('Loading CSS chunk')
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      posthog.captureException(error, {
        source: 'react_error_boundary',
        error_digest: error.digest,
        is_chunk_load_error: isChunkLoadError(error),
      });
    } catch {
      // PostHog may not be initialized yet during early page load errors
    }

    // After a deploy, stale tabs request old hashed chunks and crash.
    // Reload once so the browser picks up the new HTML/chunk map.
    if (typeof window !== 'undefined' && isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
        }
      } catch {
        // sessionStorage blocked — fall through to manual Try again
      }
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-auto px-6">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-navy-700 mb-2">Something went wrong</h2>
        <p className="text-charcoal mb-6">
          An unexpected error occurred. Our team has been notified.
        </p>
        <button
          onClick={() => {
            try {
              sessionStorage.removeItem(CHUNK_RELOAD_KEY);
            } catch {
              // ignore
            }
            reset();
          }}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
