import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { BASE_URL, FAKE_ANTHROPIC_PORT, FAKE_ANTHROPIC_URL, OAUTH_PORT, PREVIEW_PORT, REPO_ROOT } from './e2e/lib/env';

/**
 * One Playwright config, two projects.
 *
 *   oauth  e2e/mcp-oauth.spec.ts   MCP OAuth server, real MCP client. Preview on 8791 with
 *                                  MCP_ENABLED / MCP_TEST_MODE / MCP_CIMD_ENABLED. The spec starts
 *                                  its own previews on 8792 (flag off) and 8796 (test-mode guard).
 *   data   e2e/specs/**            Data integrity: revisioned saves, credits, the queue runner.
 *                                  Preview on 8794 (E2E_PREVIEW_PORT) with the model pointed at
 *                                  e2e/fake-anthropic.ts on 18793.
 *
 * Prerequisites:
 *   npx opennextjs-cloudflare build        (npm run test:e2e does this first)
 *   CI=1 npx wrangler d1 migrations apply usefulapply-db --local     # local only, never --remote
 *   An installed Google Chrome, or PW_CHANNEL=chromium after `npx playwright install chromium`,
 *   or E2E_CHROMIUM=/path/to/chrome.
 *
 * Run both: npm run test:e2e. One project: npx playwright test --project=data.
 * Servers are always started fresh (`reuseExistingServer: false`), so a stale process on a
 * port fails the run instead of being tested by accident. Artifacts go to
 * `<main checkout>/verify/<branch>/` (override with E2E_ARTIFACTS). PW_VIDEO=off skips video.
 * Nothing in the product reads a test flag.
 */

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

/** `<main checkout>/verify/<branch>/`, where the repo keeps verification artifacts. Override with E2E_ARTIFACTS. */
function artifactRoot(): string {
  if (process.env.E2E_ARTIFACTS) return resolve(process.env.E2E_ARTIFACTS);
  const mainCheckout = dirname(resolve(REPO_ROOT, git('rev-parse', '--git-common-dir')));
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').replace(/[^A-Za-z0-9._-]+/g, '-');
  return join(mainCheckout, 'verify', branch);
}

/** The build under test must not be older than the code it claims to test. */
function assertBuildIsFresh(): void {
  if (process.env.E2E_SKIP_BUILD_CHECK) return;
  const worker = join(REPO_ROOT, '.open-next', 'worker.js');
  if (!existsSync(worker)) throw new Error('No build found. Run: npx opennextjs-cloudflare build');
  const sources = [
    ...git('ls-files', 'src', 'migrations', 'wrangler.jsonc', 'package.json', 'next.config.ts', 'open-next.config.ts').split('\n'),
    ...git('ls-files', '-o', '--exclude-standard', 'src', 'migrations').split('\n'),
  ].filter(Boolean);
  const newest = sources.reduce((latest, file) => {
    const path = join(REPO_ROOT, file);
    return existsSync(path) ? Math.max(latest, statSync(path).mtimeMs) : latest;
  }, 0);
  if (newest > statSync(worker).mtimeMs) {
    throw new Error(`The build in .open-next is older than the source (HEAD ${git('rev-parse', '--short', 'HEAD')} plus local changes). Run: npx opennextjs-cloudflare build`);
  }
}

/** wrangler.jsonc without comments or trailing commas, so a copy can be edited as JSON. */
function parseJsonc(text: string): Record<string, unknown> {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 1;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')) as Record<string, unknown>;
}

/**
 * The data project's preview runs wrangler.jsonc minus the `ai` binding and the
 * production routes. Workers AI is remote-only (it would reach the real account and
 * cost credits from a test) and the only thing here that uses it is language
 * detection, which falls back to English when the binding is absent.
 */
const E2E_WRANGLER = 'wrangler.e2e.generated.json';
function writeE2eWranglerConfig(): void {
  const config = parseJsonc(readFileSync(join(REPO_ROOT, 'wrangler.jsonc'), 'utf8'));
  delete config.ai;
  delete config.routes;
  writeFileSync(join(REPO_ROOT, E2E_WRANGLER), `${JSON.stringify(config, null, 2)}\n`);
}

assertBuildIsFresh();
writeE2eWranglerConfig();
const artifacts = artifactRoot();

const browser = process.env.E2E_CHROMIUM
  ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM } }
  : { channel: process.env.PW_CHANNEL ?? 'chrome' };

export default defineConfig({
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: join(artifacts, 'playwright-report'), open: 'never' }],
    ['json', { outputFile: join(artifacts, 'results.json') }],
  ],
  outputDir: join(artifacts, 'test-results'),
  use: {
    headless: true,
    ...browser,
    trace: 'on',
    // Video needs Playwright's ffmpeg (`npx playwright install ffmpeg`); PW_VIDEO=off skips it.
    video: process.env.PW_VIDEO === 'off' ? 'off' : 'on',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'oauth',
      testDir: './e2e',
      testMatch: 'mcp-oauth.spec.ts',
      timeout: 240_000,
      use: { baseURL: `http://localhost:${OAUTH_PORT}` },
    },
    {
      name: 'data',
      testDir: './e2e/specs',
      timeout: 180_000,
      expect: { timeout: 20_000 },
      use: { baseURL: BASE_URL, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: [
        'npx opennextjs-cloudflare preview --',
        `--port ${OAUTH_PORT}`,
        `--inspector-port ${Number(process.env.E2E_OAUTH_INSPECTOR_PORT ?? 19230)}`,
        `--local-upstream localhost:${OAUTH_PORT}`,
        '--test-scheduled',
        '--var MCP_ENABLED:true',
        '--var MCP_TEST_MODE:true',
        '--var MCP_CIMD_ENABLED:true',
        `--var BETTER_AUTH_URL:http://localhost:${OAUTH_PORT}`,
      ].join(' '),
      url: `http://localhost:${OAUTH_PORT}/.well-known/oauth-protected-resource/mcp`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx tsx e2e/fake-anthropic.ts ${FAKE_ANTHROPIC_PORT}`,
      url: `${FAKE_ANTHROPIC_URL}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: [
        `npx opennextjs-cloudflare preview -c ${E2E_WRANGLER} --`,
        `--port ${PREVIEW_PORT}`,
        `--inspector-port ${Number(process.env.E2E_INSPECTOR_PORT ?? 19229)}`,
        '--test-scheduled',
        `--var BETTER_AUTH_URL:${BASE_URL}`,
        '--var AI_PROVIDER:anthropic',
        '--var ANTHROPIC_API_KEY:e2e-stub-key',
        `--var ANTHROPIC_BASE_URL:${FAKE_ANTHROPIC_URL}`,
      ].join(' '),
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
