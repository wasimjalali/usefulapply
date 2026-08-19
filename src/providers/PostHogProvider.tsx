'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

// Query params that carry a live credential and must never reach an analytics
// payload. `g` so every occurrence goes, `i` because casing is not ours to trust.
const SECRET_QUERY_PARAM = /([?&])(token|token_hash|access_token|refresh_token|code)=[^&#]*/gi;

// Initialize PostHog at module scope (before any component renders).
// This prevents the race condition where PHProvider receives an uninitialised
// client and session recording scripts load before init completes.
// Error this fixes: "Called on script loaded before session recording is available"
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
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
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
