'use client';

import { useEffect } from 'react';

// Each deploy replaces the whole Workers static-asset set, so a tab still
// running the previous build 404s on its old hashed chunks the next time it
// lazy-loads one. A hard reload picks up the new build. One reload per minute
// per tab, so a genuinely missing asset can't loop the page.
const RELOAD_KEY = 'ua-chunk-reload-at';
const RELOAD_COOLDOWN_MS = 60_000;

function reloadOnce() {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // Storage unavailable: reload without loop protection rather than stay broken.
  }
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

const CHUNK_ERROR = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/;

export default function ChunkReloadGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    const onError = (event: ErrorEvent) => {
      const target = event.target as HTMLElement | null;
      const src =
        target instanceof HTMLScriptElement ? target.src
        : target instanceof HTMLLinkElement ? target.href
        : '';
      if (src.includes('/_next/static/')) {
        reloadOnce();
        return;
      }
      if (typeof event.message === 'string' && CHUNK_ERROR.test(event.message)) {
        reloadOnce();
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === 'string' ? reason
        : reason instanceof Error ? `${reason.name} ${reason.message}`
        : '';
      if (CHUNK_ERROR.test(message)) reloadOnce();
    };

    // Capture phase: resource load errors do not bubble.
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
