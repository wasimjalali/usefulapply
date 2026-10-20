/**
 * Test-only seam for the E2E (only ever used when isMcpTestMode(), which needs
 * MCP_TEST_MODE=true on a localhost origin): lets one user's /oauth2/token
 * request be held inside the provider's issuance step, after the code was
 * consumed, so the test can revoke and reconnect while the exchange is in flight.
 *
 * The provider's customAccessTokenClaims callback runs during issuance but is
 * not given the request, only the user, so the pause is kept per user id (set by
 * the before-hook from that request's header, taken once by that user's issuance).
 * Two exchanges for different users never see each other's pause.
 */
const pauses = new Map<string, number>();

export function setTestIssuePause(userId: string, ms: number): void {
  if (ms > 0) pauses.set(userId, Math.min(ms, 30_000));
}

export async function takeTestIssuePause(userId: string | undefined): Promise<void> {
  if (!userId) return;
  const ms = pauses.get(userId);
  if (ms === undefined) return;
  pauses.delete(userId);
  await new Promise((resolve) => setTimeout(resolve, ms));
}
