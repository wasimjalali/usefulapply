'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

const CHUNK_RELOAD_KEY = 'karko_chunk_reload';

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

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      posthog.captureException(error, {
        source: 'global_error_boundary',
        error_digest: error.digest,
        is_chunk_load_error: isChunkLoadError(error),
      });
    } catch {
      // PostHog may not be ready
    }

    if (typeof window !== 'undefined' && isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
        }
      } catch {
        // ignore
      }
    }
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem', margin: '0 auto', padding: '0 1.5rem' }}>
            <div style={{ fontSize: '3.75rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e3a5f', marginBottom: '0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#4a5568', marginBottom: '1.5rem' }}>
              A critical error occurred. Our team has been notified.
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
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '1rem',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
