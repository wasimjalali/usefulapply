import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The preview Worker the data specs drive. 8791 belongs to the OAuth project, and
 * e2e/mcp-oauth.spec.ts starts its own previews on 8792 and 8796, so this lane is 8794.
 */
export const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT ?? 8794);
/**
 * The preview the OAuth project drives. The spec also starts previews on OAUTH_PORT + 1 (flag off) and
 * OAUTH_PORT + 5 (test-mode guard), which is 8792 and 8796 at the default. Override it (E2E_OAUTH_PORT)
 * to run two copies of the suite side by side.
 */
export const OAUTH_PORT = Number(process.env.E2E_OAUTH_PORT ?? 8791);
export const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

/** The scripted Anthropic stand-in (see e2e/fake-anthropic.ts). */
export const FAKE_ANTHROPIC_PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 18793);
export const FAKE_ANTHROPIC_URL = `http://127.0.0.1:${FAKE_ANTHROPIC_PORT}`;

/**
 * The MCP lane (E2E_MCP=1): a preview with MCP and test mode on, its own scripted model and its own
 * inspector port, so it never shares a server with the data or OAuth lanes.
 */
export const MCP_PORT = Number(process.env.E2E_MCP_PORT ?? 8798);
export const MCP_BASE_URL = `http://localhost:${MCP_PORT}`;
export const MCP_URL = `${MCP_BASE_URL}/mcp`;
export const MCP_FAKE_PORT = Number(process.env.E2E_MCP_FAKE_PORT ?? 18798);
export const MCP_FAKE_URL = `http://127.0.0.1:${MCP_FAKE_PORT}`;
export const MCP_INSPECTOR_PORT = Number(process.env.E2E_MCP_INSPECTOR_PORT ?? 19398);

export const REPO_ROOT = resolve(__dirname, '..', '..');

/** wrangler's local state for the preview, `.wrangler/state/v3`. Local D1 only: nothing here ever points at --remote. */
export const LOCAL_STATE_V3 = join(REPO_ROOT, '.wrangler', 'state', 'v3');

/** Same id as wrangler.jsonc, so a second Miniflare on the same state dir opens the same sqlite file. */
export const D1_DATABASE_ID = '8cd7059e-4f0b-429b-aace-e379756707e1';

export const TEST_PASSWORD = 'E2e-Passw0rd!x';

/**
 * Wrangler `--var` args for the secrets a preview can't start without, used only when the repo has no
 * local secrets file, `.dev.vars` or the `.env` wrangler falls back to (a cloud session or a fresh
 * clone). The file is never read, only checked for. When it exists, its values stay in use, because the
 * local D1 state holds keys encrypted with that auth secret. Other env files (`.env.local` and the
 * like) aren't checked.
 * Test-only values: they sign nothing outside this run's local state.
 */
export const FALLBACK_SECRET_VARS: string[] =
  existsSync(join(REPO_ROOT, '.dev.vars')) || existsSync(join(REPO_ROOT, '.env'))
  ? []
  : ['--var', 'BETTER_AUTH_SECRET:e2e-only-better-auth-secret-not-for-production-use'];
