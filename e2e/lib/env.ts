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
/** The stand-in for the Workers AI binding (e2e/fake-ai/worker.mjs), a Worker of its own that the preview binds as `AI`. */
export const MCP_AI_PORT = Number(process.env.E2E_MCP_AI_PORT ?? 18788);
export const MCP_AI_INSPECTOR_PORT = Number(process.env.E2E_MCP_AI_INSPECTOR_PORT ?? 19388);
/** The name that Worker registers under, one per lane port so two runs on one machine do not find each other's. */
export const MCP_AI_WORKER_NAME = `ua-e2e-fake-ai-${MCP_PORT}`;

export const REPO_ROOT = resolve(__dirname, '..', '..');

/** wrangler's local state for the preview, `.wrangler/state/v3`. Local D1 only: nothing here ever points at --remote. */
export const LOCAL_STATE_V3 = join(REPO_ROOT, '.wrangler', 'state', 'v3');

/** Same id as wrangler.jsonc, so a second Miniflare on the same state dir opens the same sqlite file. */
export const D1_DATABASE_ID = '8cd7059e-4f0b-429b-aace-e379756707e1';

export const TEST_PASSWORD = 'E2e-Passw0rd!x';
