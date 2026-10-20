import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { BASE_URL, FAKE_ANTHROPIC_PORT, FAKE_ANTHROPIC_URL, PREVIEW_PORT, REPO_ROOT } from './e2e/lib/env';

/**
 * Data-integrity e2e (PR 2). Headless, trace and video on, one worker: the
 * specs share the preview Worker's local D1.
 *
 * Prerequisites:
 *   npx opennextjs-cloudflare build
 *   CI=1 npx wrangler d1 migrations apply usefulapply-db --local     # local only, never --remote
 *   npx playwright install chromium          # or E2E_CHROMIUM=/path/to/chrome
 *   npm run test:e2e
 *
 * The preview Worker is started with the model pointed at e2e/fake-anthropic.ts
 * (scripted answers, real SDK, real agents, real validators). Nothing in the
 * product reads a test flag. Servers are always started fresh
 * (`reuseExistingServer: false`), so a stale process on a port fails the run
 * instead of being tested by accident.
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
 * The preview runs wrangler.jsonc minus the `ai` binding and the production
 * routes. Workers AI is remote-only (it would reach the real account and cost
 * credits from a test) and the only thing here that uses it is language
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

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: join(artifacts, 'playwright-report'), open: 'never' }],
  ],
  outputDir: join(artifacts, 'test-results'),
  use: {
    baseURL: BASE_URL,
    headless: true,
    // CI installs the browser with `npx playwright install chromium`; E2E_CHROMIUM points at an existing one.
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
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
