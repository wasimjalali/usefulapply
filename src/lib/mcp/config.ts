import { getAuthBaseUrl } from '@/lib/auth/site-url';

export const MCP_PATH = '/mcp';

/** Signing algorithm of the jwt() keys: pinned in server.ts, and the only one /mcp accepts. */
export const MCP_JWT_ALG = 'EdDSA';

/** `MCP_ENABLED` comes from wrangler `vars` ("false" in production until launch). Anything but "true" is off. */
export function isMcpEnabled(): boolean {
  return process.env.MCP_ENABLED === 'true';
}

/** The protected resource tokens are bound to, e.g. https://usefulapply.com/mcp. */
export function getMcpResourceUrl(): string {
  return `${getAuthBaseUrl()}${MCP_PATH}`;
}

// On globalThis: this module is bundled into more than one chunk, and each copy would log once.
const globalForTestMode = globalThis as typeof globalThis & { __uaMcpTestModeWarned?: boolean };

/**
 * Test mode lets the CIMD fetcher serve a fixture document and lets a test
 * hold a token exchange open. It needs MCP_TEST_MODE=true
 * AND a localhost origin. On any other host the flag is never honoured: it is
 * logged once as an error (it should not be set there at all) and test mode
 * stays off.
 */
export function isMcpTestMode(): boolean {
  if (process.env.MCP_TEST_MODE !== 'true') return false;
  let local = false;
  try {
    const { hostname } = new URL(getAuthBaseUrl());
    local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    local = false;
  }
  if (!local && !globalForTestMode.__uaMcpTestModeWarned) {
    globalForTestMode.__uaMcpTestModeWarned = true;
    console.error('[mcp] MCP_TEST_MODE is set but the auth host is not localhost: ignoring it. Remove the variable from this environment.');
  }
  return local;
}

/**
 * Client ID Metadata Documents. Off unless MCP_CIMD_ENABLED is "true": Better
 * Auth requires a fetch transport that resolves the hostname once and pins the
 * approved address, and Workers `fetch` cannot pin. DCR stays on regardless.
 */
export function isMcpCimdEnabled(): boolean {
  return process.env.MCP_CIMD_ENABLED === 'true';
}
