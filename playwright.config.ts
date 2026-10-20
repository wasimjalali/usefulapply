import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { BASE_URL, FAKE_ANTHROPIC_PORT, FAKE_ANTHROPIC_URL, PREVIEW_PORT } from './e2e/lib/env';

// Playwright 1.55 wants chromium_headless_shell-1193. When only an older cached
// headless shell exists (this Mac), use it instead of downloading a new one.
// E2E_CHROMIUM overrides either way. CI just runs `npx playwright install chromium`.
const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright');
const olderShell = join(cacheRoot, 'chromium_headless_shell-1187', 'chrome-mac', 'headless_shell');
const executablePath = process.env.E2E_CHROMIUM
  ?? (!existsSync(join(cacheRoot, 'chromium_headless_shell-1193')) && existsSync(olderShell) ? olderShell : undefined);

/**
 * Data-integrity e2e (PR 2). Headless, trace and video on, one worker: the
 * specs share the preview Worker's local D1.
 *
 * Prerequisites (the webServer entries below start the servers, but the build
 * is yours to run):
 *   npx opennextjs-cloudflare build
 *   CI=1 npx wrangler d1 migrations apply usefulapply-db --local     # local only, never --remote
 *   npx playwright test
 *
 * The preview Worker is started with the model pointed at e2e/fake-anthropic.ts
 * (scripted answers, real SDK, real agents, real validators). Nothing in the
 * product reads a test flag.
 */
export default defineConfig({
  testDir: './e2e/specs',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.E2E_REPORT_DIR ?? 'verify/playwright-report', open: 'never' }],
  ],
  outputDir: process.env.E2E_OUTPUT_DIR ?? 'verify/test-results',
  use: {
    baseURL: BASE_URL,
    headless: true,
    // CI installs the browser with `npx playwright install chromium`. Locally,
    // E2E_CHROMIUM can point at any already-installed Chromium headless shell.
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: `npx tsx e2e/fake-anthropic.ts ${FAKE_ANTHROPIC_PORT}`,
      url: `${FAKE_ANTHROPIC_URL}/__health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: [
        'npx opennextjs-cloudflare preview --',
        `--port ${PREVIEW_PORT}`,
        '--inspector-port 19229',
        '--test-scheduled',
        `--var BETTER_AUTH_URL:${BASE_URL}`,
        '--var AI_PROVIDER:anthropic',
        '--var ANTHROPIC_API_KEY:e2e-stub-key',
        `--var ANTHROPIC_BASE_URL:${FAKE_ANTHROPIC_URL}`,
      ].join(' '),
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
