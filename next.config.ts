import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashRendererSources } from "./src/lib/services/export/renderer-source-hash";

const nextConfig: NextConfig = {
  // A hash of every source file that shapes an exported CV or letter, baked into the bundle. It is the
  // export cache key's renderer version, so an edit to a template, the print CSS, the DOCX builders or a
  // font changes it without anyone bumping a number.
  env: {
    RENDERER_SOURCE_HASH: hashRendererSources(process.cwd(), { fs, path, crypto } as never),
  },
  // Image optimization — serve modern formats for smaller payloads
  images: {
    formats: ['image/avif', 'image/webp'],
    // Product screenshots carry a ?v= cache-buster.
    localPatterns: [
      { pathname: '/screenshots/**', search: '?v=3' },
      { pathname: '/**', search: '' },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 2560, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Next 16 clamps every request to quality 75 unless listed here. The demo
    // stills are dense product UI; 75 turns their text to mush.
    qualities: [75, 90, 95],
  },
  // Empty turbopack config to silence build warning (Next.js 16+)
  turbopack: {},
  // Webpack fallback for compatibility
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
  // PostHog reverse proxy — bypasses ad blockers
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  async redirects() {
    return [
      { source: '/compare/karko-ai-vs-teal', destination: '/compare/usefulapply-vs-teal', permanent: true },
      { source: '/compare/karko-ai-vs-jobscan', destination: '/compare/usefulapply-vs-jobscan', permanent: true },
      { source: '/compare/karko-ai-vs-rezi', destination: '/compare/usefulapply-vs-rezi', permanent: true },
      { source: '/compare/karko-ai-vs-kickresume', destination: '/compare/usefulapply-vs-kickresume', permanent: true },
      { source: '/compare/karko-ai-vs-enhancv', destination: '/compare/usefulapply-vs-enhancv', permanent: true },
      { source: '/compare/karko-ai-vs-resume-io', destination: '/compare/usefulapply-vs-resume-io', permanent: true },
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/signup', destination: '/auth/signup', permanent: true },
      // 301, not Next's permanent:true (308). No hash: crawlers must land on `/`.
      { source: '/features', destination: '/', statusCode: 301 },
    ];
  },
  // Staging builds (NEXT_PUBLIC_SITE_STAGE=staging at build time) must not be indexed
  // while karkoai.com is still the live site. Removed at cutover (Task 9.3).
  async headers() {
    // The login, consent and authorize pages decide who gets access to an account
    // for an MCP client, so no other site may frame them (clickjacking).
    const noFraming = [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Frame-Options', value: 'DENY' },
    ];
    const rules = [
      '/auth/login',
      '/oauth/consent',
      '/oauth/resume',
      '/api/auth/oauth2/authorize',
    ].map((source) => ({ source, headers: noFraming }));
    if (process.env.NEXT_PUBLIC_SITE_STAGE !== 'staging') return rules;
    return [...rules, { source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

// PostHog source map upload — only enabled when env vars are set (build-time)
const posthogApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID;

export default posthogApiKey && posthogProjectId
  ? withPostHogConfig(nextConfig, {
      personalApiKey: posthogApiKey,
      projectId: posthogProjectId,
      host: 'https://us.i.posthog.com',
      sourcemaps: {
        enabled: true,
        deleteAfterUpload: true,
      },
    })
  : nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
// Only for `next dev`: gives getCloudflareContext() simulated bindings via wrangler.
// Guarded so `next build` and any non-Cloudflare runtime never touch wrangler.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev().catch((error) => {
    console.warn("[open-next] dev bindings unavailable:", error instanceof Error ? error.message : error);
  });
}
