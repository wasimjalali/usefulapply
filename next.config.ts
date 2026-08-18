import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig: NextConfig = {
  // Image optimization — serve modern formats for smaller payloads
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
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
    ];
  },
  // Staging builds (NEXT_PUBLIC_SITE_STAGE=staging at build time) must not be indexed
  // while karkoai.com is still the live site. Removed at cutover (Task 9.3).
  async headers() {
    if (process.env.NEXT_PUBLIC_SITE_STAGE !== 'staging') return [];
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
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
