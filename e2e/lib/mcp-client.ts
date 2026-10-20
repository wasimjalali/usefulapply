import { createHash, randomBytes } from 'node:crypto';
import { expect, request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { MCP_BASE_URL, MCP_URL } from './env';
import { createTestUser, signInContext, type TestUser, type TestUserOptions } from './user';

/**
 * Everything an MCP spec needs to act as an agent: a verified user, the OAuth dance with consent in a
 * browser for the scopes the test chooses, an MCP client holding the resulting token, and raw JSON-RPC
 * for the cases the client library does not model (a read-only token, an elicitation round, a forged
 * envelope). All of it talks to the MCP lane's preview (env.ts MCP_BASE_URL).
 */

export const API = `${MCP_BASE_URL}/api/auth`;
export const RESOURCE = MCP_URL;

const b64url = (buf: Buffer) => buf.toString('base64url');
export const pkcePair = () => {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
};
export const randomPort = () => 20_000 + Math.floor(Math.random() * 30_000);

export const ALL_SCOPES = ['read', 'write', 'spend'] as const;
export type Scope = (typeof ALL_SCOPES)[number];

export interface Tokens {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
}

export interface CallOutcome {
  isError: boolean;
  /** The first text block: the JSON of a result, or the message of a failure. */
  text: string;
  structured: Record<string, unknown> | undefined;
}

/** A tool result the way the specs read it. */
function outcomeOf(result: { isError?: boolean; content?: unknown; structuredContent?: unknown }): CallOutcome {
  const blocks = Array.isArray(result.content) ? (result.content as Array<{ type: string; text?: string }>) : [];
  return {
    isError: result.isError === true,
    text: blocks.find((block) => block.type === 'text')?.text ?? '',
    structured: result.structuredContent as Record<string, unknown> | undefined,
  };
}

/** The `_meta` envelope the 2026-07-28 wire carries on every request, so a server can see the client's capabilities. */
export function modernEnvelope(capabilities: Record<string, unknown>): Record<string, unknown> {
  return {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'e2e-modern', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': capabilities,
  };
}

export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  /** The JSON-RPC message, whether the server answered as JSON or as one server-sent event. */
  body: Record<string, unknown> | null;
}

/** One agent: a user, a token and a client. */
export class McpSession {
  client: Client | null = null;
  private tools: boolean = false;

  constructor(
    readonly request: APIRequestContext,
    readonly user: TestUser,
    readonly clientId: string,
    public tokens: Tokens,
    readonly redirectUri: string,
  ) {}

  get accessToken(): string {
    return this.tokens.accessToken;
  }

  /** The SDK client with this session's token. `listTools` runs once so the SDK validates every later structuredContent. */
  async connect(): Promise<Client> {
    if (this.client) return this.client;
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      authProvider: { token: async () => this.tokens.accessToken },
      onInsufficientScope: 'throw',
    });
    const client = new Client({ name: 'e2e-agent', version: '1.0.0' });
    await client.connect(transport);
    this.client = client;
    if (!this.tools) {
      await client.listTools();
      this.tools = true;
    }
    return client;
  }

  /** Call a tool. A refusal the tool reports (isError) comes back as an outcome; a transport error (403, 401) throws. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<CallOutcome> {
    const client = await this.connect();
    return outcomeOf(await client.callTool({ name, arguments: args }));
  }

  /** Call a tool that must succeed, and return its structured result. */
  async ok<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const outcome = await this.call(name, args);
    expect(outcome.isError, `${name} failed: ${outcome.text}`).toBe(false);
    expect(outcome.structured, `${name} returned structuredContent`).toBeTruthy();
    return outcome.structured as T;
  }

  /** Call a tool that must refuse, and return its message. */
  async fails(name: string, args: Record<string, unknown> = {}): Promise<string> {
    const outcome = await this.call(name, args);
    expect(outcome.isError, `${name} should have been refused, got ${outcome.text.slice(0, 300)}`).toBe(true);
    return outcome.text;
  }

  /** A raw JSON-RPC request with this session's token (or another, or none). */
  async raw(body: Record<string, unknown>, options: { token?: string | null; headers?: Record<string, string> } = {}): Promise<RawResponse> {
    const token = options.token === undefined ? this.tokens.accessToken : options.token;
    const response = await this.request.post(MCP_URL, {
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      data: { jsonrpc: '2.0', id: 1, ...body },
    });
    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      const data = text.startsWith('event:') || text.startsWith('data:')
        ? (text.split('\n').find((line) => line.startsWith('data:')) ?? '').slice(5).trim()
        : text;
      parsed = data ? (JSON.parse(data) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status(), headers: response.headers(), body: parsed };
  }

  /** A client on the 2026-07-28 wire that says it can show the user a form, and answers it as told. */
  async elicitingClient(answer: 'accept' | 'decline' | 'manual'): Promise<{ client: Client; asked: string[] }> {
    const asked: string[] = [];
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      authProvider: { token: async () => this.tokens.accessToken },
      onInsufficientScope: 'throw',
    });
    const client = new Client(
      { name: 'e2e-elicit', version: '1.0.0' },
      {
        capabilities: { elicitation: { form: {} } },
        versionNegotiation: { mode: { pin: '2026-07-28' } },
        inputRequired: { autoFulfill: answer !== 'manual' },
      },
    );
    client.setRequestHandler('elicitation/create', async (request) => {
      asked.push(String((request.params as { message?: string }).message ?? ''));
      return answer === 'accept' ? { action: 'accept', content: { confirm: true } } : { action: 'decline' };
    });
    await client.connect(transport);
    return { client, asked };
  }

  /** Rotate the tokens with the refresh token. Returns the raw token endpoint answer. */
  async refresh(): Promise<{ status: number; body: Record<string, string> }> {
    const result = await refreshRequest(this.request, this.clientId, this.tokens.refreshToken ?? '', this.user.ip);
    if (result.status === 200) {
      this.tokens = { accessToken: result.body.access_token, refreshToken: result.body.refresh_token ?? null, scope: String(result.body.scope ?? '') };
    }
    return result;
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = null;
    await this.request.dispose().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export async function tokenRequest(request: APIRequestContext, form: Record<string, string>, ip: string) {
  const res = await request.post(`${API}/oauth2/token`, { form, headers: { 'cf-connecting-ip': ip } });
  return { status: res.status(), body: (await res.json()) as Record<string, string> };
}

export function refreshRequest(request: APIRequestContext, clientId: string, refreshToken: string, ip: string) {
  return tokenRequest(
    request,
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, resource: RESOURCE },
    ip,
  );
}

/** Dynamic client registration for a loopback redirect, with the scopes the agent will ask for. */
async function registerClient(request: APIRequestContext, ip: string, name: string, redirectUri: string, scope: string): Promise<string> {
  const res = await request.post(`${API}/oauth2/register`, {
    data: {
      client_name: name,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      scope,
    },
    headers: { 'cf-connecting-ip': ip },
  });
  expect(res.status(), 'client registration').toBe(201);
  return (await res.json()).client_id as string;
}

/** Approve an authorization request on the consent screen, as the signed-in user in `context`. Returns the callback URL. */
async function approveConsent(page: Page, authorizationUrl: string, callbackOrigin: string): Promise<URL> {
  await page.route(`${callbackOrigin}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' }));
  const callback = page.waitForRequest((req) => req.url().startsWith(callbackOrigin), { timeout: 60_000 });
  await page.goto(authorizationUrl);
  await page.waitForURL((u) => u.pathname.startsWith('/oauth/consent'), { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  const url = new URL((await callback).url());
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
  return url;
}

export interface ConnectOptions {
  /** Scopes the agent asks for, and the user approves. Default: read, write and spend. */
  scopes?: readonly Scope[];
  /** The name shown in Connected apps. */
  name?: string;
  /** A browser context already signed in as the user (the sign-in route allows 5 a minute per address). Left open. */
  context?: BrowserContext;
}

/**
 * OAuth for an existing user: register an agent, approve it on the consent screen in a browser that is
 * signed in as that user, trade the code for tokens. Returns the session and the browser context that
 * approved it (still signed in, still open: close it when done, or use it to open the web app as the same user).
 */
export async function authorizeAgent(
  browser: Browser,
  user: TestUser,
  options: ConnectOptions = {},
): Promise<{ session: McpSession; context: BrowserContext }> {
  // The agent's own HTTP client has no cookies: Better Auth only enforces its Origin check on cookie-carrying requests,
  // and a real MCP client is never signed in to the web app.
  const request = await playwrightRequest.newContext();
  const scopes = options.scopes ?? ALL_SCOPES;
  const scope = [...scopes, 'offline_access'].join(' ');
  const port = randomPort();
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const clientId = await registerClient(request, user.ip, options.name ?? `E2E agent ${randomBytes(3).toString('hex')}`, redirectUri, scope);
  const { verifier, challenge } = pkcePair();

  let context = options.context;
  if (!context) {
    context = await browser.newContext({
      baseURL: MCP_BASE_URL,
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
    });
    const signIn = await playwrightRequest.newContext();
    await signInContext(context, signIn, user, MCP_BASE_URL);
    await signIn.dispose();
  }
  const page = await context.newPage();
  const authorize = new URL(`${API}/oauth2/authorize`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', scope);
  authorize.searchParams.set('state', `st-${randomBytes(4).toString('hex')}`);
  authorize.searchParams.set('resource', RESOURCE);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  const callback = await approveConsent(page, authorize.toString(), `http://127.0.0.1:${port}`);
  await page.close();
  const code = callback.searchParams.get('code');
  expect(code, 'the consent screen returned an authorization code').toBeTruthy();

  const exchanged = await tokenRequest(
    request,
    { grant_type: 'authorization_code', code: code as string, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: RESOURCE },
    user.ip,
  );
  expect(exchanged.status, `token exchange: ${JSON.stringify(exchanged.body)}`).toBe(200);
  const session = new McpSession(
    request,
    user,
    clientId,
    { accessToken: exchanged.body.access_token, refreshToken: exchanged.body.refresh_token ?? null, scope: String(exchanged.body.scope ?? '') },
    redirectUri,
  );
  return { session, context };
}

export interface AgentSetup extends TestUserOptions {
  scopes?: readonly Scope[];
  name?: string;
}

/** A new verified user (no CV unless asked) and an agent connected as them. The approving browser context stays open. */
export async function newAgent(
  browser: Browser,
  request: APIRequestContext,
  label: string,
  options: AgentSetup = {},
): Promise<{ session: McpSession; user: TestUser; context: BrowserContext }> {
  const user = await createTestUser(request, label, { baseUrl: MCP_BASE_URL, primaryCv: options.primaryCv ?? false });
  const { session, context } = await authorizeAgent(browser, user, options);
  return { session, user, context };
}

/** Revoke an app on the Connected apps screen of a context signed in as its user. */
export async function revokeInUi(page: Page, name: string): Promise<void> {
  await page.goto('/dashboard?settings=apps').catch(() => page.goto('/dashboard?settings=apps'));
  await expect(page.getByRole('heading', { name: 'Connected apps' })).toBeVisible();
  const row = page.getByText(name, { exact: true }).locator('xpath=ancestor::div[contains(@class,"min-h-[52px]")]');
  await row.getByRole('button', { name: 'Revoke' }).click();
  await row.getByRole('button', { name: 'Confirm revoke' }).click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
}

/** Set the daily agent credit limit the way the account owner does, on the Connected apps screen. */
export async function setDailyLimitInUi(page: Page, value: string): Promise<void> {
  await page.goto('/dashboard?settings=apps').catch(() => page.goto('/dashboard?settings=apps'));
  await expect(page.getByRole('heading', { name: 'Connected apps' })).toBeVisible();
  const limit = page.getByLabel('Daily agent credit limit');
  // The field shows the default until the saved value arrives, and the arrival overwrites what was typed: let it settle first.
  await expect(limit).toBeEnabled();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await limit.fill(value);
  await expect(limit).toHaveValue(value);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
}

export function jwtClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

export const uuid = () => crypto.randomUUID();
