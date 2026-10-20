import { join, resolve } from 'node:path';

/**
 * The preview Worker the data specs drive. 8791 belongs to the OAuth project, and
 * e2e/mcp-oauth.spec.ts starts its own previews on 8792 and 8796, so this lane is 8794.
 */
export const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT ?? 8794);
/** The preview the OAuth project drives. */
export const OAUTH_PORT = 8791;
export const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

/** The scripted Anthropic stand-in (see e2e/fake-anthropic.ts). */
export const FAKE_ANTHROPIC_PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 18793);
export const FAKE_ANTHROPIC_URL = `http://127.0.0.1:${FAKE_ANTHROPIC_PORT}`;

export const REPO_ROOT = resolve(__dirname, '..', '..');

/** wrangler's local state for the preview, `.wrangler/state/v3`. Local D1 only: nothing here ever points at --remote. */
export const LOCAL_STATE_V3 = join(REPO_ROOT, '.wrangler', 'state', 'v3');

/** Same id as wrangler.jsonc, so a second Miniflare on the same state dir opens the same sqlite file. */
export const D1_DATABASE_ID = '8cd7059e-4f0b-429b-aace-e379756707e1';

export const TEST_PASSWORD = 'E2e-Passw0rd!x';
