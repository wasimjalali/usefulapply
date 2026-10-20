import { existsSync, readFileSync } from 'node:fs';
import { request as playwrightRequest } from '@playwright/test';
import { expect, test } from '../lib/worker-logs';
import { MCP_URL } from '../lib/env';
import { EXPIRING_TOKEN_FILE, type ExpiringToken } from '../lib/expiring-token';
import { refreshRequest } from '../lib/mcp-client';

/**
 * PLAN section 7: an expired token. The access token minted by 00-mint-expiring-token.spec.ts at the start of the
 * run is 10 minutes old by now (the suite runs for about that long; this spec waits out whatever is left).
 * E2E_MCP_SKIP_EXPIRY=1 skips it for a quick local loop; the default run and `npm run test:e2e` do not.
 */
test.skip(process.env.E2E_MCP_SKIP_EXPIRY === '1', 'E2E_MCP_SKIP_EXPIRY=1');

test('an expired access token is refused with a 401 the client can recover from, and the refresh token still works', async () => {
  test.setTimeout(15 * 60 * 1000);
  expect(existsSync(EXPIRING_TOKEN_FILE), 'run the whole mcp project: 00-mint-expiring-token.spec.ts writes the token').toBe(true);
  const minted = JSON.parse(readFileSync(EXPIRING_TOKEN_FILE, 'utf8')) as ExpiringToken;

  const api = await playwrightRequest.newContext();
  try {
    const call = (token: string, body: Record<string, unknown>) =>
      api.post(MCP_URL, {
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
        data: { jsonrpc: '2.0', id: 1, ...body },
      });

    // Until its time is up the token works.
    const waitMs = minted.expiresAtMs + 3_000 - Date.now();
    if (waitMs > 0) {
      const early = await call(minted.accessToken, { method: 'tools/list' });
      expect(early.status(), 'still valid before it expires').toBe(200);
      test.info().annotations.push({ type: 'waited-for-expiry-ms', description: String(waitMs) });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    // Then every call is a 401 with the discovery challenge and the reason, never a tool error.
    const list = await call(minted.accessToken, { method: 'tools/list' });
    expect(list.status()).toBe(401);
    expect(list.headers()['www-authenticate']).toMatch(/error="invalid_token"/);
    expect(list.headers()['www-authenticate']).toMatch(/expired/i);
    expect(list.headers()['www-authenticate']).toMatch(/resource_metadata=/);
    const write = await call(minted.accessToken, { method: 'tools/call', params: { name: 'update_notification_settings', arguments: { marketing: false } } });
    expect(write.status(), 'a write with an expired token does not run').toBe(401);

    // The way back: the refresh token (30 days) issues a new access token that works, and the old one stays dead.
    const refreshed = await refreshRequest(api, minted.clientId, minted.refreshToken ?? '', minted.ip);
    expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
    expect((await call(refreshed.body.access_token, { method: 'tools/list' })).status()).toBe(200);
    expect((await call(minted.accessToken, { method: 'tools/list' })).status()).toBe(401);
  } finally {
    await api.dispose();
  }
});
