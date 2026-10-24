import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import {
  BASE_URL,
  FAKE_ANTHROPIC_PORT,
  FAKE_ANTHROPIC_URL,
  FALLBACK_SECRET_VARS,
  MCP_BASE_URL,
  MCP_FAKE_PORT,
  MCP_FAKE_URL,
  MCP_INSPECTOR_PORT,
  MCP_PORT,
  OAUTH_PORT,
  PREVIEW_PORT,
  REPO_ROOT,
} from './e2e/lib/env';

/**
 * One Playwright config, up to five projects.
 *
 *   oauth  e2e/mcp-oauth.spec.ts   MCP OAuth server, real MCP client. Preview on 8791 with
 *                                  MCP_ENABLED / MCP_TEST_MODE / MCP_CIMD_ENABLED. The spec starts
 *                                  its own previews on 8792 (flag off) and 8796 (test-mode guard).
 *   data   e2e/specs/**            Data integrity: revisioned saves, credits, the queue runner.
 *                                  Preview on 8794 (E2E_PREVIEW_PORT) with the model pointed at
 *                                  e2e/fake-anthropic.ts on 18793, and the Bedrock failover pointed at the
 *                                  same fake under /bedrock. The mcp lane has no Bedrock credentials.
 *   visual e2e/visual/**           Every screen of the design-system plan at 1280x900 and 768x1024, compared pixel for
 *                                  pixel with the committed Linux snapshots in e2e/visual/__screenshots__/. Runs on the
 *                                  data lane's preview and fake; skipped on macOS (the snapshots are Linux renders).
 *   mcp    e2e/mcp/**              The MCP tool catalog end to end (PLAN section 7), over OAuth, on the local D1.
 *                                  Only with E2E_MCP=1 (npm run test:e2e sets it). Preview on 8798 (E2E_MCP_PORT, inspector
 *                                  E2E_MCP_INSPECTOR_PORT 19398) with MCP_ENABLED and MCP_TEST_MODE, and the model pointed at
 *                                  its own e2e/fake-anthropic.ts on 18798 (E2E_MCP_FAKE_PORT). Every model call, Haiku 5.5 sites
 *                                  included, goes to that fake.
 *   mcp-exports e2e/mcp-exports/** The seven export formats in two templates through export_documents. Only with
 *                                  E2E_MCP_EXPORTS=1 (which also turns the mcp servers on): the mcp preview then runs with the
 *                                  Browser Run binding remote in its generated wrangler config (never committed), so it needs
 *                                  a wrangler login. Not part of npm run test:e2e.
 *
 * Prerequisites:
 *   npx opennextjs-cloudflare build        (npm run test:e2e does this first)
 *   CI=1 npx wrangler d1 migrations apply usefulapply-db --local     # local only, never --remote
 *   An installed Google Chrome, or PW_CHANNEL=chromium after `npx playwright install chromium`,
 *   or E2E_CHROMIUM=/path/to/chrome.
 *
 *   exports evals/ats-export/e2e     The web download E2E of the CV and letter renderer (PR #154). Only with
 *                                  E2E_EXPORTS=1: it needs the Browser Run binding remote (a local-only
 *                                  `"remote": true` on `browser` in wrangler.jsonc, never committed), `next dev` on
 *                                  8793, poppler, and `npm ci --prefix evals/ats-export`. Not part of `npm run test:e2e`.
 *
 * Run oauth, data and mcp: npm run test:e2e. The exports project too: E2E_EXPORTS=1 npx playwright test --project=exports.
 * One project: npx playwright test --project=data. Playwright's `webServer` list is global, not per project, so
 * this file only lists the servers the selected `--project`s need (none selected means all of them), and a run
 * fails if one of its ports is taken. E2E_OAUTH_PORT, E2E_PREVIEW_PORT, FAKE_ANTHROPIC_PORT, E2E_INSPECTOR_PORT,
 * E2E_OAUTH_INSPECTOR_PORT and the E2E_MCP_* ports move a lane so two runs can coexist.
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
 * The previews run wrangler.jsonc minus the production routes. wrangler.jsonc has no `ai` binding any more
 * (every model call goes to the Anthropic API, which the previews point at the scripted fake).
 */
const E2E_WRANGLER = 'wrangler.e2e.generated.json';
const E2E_MCP_WRANGLER = 'wrangler.e2e-mcp.generated.json';
function writeE2eWranglerConfig(file: string, edit?: (config: Record<string, unknown>) => void): void {
  const config = parseJsonc(readFileSync(join(REPO_ROOT, 'wrangler.jsonc'), 'utf8'));
  delete config.routes;
  edit?.(config);
  writeFileSync(join(REPO_ROOT, file), `${JSON.stringify(config, null, 2)}\n`);
}

const MCP_EXPORTS = process.env.E2E_MCP_EXPORTS === '1';
const MCP = process.env.E2E_MCP === '1' || MCP_EXPORTS;

assertBuildIsFresh();
writeE2eWranglerConfig(E2E_WRANGLER);
if (MCP) {
  // The renderer behind export_documents is Browser Run, which does not run locally. Only the exports run points
  // the binding at the real service, in this generated copy and nowhere else.
  writeE2eWranglerConfig(E2E_MCP_WRANGLER, (config) => {
    if (MCP_EXPORTS) config.browser = { ...(config.browser as Record<string, unknown>), remote: true };
  });
}
const artifacts = artifactRoot();

const browser = process.env.E2E_CHROMIUM
  ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM } }
  : { channel: process.env.PW_CHANNEL ?? 'chrome' };

/** Project names passed on the command line (`--project=x`, `--project x`, `-p x`). Empty means every project. */
function selectedProjects(): string[] {
  const names: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--project=')) names.push(arg.slice('--project='.length));
    else if ((arg === '--project' || arg === '-p') && args[i + 1]) names.push(args[++i]);
  }
  return names;
}
const selected = selectedProjects();
const needs = (...projects: string[]) => selected.length === 0 || projects.some((name) => selected.includes(name));

const webServers = [
  ...(needs('oauth')
    ? [
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
            ...FALLBACK_SECRET_VARS,
          ].join(' '),
          url: `http://localhost:${OAUTH_PORT}/.well-known/oauth-protected-resource/mcp`,
          reuseExistingServer: false,
          timeout: 180_000,
          stdout: 'pipe' as const,
          stderr: 'pipe' as const,
        },
      ]
    : []),
  ...(needs('data', 'visual')
    ? [
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
            '--var ANTHROPIC_API_KEY:e2e-stub-key',
            `--var ANTHROPIC_BASE_URL:${FAKE_ANTHROPIC_URL}`,
            // The Bedrock failover, pointed at the same fake under /bedrock. Fake values: they only authenticate to it.
            '--var AWS_BEARER_TOKEN_BEDROCK:e2e-stub-bedrock-token',
            `--var ANTHROPIC_BEDROCK_MANTLE_BASE_URL:${FAKE_ANTHROPIC_URL}/bedrock`,
            // Signs export links, so the web downloads reach the renderer. PDFs still fail here (Browser Run
            // does not run locally), which is the failure p-export-browser-run-only.spec.ts needs; DOCX and TXT render.
            '--var EXPORT_SIGNING_SECRET:e2e-export-signing-secret',
            ...FALLBACK_SECRET_VARS,
          ].join(' '),
          url: BASE_URL,
          reuseExistingServer: false,
          timeout: 180_000,
        },
      ]
    : []),
  ...(MCP && needs('mcp', 'mcp-exports')
    ? [
        {
          command: `npx tsx e2e/fake-anthropic.ts ${MCP_FAKE_PORT}`,
          url: `${MCP_FAKE_URL}/__health`,
          reuseExistingServer: false,
          timeout: 30_000,
        },
        {
          command: [
            `npx opennextjs-cloudflare preview -c ${E2E_MCP_WRANGLER} --`,
            `--port ${MCP_PORT}`,
            `--inspector-port ${MCP_INSPECTOR_PORT}`,
            `--local-upstream localhost:${MCP_PORT}`,
            '--test-scheduled',
            '--var MCP_ENABLED:true',
            '--var MCP_TEST_MODE:true',
            `--var BETTER_AUTH_URL:${MCP_BASE_URL}`,
            '--var ANTHROPIC_API_KEY:e2e-stub-key',
            `--var ANTHROPIC_BASE_URL:${MCP_FAKE_URL}`,
            // Test value that only signs the download links of this run.
            '--var EXPORT_SIGNING_SECRET:e2e-mcp-export-signing-secret',
            ...FALLBACK_SECRET_VARS,
          ].join(' '),
          url: `${MCP_BASE_URL}/.well-known/oauth-protected-resource/mcp`,
          reuseExistingServer: false,
          timeout: 180_000,
          stdout: 'pipe' as const,
          stderr: 'pipe' as const,
        },
      ]
    : []),
];

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
    ...(process.env.E2E_EXPORTS === '1'
      ? [
          {
            name: 'exports-setup',
            testDir: './evals/ats-export/e2e',
            testMatch: 'setup.spec.ts',
            timeout: 120_000,
          },
          {
            name: 'exports',
            testDir: './evals/ats-export/e2e',
            testMatch: 'web-downloads.spec.ts',
            dependencies: ['exports-setup'],
            timeout: 180_000,
            use: {
              baseURL: 'http://localhost:8793',
              acceptDownloads: true,
              storageState: join(tmpdir(), 'ua-e2e-storage.json'),
              viewport: { width: 1440, height: 900 },
            },
          },
        ]
      : []),
    ...(MCP
      ? [
          {
            name: 'mcp',
            testDir: './e2e/mcp',
            timeout: 240_000,
            expect: { timeout: 20_000 },
            use: { baseURL: MCP_BASE_URL, viewport: { width: 1440, height: 900 } },
          },
        ]
      : []),
    ...(MCP_EXPORTS
      ? [
          {
            name: 'mcp-exports',
            testDir: './e2e/mcp-exports',
            timeout: 300_000,
            expect: { timeout: 30_000 },
            use: { baseURL: MCP_BASE_URL, viewport: { width: 1440, height: 900 } },
          },
        ]
      : []),
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
    {
      name: 'visual',
      testDir: './e2e/visual',
      timeout: 180_000,
      // Linux renders only: the spec skips itself on other platforms, and {platform} keeps the names apart.
      snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{platform}{ext}',
      expect: {
        timeout: 20_000,
        toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: 'disabled', caret: 'hide', scale: 'css' },
      },
      use: { baseURL: BASE_URL },
    },
  ],
  webServer: webServers,
});
