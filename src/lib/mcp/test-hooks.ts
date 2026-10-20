/**
 * Test-only seam for the E2E (only ever set when isMcpTestMode(), which needs
 * MCP_TEST_MODE=true on a localhost origin): lets one /oauth2/token request be
 * held inside the provider's issuance step, after the code was consumed, so the
 * test can revoke and reconnect while the exchange is in flight.
 */
let issuePauseMs = 0;

export function setTestIssuePause(ms: number): void {
  issuePauseMs = Math.min(Math.max(ms, 0), 30_000);
}

/** Called from the provider's customAccessTokenClaims, which runs during issuance. Takes the pause once. */
export async function takeTestIssuePause(): Promise<void> {
  const ms = issuePauseMs;
  issuePauseMs = 0;
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}
