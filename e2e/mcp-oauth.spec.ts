import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
} from '@modelcontextprotocol/client';

/**
 * MCP OAuth end to end, through a real MCP client (@modelcontextprotocol/client v2)
 * and a headless browser, against the built Worker on the local D1.
 *
 * Test credentials are generated here per run and never printed.
 */

const BASE = 'http://localhost:8791';
const OFF_BASE = 'http://localhost:8792';
const MCP_URL = `${BASE}/mcp`;
const API = `${BASE}/api/auth`;
const RESOURCE = MCP_URL;
const CIMD_CLIENT_ID = 'https://cimd-fixture.example.com/client.json';
const CIMD_REDIRECT = 'http://localhost:8799/callback';

const runId = randomBytes(4).toString('hex');
const USER = {
  email: `mcp-e2e-${runId}@example.test`,
  password: `Pw-${randomBytes(12).toString('base64url')}`,
  name: 'MCP E2E',
};

// State shared by the serial tests below.
let fullFlow: { provider: MemoryProvider; callbackPort: number } | null = null;
// Signed-in browser state from the first login, reused so the sign-in rate limit is not what the tests exercise.
let signedIn: Awaited<ReturnType<BrowserContext['storageState']>> | null = null;
const withSession = () => ({ storageState: signedIn ?? undefined });

/** Extra contexts record video like the default one does. PW_VIDEO=off skips it when Playwright's ffmpeg is not installed. */
const recordVideo = (dir: string) => (process.env.PW_VIDEO === 'off' ? {} : { recordVideo: { dir: `test-results/${dir}` } });

const b64url = (buf: Buffer) => buf.toString('base64url');
const pkcePair = () => {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
};
const randomPort = () => 20_000 + Math.floor(Math.random() * 30_000);

class MemoryProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;
  private info: StoredOAuthClientInformation | undefined;
  private saved: StoredOAuthTokens | undefined;
  private verifier = '';

  constructor(private readonly redirect: string, private readonly scope?: string) {}

  get redirectUrl() {
    return this.redirect;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'E2E MCP Client',
      redirect_uris: [this.redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(this.scope ? { scope: this.scope } : {}),
    };
  }
  clientInformation() {
    return this.info;
  }
  saveClientInformation(info: StoredOAuthClientInformation) {
    this.info = info;
  }
  tokens() {
    return this.saved;
  }
  saveTokens(tokens: StoredOAuthTokens) {
    this.saved = tokens;
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(v: string) {
    this.verifier = v;
  }
  codeVerifier() {
    return this.verifier;
  }
}

function sqlLocal(sql: string) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'usefulapply-db', '--local', '--command', sql], {
    stdio: 'pipe',
  });
}

/**
 * Drive the browser through an authorization request: log in if asked, approve
 * on the consent screen, and return the callback URL the client was sent to.
 */
async function approveInBrowser(page: Page, authorizationUrl: string, callbackOrigin: string, shot?: string): Promise<URL> {
  await page.route(`${callbackOrigin}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' }),
  );
  const callback = page.waitForRequest((req) => req.url().startsWith(callbackOrigin), { timeout: 60_000 });
  await page.goto(authorizationUrl);

  await page.waitForURL((u) => /\/auth\/login|\/oauth\/consent/.test(u.pathname), { timeout: 30_000 });
  if (new URL(page.url()).pathname.startsWith('/auth/login')) {
    await page.locator('#email').fill(USER.email);
    await page.locator('#password').fill(USER.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/oauth/consent'), { timeout: 30_000 });
  }
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  if (shot) await page.screenshot({ path: `test-results/${shot}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Approve' }).click();
  return new URL((await callback).url());
}

/** Registration is limited to 10 per minute per IP; wait out a 429 instead of failing unrelated tests. */
async function register(request: APIRequestContext, body: Record<string, unknown>) {
  for (let attempt = 0; ; attempt++) {
    const res = await request.post(`${API}/oauth2/register`, { data: body });
    if (res.status() !== 429 || attempt >= 2) return res;
    await new Promise((r) => setTimeout(r, (Number(res.headers()['retry-after']) || 60) * 1_000 + 500));
  }
}

async function exchangeCode(
  request: APIRequestContext,
  p: { clientId: string; code: string; redirectUri: string; verifier: string },
) {
  const res = await request.post(`${API}/oauth2/token`, {
    form: {
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: p.clientId,
      code_verifier: p.verifier,
      resource: RESOURCE,
    },
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

function authorizeUrl(p: {
  clientId: string;
  redirectUri: string;
  scope: string;
  challenge?: string;
  state?: string;
}) {
  const url = new URL(`${API}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('scope', p.scope);
  url.searchParams.set('state', p.state ?? 'st-' + runId);
  url.searchParams.set('resource', RESOURCE);
  if (p.challenge) {
    url.searchParams.set('code_challenge', p.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

function staticClient(token: string) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    authProvider: { token: async () => token },
    onInsufficientScope: 'throw',
  });
  const client = new Client({ name: 'e2e-static', version: '1.0.0' });
  return { client, transport };
}

function jwtClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

test.describe.serial('MCP OAuth', () => {
  test.beforeAll(async ({ request }) => {
    const signup = await request.post('/api/auth/signup', {
      data: { email: USER.email, password: USER.password, fullName: USER.name },
    });
    // The confirmation email cannot be delivered locally; the user row exists either way.
    expect([200, 400]).toContain(signup.status());
    sqlLocal(`UPDATE user SET email_verified = 1 WHERE email = '${USER.email}'`);
  });

  test('discovery documents advertise the right shape', async ({ request }) => {
    const prm = await (await request.get('/.well-known/oauth-protected-resource/mcp')).json();
    expect(prm.resource).toBe(RESOURCE);
    expect(prm.authorization_servers).toEqual([API]);
    expect(prm.scopes_supported).toEqual(['read', 'write', 'spend']);

    for (const path of ['/.well-known/oauth-authorization-server/api/auth', '/.well-known/openid-configuration/api/auth']) {
      const res = await request.get(path);
      if (!res.ok()) continue; // openid-configuration is only served when openid is a scope
      const as = await res.json();
      expect(as.issuer).toBe(API);
      expect(as.code_challenge_methods_supported).toEqual(['S256']);
      expect(as.registration_endpoint).toBe(`${API}/oauth2/register`);
      expect(as.client_id_metadata_document_supported).toBe(true);
      expect(as.scopes_supported).toEqual(expect.arrayContaining(['read', 'write', 'spend', 'offline_access']));
      expect(as.grant_types_supported).not.toContain('client_credentials');
    }

    const unauth = await request.post('/mcp', {
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(unauth.status()).toBe(401);
    expect(unauth.headers()['www-authenticate']).toContain(
      `resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  test('registration: allowlisted redirects pass, others are rejected', async ({ request }) => {
    const base = { client_name: 'Allowlist probe', token_endpoint_auth_method: 'none' };

    // Hosted callbacks match exactly; loopback matches on any port, in all three spellings.
    // Two requests with several URIs each keep this under the registration rate limit.
    const hosted = [
      'https://claude.ai/api/mcp/auth_callback',
      'https://claude.com/api/mcp/auth_callback',
      'https://chatgpt.com/connector_platform_oauth_redirect',
      'https://platform.openai.com/apps-manage/oauth',
    ];
    const loopback = [
      `http://localhost:${randomPort()}/callback`,
      `http://127.0.0.1:${randomPort()}/callback`,
      `http://[::1]:${randomPort()}/callback`,
    ];
    for (const uris of [hosted, loopback]) {
      const res = await register(request, { ...base, redirect_uris: uris });
      expect(res.status(), `register ${uris.join(' ')}`).toBe(201);
      expect((await res.json()).redirect_uris).toEqual(uris);
    }

    for (const uri of [
      'https://claude.ai/api/mcp/auth_callback/extra',
      'https://claude.ai.evil.example/api/mcp/auth_callback',
      'https://evil.example/callback',
      'http://localhost.evil.example:3000/callback',
      'http://169.254.169.254/callback',
    ]) {
      const res = await register(request, { ...base, redirect_uris: [uri] });
      expect(res.status(), `register ${uri}`).toBe(400);
    }
  });

  test('full flow with the MCP client: login, consent, token, get_account', async ({ browser }) => {
    const callbackPort = randomPort();
    const provider = new MemoryProvider(`http://localhost:${callbackPort}/callback`);

    const first = new Client({ name: 'e2e-oauth', version: '1.0.0' });
    const firstTransport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
    await expect(first.connect(firstTransport)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(provider.authorizationUrl, 'client was sent to authorize').not.toBeNull();
    const authUrl = provider.authorizationUrl as URL;
    expect(authUrl.pathname).toBe('/api/auth/oauth2/authorize');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl.searchParams.get('resource')).toBe(RESOURCE);

    const context = await browser.newContext(recordVideo('video-full-flow'));
    const page = await context.newPage();
    const callback = await approveInBrowser(page, authUrl.toString(), `http://localhost:${callbackPort}`, 'consent-screen');
    expect(callback.searchParams.get('code')).toBeTruthy();
    signedIn = await context.storageState();
    await context.close();

    await firstTransport.finishAuth(callback.searchParams);
    expect(provider.tokens()?.access_token).toBeTruthy();
    expect(provider.tokens()?.refresh_token, 'offline_access gives a refresh token').toBeTruthy();

    const client = new Client({ name: 'e2e-oauth', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider }));

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(['get_account', 'test_write_stub']);
    const getAccount = tools.tools.find((t) => t.name === 'get_account');
    expect(getAccount?.annotations).toMatchObject({
      title: 'Get account',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });

    const result = await client.callTool({ name: 'get_account', arguments: {} });
    expect(result.isError).toBeFalsy();
    const account = result.structuredContent as {
      plan: string;
      credits: { monthly: number; rollover: number; addon: number; total: number };
      nextResetDate: string | null;
      cvOnFile: { primary: boolean; master: boolean };
      profile: { name: string | null; email: string };
    };
    expect(account.profile.email).toBe(USER.email);
    expect(account.plan).toBe('free');
    expect(account.credits.total).toBe(account.credits.monthly + account.credits.rollover + account.credits.addon);
    expect(account.cvOnFile).toEqual({ primary: false, master: false });

    const claims = jwtClaims(provider.tokens()!.access_token);
    expect(claims.aud).toBe(RESOURCE);
    expect(claims.scope).toEqual(expect.stringContaining('read'));
    expect((claims.exp as number) - (claims.iat as number)).toBe(600);

    fullFlow = { provider, callbackPort };
    await client.close();
  });

  test('refresh rotates the refresh token and the new access token works', async ({ request }) => {
    const { provider } = fullFlow!;
    const tokens = provider.tokens()!;
    const clientId = provider.clientInformation()!.client_id;

    const res = await request.post(`${API}/oauth2/token`, {
      form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: clientId, resource: RESOURCE },
    });
    expect(res.status()).toBe(200);
    const next = await res.json();
    expect(next.access_token).toBeTruthy();
    expect(next.refresh_token).toBeTruthy();
    expect(next.refresh_token).not.toBe(tokens.refresh_token);

    const { client, transport } = staticClient(next.access_token);
    await client.connect(transport);
    const result = await client.callTool({ name: 'get_account', arguments: {} });
    expect(result.isError).toBeFalsy();
    await client.close();

    // Keep the rotated pair for the revocation test.
    provider.saveTokens({ ...tokens, access_token: next.access_token, refresh_token: next.refresh_token });
  });

  test('a read-only token is refused on a write tool', async ({ browser, request }) => {
    const port = randomPort();
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const reg = await register(request, {
      client_name: 'Read-only agent',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      scope: 'read offline_access',
    });
    expect(reg.status()).toBe(201);
    const clientId = (await reg.json()).client_id as string;

    const { verifier, challenge } = pkcePair();
    const context = await browser.newContext(withSession());
    const page = await context.newPage();
    const callback = await approveInBrowser(
      page,
      authorizeUrl({ clientId, redirectUri, scope: 'read offline_access', challenge }),
      `http://127.0.0.1:${port}`,
    );
    await context.close();
    const { res, body } = await exchangeCode(request, {
      clientId,
      code: callback.searchParams.get('code')!,
      redirectUri,
      verifier,
    });
    expect(res.status()).toBe(200);
    expect(String(body.scope).split(' ')).not.toContain('write');
    const token = body.access_token as string;

    const { client, transport } = staticClient(token);
    await client.connect(transport);
    const read = await client.callTool({ name: 'get_account', arguments: {} });
    expect(read.isError).toBeFalsy();
    await expect(client.callTool({ name: 'test_write_stub', arguments: {} })).rejects.toThrow(/403|insufficient/i);
    await client.close();

    // The raw wire shape: 403 with an insufficient_scope challenge naming the scope.
    const raw = await request.post('/mcp', {
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      data: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'test_write_stub', arguments: {} } },
    });
    expect(raw.status()).toBe(403);
    expect(raw.headers()['www-authenticate']).toMatch(/insufficient_scope/);
    expect(raw.headers()['www-authenticate']).toMatch(/write/);
  });

  test('CIMD client: metadata document registration, consent and a token', async ({ browser, request }) => {
    const { verifier, challenge } = pkcePair();
    const context = await browser.newContext(withSession());
    const page = await context.newPage();
    const callback = await approveInBrowser(
      page,
      authorizeUrl({ clientId: CIMD_CLIENT_ID, redirectUri: CIMD_REDIRECT, scope: 'read offline_access', challenge }),
      'http://localhost:8799',
    );
    await context.close();
    const { res, body } = await exchangeCode(request, {
      clientId: CIMD_CLIENT_ID,
      code: callback.searchParams.get('code')!,
      redirectUri: CIMD_REDIRECT,
      verifier,
    });
    expect(res.status()).toBe(200);
    expect(jwtClaims(body.access_token as string).azp).toBe(CIMD_CLIENT_ID);
    const { client, transport } = staticClient(body.access_token as string);
    await client.connect(transport);
    expect((await client.callTool({ name: 'get_account', arguments: {} })).isError).toBeFalsy();
    await client.close();
  });

  test('wrong redirect_uri and missing PKCE are rejected', async ({ browser, request }) => {
    const port = randomPort();
    const redirectUri = `http://localhost:${port}/callback`;
    const clientId = (
      await (
        await register(request, {
          client_name: 'Negative probe',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
        })
      ).json()
    ).client_id as string;

    // Signed in, so authorize reaches its own validation instead of the login redirect.
    const context = await browser.newContext(withSession());

    const { challenge } = pkcePair();
    const authorize = async (url: string) => {
      const res = await context.request.get(url, { maxRedirects: 0 });
      return { status: res.status(), location: res.headers()['location'] ?? '' };
    };

    // A redirect_uri the client did not register: an error page on our own origin, never a redirect to that URI.
    for (const bad of ['http://localhost:1/other', `http://localhost:${port}/evil-path`, 'https://evil.example/cb']) {
      const res = await authorize(authorizeUrl({ clientId, redirectUri: bad, scope: 'read', challenge }));
      expect(res.status, bad).toBe(302);
      expect(res.location, bad).toMatch(/^http:\/\/localhost:8791\/api\/auth\/error\?error=invalid_redirect/);
    }

    // No PKCE, a challenge without a method, and the plain method: the error goes back to the client, with no code.
    const noPkce = await authorize(authorizeUrl({ clientId, redirectUri, scope: 'read' }));
    expect(noPkce.location).toContain(`${redirectUri}?error=invalid_request`);
    expect(noPkce.location).toMatch(/pkce\+is\+required/);
    expect(noPkce.location).not.toContain('code=');

    const noMethod = await authorize(authorizeUrl({ clientId, redirectUri, scope: 'read' }) + `&code_challenge=${challenge}`);
    expect(noMethod.location).toContain(`${redirectUri}?error=invalid_request`);

    const plain = await authorize(
      authorizeUrl({ clientId, redirectUri, scope: 'read' }) + `&code_challenge=${challenge}&code_challenge_method=plain`,
    );
    expect(plain.location).toContain(`${redirectUri}?error=invalid_request`);
    expect(plain.location).toMatch(/S256/);
    expect(plain.location).not.toContain('code=');

    // The control: S256 with the registered URI goes on to consent, and so does the same loopback URI on another port.
    const ok = await authorize(authorizeUrl({ clientId, redirectUri, scope: 'read', challenge }));
    expect(ok.location).toMatch(/^\/oauth\/consent\?/);
    const otherPort = await authorize(
      authorizeUrl({ clientId, redirectUri: `http://localhost:${randomPort()}/callback`, scope: 'read', challenge }),
    );
    expect(otherPort.location, 'loopback matches on any port').toMatch(/^\/oauth\/consent\?/);

    await context.close();
  });

  test('Connected apps lists the client; revoking kills the access token and the refresh token', async ({ browser, request }, testInfo) => {
    const { provider } = fullFlow!;
    const tokens = provider.tokens()!;

    const context = await browser.newContext({ ...withSession(), ...recordVideo('video-revoke') });
    const page = await context.newPage();
    await page.goto('/dashboard?settings=apps');

    await expect(page.getByRole('heading', { name: 'Connected apps' })).toBeVisible();
    // The other clients from the earlier tests are listed too; only the full-flow client is revoked.
    const row = page.getByText('E2E MCP Client', { exact: true }).locator('xpath=ancestor::div[contains(@class,"min-h-[52px]")]');
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Read, Edit, Spend credits/);
    await page.screenshot({ path: 'test-results/connected-apps.png' });
    await testInfo.attach('connected-apps', { path: 'test-results/connected-apps.png', contentType: 'image/png' });

    // Daily limit: default 10, editable.
    const limit = page.getByLabel('Daily agent credit limit');
    await expect(limit).toHaveValue('10');
    await limit.fill('7.5');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.reload();
    await page.goto('/dashboard?settings=apps');
    await expect(page.getByLabel('Daily agent credit limit')).toHaveValue('7.5');

    // The token works before revoking.
    const before = staticClient(tokens.access_token);
    await before.client.connect(before.transport);
    expect((await before.client.callTool({ name: 'get_account', arguments: {} })).isError).toBeFalsy();
    await before.client.close();

    await row.getByRole('button', { name: 'Revoke' }).click();
    await row.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect(page.getByText('E2E MCP Client', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Read-only agent', { exact: true })).toBeVisible();
    const revokedAt = Date.now();
    await context.close();

    // Access token: refused within 70 s (the verifier caches a revocation for at most 30 s).
    let status = 200;
    while (Date.now() - revokedAt < 70_000) {
      const res = await request.post('/mcp', {
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${tokens.access_token}`,
        },
        data: { jsonrpc: '2.0', id: 9, method: 'tools/list' },
      });
      status = res.status();
      if (status === 401) {
        expect(res.headers()['www-authenticate']).toMatch(/invalid_token/);
        break;
      }
      await new Promise((r) => setTimeout(r, 3_000));
    }
    const latency = Date.now() - revokedAt;
    testInfo.annotations.push({ type: 'revocation-latency-ms', description: String(latency) });
    expect(status, `access token refused within 70 s (took ${latency} ms)`).toBe(401);

    // Refresh token: dead immediately.
    const refresh = await request.post(`${API}/oauth2/token`, {
      form: {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token!,
        client_id: provider.clientInformation()!.client_id,
        resource: RESOURCE,
      },
    });
    expect(refresh.status()).toBeGreaterThanOrEqual(400);
    expect(await refresh.text()).toMatch(/invalid_grant|invalid/);
  });
});

test.describe('MCP rate limits', () => {
  test('dynamic client registration is limited per IP with a Retry-After', async ({ request }) => {
    const statuses: number[] = [];
    let retryAfter = '';
    for (let i = 0; i < 14; i++) {
      const res = await request.post(`${API}/oauth2/register`, {
        data: { client_name: 'Flood probe', redirect_uris: [`http://localhost:${randomPort()}/cb`], token_endpoint_auth_method: 'none' },
      });
      statuses.push(res.status());
      if (res.status() === 429) retryAfter = res.headers()['retry-after'] ?? '';
    }
    expect(statuses).toContain(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});

test.describe('MCP flag off', () => {
  let server: ChildProcess | null = null;

  test.beforeAll(async () => {
    server = spawn(
      'npx',
      [
        'opennextjs-cloudflare',
        'preview',
        '--',
        '--port',
        '8792',
        '--local-upstream',
        'localhost:8792',
        '--var',
        'MCP_ENABLED:false',
        '--var',
        'BETTER_AUTH_URL:http://localhost:8792',
        '--persist-to',
        '.wrangler/e2e-flag-off',
      ],
      { stdio: 'ignore', detached: true },
    );
    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        const res = await fetch(`${OFF_BASE}/.well-known/oauth-protected-resource/mcp`);
        if (res.status < 500) break;
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error('flag-off preview did not start');
      await new Promise((r) => setTimeout(r, 1_000));
    }
  });

  test.afterAll(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  });

  test('/mcp returns 404 when MCP_ENABLED is false', async ({ request }) => {
    for (const method of ['GET', 'POST'] as const) {
      const res = await request.fetch(`${OFF_BASE}/mcp`, {
        method,
        headers: { 'content-type': 'application/json', authorization: 'Bearer anything' },
        data: method === 'POST' ? { jsonrpc: '2.0', id: 1, method: 'tools/list' } : undefined,
      });
      expect(res.status(), `${method} /mcp`).toBe(404);
    }
  });
});
