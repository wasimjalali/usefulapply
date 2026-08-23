'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Query params that carry a live credential and must never reach an analytics
// payload. `g` so every occurrence goes, `i` because casing is not ours to trust.
const SECRET_QUERY_PARAM = /([?&])(token|token_hash|access_token|refresh_token|code)=[^&#]*/gi;

let posthogInitialized = false;

function initializePostHog() {
  if (posthogInitialized || typeof window === 'undefined' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    capture_exceptions: true,
    session_recording: {
      maskAllInputs: false,
      maskTextSelector: '[data-ph-mask]',
    },
    before_send: (event) => {
      if (window.location.pathname.startsWith('/admin-dashboard')) return null;
      return event;
    },
    // Last line of defence for the password reset token. The reset page already
    // strips it from the URL on mount, so it should never reach here, but PostHog
    // puts URLs in more properties than the obvious ones ($current_url,
    // $referrer, $initial_current_url, $session_entry_url, rrweb meta hrefs), so
    // scan every string property rather than an allowlist of keys.
    sanitize_properties: (properties) => {
      const scrubbed: Record<string, unknown> = { ...properties };
      for (const [key, value] of Object.entries(scrubbed)) {
        // No .test() guard: a /g regex carries lastIndex between calls, so
        // testing then replacing would skip matches on later properties.
        if (typeof value !== 'string') continue;
        scrubbed[key] = value.replace(SECRET_QUERY_PARAM, '$1$2=redacted');
      }
      return scrubbed;
    },
  });
  posthogInitialized = true;
}

// A direct admin load must not initialize PostHog or send remote configuration
// traffic with a persistent browser identifier.
if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin-dashboard')) {
  initializePostHog();
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [initialized, setInitialized] = useState(posthogInitialized);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (pathname.startsWith('/admin-dashboard')) {
      if (posthogInitialized) posthog.stopSessionRecording();
      return;
    }
    initializePostHog();
    posthog.startSessionRecording();
    const update = window.setTimeout(() => setInitialized(true), 0);
    return () => window.clearTimeout(update);
  }, [pathname]);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !initialized) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
