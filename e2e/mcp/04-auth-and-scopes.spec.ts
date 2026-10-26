import { randomBytes } from 'node:crypto';
import { expect, test } from '../lib/worker-logs';
import { TOOL_SCOPES } from '../../src/lib/mcp/scopes';
import { MCP_URL } from '../lib/env';
import { McpSession, authorizeAgent, newAgent, revokeInUi, uuid } from '../lib/mcp-client';
import { accountSnapshot } from '../lib/mcp-db';
import { PRIMARY_CV } from '../lib/model-script';
import { sampleArgs } from '../lib/sample-args';
import type { TestUser } from '../lib/user';

/**
 * PLAN section 7 negatives that are about the token: a read token on every write and spend tool, exact scopes
 * with no hierarchy, a missing or forged token, and a revoked app (access token refused, refresh token dead).
 * The expired access token is in 99-expired-token.spec.ts, which has to wait for a real 10 minutes.
 */

test.describe.serial('scopes: a token can only do what its consent said', () => {
  let owner: McpSession;
  let user: TestUser;
  let readOnly: McpSession;
  let writeOnly: McpSession;
  let spendOnly: McpSession;
  let applicationId: string;
  let toolInputs: Record<string, unknown> = {};

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'scopes');
    owner = created.session;
    user = created.user;
    for (const [target, scopes] of [['read', ['read']], ['write', ['write']], ['spend', ['spend']]] as const) {
      const { session } = await authorizeAgent(browser, user, { scopes, name: `${target}-only agent`, context: created.context });
      if (target === 'read') readOnly = session;
      if (target === 'write') writeOnly = session;
      if (target === 'spend') spendOnly = session;
    }
    await owner.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    applicationId = (await owner.ok<{ applicationId: string }>('create_application', {
      jobDescription: 'Senior FP&A Analyst at Northwind Foods. You own the rolling forecast and month-end reporting. Required: Forecasting.',
      title: 'Senior FP&A Analyst',
      company: 'Northwind Foods',
    })).applicationId;
    const { tools } = await (await owner.connect()).listTools();
    toolInputs = Object.fromEntries(tools.map((tool) => [tool.name, tool.inputSchema]));
    await created.context.close();
  });

  test.afterAll(async () => {
    await Promise.all([owner, readOnly, writeOnly, spendOnly].map((session) => session?.close()));
  });

  test('the consent screen granted exactly the scopes asked for', async () => {
    expect(readOnly.tokens.scope.split(' ').filter((scope) => scope !== 'offline_access')).toEqual(['read']);
    expect(writeOnly.tokens.scope.split(' ').filter((scope) => scope !== 'offline_access')).toEqual(['write']);
    expect(spendOnly.tokens.scope.split(' ').filter((scope) => scope !== 'offline_access')).toEqual(['spend']);
  });

  test('a read-only token is refused on all 32 write and spend tools, with the scope to ask for, and changes nothing', async () => {
    const before = accountSnapshot(user.id);
    const refused: string[] = [];
    for (const [name, scope] of Object.entries(TOOL_SCOPES)) {
      if (scope === 'read') continue;
      const args = sampleArgs(toolInputs[name], { applicationId, revision: 0, idempotencyKey: uuid(), target: 'primary' });
      const response = await readOnly.raw({ method: 'tools/call', params: { name, arguments: args } });
      expect(response.status, `${name} with a read-only token`).toBe(403);
      const challenge = response.headers['www-authenticate'] ?? '';
      expect(challenge, name).toMatch(/insufficient_scope/);
      expect(challenge, `${name} names the scope it needs`).toContain(scope);
      refused.push(name);
    }
    expect(refused).toHaveLength(32);
    expect(accountSnapshot(user.id), 'no tool ran').toEqual(before);

    // The positive control: the same token reads.
    const account = await readOnly.ok<{ profile: { email: string } }>('get_account');
    expect(account.profile.email).toBe(user.email);
  });

  test('scopes are exact, with no hierarchy: write does not read, spend does not write, and neither spends nor reads', async () => {
    const before = accountSnapshot(user.id);
    const call = (session: McpSession, name: string, extra: Record<string, unknown> = {}) =>
      session.raw({ method: 'tools/call', params: { name, arguments: sampleArgs(toolInputs[name], { applicationId, revision: 0, idempotencyKey: uuid(), ...extra }) } });

    const writeReads = await call(writeOnly, 'get_account');
    expect(writeReads.status).toBe(403);
    expect(writeReads.headers['www-authenticate']).toContain('read');
    const writeSpends = await call(writeOnly, 'analyze_job_fit', { applicationId });
    expect(writeSpends.status).toBe(403);
    expect(writeSpends.headers['www-authenticate']).toContain('spend');
    const spendWrites = await call(spendOnly, 'update_notification_settings', { followUpDue: false });
    expect(spendWrites.status).toBe(403);
    expect(spendWrites.headers['www-authenticate']).toContain('write');
    const spendReads = await call(spendOnly, 'get_operation');
    expect(spendReads.status).toBe(403);
    expect(accountSnapshot(user.id)).toEqual(before);

    // Each token does work in its own lane.
    const notifications = await writeOnly.ok<{ followUpDue: boolean }>('update_notification_settings', { followUpDue: false });
    expect(notifications.followUpDue).toBe(false);
    const fit = await spendOnly.ok<{ creditsUsed: number; applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), applicationId });
    expect(fit).toMatchObject({ creditsUsed: 0.5, applicationId });
  });

  test('tools/list works with any scope, and the tools it lists are the same ones', async () => {
    const lists = await Promise.all([readOnly, writeOnly, spendOnly].map(async (session) => (await (await session.connect()).listTools()).tools.map((tool) => tool.name).sort()));
    expect(lists[0]).toEqual(lists[1]);
    expect(lists[1]).toEqual(lists[2]);
    expect(lists[0]).toEqual(Object.keys(TOOL_SCOPES).sort());
  });
});

test.describe.serial('tokens: missing, forged and revoked', () => {
  test('no token and a garbage token are 401 with the discovery challenge, not a tool error', async ({ request }) => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    const none = await request.post(MCP_URL, { headers, data: body });
    expect(none.status()).toBe(401);
    expect(none.headers()['www-authenticate']).toMatch(/resource_metadata=/);

    const garbage = await request.post(MCP_URL, { headers: { ...headers, authorization: 'Bearer not-a-token' }, data: body });
    expect(garbage.status()).toBe(401);
    expect(garbage.headers()['www-authenticate']).toMatch(/invalid_token/);

    // A well-formed JWT that nobody signed: alg none, valid-looking claims.
    const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const forged = `${b64({ alg: 'none', typ: 'at+jwt' })}.${b64({ sub: 'someone', azp: 'x', scope: 'read write spend', aud: MCP_URL, iss: 'x', iat: now, exp: now + 600, jti: 'forged' })}.`;
    const forgedResponse = await request.post(MCP_URL, { headers: { ...headers, authorization: `Bearer ${forged}` }, data: body });
    expect(forgedResponse.status()).toBe(401);
    expect(forgedResponse.headers()['www-authenticate']).toMatch(/invalid_token/);
  });

  test('revoking the app in Connected apps kills the access token and the refresh token, and a new consent works again', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const name = `Revoke agent ${randomBytes(3).toString('hex')}`;
    const created = await newAgent(browser, request, 'revoke', { name });
    const session = created.session;
    try {
      await session.ok('get_account');
      const rotated = await session.refresh();
      expect(rotated.status, 'refresh works before the revoke').toBe(200);

      const page = await created.context.newPage();
      await revokeInUi(page, name);
      const revokedAt = Date.now();

      // The access token stops working within the verifier's cache window (70 s is the bound the OAuth lane asserts too).
      let status = 200;
      while (Date.now() - revokedAt < 75_000) {
        status = (await session.raw({ method: 'tools/list' })).status;
        if (status === 401) break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      expect(status, `refused within 75 s (took ${Date.now() - revokedAt} ms)`).toBe(401);

      // The refresh token is dead at once, with the standard error.
      const refresh = await session.refresh();
      expect(refresh.status).toBe(400);
      expect(refresh.body.error).toBe('invalid_grant');

      // Nothing about the revoke blocks the user from connecting the same app again.
      const again = await authorizeAgent(browser, created.user, { name });
      try {
        await again.session.ok('get_account');
      } finally {
        await again.session.close();
        await again.context.close();
      }
    } finally {
      await session.close();
      await created.context.close();
    }
  });
});
