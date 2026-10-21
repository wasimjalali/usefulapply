import { writeFileSync } from 'node:fs';
import { expect, test } from '../lib/worker-logs';
import { EXPIRING_TOKEN_FILE } from '../lib/expiring-token';
import { jwtClaims, newAgent } from '../lib/mcp-client';

/**
 * First spec of the lane, on purpose. An access token lives 10 minutes and the only honest way to see an expired
 * one is to wait, so the token is minted here, at the start of the run, and 99-expired-token.spec.ts (the last
 * spec) checks it after the rest of the suite has used up its lifetime: the wait costs nothing the suite was not
 * already spending. The file holds one throwaway token of a throwaway local user.
 */
test('mint a token that will be expired by the time the last spec runs', async ({ browser, request }) => {
  const { session, context } = await newAgent(browser, request, 'expiry');
  try {
    await session.ok('get_account');
    const claims = jwtClaims(session.accessToken);
    expect((claims.exp as number) - (claims.iat as number)).toBe(600);
    writeFileSync(
      EXPIRING_TOKEN_FILE,
      JSON.stringify({
        accessToken: session.accessToken,
        refreshToken: session.tokens.refreshToken,
        clientId: session.clientId,
        ip: session.user.ip,
        expiresAtMs: (claims.exp as number) * 1000,
      }),
    );
  } finally {
    await session.request.dispose();
    await context.close();
  }
});
