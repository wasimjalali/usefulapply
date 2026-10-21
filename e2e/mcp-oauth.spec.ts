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
import { OAUTH_PORT } from './lib/env';
import { TOOL_SCOPES } from '../src/lib/mcp/scopes';

/**
 * MCP OAuth end to end, through a real MCP client (@modelcontextprotocol/client v2)
 * and a headless browser, against the built Worker on the local D1.
 *
 * Test credentials are generated here per run and never printed.
 */

const BASE = `http://localhost:${OAUTH_PORT}`;
// The flag-off and test-mode-guard previews sit at fixed offsets from the main one, so two copies of the suite can coexist.
const OFF_PORT = OAUTH_PORT + 1;
const GUARD_PORT = OAUTH_PORT + 5;
const OFF_BASE = `http://localhost:${OFF_PORT}`;
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
let readOnly: { clientId: string; accessToken: string } | null = null;
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
/** The auth route keys its limits on cf-connecting-ip, so each test can have its own bucket. */
const fakeIp = () => `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
/** Fixed addresses for the tests that need a bucket of their own; 203.0.113.0/24 is a range fakeIp never returns. */
const FLOOD_IP = '203.0.113.10';
const OTHER_IP = '203.0.113.11';

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

function sqlLocal(sql: string): Record<string, unknown>[] {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'usefulapply-db', '--local', '--json', '--command', sql], {
    stdio: 'pipe',
  }).toString();
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as { results?: Record<string, unknown>[] }[];
  return parsed[0]?.results ?? [];
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
  const url = new URL((await callback).url());
  // Let the (stubbed) callback page finish loading so the next navigation does not race it.
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
  return url;
}

/** Dynamic registration from a bucket of its own (a fresh fake client IP), unless one is given. */
async function register(request: APIRequestContext, body: Record<string, unknown>, ip = fakeIp()) {
  return request.post(`${API}/oauth2/register`, { data: body, headers: { 'cf-connecting-ip': ip } });
}

async function tokenRequest(request: APIRequestContext, form: Record<string, string>) {
  const res = await request.post(`${API}/oauth2/token`, { form, headers: { 'cf-connecting-ip': fakeIp() } });
  return { res, status: res.status(), body: (await res.json()) as Record<string, string> };
}

async function exchangeCode(
  request: APIRequestContext,
  p: { clientId: string; code: string; redirectUri: string; verifier: string },
) {
  return tokenRequest(request, {
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: p.verifier,
    resource: RESOURCE,
  });
}

function refreshRequest(request: APIRequestContext, clientId: string, refreshToken: string) {
  return tokenRequest(request, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    resource: RESOURCE,
  });
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

/** An authorization code for a client the user already approved: authorize goes straight back to the client. */
async function codeFor(
  context: BrowserContext,
  p: { clientId: string; redirectUri: string; scope: string; challenge: string },
): Promise<string> {
  const res = await context.request.get(authorizeUrl(p), { maxRedirects: 0 });
  const location = res.headers()['location'] ?? '';
  expect(location, 'authorize returns a code for an approved client').toContain(`${p.redirectUri}?code=`);
  return new URL(location).searchParams.get('code')!;
}

async function revokeInUi(page: Page, name: string) {
  // A navigation still settling from the callback page can interrupt the first goto; once more is enough.
  await page.goto('/dashboard?settings=apps').catch(() => page.goto('/dashboard?settings=apps'));
  await expect(page.getByRole('heading', { name: 'Connected apps' })).toBeVisible();
  const row = page.getByText(name, { exact: true }).locator('xpath=ancestor::div[contains(@class,"min-h-[52px]")]');
  await row.getByRole('button', { name: 'Revoke' }).click();
  await row.getByRole('button', { name: 'Confirm revoke' }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
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

async function mcpStatus(request: APIRequestContext, token: string) {
  const res = await request.post('/mcp', {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    },
    data: { jsonrpc: '2.0', id: 9, method: 'tools/list' },
  });
  return { status: res.status(), wwwAuthenticate: res.headers()['www-authenticate'] ?? '' };
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

    // The issuer has a path (/api/auth), so RFC 8414 puts the document at the path-inserted URL.
    // Clients that follow the MCP discovery order never ask for the bare root form, which stays a 404.
    const res = await request.get('/.well-known/oauth-authorization-server/api/auth');
    expect(res.status()).toBe(200);
    const as = await res.json();
    expect(as.issuer).toBe(API);
    expect(as.code_challenge_methods_supported).toEqual(['S256']);
    expect(as.registration_endpoint).toBe(`${API}/oauth2/register`);
    expect(as.authorization_endpoint).toBe(`${API}/oauth2/authorize`);
    expect(as.token_endpoint).toBe(`${API}/oauth2/token`);
    expect(as.jwks_uri).toBe(`${API}/jwks`);
    expect(as.client_id_metadata_document_supported).toBe(true);
    expect(as.scopes_supported).toEqual(expect.arrayContaining(['read', 'write', 'spend', 'offline_access']));
    expect(as.grant_types_supported).not.toContain('client_credentials');
    expect((await request.get('/.well-known/oauth-authorization-server')).status()).toBe(404);

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
    const hosted = [
      'https://claude.ai/api/mcp/auth_callback',
      'https://claude.com/api/mcp/auth_callback',
      'https://chatgpt.com/connector_platform_oauth_redirect',
      'https://platform.openai.com/apps-manage/oauth',
      'https://www.cursor.com/agents/mcp/oauth/callback',
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
      'https://www.cursor.com/agents/mcp/oauth/callback/extra',
      'https://evil.example/callback',
      'http://localhost.evil.example:3000/callback',
      'http://localhost@evil.example/callback',
      'http://169.254.169.254/callback',
      'cursor://anysphere.cursor-retrieval/oauth/callback',
      'javascript:alert(1)',
    ]) {
      const res = await register(request, { ...base, redirect_uris: [uri] });
      expect(res.status(), `register ${uri}`).toBe(400);
    }
  });

  test('registration: oversize bodies and forbidden fields are rejected', async ({ request }) => {
    const redirect_uris = [`http://localhost:${randomPort()}/callback`];
    const ok = { client_name: 'x'.repeat(80), redirect_uris, token_endpoint_auth_method: 'none' };
    expect((await register(request, ok)).status(), 'a name of exactly 80 characters is fine').toBe(201);

    // Body size: over 8 KB is refused before it is parsed (once as a JSON body, once as raw bytes).
    const big = await register(request, { ...ok, client_name: 'big', padding: 'p'.repeat(9 * 1024) });
    expect(big.status()).toBe(413);
    const chunked = await request.post(`${API}/oauth2/register`, {
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': fakeIp() },
      data: Buffer.from(JSON.stringify({ ...ok, client_name: 'big', padding: 'p'.repeat(9 * 1024) })),
    });
    expect(chunked.status()).toBe(413);

    const tooLong = {
      'client_name over 80': { ...ok, client_name: 'n'.repeat(81) },
      'logo_uri over 512': { ...ok, logo_uri: `https://example.com/${'l'.repeat(520)}` },
      'client_uri over 512': { ...ok, client_uri: `https://example.com/${'c'.repeat(520)}` },
      'contacts over 3': { ...ok, contacts: ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'] },
      'software_statement': { ...ok, software_statement: 'eyJhbGciOiJub25lIn0.e30.' },
      'jwks': { ...ok, jwks: { keys: [] } , token_endpoint_auth_method: 'private_key_jwt' },
      'jwks_uri': { ...ok, jwks_uri: 'https://example.com/jwks.json' },
      'backchannel_logout_uri': { ...ok, backchannel_logout_uri: 'https://example.com/logout' },
      'post_logout_redirect_uris': { ...ok, post_logout_redirect_uris: ['https://example.com/after'] },
    };
    for (const [name, body] of Object.entries(tooLong)) {
      const res = await register(request, body);
      expect(res.status(), name).toBe(400);
      expect((await res.json()).error, name).toMatch(/invalid_client_metadata|invalid_redirect_uri/);
    }
    // Three contacts are fine.
    const three = await register(request, { ...ok, contacts: ['a@example.com', 'b@example.com', 'c@example.com'] });
    expect(three.status()).toBe(201);
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
    expect(names, 'tools/list is the whole catalog: every name in TOOL_SCOPES and nothing else').toEqual(Object.keys(TOOL_SCOPES).sort());
    for (const tool of tools.tools) {
      // Every annotation is an explicit boolean, as the directories require.
      expect(typeof tool.annotations?.title, tool.name).toBe('string');
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        expect(typeof tool.annotations?.[hint], `${tool.name} ${hint}`).toBe('boolean');
      }
    }
    const getAccount = tools.tools.find((t) => t.name === 'get_account');
    expect(getAccount?.annotations).toMatchObject({
      title: 'Get account',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
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
      dailyAgentCreditLimit: number;
    };
    expect(account.profile.email).toBe(USER.email);
    expect(account.plan).toBe('free');
    expect(account.credits.total).toBe(account.credits.monthly + account.credits.rollover + account.credits.addon);
    expect(account.cvOnFile).toEqual({ primary: false, master: false });
    expect(account.dailyAgentCreditLimit, 'default daily agent credit limit').toBe(10);

    const claims = jwtClaims(provider.tokens()!.access_token);
    expect(claims.aud).toBe(RESOURCE);
    expect(claims.scope).toEqual(expect.stringContaining('read'));
    expect((claims.exp as number) - (claims.iat as number)).toBe(600);
    const header = JSON.parse(Buffer.from(provider.tokens()!.access_token.split('.')[0], 'base64url').toString('utf8'));
    expect(header.typ).toBe('at+jwt');
    expect(header.alg).toBe('EdDSA');

    fullFlow = { provider, callbackPort };
    await client.close();
  });

  test('the consent screen names the destination and says the name is the app\'s own', async ({ browser, request }) => {
    const port = randomPort();
    const redirectUri = `https://www.cursor.com/agents/mcp/oauth/callback`;
    const reg = await register(request, {
      client_name: 'Totally Anthropic',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
    });
    expect(reg.status()).toBe(201);
    const clientId = (await reg.json()).client_id as string;
    const context = await browser.newContext(withSession());
    const page = await context.newPage();
    await page.goto(authorizeUrl({ clientId, redirectUri, scope: 'read', challenge: pkcePair().challenge }));
    await page.waitForURL((u) => u.pathname.startsWith('/oauth/consent'));
    await expect(page.getByRole('heading', { name: /Totally Anthropic/ })).toBeVisible();
    await expect(page.getByText('The app chose its own name. Approving sends you to www.cursor.com.')).toBeVisible();
    await page.screenshot({ path: 'test-results/consent-destination.png' });
    await context.close();

    // A loopback client gets the plain phrase instead of a host.
    const loop = await register(request, {
      client_name: 'Local tool',
      redirect_uris: [`http://localhost:${port}/callback`],
      token_endpoint_auth_method: 'none',
    });
    const loopId = (await loop.json()).client_id as string;
    const context2 = await browser.newContext(withSession());
    const page2 = await context2.newPage();
    await page2.goto(authorizeUrl({ clientId: loopId, redirectUri: `http://localhost:${port}/callback`, scope: 'read', challenge: pkcePair().challenge }));
    await expect(page2.getByText('Approving sends you to a desktop app on this computer.')).toBeVisible();
    await context2.close();
  });

  test('login, consent and authorize cannot be framed; other pages can', async ({ browser }) => {
    const context = await browser.newContext(withSession());
    const { challenge } = pkcePair();
    const cid = fullFlow!.provider.clientInformation()!.client_id;
    const targets = [
      '/auth/login',
      '/oauth/consent',
      '/oauth/resume',
      authorizeUrl({ clientId: cid, redirectUri: fullFlow!.provider.redirectUrl as string, scope: 'read', challenge }),
    ];
    for (const target of targets) {
      const res = await context.request.get(target, { maxRedirects: 0 });
      const headers = res.headers();
      expect(headers['content-security-policy'], target).toContain("frame-ancestors 'none'");
      expect(headers['x-frame-options'], target).toBe('DENY');
    }
    const other = await context.request.get('/pricing', { maxRedirects: 0 });
    expect(other.headers()['x-frame-options'], 'scoped to the sign-in surfaces').toBeUndefined();
    await context.close();
  });

  test('sessions do not sign a JWT; the unused provider and jwt endpoints are closed', async ({ browser }) => {
    const context = await browser.newContext(withSession());
    const session = await context.request.get('/api/auth/get-session');
    expect(session.status()).toBe(200);
    expect((await session.json()).user.email).toBe(USER.email);
    // jwt() would put a signed session JWT here on every get-session (and read the jwks table to do it).
    expect(session.headers()['set-auth-jwt']).toBeUndefined();
    expect(session.headers()['access-control-expose-headers'] ?? '').not.toContain('set-auth-jwt');

    for (const path of ['/api/auth/token']) {
      expect((await context.request.get(path)).status(), path).toBe(404);
    }
    // Client administration and consent endpoints are not served, with a session or without one.
    for (const path of ['create-client', 'update-client', 'delete-client', 'delete-consent', 'update-consent', 'get-clients', 'end-session']) {
      const res = await context.request.post(`/api/auth/oauth2/${path}`, {
        data: {},
        headers: { origin: BASE },
      });
      expect(res.status(), path).toBe(404);
    }
    // The JWKS stays public.
    expect((await context.request.get('/api/auth/jwks')).status()).toBe(200);
    await context.close();
  });

  test('refresh rotates the refresh token; a write-scoped token can call a write tool', async ({ request }) => {
    const { provider } = fullFlow!;
    const tokens = provider.tokens()!;
    const clientId = provider.clientInformation()!.client_id;

    const next = await refreshRequest(request, clientId, tokens.refresh_token!);
    expect(next.status).toBe(200);
    expect(next.body.access_token).toBeTruthy();
    expect(next.body.refresh_token).toBeTruthy();
    expect(next.body.refresh_token).not.toBe(tokens.refresh_token);

    // The refresh token that was rotated out keeps its binding only for the replay window; the new one for 30 days.
    const sha = (t: string) => createHash('sha256').update(t).digest('base64url');
    const expiry = (t: string) => Number(sqlLocal(`SELECT expires_at AS e FROM mcp_token_generation WHERE token_key = 'rt:${sha(t)}'`)[0]?.e);
    const oldExpiry = expiry(tokens.refresh_token!);
    expect(oldExpiry, 'rotated-out binding is kept for about a minute').toBeLessThanOrEqual(Date.now() + 75_000);
    expect(oldExpiry).toBeGreaterThan(Date.now() - 5_000);
    expect(expiry(next.body.refresh_token), 'the live refresh token keeps its 30-day binding').toBeGreaterThan(Date.now() + 25 * 24 * 3600_000);

    const { client, transport } = staticClient(next.body.access_token);
    await client.connect(transport);
    const result = await client.callTool({ name: 'get_account', arguments: {} });
    expect(result.isError).toBeFalsy();
    // Positive control for the read-only test below: with the write scope a real, harmless write tool is callable.
    const write = await client.callTool({ name: 'update_notification_settings', arguments: { marketing: false } });
    expect(write.isError).toBeFalsy();
    expect(write.structuredContent).toMatchObject({ marketing: false });
    await client.close();

    // Keep the rotated pair for the revocation test.
    provider.saveTokens({ ...tokens, access_token: next.body.access_token, refresh_token: next.body.refresh_token });
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
    const { status, body } = await exchangeCode(request, {
      clientId,
      code: callback.searchParams.get('code')!,
      redirectUri,
      verifier,
    });
    expect(status).toBe(200);
    expect(String(body.scope).split(' ')).not.toContain('write');
    const token = body.access_token as string;
    readOnly = { clientId, accessToken: token };

    const { client, transport } = staticClient(token);
    await client.connect(transport);
    const read = await client.callTool({ name: 'get_account', arguments: {} });
    expect(read.isError).toBeFalsy();
    await expect(client.callTool({ name: 'update_notification_settings', arguments: { marketing: false } })).rejects.toThrow(/403|insufficient/i);
    await client.close();

    // The raw wire shape: 403 with an insufficient_scope challenge naming the scope.
    const raw = await request.post('/mcp', {
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      data: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'update_notification_settings', arguments: { marketing: false } } },
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
    const { status, body } = await exchangeCode(request, {
      clientId: CIMD_CLIENT_ID,
      code: callback.searchParams.get('code')!,
      redirectUri: CIMD_REDIRECT,
      verifier,
    });
    expect(status).toBe(200);
    expect(jwtClaims(body.access_token).azp).toBe(CIMD_CLIENT_ID);
    const { client, transport } = staticClient(body.access_token);
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
    for (const bad of [
      'http://localhost:1/other',
      `http://localhost:${port}/evil-path`,
      'https://evil.example/cb',
      'http://localhost@evil.example/cb',
      'http://localhost.evil.example/cb',
      'cursor://anysphere.cursor-retrieval/oauth/callback',
    ]) {
      const res = await authorize(authorizeUrl({ clientId, redirectUri: bad, scope: 'read', challenge }));
      expect(res.status, bad).toBe(302);
      expect(res.location, bad).toMatch(new RegExp(`^http://localhost:${OAUTH_PORT}/api/auth/error\\?error=invalid_(redirect|request)`));
    }

    // No PKCE, a challenge without a method, and the plain method: the error goes back to the client, with no code.
    const noPkce = await authorize(authorizeUrl({ clientId, redirectUri, scope: 'read' }));
    expect(noPkce.location).toContain(`${redirectUri}?error=invalid_request`);
    expect(noPkce.location).toMatch(/pkce\+is\+required/);
    expect(noPkce.location).not.toContain('code=');

    const noMethod = await authorize(authorizeUrl({ clientId, redirectUri, scope: 'read' }) + `&code_challenge=${challenge}`);
    expect(noMethod.location).toContain(`${redirectUri}?error=invalid_request`);
    expect(noMethod.location, 'a challenge without a method issues no code').not.toContain('code=');

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

  test('token endpoint: wrong verifier, redirect mismatch and replay fail; a revoked app\'s code and refresh token die', async ({ browser, request }) => {
    const port = randomPort();
    const redirectUri = `http://localhost:${port}/callback`;
    const clientId = (
      await (
        await register(request, {
          client_name: 'Token probe',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
        })
      ).json()
    ).client_id as string;
    const scope = 'read offline_access';
    const base = { clientId, redirectUri, scope };

    // One approval in the browser; every later authorize for this client returns a code directly.
    const first = pkcePair();
    const context = await browser.newContext({ ...withSession(), ...recordVideo('video-revoked-code') });
    const page = await context.newPage();
    const callback = await approveInBrowser(page, authorizeUrl({ ...base, challenge: first.challenge }), `http://localhost:${port}`);
    const initial = await exchangeCode(request, {
      clientId,
      code: callback.searchParams.get('code')!,
      redirectUri,
      verifier: first.verifier,
    });
    expect(initial.status).toBe(200);

    // Wrong code_verifier.
    const a = pkcePair();
    const wrongVerifier = await exchangeCode(request, {
      clientId,
      code: await codeFor(context, { ...base, challenge: a.challenge }),
      redirectUri,
      verifier: pkcePair().verifier,
    });
    expect(wrongVerifier.status).toBe(400);
    expect(wrongVerifier.body.error).toBe('invalid_grant');

    // redirect_uri that differs from the authorization request.
    const b = pkcePair();
    const mismatch = await exchangeCode(request, {
      clientId,
      code: await codeFor(context, { ...base, challenge: b.challenge }),
      redirectUri: `http://localhost:${port}/other`,
      verifier: b.verifier,
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toBe('invalid_grant');
    expect(mismatch.body.error_description).toBe('redirect_uri mismatch');

    // A code works once.
    const c = pkcePair();
    const codeC = await codeFor(context, { ...base, challenge: c.challenge });
    const good = await exchangeCode(request, { clientId, code: codeC, redirectUri, verifier: c.verifier });
    expect(good.status).toBe(200);
    const replay = await exchangeCode(request, { clientId, code: codeC, redirectUri, verifier: c.verifier });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('invalid_grant');

    // Positive refresh, then revoke the app with a code issued but not yet exchanged.
    const rotated = await refreshRequest(request, clientId, initial.body.refresh_token);
    expect(rotated.status, 'refresh works before the revoke').toBe(200);
    const d = pkcePair();
    const pendingCode = await codeFor(context, { ...base, challenge: d.challenge });

    await revokeInUi(page, 'Token probe');
    await context.close();

    const afterRevokeCode = await exchangeCode(request, { clientId, code: pendingCode, redirectUri, verifier: d.verifier });
    expect(afterRevokeCode.status, 'a code issued before the revoke is not redeemable').toBe(400);
    expect(afterRevokeCode.body.error).toBe('invalid_grant');
    // Revoke deleted the pending code outright, so the provider itself no longer knows it.
    expect(afterRevokeCode.body.error_description).toBe('invalid code');
    const afterRevokeRefresh = await refreshRequest(request, clientId, rotated.body.refresh_token);
    expect(afterRevokeRefresh.status).toBe(400);
    expect(afterRevokeRefresh.body.error).toBe('invalid_grant');
    expect(afterRevokeRefresh.body.error_description).toBe('session not found');
    const staleRefresh = await refreshRequest(request, clientId, good.body.refresh_token);
    expect(staleRefresh.status).toBe(400);
    expect(staleRefresh.body.error).toBe('invalid_grant');
  });

  test('reconnecting with less access does not revive an old code; a token broader than the consent is refused', async ({ browser, request }) => {
    const port = randomPort();
    const redirectUri = `http://localhost:${port}/callback`;
    const origin = `http://localhost:${port}`;
    const full = 'read write spend offline_access';
    const narrow = 'read offline_access';
    const clientId = (
      await (
        await register(request, {
          client_name: 'Revival probe',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
        })
      ).json()
    ).client_id as string;

    // 1. Approve everything, mint tokens, and leave one broad code unredeemed.
    const a = pkcePair();
    const context = await browser.newContext({ ...withSession(), ...recordVideo('video-revival') });
    const page = await context.newPage();
    const firstCb = await approveInBrowser(page, authorizeUrl({ clientId, redirectUri, scope: full, challenge: a.challenge }), origin);
    const broad = await exchangeCode(request, { clientId, code: firstCb.searchParams.get('code')!, redirectUri, verifier: a.verifier });
    expect(broad.status).toBe(200);
    expect(String(broad.body.scope).split(' ')).toContain('spend');
    const x = pkcePair();
    const oldCode = await codeFor(context, { clientId, redirectUri, scope: full, challenge: x.challenge });

    // 2. Revoke. The batch deletes the pending code and every token row for the pair, not just the consent.
    await revokeInUi(page, 'Revival probe');
    const count = (table: string, where: string) => sqlLocal(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0].n;
    expect(count('oauth_refresh_token', `client_id = '${clientId}'`), 'refresh tokens deleted').toBe(0);
    expect(count('oauth_access_token', `client_id = '${clientId}'`)).toBe(0);
    expect(
      count('verification', `json_valid(value) AND json_extract(value, '$.query.client_id') = '${clientId}'`),
      'the unredeemed code is deleted',
    ).toBe(0);

    // 3. Reconnect with read only. revoked_at is pushed an hour into the future first: a reconnect in the same
    //    second as the revoke (iat rounds down) used to be refused for good, and now nothing reads revoked_at.
    sqlLocal(`UPDATE mcp_grant_state SET revoked_at = ${Date.now() + 3_600_000} WHERE client_id = '${clientId}'`);
    const b = pkcePair();
    const narrowCb = await approveInBrowser(page, authorizeUrl({ clientId, redirectUri, scope: narrow, challenge: b.challenge }), origin);
    await context.close();
    const readTok = await exchangeCode(request, { clientId, code: narrowCb.searchParams.get('code')!, redirectUri, verifier: b.verifier });
    expect(readTok.status, 'the new, narrower connection works').toBe(200);
    expect(String(readTok.body.scope).split(' ')).not.toContain('write');
    expect((await mcpStatus(request, readTok.body.access_token)).status).toBe(200);

    // 4. The old broad code does not come back to life under the new consent, and the old access token stays dead.
    const revived = await exchangeCode(request, { clientId, code: oldCode, redirectUri, verifier: x.verifier });
    expect(revived.status).toBe(400);
    expect(revived.body.error).toBe('invalid_grant');
    expect((await mcpStatus(request, broad.body.access_token)).status, 'a token from before the revoke is refused').toBe(401);

    // 5. /mcp itself refuses a token whose scopes exceed the current consent, even one issued after the revoke
    //    (what a code that slipped through the revoke would have produced). Make one by widening the consent,
    //    minting, then narrowing the consent behind it.
    const c = pkcePair();
    const context2 = await browser.newContext(withSession());
    const page2 = await context2.newPage();
    const widenCb = await approveInBrowser(page2, authorizeUrl({ clientId, redirectUri, scope: full, challenge: c.challenge }), origin);
    await context2.close();
    const wide = await exchangeCode(request, { clientId, code: widenCb.searchParams.get('code')!, redirectUri, verifier: c.verifier });
    expect(wide.status).toBe(200);
    expect(String(wide.body.scope).split(' ')).toContain('write');
    expect((await mcpStatus(request, wide.body.access_token)).status, 'the wide token works while the consent covers it').toBe(200);
    sqlLocal(`UPDATE oauth_consent SET scopes = '["read","offline_access"]' WHERE client_id = '${clientId}'`);
    // The grant lookup is cached for up to 30 s, so the narrowing shows up within that window.
    let tooBroad = await mcpStatus(request, wide.body.access_token);
    for (let i = 0; tooBroad.status === 200 && i < 14; i++) {
      await new Promise((r) => setTimeout(r, 3_000));
      tooBroad = await mcpStatus(request, wide.body.access_token);
    }
    expect(tooBroad.status).toBe(401);
    expect(tooBroad.wwwAuthenticate).toContain('more access than this app was approved for');
  });

  test('an exchange paused inside the provider cannot revive a connection revoked and reconnected meanwhile', async ({ browser, request }) => {
    const port = randomPort();
    const redirectUri = `http://localhost:${port}/callback`;
    const origin = `http://localhost:${port}`;
    const full = 'read write spend offline_access';
    const clientId = (
      await (
        await register(request, {
          client_name: 'Paused probe',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
        })
      ).json()
    ).client_id as string;
    const count = (table: string, where: string) => sqlLocal(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0].n as number;

    // A broad code under the first connection.
    const a = pkcePair();
    const context = await browser.newContext({ ...withSession(), ...recordVideo('video-paused-exchange') });
    const page = await context.newPage();
    const firstCb = await approveInBrowser(page, authorizeUrl({ clientId, redirectUri, scope: full, challenge: a.challenge }), origin);
    const code = firstCb.searchParams.get('code')!;

    // Redeem it, but hold the exchange inside the provider (test mode only) after the code is consumed.
    const paused = request.post(`${API}/oauth2/token`, {
      form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: a.verifier, resource: RESOURCE },
      headers: { 'cf-connecting-ip': fakeIp(), 'x-test-issue-pause-ms': '12000' },
    });
    const codeRows = `json_valid(value) AND json_extract(value, '$.query.client_id') = '${clientId}'`;
    for (let i = 0; i < 40 && count('verification', codeRows) > 0; i++) await new Promise((r) => setTimeout(r, 250));
    expect(count('verification', codeRows), 'the code is consumed, so revoke cannot delete it').toBe(0);

    // While it is held: revoke, then reconnect with read only.
    await revokeInUi(page, 'Paused probe');
    const b = pkcePair();
    const narrowCb = await approveInBrowser(page, authorizeUrl({ clientId, redirectUri, scope: 'read offline_access', challenge: b.challenge }), origin);
    await context.close();
    const narrow = await exchangeCode(request, { clientId, code: narrowCb.searchParams.get('code')!, redirectUri, verifier: b.verifier });
    expect(narrow.status, 'the new, narrower connection works').toBe(200);
    expect((await mcpStatus(request, narrow.body.access_token)).status).toBe(200);

    // Issuance resumes against the old connection: nothing is handed out, and the refresh token it made is gone.
    const finished = await paused;
    expect(finished.status()).toBe(400);
    const finishedBody = (await finished.json()) as Record<string, string>;
    expect(finishedBody.error).toBe('invalid_grant');
    expect(finishedBody.error_description).toBe('authorization was revoked');
    expect(count('oauth_refresh_token', `client_id = '${clientId}'`), 'only the new connection has a refresh token').toBe(1);
    const consentId = sqlLocal(`SELECT id FROM oauth_consent WHERE client_id = '${clientId}'`)[0].id as string;
    expect(count('mcp_token_generation', `client_id = '${clientId}' AND consent_id <> '${consentId}'`), 'what the paused exchange minted is bound to the old connection').toBeGreaterThan(0);
    expect(count('mcp_token_generation', `client_id = '${clientId}' AND consent_id = '${consentId}'`), 'the new connection\'s tokens are bound to it').toBe(2);
  });

  test('tokens are bound to a consent generation: a stale or missing binding is refused at /mcp and on refresh', async ({ browser, request }) => {
    const port = randomPort();
    const redirectUri = `http://localhost:${port}/callback`;
    const scope = 'read offline_access';
    const clientId = (
      await (
        await register(request, {
          client_name: 'Binding probe',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
        })
      ).json()
    ).client_id as string;
    // One approval in the browser; every later authorize for this client returns a code directly.
    const context = await browser.newContext(withSession());
    const first = pkcePair();
    const approval = await approveInBrowser(
      await context.newPage(),
      authorizeUrl({ clientId, redirectUri, scope, challenge: first.challenge }),
      `http://localhost:${port}`,
    );
    let firstCode: string | null = approval.searchParams.get('code');
    const mint = async () => {
      const pkce = first && firstCode ? first : pkcePair();
      const code = firstCode ?? (await codeFor(context, { clientId, redirectUri, scope, challenge: pkce.challenge }));
      firstCode = null;
      const res = await exchangeCode(request, { clientId, code, redirectUri, verifier: pkce.verifier });
      expect(res.status).toBe(200);
      return res.body;
    };

    // Bound to the current consent: works.
    const good = await mint();
    expect((await mcpStatus(request, good.access_token)).status).toBe(200);
    const bindings = sqlLocal(`SELECT token_key FROM mcp_token_generation WHERE client_id = '${clientId}'`).map((r) => String(r.token_key));
    expect(bindings.filter((k) => k.startsWith('at:'))).toHaveLength(1);
    expect(bindings.filter((k) => k.startsWith('rt:'))).toHaveLength(1);

    // A token bound to some other generation is refused (use a fresh token: the grant lookup caches verdicts).
    const stale = await mint();
    const staleJti = String(jwtClaims(stale.access_token).jti);
    sqlLocal(`UPDATE mcp_token_generation SET consent_id = 'an-older-consent' WHERE token_key = 'at:${staleJti}'`);
    const staleCheck = await mcpStatus(request, stale.access_token);
    expect(staleCheck.status).toBe(401);
    expect(staleCheck.wwwAuthenticate).toContain('disconnected');

    // A token that was never bound is refused.
    const unbound = await mint();
    sqlLocal(`DELETE FROM mcp_token_generation WHERE token_key = 'at:${String(jwtClaims(unbound.access_token).jti)}'`);
    expect((await mcpStatus(request, unbound.access_token)).status).toBe(401);

    // A refresh token bound to another generation gets a clean invalid_grant, not a loop of 401s.
    const refreshStale = await mint();
    sqlLocal(`UPDATE mcp_token_generation SET consent_id = 'an-older-consent' WHERE token_key LIKE 'rt:%' AND client_id = '${clientId}' AND consent_id <> 'an-older-consent'`);
    const refreshed = await refreshRequest(request, clientId, refreshStale.refresh_token);
    expect(refreshed.status).toBe(400);
    expect(refreshed.body.error).toBe('invalid_grant');
    expect(refreshed.body.error_description).toBe('authorization was revoked');

    // A refresh token whose scopes the current consent no longer covers: the same clean error.
    const narrowed = await mint();
    sqlLocal(`UPDATE oauth_consent SET scopes = '["offline_access"]' WHERE client_id = '${clientId}'`);
    const tooWide = await refreshRequest(request, clientId, narrowed.refresh_token);
    expect(tooWide.status).toBe(400);
    expect(tooWide.body.error).toBe('invalid_grant');
    await context.close();
  });

  test('a code or refresh token issued before the current consent is refused, and so is a token with no consent', async ({ browser, request }) => {
    const port = randomPort();
    const redirectUri = `http://localhost:${port}/callback`;
    const scope = 'read offline_access';
    const clientId = (
      await (
        await register(request, {
          client_name: 'Consent age probe',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
        })
      ).json()
    ).client_id as string;
    const a = pkcePair();
    const context = await browser.newContext(withSession());
    const page = await context.newPage();
    const cb = await approveInBrowser(page, authorizeUrl({ clientId, redirectUri, scope, challenge: a.challenge }), `http://localhost:${port}`);
    const minted = await exchangeCode(request, { clientId, code: cb.searchParams.get('code')!, redirectUri, verifier: a.verifier });
    expect(minted.status).toBe(200);
    const d = pkcePair();
    const code = await codeFor(context, { clientId, redirectUri, scope, challenge: d.challenge });
    await context.close();

    // The consent now reads as newer than both the code and the refresh token (what a revoke-then-reconnect looks like).
    sqlLocal(`UPDATE oauth_consent SET created_at = ${Date.now() + 60_000} WHERE client_id = '${clientId}'`);
    const oldCode = await exchangeCode(request, { clientId, code, redirectUri, verifier: d.verifier });
    expect(oldCode.status).toBe(400);
    expect(oldCode.body.error).toBe('invalid_grant');
    expect(oldCode.body.error_description).toBe('authorization was revoked');
    const oldRefresh = await refreshRequest(request, clientId, minted.body.refresh_token);
    expect(oldRefresh.status).toBe(400);
    expect(oldRefresh.body.error_description).toBe('authorization was revoked');

    // No consent row at all: /mcp refuses a token that was never checked before (so no cached verdict).
    sqlLocal(`DELETE FROM oauth_consent WHERE client_id = '${clientId}'`);
    const noConsent = await mcpStatus(request, minted.body.access_token);
    expect(noConsent.status).toBe(401);
    expect(noConsent.wwwAuthenticate).toContain('disconnected');
  });

  test('Connected apps lists the client; revoking kills the access token and the refresh token', async ({ browser, request }, testInfo) => {
    const { provider } = fullFlow!;
    const clientId = provider.clientInformation()!.client_id;

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

    // The token works before revoking, and so does a refresh (this one is what the revoke has to kill).
    const before = staticClient(provider.tokens()!.access_token);
    await before.client.connect(before.transport);
    const accountNow = await before.client.callTool({ name: 'get_account', arguments: {} });
    expect(accountNow.isError).toBeFalsy();
    expect((accountNow.structuredContent as { dailyAgentCreditLimit: number }).dailyAgentCreditLimit).toBe(7.5);
    await before.client.close();
    const positive = await refreshRequest(request, clientId, provider.tokens()!.refresh_token!);
    expect(positive.status, 'refresh works before the revoke').toBe(200);
    provider.saveTokens({ ...provider.tokens()!, access_token: positive.body.access_token, refresh_token: positive.body.refresh_token });
    const tokens = provider.tokens()!;

    await row.getByRole('button', { name: 'Revoke' }).click();
    await row.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect(page.getByText('E2E MCP Client', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Read-only agent', { exact: true })).toBeVisible();
    const revokedAt = Date.now();
    await context.close();

    // Access token: refused within 70 s (the verifier caches a revocation for at most 30 s).
    let status = 200;
    while (Date.now() - revokedAt < 70_000) {
      const res = await mcpStatus(request, tokens.access_token);
      status = res.status;
      if (status === 401) {
        expect(res.wwwAuthenticate).toMatch(/invalid_token/);
        break;
      }
      await new Promise((r) => setTimeout(r, 3_000));
    }
    const latency = Date.now() - revokedAt;
    testInfo.annotations.push({ type: 'revocation-latency-ms', description: String(latency) });
    expect(status, `access token refused within 70 s (took ${latency} ms)`).toBe(401);

    // Refresh token: dead immediately, with the standard error.
    const refresh = await refreshRequest(request, clientId, tokens.refresh_token!);
    expect(refresh.status).toBe(400);
    expect(refresh.body.error).toBe('invalid_grant');
  });

  test('the daily cleanup purges old clients nobody consented to, and only those', async ({ request }) => {
    const redirect_uris = [`http://localhost:${randomPort()}/callback`];
    const mk = async (name: string) =>
      (await (await register(request, { client_name: name, redirect_uris, token_endpoint_auth_method: 'none' })).json()).client_id as string;
    const oldUnconsented = await mk('Old unconsented');
    const newUnconsented = await mk('New unconsented');
    const oldConsented = readOnly!.clientId; // approved earlier in this run, still connected
    const twoDaysAgo = Date.now() - 48 * 3600_000;
    sqlLocal(`UPDATE oauth_client SET created_at = ${twoDaysAgo} WHERE client_id IN ('${oldUnconsented}', '${oldConsented}')`);

    // wrangler's --test-scheduled route runs the Worker's scheduled() for the daily cron.
    const run = await request.get('/cdn-cgi/handler/scheduled?cron=0+3+*+*+*', { timeout: 120_000 });
    expect(run.status(), 'scheduled handler ran').toBeLessThan(500);

    const left = sqlLocal(
      `SELECT client_id FROM oauth_client WHERE client_id IN ('${oldUnconsented}', '${newUnconsented}', '${oldConsented}')`,
    ).map((r) => r.client_id);
    expect(left).not.toContain(oldUnconsented);
    expect(left).toContain(newUnconsented);
    expect(left).toContain(oldConsented);
  });

  test('a password reset revokes every connected app', async ({ browser, request }) => {
    // A token minted for this test, so it does not depend on what earlier tests left connected.
    const port = randomPort();
    const redirectUri = `http://localhost:${port}/callback`;
    const clientId = (
      await (
        await register(request, {
          client_name: 'Reset probe',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
        })
      ).json()
    ).client_id as string;
    const { verifier, challenge } = pkcePair();
    const context = await browser.newContext(withSession());
    const page = await context.newPage();
    const callback = await approveInBrowser(
      page,
      authorizeUrl({ clientId, redirectUri, scope: 'read offline_access', challenge }),
      `http://localhost:${port}`,
    );
    await context.close();
    const minted = await exchangeCode(request, { clientId, code: callback.searchParams.get('code')!, redirectUri, verifier });
    expect(minted.status).toBe(200);
    expect((await mcpStatus(request, minted.body.access_token)).status, 'token works before the reset').toBe(200);
    expect(sqlLocal(`SELECT COUNT(*) AS n FROM oauth_consent WHERE user_id = (SELECT id FROM user WHERE email = '${USER.email}')`)[0].n).toBeGreaterThan(0);

    const ask = await request.post('/api/auth/request-password-reset', {
      data: { email: USER.email, redirectTo: `${BASE}/auth/reset-password` },
      headers: { 'cf-connecting-ip': fakeIp() },
    });
    expect(ask.status()).toBe(200);
    const rows = sqlLocal(`SELECT identifier FROM verification WHERE identifier LIKE 'reset-password:%' ORDER BY created_at DESC LIMIT 1`);
    const token = String(rows[0].identifier).slice('reset-password:'.length);
    const reset = await request.post('/api/auth/reset-password', { data: { newPassword: `New-${randomBytes(9).toString('base64url')}`, token } });
    expect(reset.status()).toBe(200);

    expect(sqlLocal(`SELECT COUNT(*) AS n FROM oauth_consent WHERE user_id = (SELECT id FROM user WHERE email = '${USER.email}')`)[0].n).toBe(0);
    expect(sqlLocal(`SELECT COUNT(*) AS n FROM oauth_refresh_token WHERE user_id = (SELECT id FROM user WHERE email = '${USER.email}')`)[0].n).toBe(0);
    const after = await mcpStatus(request, minted.body.access_token);
    expect(after.status, 'an access token issued before the reset is refused').toBe(401);
    const refreshed = await refreshRequest(request, clientId, minted.body.refresh_token);
    expect(refreshed.status).toBe(400);
    expect(refreshed.body.error).toBe('invalid_grant');
  });
});

test.describe('MCP rate limits', () => {
  test('dynamic client registration allows 10 a minute per IP, then 429 with Retry-After', async ({ request }) => {
    const ip = FLOOD_IP;
    const statuses: number[] = [];
    let retryAfter = '';
    for (let i = 0; i < 12; i++) {
      const res = await register(
        request,
        { client_name: 'Flood probe', redirect_uris: [`http://localhost:${randomPort()}/cb`], token_endpoint_auth_method: 'none' },
        ip,
      );
      statuses.push(res.status());
      if (res.status() === 429) retryAfter = res.headers()['retry-after'] ?? '';
    }
    expect(statuses.slice(0, 10), 'the first ten pass').toEqual(Array(10).fill(201));
    expect(statuses.slice(10), 'then it is limited').toEqual([429, 429]);
    expect(Number(retryAfter)).toBeGreaterThan(0);

    // Another client IP has its own bucket (and shows the limit is keyed on IP).
    const other = await register(
      request,
      { client_name: 'Other IP', redirect_uris: [`http://localhost:${randomPort()}/cb`], token_endpoint_auth_method: 'none' },
      OTHER_IP,
    );
    expect(other.status()).toBe(201);
  });
});

test.describe('Route rate limits', () => {
  test('sending verification mail is limited per IP', async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request.post('/api/auth/send-verification-email', {
        data: { email: `nobody-${i}@example.test`, callbackURL: `${BASE}/auth/callback` },
        headers: { 'cf-connecting-ip': '203.0.113.20' },
      });
      statuses.push(res.status());
    }
    // Better Auth's own rule for this endpoint (3 a minute per IP, now that it can see the IP) trips first;
    // the route bucket (the forgot-password limits, 5 a minute) is the backstop behind it.
    expect(statuses.slice(0, 3), 'the first three are not limited').not.toContain(429);
    expect(statuses.slice(3), 'then it is limited').toContain(429);
    const other = await request.post('/api/auth/send-verification-email', {
      data: { email: 'nobody-x@example.test', callbackURL: `${BASE}/auth/callback` },
      headers: { 'cf-connecting-ip': '203.0.113.21' },
    });
    expect(other.status()).not.toBe(429);
  });

  test('IPv6 clients are limited by their /64, not by the single address', async ({ request }) => {
    const prefix = `2001:db8:${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}`;
    const body = () => ({ client_name: 'v6 probe', redirect_uris: [`http://localhost:${randomPort()}/cb`], token_endpoint_auth_method: 'none' });
    for (let i = 0; i < 10; i++) {
      // Ten different addresses inside one /64, written in different ways.
      const ip = i % 2 === 0 ? `${prefix}::${i + 1}` : `${prefix}:0:${i}:${i}:${i + 1}`;
      expect((await register(request, body(), ip)).status(), ip).toBe(201);
    }
    const eleventh = await register(request, body(), `${prefix}:ffff:ffff:ffff:ffff`);
    expect(eleventh.status(), 'another address in the same /64 shares the bucket').toBe(429);
    const elsewhere = await register(request, body(), `2001:db8:${randomBytes(2).toString('hex')}:ffff::1`);
    expect(elsewhere.status(), 'a different /64 has its own bucket').toBe(201);
  });
});

test.describe('Test mode is never honoured off localhost', () => {
  let server: ChildProcess | null = null;
  const guardBase = `http://localhost:${GUARD_PORT}`;

  test.beforeAll(async () => {
    // Its own local D1, migrated like the main one, so the provider can read its tables.
    execFileSync(
      'npx',
      ['wrangler', 'd1', 'migrations', 'apply', 'usefulapply-db', '--local', '--persist-to', '.wrangler/e2e-test-mode-guard'],
      { stdio: 'pipe' },
    );
    // MCP_TEST_MODE is set, but the auth host (BETTER_AUTH_URL) is not localhost.
    server = spawn(
      'npx',
      [
        'opennextjs-cloudflare',
        'preview',
        '--',
        '--port',
        String(GUARD_PORT),
        '--local-upstream',
        `localhost:${GUARD_PORT}`,
        '--var',
        'MCP_ENABLED:true',
        '--var',
        'MCP_TEST_MODE:true',
        '--var',
        'MCP_CIMD_ENABLED:true',
        '--var',
        'BETTER_AUTH_URL:https://usefulapply.example',
        '--persist-to',
        '.wrangler/e2e-test-mode-guard',
      ],
      { stdio: 'ignore', detached: true },
    );
    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        const res = await fetch(`${guardBase}/auth/login`);
        if (res.status < 500) break;
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error('test-mode guard preview did not start');
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

  test('the CIMD fixture is not served, so test mode is off', async ({ request }) => {
    // On localhost (the main server) this client id resolves to the in-code fixture. Here it must go to the
    // network instead, where the host does not exist, so the client is rejected.
    const url = new URL(`${guardBase}/api/auth/oauth2/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', CIMD_CLIENT_ID);
    url.searchParams.set('redirect_uri', CIMD_REDIRECT);
    url.searchParams.set('scope', 'read');
    url.searchParams.set('state', 'guard');
    url.searchParams.set('code_challenge', pkcePair().challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Earlier runs leave their log lines in this server's local store, so count what each request adds.
    const warnings = async () => {
      const res = await request.post(`${guardBase}/cdn-cgi/local/explorer/api/local/observability/query`, {
        data: { sql: "SELECT COUNT(*) AS n FROM logs WHERE message LIKE '%MCP_TEST_MODE is set%'" },
      });
      const body = await res.json();
      return Number(body.result?.rows?.[0]?.[0] ?? NaN);
    };
    const before = await warnings();
    const res = await request.get(url.toString(), { maxRedirects: 0, headers: { 'cf-connecting-ip': fakeIp() } });
    const text = (res.headers()['location'] ?? '') + (await res.text());
    expect(text).toMatch(/invalid_client|Failed to fetch metadata/);
    expect(text).not.toContain('/auth/login');

    // And it said so, once: the first request logs the error, a second one does not repeat it.
    const afterFirst = await warnings();
    await request.get(url.toString(), { maxRedirects: 0, headers: { 'cf-connecting-ip': fakeIp() } });
    const afterSecond = await warnings();
    expect(afterFirst - before, 'logged on the first request').toBe(1);
    expect(afterSecond, 'not logged again').toBe(afterFirst);
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
        String(OFF_PORT),
        '--local-upstream',
        `localhost:${OFF_PORT}`,
        '--var',
        'MCP_ENABLED:false',
        '--var',
        `BETTER_AUTH_URL:http://localhost:${OFF_PORT}`,
        '--persist-to',
        '.wrangler/e2e-flag-off',
      ],
      { stdio: 'ignore', detached: true },
    );
    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        const res = await fetch(`${OFF_BASE}/auth/login`);
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

  test('with MCP_ENABLED false the MCP server, the authorization server and their pages are 404', async ({ request }) => {
    const json = { 'content-type': 'application/json', authorization: 'Bearer anything' };
    const cases: { method: 'GET' | 'POST'; path: string; data?: unknown }[] = [
      { method: 'GET', path: '/mcp' },
      { method: 'POST', path: '/mcp', data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } },
      { method: 'POST', path: '/api/auth/oauth2/register', data: { client_name: 'x', redirect_uris: ['http://localhost:1/cb'] } },
      { method: 'POST', path: '/api/auth/oauth2/token', data: {} },
      { method: 'GET', path: '/api/auth/oauth2/authorize?client_id=x' },
      { method: 'GET', path: '/api/auth/jwks' },
      { method: 'GET', path: '/.well-known/oauth-protected-resource' },
      { method: 'GET', path: '/.well-known/oauth-protected-resource/mcp' },
      { method: 'GET', path: '/.well-known/oauth-authorization-server' },
      { method: 'GET', path: '/.well-known/oauth-authorization-server/api/auth' },
      { method: 'GET', path: '/.well-known/openid-configuration' },
      { method: 'GET', path: '/oauth/consent' },
      { method: 'GET', path: '/oauth/resume' },
    ];
    for (const c of cases) {
      const res = await request.fetch(`${OFF_BASE}${c.path}`, { method: c.method, headers: json, data: c.data });
      expect(res.status(), `${c.method} ${c.path}`).toBe(404);
    }
    // Everything else keeps working: sign-in page and session checks (no jwks involved).
    expect((await request.get(`${OFF_BASE}/auth/login`)).status()).toBe(200);
    expect((await request.get(`${OFF_BASE}/api/auth/get-session`)).status()).toBe(200);
  });
});
