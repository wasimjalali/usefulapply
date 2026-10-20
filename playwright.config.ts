import { defineConfig } from '@playwright/test';

/**
 * E2E for the MCP OAuth server (e2e/mcp-oauth.spec.ts).
 *
 * Runs against the built Worker (`opennextjs-cloudflare preview`) on port 8791
 * with the LOCAL D1 (`npx wrangler d1 migrations apply usefulapply-db --local`
 * first). Never run it against --remote. MCP_ENABLED, MCP_TEST_MODE and
 * MCP_CIMD_ENABLED are passed as wrangler --var flags so .dev.vars is not
 * touched. Uses the installed Google Chrome (no browser download); set
 * PW_CHANNEL=chromium after `npx playwright install chromium` to use that.
 */
export const E2E_PORT = 8791;

export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  workers: 1,
  fullyParallel: false,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    headless: true,
    channel: process.env.PW_CHANNEL ?? 'chrome',
    trace: 'on',
    // Video needs Playwright's ffmpeg (`npx playwright install ffmpeg`); PW_VIDEO=off skips it.
    video: process.env.PW_VIDEO === 'off' ? 'off' : 'on',
    screenshot: 'on',
  },
  webServer: {
    command: [
      'npx opennextjs-cloudflare build',
      '&&',
      `npx opennextjs-cloudflare preview -- --port ${E2E_PORT} --local-upstream localhost:${E2E_PORT}`,
      '--var MCP_ENABLED:true',
      '--var MCP_TEST_MODE:true',
      '--var MCP_CIMD_ENABLED:true',
      `--var BETTER_AUTH_URL:http://localhost:${E2E_PORT}`,
    ].join(' '),
    url: `http://localhost:${E2E_PORT}/.well-known/oauth-protected-resource/mcp`,
    timeout: 600_000,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
