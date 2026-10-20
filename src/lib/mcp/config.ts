import { getAuthBaseUrl } from '@/lib/auth/site-url';

export const MCP_PATH = '/mcp';

/** `MCP_ENABLED` comes from wrangler `vars` ("false" in production until launch). Anything but "true" is off. */
export function isMcpEnabled(): boolean {
  return process.env.MCP_ENABLED === 'true';
}

/** The protected resource tokens are bound to, e.g. https://usefulapply.com/mcp. */
export function getMcpResourceUrl(): string {
  return `${getAuthBaseUrl()}${MCP_PATH}`;
}

/**
 * Test mode adds a stub write tool and lets the CIMD fetcher serve a fixture
 * document. It needs MCP_TEST_MODE=true AND a localhost origin, so setting the
 * flag on a deployed host does nothing.
 */
export function isMcpTestMode(): boolean {
  if (process.env.MCP_TEST_MODE !== 'true') return false;
  try {
    const { hostname } = new URL(getAuthBaseUrl());
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Client ID Metadata Documents. Off unless MCP_CIMD_ENABLED is "true": Better
 * Auth requires a fetch transport that resolves the hostname once and pins the
 * approved address, and Workers `fetch` cannot pin. DCR stays on regardless.
 */
export function isMcpCimdEnabled(): boolean {
  return process.env.MCP_CIMD_ENABLED === 'true';
}
