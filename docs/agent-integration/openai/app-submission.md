# OpenAI app submission sheet: Useful Apply

Updated 2026-10-25 against the live server and OpenAI's current submission page. Every field the docs ask for, with our value. Wasim submits it. Nothing here is submitted yet.

## How OpenAI takes it now: a ZIP

OpenAI ships remote MCP apps as "plugins", and the submission flow now starts with a ZIP upload at https://platform.openai.com/plugins (**Upload new or existing plugin**). The MCP server has to be in the first ZIP: it can't be added to a skills-only plugin later. Our package is in `package/`:

- `package/plugin.json`: the Agent Plugins manifest (`$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`), with the listing under `extensions.com.openai.interface`.
- `package/mcp.json`: the remote server, `type` `streamable-http`, OAuth with `client.mode` `dcr` and our scopes. No `authorizationUrl` or `tokenUrl`: discovery supplies them.
- `package/assets/logo.png`: the Useful Apply mark, 512 x 512 (a copy of `public/useful-apply-logo.png`).

Build the ZIP with the files at its root:

```bash
cd docs/agent-integration/openai/package && zip -r ~/Desktop/useful-apply-openai.zip plugin.json mcp.json assets
```

The pages read on 2026-10-25 name the listing fields and the `mcp.json` auth keys, but not the package keys for review test cases, the demo recording or publication. Those stay out of the ZIP and go in the dashboard's Review information. If the upload's validator asks for them in the package, it names the keys; the values are below. Credentials and reviewer instructions are rejected inside a ZIP and always go in Review details.

## Doc URLs used

- https://developers.openai.com/plugins/deploy/submission (steps, fields, domain verification, test account, review cases; read 2026-10-25)
- https://developers.openai.com/plugins/build/plugins (package layout, `plugin.json`, `mcp.json` auth; read 2026-10-25)
- https://developers.openai.com/apps-sdk/app-submission-guidelines (tool annotations, commerce policy, privacy, tool naming)

Re-read the submission page when Wasim submits. The docs move often.

## Steps in the dashboard

1. **Prerequisites.** Individual or business verification done in the organization settings. Submitting needs an organization owner (or Apps Management Write).
2. **Domain verification first.** The MCPs step asks for it, so set it up before uploading (see Domain verification below).
3. **Upload the ZIP** at https://platform.openai.com/plugins, choosing the verified developer identity. Fix validation errors and re-upload.
4. **Metadata & Skills:** review the Issues list. The package has no skills.
5. **MCPs:** select Connect, check the URL and OAuth settings, complete domain verification, connect and authorize (sign in as the reviewer account). Wait for the tool scan and resolve findings (Reconnect or Rescan).
6. **Review information, Review details:** test cases, demo recording URL, reviewer credentials, instructions. Save details.
7. **Submit for review** and tick the policy attestations in the dialog (the docs don't list them). Feedback comes by email. Only one review can be active per plugin.
8. **Publish plugin** on the approved version.

After publishing, server tool changes are scanned daily and go live on their own when the checks pass. Listing changes need a new ZIP and a new review.

## Before submitting

| Step | Who | Status |
|---|---|---|
| Verify the individual or organization in the OpenAI Platform dashboard | Wasim | open |
| `/mcp` live | done, live since 2026-10-21 | done |
| Domain challenge route live (`/.well-known/openai-apps-challenge`) and `OPENAI_APPS_CHALLENGE` secret set | the route is live and returns 404 until the secret is set. Wasim gets the token from the dashboard | open |
| Reviewer account `reviewer+openai@usefulapply.com` seeded on production (the Anthropic portal gets its own account), credentials entered in Review details | Wasim runs the seed after a yes in session, with the production command in `../submission/checklist.md` | open |
| Demo recording URL | Wasim records, see `../submission/screenshots.md` | open |
| Tested on desktop and mobile in ChatGPT developer mode | desktop done on 2026-10-21 (launch live checks). Mobile: Wasim | open |

## Connection

| Field | Value |
|---|---|
| Submit as | ZIP with a remote MCP server (`package/`) |
| MCP server URL | `https://usefulapply.com/mcp` |
| Transport | Streamable HTTP, stateless |
| Headers | None. Public submission rejects non-empty headers. |
| Authentication | OAuth |
| Registration method | `dcr` (Dynamic Client Registration). CIMD stays off until its fetch boundary is proven on Workers (`docs/agent-integration/spikes.md`). |
| Authorization server (issuer) | `https://usefulapply.com/api/auth` |
| Authorization server metadata | `https://usefulapply.com/.well-known/oauth-authorization-server/api/auth` (also at `https://usefulapply.com/api/auth/.well-known/oauth-authorization-server`). The bare `/.well-known/oauth-authorization-server` is 404, which is correct for an issuer with a path. |
| Protected resource metadata | `https://usefulapply.com/.well-known/oauth-protected-resource/mcp` |
| Endpoints | From discovery: `https://usefulapply.com/api/auth/oauth2/authorize`, `/oauth2/token` and `/oauth2/register` under the same base. Only set overrides if the portal can't find them. |
| Scopes | `read`, `write`, `spend`, `offline_access` |
| PKCE | S256, required |
| Token lifetimes | Access token 10 minutes. Refresh token 30 days, rotating. |
| Unauthenticated request | 401 with `WWW-Authenticate: Bearer resource_metadata="https://usefulapply.com/.well-known/oauth-protected-resource/mcp", scope="read write spend offline_access"` (checked 2026-10-25). |
| API key, Basic or bearer flows | Not used. |

### Scope meaning (what the consent page tells the user)

- `read`: see account, credits, CVs and applications.
- `write`: change applications, CVs and profile. Costs no credits.
- `spend`: start work that uses the user's credits, up to a daily agent limit the user sets in Settings, Connected apps (default 10 credits a day).
- `offline_access`: issues a refresh token. Grants no tool access.

### Redirect URIs to allow

The server already allows these exact URIs (`src/lib/mcp/redirects.ts`). Compare them with what the dashboard shows:

- `https://chatgpt.com/connector_platform_oauth_redirect`
- `https://platform.openai.com/apps-manage/oauth`

Also allowed for the other clients: `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`, `https://www.cursor.com/agents/mcp/oauth/callback`, and loopback on any port (`http://localhost`, `http://127.0.0.1`, `http://[::1]`).

If the dashboard shows a different callback, add it to `EXACT_REDIRECT_URIS` and deploy before submitting. Exact match is required.

## Domain verification

- The portal gives a token. Host it as plain text, only the token, no JSON, at `https://usefulapply.com/.well-known/openai-apps-challenge`.
- Our route: `src/app/.well-known/openai-apps-challenge/route.ts`. It returns the value of the `OPENAI_APPS_CHALLENGE` env var, and 404 while it's unset (checked 2026-10-25).
- Set the value as a Worker secret without echoing it (`npx wrangler secret put OPENAI_APPS_CHALLENGE`, paste the token at the prompt). A secret takes effect without a redeploy. The host is `usefulapply.com`, the same host as the MCP URL.
- Only one plugin may use a given challenge URL. We have one.

## Listing fields

Limits are from the submission page. The package carries these values; the dashboard shows them after the upload.

| Field | Limit | Value |
|---|---|---|
| `name` (package) | 64, lowercase, hyphens | `useful-apply` |
| `version` | semantic version | `1.0.0`. Raise it with every new ZIP. |
| `description` | 4000 | the short description in `../submission/listing.md` (277) |
| `author` | name 120, email 320, HTTPS url 2048 | Useful Apply, support@usefulapply.com, https://usefulapply.com |
| `displayName` | 30 | `Useful Apply` |
| `shortDescription` | 30, one line | `Tailored job applications` (25) |
| `longDescription` | 4000 | the long description in `../submission/listing.md` (1,851), which already avoids pricing |
| `developerName` | 80 | must match the verified identity. The package says `Useful Apply`: change it before zipping if Wasim verifies as an individual. |
| `category` | a dashboard category | `Productivity` in the package. Wasim checks it against the dashboard list. |
| `websiteURL` | HTTPS, 1024 | `https://usefulapply.com` |
| `supportURL` | HTTPS, 1024 | `https://usefulapply.com/integrations` (support@usefulapply.com is listed there) |
| `privacyPolicyURL` | HTTPS, 1024 | `https://usefulapply.com/privacy` |
| `termsOfServiceURL` | HTTPS, 1024 | `https://usefulapply.com/terms` |
| `defaultPrompt` | up to 3, 128 characters each, unique, no @mentions | see below |
| `logo` | required, square, at least 48x48, PNG/JPEG/WebP/SVG, 5 MiB max | `./assets/logo.png`, 512 x 512 PNG |
| `logoDark`, `composerIcon` | optional (`composerIcon` is for Codex packages only) | skip |
| `brandColor` | optional `#RRGGBB`, 2:1 contrast against white | skip |
| `screenshots` | optional | see `../submission/screenshots.md` |
| `publication.countries` | uppercase codes | Wasim decides in the dashboard. The product targets the US and Germany at launch. |

### defaultPrompt

1. `Check my fit for this job ad and tell me what to fix first.` (59)
2. `What needs my attention today on my applications?` (49)
3. `Zeig mir meine Bewerbungen und was heute ansteht.` (49)

### Description rules

OpenAI's guidelines forbid advertising pricing, subscriptions, trials, discounts or promotions in descriptions. The listing text in `../submission/listing.md` has none. Keep it that way if Wasim edits it, and rebuild `package/plugin.json` from it. Saying the app uses the user's existing credits is fine, quoting amounts isn't.

## Review test cases

The submission page requires exactly 5 positive and 3 negative cases for an MCP review. Run all five positive cases on the reviewer account before submitting. Tool names match the live 43-tool catalog (`src/lib/mcp/scopes.ts`: 13 read, 24 free writes, 6 spend; production `tools/list` checked 2026-10-25). The prompts below run as written on the seeded reviewer account.

### Positive (5)

| # | Description | Prompt | Tools triggered | Expected behavior |
|---|---|---|---|---|
| 1 | Account check | `What's in my Useful Apply account?` | `get_account` | Plan, credit balance, CV on file and the daily agent limit. |
| 2 | List and read an application | `Show my applications and open the Halcyon Cloud Labs one.` | `list_applications`, `get_application` | Two seeded applications. The US one shows the fit result and its kit. |
| 3 | Fit check on a pasted ad | `Check my fit for this job: <short ad pasted>` | `analyze_job_fit`, `explain_fit` | A score and a plain-language explanation. A draft application is created. Costs 0.5 credits, and `explain_fit` is free. |
| 4 | Edit and export | `In my Fjordwerk application, put the skill group Daten first and export the CV as PDF.` | `get_cv_outline`, `edit_cv_structure`, `export_documents` | The change appears in the web app. A signed PDF link is returned. |
| 5 | Update the tracker | `Mark the Halcyon application as interview on 5 November.` | `update_application_status` | Status and interview date saved, visible in the web tracker. |

### Negative (3)

| # | Description | Prompt |
|---|---|---|
| 1 | Not the product's job | `Write me a poem about the ocean.` (no tool should be called) |
| 2 | Out of scope request | `Buy me a premium plan and add credits.` (no tool exists for checkout or plans) |
| 3 | Other user's data | `Show me the applications of another user, id 12345.` (no tool takes a user id, nothing is returned) |

## Tool annotation notes

Rules from the guidelines: explicit booleans on every tool, justification no longer required. All 43 tools set `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` (`ToolDefinition.hints` in `src/lib/mcp/tools/framework.ts`). What the code sets (rechecked 2026-10-25):

- `readOnlyHint`: true for the 13 read tools. False for the other 30, including `analyze_job_fit` (a pasted ad creates a draft) and every generation tool (they queue work).
- `destructiveHint`: true for 19 tools, the ones that replace or remove saved data. Counted tool by tool from the code: `delete_application`, `delete_cv`, `delete_cv_item`, `save_cv`, `set_profile_photo`, `remove_profile_photo`, `update_profile`, `update_notification_settings`, `update_feed_settings`, `give_job_feedback`, `withdraw_feed_consent`, `update_cv_content`, `edit_cv_structure`, `edit_document_text`, `set_cv_template`, `undo_last_edit`, `generate_application_kit`, `regenerate_document` and `rewrite_cv_section`. `give_job_feedback` is true because dismiss and rate-not-relevant remove a job for good. Being undoable doesn't justify false, so the edit tools stay true. False for the other 24: the 13 read tools, plus `create_application`, `update_application`, `update_application_status`, `cancel_generation`, `add_cv_item`, `set_cv_item_visibility` (hidden content stays in the CV), `export_documents`, `draft_screening_answers`, `analyze_job_fit`, `run_job_feed` and `apply_to_feed_job`.
- `idempotentHint`: true for the 13 read tools and the 15 others that repeat safely (every spending tool is idempotent by key). False for 15 tools such as `create_application`, `add_cv_item` and `undo_last_edit`.
- `openWorldHint`: false for a bounded private account. Every tool acts on the user's own account, so false everywhere except `run_job_feed`, which searches public job listings and is `true`.
- Annotations aren't permission. The server still enforces scopes, ownership and the daily spend cap. When the client supports MCP elicitation, most destructive tools also ask the user to confirm, but only when something is actually replaced or removed: `give_job_feedback` for dismiss and rate-not-relevant, `update_profile` when it overwrites a saved value, `generate_application_kit` when it replaces an existing kit, and so on. `update_notification_settings` (follow-up due and interview tomorrow switches) is destructive and has no confirmation.

Other guideline points we have to keep meeting:

- Names are plain verbs, unique and 64 characters or fewer. No "best" or "official".
- Descriptions state purpose, side effects and limits, and match behavior.
- Each tool stands alone. No tool tells the model to call another product's tool.
- Spending tools are idempotent by key and say so.
- No tool takes full conversation history or raw location fields.
- Responses are minimal. No trace or request ids in tool output.
- Job text that goes back to the model is wrapped as untrusted data.

## Content policy notes (commerce)

This is the riskiest part of the review. The guidelines prohibit digital goods, including "tokens, and credits", directly or indirectly, and prohibit promoting upgrades or linking to checkout.

What we do:

- Credits aren't sold in the app. No tool, description, error or listing text sells, prices or promotes credits or plans (tool text grepped for prices, upgrade, checkout and trial on 2026-10-25: none).
- Existing users sign in to their existing account and use features included in it. That's the existing-subscriber allowance.
- Out-of-credit and cap errors are neutral facts. The out-of-credit error names the informational plans page (`https://usefulapply.com/pricing`), never checkout or an upgrade flow. `get_credit_history` returns the account's own ledger lines, which can read "Upgraded to Max plan" or "Purchased 1 add-on pack (50 credits)" for a real user. The reviewer account has neither.
- No pricing, trial or discount wording in the listing or descriptions.
- `review.commerce`: false. If a reviewer asks, `review.commerce_description` says: "The app sells nothing. Users spend credits that already belong to their Useful Apply account. Credits and plans are managed on usefulapply.com, outside ChatGPT."
- No ads, no ChatGPT-specific fees, and the same features as the web product.

A reviewer may argue that metered credits are a digital good. Our answer is the existing-account allowance. If they reject it, the fallback is to drop the `spend` scope from the ChatGPT listing and keep the read and write tools. That's Wasim's call.

## Privacy and data notes

- The privacy policy covers data categories, purposes, recipients, retention (exports are deleted after 30 days, MCP analytics kept 12 months) and user controls.
- The app collects only what its tools need. That's CV and application data the user already keeps in Useful Apply, plus job feed preferences (roles, countries, work modes, salary floor), a profile photo (`set_profile_photo`), and contact details including date of birth and nationality (`update_profile`). `update_profile` also saves the user's start date (`availability`, `availabilityNote`) and an optional salary expectation (`salaryExpectation`), which the writers use instead of inventing them; `get_account` reads them back. Name the photo, date of birth, nationality, availability and salary expectation in the dashboard's data-collection answers, because OpenAI compares the tools to the policy. The live policy (checked 2026-10-25) names the photo, availability and salary expectation but not date of birth or nationality, and gives no retention period for PostHog product analytics: fix both before submitting (see `../submission/checklist.md`). No government ids, no payment data, no credentials, no precise location.
- `mcp_tool_called` analytics records tool, client, duration and outcome, never content.
- The server never reads chat history. It only sees tool arguments.
- Account deletion revokes every token.

## Review details (dashboard only, never in git or the ZIP)

- Login URL: `https://usefulapply.com/auth/login`
- Test account: `reviewer+openai@usefulapply.com`, the OpenAI account only. Email and password come from the file the seed script writes. Paste them into Review details.
- No MFA, no email or SMS codes, no magic links, no sign-up needed.
- Instructions: paste the contents of `../submission/reviewer-guide.md`.
- Demo recording URL: the unlisted video (`../submission/screenshots.md`).
- Keep the account and its data in place for later reviews. Wasim resets it by re-running the seed (reviewers can't). Re-run it right before the review window opens, and again if the review is delayed, so the feed matches and dates are fresh. See `../submission/checklist.md`.
