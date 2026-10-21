# Spikes

Findings from the spikes in `PLAN.md` section 8. Each section is written by the worker that ran it.

## 0a Better Auth MCP

Run 2026-10-20 on branch `feature/mcp-oauth`. Verdict: **the Better Auth packages fit and PR 1 is built on them.** Two plan items change (CIMD ships off, `account.issuer` needs handling) and one decision is recorded (which MCP handler).

### Versions

| Package | Version | Notes |
|---|---|---|
| `better-auth` | 1.7.11 exact, no caret (was 1.7.0) | Forced by the next row. See "Better Auth 1.7.3 and `account.issuer`". |
| `@better-auth/mcp` | 1.7.11 | `peerDependencies: better-auth ^1.7.11`. Plugin `mcp()`, plus `requireMcpAuth` (not used, see below). |
| `@better-auth/oauth-provider` | 1.7.11 | `mcp()` is the OAuth provider; never add `oauthProvider()` beside it. |
| `@better-auth/cimd` | 1.7.11 | Built, tested, **off by default**. |
| `@modelcontextprotocol/server` | 2.3.1 | `createMcpHandler`, `McpServer`, `requireScopes`. |
| `@modelcontextprotocol/client` | 2.3.1 (dev) | E2E client: OAuth provider interface, Streamable HTTP transport. |
| `zod` | 4.6.7 | Tool schemas. |
| `@playwright/test` | 1.64.1 (dev) | E2E. |
| `agents` (Cloudflare) | not installed | Tried 0.28.1, dropped. See "MCP handler". |

`npm install` needs `--legacy-peer-deps` on this repo and did before this PR: `better-auth` has an optional peer on `better-sqlite3@^12` and the repo has 13. Nothing I changed; `npm ci` fails the same way on main.

### What works

- **D1 with `transaction: false`.** The OAuth tables (`jwks`, `oauth_client`, `oauth_resource`, `oauth_client_resource`, `oauth_refresh_token`, `oauth_access_token`, `oauth_consent`, `oauth_client_assertion`) are in migration `0009_oauth_provider.sql` and `src/db/schema.ts`. Field names come from `getAuthTables({ plugins })` in `better-auth/db`. Better Auth stores `string[]` and JSON fields as JSON text on SQLite, so they are `text` columns. Registration, authorize, consent, code exchange, refresh rotation and revocation all run on the local D1 in the E2E.
- **Routing under OpenNext.** The provider's discovery documents are served by the auth handler's request hook, which only sees `/api/auth/*`. Three optional catch-all Next routes under `src/app/.well-known/` (`oauth-protected-resource`, `oauth-authorization-server`, `openid-configuration`) hand the request to `auth.handler` unchanged. They answer at the root and with the path appended (`/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server/api/auth`). `/api/auth/oauth2/*` works through the existing `[...all]` route. **`src/worker.ts` is untouched.**
- **`/mcp` in a Next route handler**, stateless, behind `MCP_ENABLED`. Verified with the real v2 MCP client: OAuth discovery, dynamic registration, PKCE S256, consent in a browser, token, `tools/list`, `get_account`.
- **Per-call scope enforcement** uses the SDK's own `scopeChallenge: requireScopes(scope)` on each tool. A read-only token calling a write tool gets HTTP 403 with `WWW-Authenticate: Bearer error="insufficient_scope", scope="write", resource_metadata=...` before the tool runs. A second check inside each tool backs it up.
- **Access tokens** are JWTs, 600 s (`exp - iat` asserted), `aud` is the `/mcp` resource, `azp` is the client id, `sub` is the user id. Refresh tokens rotate on use.
- **Redirects.** `clientRegistrationDefaultApplicationType: "infer"` makes native clients (`http://localhost`, `127.0.0.1`, `[::1]`) register as native, and Better Auth's own matching lets a registered loopback URI use any port (asserted: a different random port reaches consent). On top of that, `validateRedirectUri` and a registration hook (`mcpRegistrationGuard`) restrict every client to the allowlist: the five hosted callbacks (Claude x2, ChatGPT x2, Cursor Agents) exact-match, loopback any port. A redirect URI that is not registered gets an error page on our own origin (`/api/auth/error?error=invalid_redirect`), never a redirect to it.
- **PKCE.** Missing PKCE, a challenge without a method and `plain` are all answered with `error=invalid_request` to the client's redirect URI and no code.

### Better Auth 1.7.3 and `account.issuer`

Better Auth 1.7.0 to 1.7.2 added a required `account.issuer` column and a unique index on `(issuer, account_id)`; our migration 0002 has both. 1.7.3 and later never write it, and on startup they fail every auth request with "Drizzle schema mismatch: Required columns Better Auth never writes: account.issuer". `@better-auth/mcp` needs 1.7.11, so the bump is unavoidable.

What I did: gave the Drizzle column a default (`$defaultFn(() => 'unset')`) so new rows satisfy the NOT NULL column, with no data migration. Existing rows keep their value, and nothing in the repo reads the column. Signup, email sign-in and the OAuth flow all run on it in the E2E. **Follow-up for the orchestrator:** once 1.7.11 is live, a small migration can drop the index and the column (`DROP INDEX account_issuer_accountId_uidx; ALTER TABLE account DROP COLUMN issuer;`, both supported by D1's SQLite). I did not do it in 0009 because it would break the old build between migration and deploy. This is the auth-sensitive part of PR 1 and belongs in the Opus review.

### MCP handler

Better Auth's current MCP example uses `createMcpHandler` from `@modelcontextprotocol/server` v2 directly, and the Cloudflare docs wrap the same function in `agents/mcp/server`. I tried `agents@0.28.1` first and dropped it: it adds route matching, CORS and host checks we do not need on a custom domain, and pulls a large dependency tree into the lockfile (about 10,000 lines of lockfile churn against about 350 without it). The SDK handler under OpenNext works as is: `handler.fetch(request, { authInfo })`, `legacy: "stateless"` (2025-era stateless clients keep working, which is decision 6 in the plan). The route adds an Origin allowlist with the SDK's `originValidationResponse`. The server function bundle (`.open-next/server-functions/default/handler.mjs`) grows from 15.1 MB on main (built 2026-10-13) to 18.0 MB, 4.5 MB gzipped. That is the OAuth provider, the MCP SDK, jose and zod; check the total against the Worker size limit before deploy.

### `requireMcpAuth`: not used, same building blocks

`requireMcpAuth` reads the signing keys with an HTTP fetch of `<issuer>/jwks`, which from inside the Worker is a request to our own hostname. In this spike the self-fetch worked in local workerd (HTTP 200), and Cloudflare's docs say that with `global_fetch_strictly_public` a same-zone request goes back through the edge and "may reach the same Worker again", so it would likely work in production at the cost of an extra invocation per cold isolate. I could not verify production, and a failure there reads as "invalid token" for every caller. `src/lib/mcp/auth.ts` therefore verifies the same JWT with Better Auth's own `verifyJwsAccessToken` and reads the keys in process through `auth.api.getJwks()`; challenges come from Better Auth's `createResourceServerChallenge`. It also adds the revocation check. Switching to `requireMcpAuth` is about ten lines if you prefer it. **This deviates from the brief.**

### Revocation

Better Auth cannot revoke a JWT access token (its docs say so), so every token is bound to a consent generation and `/mcp` checks the binding (see "Review round 3 changes"). Revoking a connected app runs one D1 batch that deletes the app's access and refresh tokens, its consent, the token bindings and any pending authorization codes, and writes `mcp_grant_state.revoked_at` (kept for the record, no longer read). `/mcp` keeps a per-isolate cache of the grant lookup of 30 s (the brief allows 60 s). Revoking also updates the cache entry in the isolate that handled it, so the E2E sees the access token refused 159 ms after the Revoke click; another isolate takes at most 30 s. The cache lives on `globalThis`: with a module-level `Map` the E2E measured 18 s, because the settings server action and the `/mcp` route are bundled separately and each got its own `Map`. The same cached read refuses tokens of a deleted account (`userMissing`), which covers "account deletion revokes everything" for tokens already issued (the OAuth rows themselves cascade on user delete).

### CIMD on Workers: shipped off

Better Auth requires a custom `fetchClientMetadataResource` to resolve the hostname once, reject every RFC 6890 address, connect to that approved address while keeping the TLS identity of the hostname, refuse redirects, and warns not to "DNS check then call `globalThis.fetch`". Their Node transport does it with `node:dns` and `node:https`. **A Worker cannot satisfy this at the application layer:** `fetch` resolves and connects internally, there is no way to pin an address, and the sockets API takes one hostname for both DNS and SNI.

The platform might cover it, but nothing documents that. Evidence from local workerd (the flag `global_fetch_strictly_public` is set in `wrangler.jsonc`, and Cloudflare's compatibility-flags page only describes same-zone routing, not private addresses):

| Probe | Result |
|---|---|
| `fetch('http://localtest.me:8791/')` (public DNS name for 127.0.0.1) | 200, reached loopback |
| `fetch('https://localtest.me/')` | "Network connection lost" (nothing listening on :443, so no evidence either way) |
| `fetch('http://169.254.169.254/...')` | "Network connection lost" (unroutable here, no evidence either way) |
| `fetch(url, { redirect: 'error' })` and `new Request(url, { redirect: 'error' })` | `TypeError`: Workers support only `follow` and `manual` |

The last row matters for code: Better Auth passes `redirect: "error"`, so the transport must not build a `Request` from its init. `src/lib/mcp/cimd-fetch.ts` reads the URL and method directly, uses `redirect: "manual"`, refuses 3xx, and caps time (4 s) and size (5 KB, Better Auth's own limit, enforced on top of ours).

Per the plan update, **CIMD is off unless `MCP_CIMD_ENABLED` is `"true"`, and dynamic client registration stays on.** The flag is not set in `wrangler.jsonc`, so production is off. The E2E turns it on with a fixture host (`https://cimd-fixture.example.com/client.json`, served from code only when `MCP_TEST_MODE` is on and the origin is localhost) so the plugin's discovery, registration and token path are tested; the network boundary is the part that is not. To turn it on in production someone has to establish the boundary: either Cloudflare confirming (in writing) that `fetch` refuses hostnames that resolve to private ranges at connect time, or moving the metadata fetch to a Node runtime that can pin.

### Smaller findings

- **Refresh tokens need `offline_access`.** The server issues one only when that scope is requested. It is in `scopes_supported` of the authorization server metadata (not in the resource metadata, by design), and in the 401 challenge's `scope`, so a client that follows either gets refresh tokens. Asserted: the SDK client received one.
- **Scopes.** `read`, `write`, `spend`, plus `offline_access`. `client_credentials` is removed from `grant_types_supported` (`grantTypes: ["authorization_code", "refresh_token"]`).
- **Sign-in continues the authorize request.** `oauthProviderClient()` on the auth client adds the signed query to sign-in and consent calls made from a page opened by `/oauth2/authorize`, and only then. Email sign-in needs nothing else. Google leaves the site, so the login page saves the signed query in `sessionStorage` and `/oauth/resume` replays it (not covered by the E2E; Google cannot run locally).
- **Rate limit buckets.** `mcp` is keyed on the token's user (Claude and ChatGPT call from shared egress IPs); `mcp-oauth` and `mcp-register` are keyed on IP. Registration 429s with `Retry-After` after 10 per minute (asserted).
- **Better Auth's own sign-in limiter** (3 per 10 s per path, in production mode) applies in preview too, so the E2E signs in once and reuses the session. See also the shared-bucket finding under "Review round 1 changes".
- **`wrangler dev` rewrites the `Origin` header** to the first custom-domain route (`http://usefulapply.com`) unless `--local-upstream localhost:<port>` is passed, which makes Better Auth return `INVALID_ORIGIN` on every browser POST in preview. The E2E passes the flag. Anyone running `npm run preview` for browser work on 8791 needs it too.
- **Local preview needs `http://localhost:8791` in `trustedOrigins`.** Added next to 8790.
- **Cursor** (cursor.com/docs/context/mcp, "Static redirect URL", checked 2026-10-20): the desktop app uses `http://localhost:8787/callback`, which the loopback rule covers. Web and Cursor Agents use `https://www.cursor.com/agents/mcp/oauth/callback`, which is on the exact-match allowlist (asserted, and a `/extra` suffix is rejected). Those docs do not mention a `cursor://` redirect, and a custom scheme is rejected (asserted).

### Review round 1 changes (PR 153)

- **Apply migration 0009 before deploying this code.** The OAuth endpoints, the consent flow and `/mcp` need its tables. With `jwt({ disableSettingJwtHeader: true })` the ordinary session path no longer touches the `jwks` table, so a deploy that lands before the migration does not break sign-in, but every MCP and OAuth request would fail until it is applied. Apply it, then deploy.
- **`jwt()` no longer signs a session JWT on every request.** By default its after-hook on `/get-session` reads the `jwks` table and signs a token for every `getSession` (so every authenticated route), and every session check would throw if `BETTER_AUTH_SECRET` rotated or the table was missing. `disableSettingJwtHeader: true` turns the hook off (checked in `node_modules/better-auth/dist/plugins/jwt/index.mjs`). The E2E asserts a signed-in `get-session` response has no `set-auth-jwt` header. The key pair is pinned to `EdDSA`, and `/mcp` accepts only `alg: EdDSA` and `typ: at+jwt`.
- **The authorization server is off with `MCP_ENABLED`.** `/api/auth/oauth2/*`, `/api/auth/jwks`, the `.well-known` routes and the `/oauth/*` pages return 404 while the flag is false (asserted on a second server, along with sign-in and `get-session` still working). With the flag on, only ten provider endpoints are served; client create, update and delete, consent admin and end-session are 404, as is the jwt plugin's `/token`.
- **Registration is bounded.** A body over 8 KB is refused before Better Auth parses it. Names over 80 characters, `logo_uri` and `client_uri` over 512, more than 3 contacts, and any `software_statement`, `jwks`, `jwks_uri`, `backchannel_logout_uri` or `post_logout_redirect_uris` are rejected. The daily cron (`dispatchScheduled`, `0 3 * * *`, no `worker.ts` change) deletes clients older than 24 h with no consent row (asserted through wrangler's `--test-scheduled`).
- **Revoke covers unredeemed codes and in-flight refreshes.** A before-hook on `/oauth2/token` refuses `authorization_code` and `refresh_token` grants when no consent row exists for the user and client. A refresh that passed the hook just before the revoke committed can still mint one more access token, which then dies on the revocation record.
- **Better Auth's rate limiter was shared across all callers.** Its log says "Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket": on Workers every caller landed in one bucket per path (the provider's built-ins are 5 registrations and 20 token requests a minute). Fixed with `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']`. The provider's own per-IP limits are switched off, because Claude and ChatGPT share egress IPs; our `mcp-oauth` and `mcp-register` buckets replace them. This also moves Better Auth's limits on the existing sign-in and sign-up routes from one global bucket to per IP, which is what they were meant to be.
- **Password reset** revokes every connected app (`onPasswordReset`; a failure is logged and the reset still completes).
- **Framing.** `frame-ancestors 'none'` and `X-Frame-Options: DENY` on `/auth/login`, `/oauth/consent`, `/oauth/resume` and `/api/auth/oauth2/authorize`, from `next.config.ts`.

### Review round 2 changes (PR 153)

- **A revoked code could revive after reconnecting.** Scenario: an unredeemed code for `read write spend offline_access`, a revoke, a reconnect with `read` only, then the old code is redeemed. The hook found the new consent and passed, and the broad token's `iat` was after `revoked_at`. Three layers now stop it:
  - Revoke deletes everything for the (user, client) pair in the same batch: access tokens, refresh tokens, the consent, and pending authorization codes. Codes live in the `verification` table as JSON (`identifier` is the hashed code, `value` holds `userId` and the original `query`), so they are deleted with `json_extract` on `$.userId` and `$.query.client_id`, inside a `CASE WHEN json_valid(value)` because other rows in that table are not JSON.
  - The `/oauth2/token` hook refuses a code or refresh token created before the current consent row (`createdAt`, one-second resolution on both sides, so strictly older).
  - `/mcp` checks, from a grant lookup cached for at most 30 s, that a consent row exists and that the token's scopes are a subset of the current consent's. A token refused from the cache is re-checked against the database once before it is rejected, so a reconnect is not blocked for 30 s by a cached "revoked".
  Asserted in the E2E: revoke, reconnect with `read`, exchange the old code (fails); an old access token (401); a token wider than the consent (401, "more access than this app was approved for"); a code and refresh token older than the consent (`invalid_grant`); a token with no consent row (401); a password reset leaves no consent or refresh rows.
- **Consent replaces its scopes.** Better Auth updates the existing consent row on a new approval and sets `scopes` to the latest request, keeping `createdAt`. Approving a narrower request therefore narrows the consent, and the `/mcp` subset rule then refuses the wider token still held by that client. That is intended.
- **`/send-verification-email`** has a route bucket (the forgot-password limits, its own counter per IP). Better Auth's built-in rule for that path (3 a minute per IP, which now works because it can see the IP) trips first, so the E2E asserts 3 pass and the 4th is refused. No new wrangler binding was needed.
- **IPv6** clients are keyed by their /64 in `getClientIP` (also `::ffff:a.b.c.d` as IPv4). Asserted: ten differently written addresses in one /64 use one bucket, an eleventh in the same /64 is refused, another /64 is not.
- **Password reset revocation failures** go to PostHog `captureException` as well as the log (no user data in the properties).
- **Do not set `prefix.refreshToken`, `formatRefreshToken` or `storeTokens`** on `mcp()`: the token hook looks tokens up by the provider's default stored form (SHA-256, base64url, no padding). There is a comment at the options.
- **Versions** of `@modelcontextprotocol/server`, `@modelcontextprotocol/client` and `@playwright/test` are now exact in `package.json`, like Better Auth.

### Review round 3 changes (PR 153)

- **The race.** An exchange that has already consumed its code (revoke cannot delete it) can be paused while the user revokes and reconnects; issuance then resumes and mints a new refresh token whose `createdAt` is newer than the new consent. Fixed by binding every token to a consent generation.
- **Generation = the consent row's id.** Revoke deletes the row and a reconnect creates a new id. Table `mcp_token_generation` (in migration 0009, which has not been applied remotely): `at:<jti>` for access tokens, `rt:<sha256 b64url>` for refresh tokens, with the consent id, user, client and expiry.
  - **`/oauth2/token` before-hook:** reads the current consent id and refuses the grant if there is no consent, the code or refresh token is older than the consent, the refresh token's binding is not that id, or its stored scopes exceed the consent's (a clean `invalid_grant`, not a loop of 401s). It hands the consent id to the after-hook.
  - **after-hook:** binds the access token (by its `jti`) and the refresh token to the consent id the exchange was authorised under, then re-reads the consent. If it changed, the refresh row is deleted and the response is `invalid_grant`, so the client never receives the tokens. A refresh inherits its parent's generation because the before-hook only passes when the parent's binding is the current consent id.
  - **`/mcp`:** the token's `jti` must be bound to the current consent id, with the existing cached grant lookup and a fresh re-read before refusing; the scope-subset rule stays. The `iat` against `revoked_at` rule is gone, which also fixes a reconnect in the same second as the revoke being refused for good (asserted by setting `revoked_at` an hour ahead and reconnecting).
- **Deviation from the brief, on purpose:** the generation is captured when the exchange starts, not recorded when the code is issued. Revoke deletes pending codes, and the hook refuses a code older than the consent, so a code that can still be redeemed can only belong to the current generation; the exchange that was already past that check is the one the binding catches. That avoids a table write at code creation (the provider has no hook there; it would mean parsing redirects in after-hooks of `/oauth2/authorize` and `/oauth2/consent`).
- **No custom access-token claim.** `customAccessTokenClaims` in 1.7.11 receives only the user, scopes, resources, `referenceId` and client metadata, with no request context and no client id, so it cannot carry a generation read at exchange start. Binding by `jti` in the table it is.
- **Test seam.** To hold an exchange inside the provider after the code is consumed, `customAccessTokenClaims` (which runs during issuance) awaits a pause set from an `x-test-issue-pause-ms` header, only when `isMcpTestMode()` (needs `MCP_TEST_MODE=true` and a localhost origin). Outside that it is a no-op.
- **Refusal cache.** A token refused at `/mcp` is remembered by `jti` for 5 s, so a revoked client replaying a still-signed token costs one set of reads per 5 s instead of several per request.
- **`revokeAllConnectedApps`** tries every client, collects the errors and throws an `AggregateError` at the end.
- **Cleanup.** The daily cron also deletes expired rows of `mcp_token_generation`.
- **Asserted in the E2E:** an exchange held inside the provider while the app is revoked and reconnected (the held exchange gets `invalid_grant`, only the new connection has a refresh token, what it minted is bound to the old consent); stale and missing bindings refused at `/mcp`; a stale-bound or over-scoped refresh token gets `invalid_grant`; the wide token works before the consent is narrowed and is refused after.
- **Rotated refresh bindings are short-lived.** When a refresh rotates, the old refresh token's binding now expires 60 s later (the provider's replay window is 30 s), so a steady connection no longer keeps a row per refresh for 30 days (about 4,300 a month). Asserted in the E2E.
- **Test mode guard.** `MCP_TEST_MODE=true` is honoured only when the auth host is localhost. On any other host `isMcpTestMode()` logs one error ("MCP_TEST_MODE is set but the auth host is not localhost: ignoring it") and stays off. The E2E starts a server with the flag set and `BETTER_AUTH_URL` on another host, checks the CIMD fixture is not served, and that the error was logged once. The issuance pause is kept per user id (the provider's claims callback gets the user, not the request), so two exchanges never share one.

## 0b Browser Run

**Run:** 2026-10-20, wrangler 4.123.0 with a remote `browser` binding (`wrangler dev`, compatibility date 2026-08-17), against the real Browser Run service on the Karko AI account. Chrome reports `HeadlessChrome/128`, PDFs come back as `Skia/PDF m128`. Spike code: `evals/ats-export/render-worker/` (the Worker) and `evals/ats-export/spike-render.ts`. The full renderer now lives in `src/lib/services/export/`.

**Verdict: it works, and it is faster and cheaper than the plan assumed.** `env.BROWSER.quickAction("pdf", { html, ... })` renders a server-built page to a tagged PDF with real text, embedded fonts and a Unicode map. No render token, no public print route.

### Exact request

```ts
await env.BROWSER.quickAction('pdf', {
  html,                                   // standalone page, everything inlined
  gotoOptions: { waitUntil: 'load', timeout: 20_000 },
  pdfOptions: {
    format: 'a4' | 'letter',              // repeats the @page size as a fallback
    preferCSSPageSize: true,              // @page owns size and margins
    printBackground: true,
    tagged: true,
    displayHeaderFooter: false,
    timeout: 30_000,
  },
});
```

The page carries `@page { size; margin }` (the single margin owner, the template root has no padding in print mode), self-hosted Arimo and Gelasio as base64 `@font-face`, the photo as a `data:` URI, and a CSP of `default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:` so a hostile string in a CV can never make the render fetch anything. `pdf-lib` then sets Title, Author, Subject, Producer, Creator and `/Lang`, and `DisplayDocTitle`.

### What came back (Premium ATS, German ATS with photo, both cover letters, 42 CV renders per format in the eval)

| Check | Result |
|---|---|
| Tagged PDF (`pdfinfo`) | yes, before and after the `pdf-lib` rewrite (the structure tree survives) |
| Fonts | `Arimo-Regular`, `Arimo-Bold`, `Gelasio-Regular`, `Gelasio-Bold`: CID TrueType, embedded, subset, Unicode map present. No Type 3 |
| Umlauts, ß, bullets | extract correctly with `pdftotext` and pdf.js |
| Page size | Letter 612 x 792 pt exactly. A4 comes back 595.92 x 842.88 pt (Chrome rounds to CSS pixels), within 1 pt of 595.28 x 841.89 |
| Margins | `@page` margins honoured on every page. A different first-page margin (`@page :first`) works, which the DIN 5008 letter relies on |
| Page-break rules | `break-inside: avoid`, `break-after: avoid`, orphans and widows all honoured |
| Producer, title | Chrome writes `about:blank` as the title, `Skia/PDF` as producer and `/Lang (en-US)` always. All three are replaced with `pdf-lib` |
| File size | median 68 KB per PDF (limit we set: 2 MB). The old html2canvas export averaged 1,044 KB |

### Timings and limits

- Wall time per render: median **0.97 s**, max 1.7 s over 31 renders, including one hop through the eval Worker. `X-Browser-Ms-Used` (the billed number): median **224 ms**. The plan assumed 3 s.
- Cost at that figure and $0.09 per browser hour: about **$0.000006 per PDF**. The included 10 hours a month cover roughly 160,000 PDFs.
- Request size: 0.5, 0.9, 1.5, 5 and 20 MB of HTML all rendered (3.1 s for 20 MB). The docs give 50 MB. A real CV page with fonts is about 200 KB, with a photo about 250 KB.
- The Quick Actions limit on Workers Paid is 30 requests per second.
- **`quickAction` does not run in plain local dev.** It needs `wrangler dev --remote` or `"remote": true` on the binding, which must not be committed. The installed workerd supports compatibility dates up to 2026-08-18 only, so the eval Worker uses 2026-08-17.
- **Transient failures:** the service answered `Error: internal error` 3 times in about 70 renders during the eval (a Worker exception, no body). `renderHtmlToPdf` retries a render up to 3 times with a short backoff before it fails. A render has no side effects.
- Fonts: Browser Run lists Liberation Sans, Arial, Georgia and Noto (CJK, emoji) as installed. Arimo and Gelasio are not, so they are embedded. Cyrillic, Greek and other scripts fall back to the installed families and are not covered by the shipped Latin subsets.

### Things the spike turned up that the plan did not have

1. **`react-dom/server` cannot be imported in a Next route handler.** Route handlers compile in the React Server Components layer, where every `react-dom/server` entry resolves to a module that throws (`You're importing a component that imports react-dom/server`). The export therefore uses `src/lib/services/export/static-markup.ts`, a 100-line tree walker for the templates' plain function components. `evals/ats-export/markup-parity.ts` renders every template and fixture with both and compares the HTML: 0 differences in 50 renders.
2. **Letter-spaced headings break pdf.js extraction.** With `letter-spacing: 2px` on an uppercase heading, pdf.js returned `P R O F I L`, while `pdftotext` returned `PROFIL`. Heading letter-spacing is now 0.5 px or less. OpenResume, which is built on pdf.js, depends on this.
3. **A positioned element paints late.** `position: relative` on the Premium experience entries put all of them after the Certifications section in the content stream, so the text layer read Summary, Skills, Education, Certifications, then every job. The headings were in order, the content was not. The attribute is gone and the eval now asserts that experience entries sit between their heading and the next one.
4. **An all-caps bold skill label reads as a section title** to a simple parser (OpenResume split Skills into empty sections). Skill group labels are now bold mixed case with a colon.
5. **`pdftotext` drops the hyphen when a compound word breaks across lines** (`zero-downtime` becomes `zerodowntime`). pdf.js keeps it. The eval's text match ignores spaces and hyphens for that reason.
6. **Two columns read badly in layout readers.** A first design had two templates with a sidebar. pdf.js, Tika and PyMuPDF read the main column first, but pdftotext in reading order and pdfminer.six merged the sidebar's lines into the main column on the same row (the numbers are in `evals/results/2026-10-20-ats-export/raw/results-round2-two-column.json`). Both templates are single column now and every reader passes every reading-order check.
7. **Request blocking works, and an image count cannot show it.** `allowRequestPattern: ['^data:']` stops the page from fetching anything but `data:` URIs, behind the meta CSP. A blocked `<img>` still prints a broken-image placeholder, which `pdfimages` counts, so counting images proves nothing (4 with blocking, 2 without: the placeholders). The eval's probe page reports `onload` or `onerror` of a remote image into the page text instead, and runs the same page without the pattern as a control that must load the image.
8. **A page-break chain inside a flex column container moved a heading and its first entry to the next page as one piece.** Vertical lists are block stacks (`cv-stack`) with the gap as a margin on every child after the first, which keeps `break-after: avoid` chains breakable.
9. **Browser Run keeps `www.` and path-less URLs as Chrome writes them.** A link to `https://host` is `https://host/` in the annotation. Compare links as parsed URLs.
10. **Tika appends the URL of every link annotation after the page text**, so an ATS built on Tika sees both the clean visible address and the full URL. The eval ignores those trailing URL-only lines when it checks that no `https://` is printed.
