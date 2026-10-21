# OpenAI app submission sheet: Useful Apply

Prepared 2026-10-20 for PR 6b. Fill-in sheet for the OpenAI developer dashboard (platform.openai.com), with every field the docs ask for and our value. Wasim submits it. Nothing here is submitted yet.

## Why a sheet and not a manifest file

OpenAI now ships remote MCP apps as "plugins". The docs describe two ways in:

1. The dashboard flow, **With MCP**: paste the server URL and fill in the fields below. No file needed.
2. An optional ZIP with a root `plugin.json` (the Agent Plugins format, with a `$schema`) plus an `mcp.json`. OpenAI-specific listing and review data go under `extensions.com.openai`.

The pages I could read name the fields and limits (copied below) but not the `$schema` URL or the `mcp.json` OAuth keys, and the Reference page doesn't document them either. I'm not guessing a schema. Use the dashboard flow. If Wasim wants the ZIP route, take the schema from https://developers.openai.com/plugins/reference and the values from this sheet. Credentials and reviewer instructions are rejected inside a ZIP anyway and always go in the dashboard's Review details.

## Doc URLs used

- https://developers.openai.com/plugins/deploy/submission (submission fields, domain verification, test account, review cases)
- https://developers.openai.com/apps-sdk/app-submission-guidelines (tool annotations, commerce policy, privacy, tool naming)
- https://developers.openai.com/plugins/reference (checked, it has no manifest schema)
- Search results from developers.openai.com that confirmed the move from "apps" to "plugins": `/plugins/deploy/submission-errors`, `/plugins/build/plugins`, `/apps-sdk/deploy`

Re-read the submission page when Wasim submits. The docs moved recently.

## Before submitting

| Step | Who | Status |
|---|---|---|
| Verify the individual or organization in the OpenAI Platform dashboard | Wasim | open |
| `MCP_ENABLED=true` in production and `/mcp` live | launch step in `STATUS.md` | open |
| Domain challenge route live (`/.well-known/openai-apps-challenge`, PR #156) and `OPENAI_APPS_CHALLENGE` secret set | Wasim (the token comes from the dashboard) | open |
| Reviewer account `reviewer+openai@usefulapply.com` seeded on production (the Anthropic portal gets its own account), credentials entered in the dashboard | Wasim runs `scripts/seed-reviewer-account.ts --email reviewer+openai@usefulapply.com` | open |
| Demo recording URL | Wasim records, see `../submission/screenshots.md` | open |
| Tested on desktop and mobile in ChatGPT developer mode | Wasim | open |

## Connection

| Field | Value |
|---|---|
| Submit as | With MCP (remote server) |
| MCP server URL | `https://usefulapply.com/mcp` |
| Transport | Streamable HTTP, stateless |
| Headers | None. Public submission rejects non-empty headers. |
| Authentication | OAuth |
| Registration method | `dcr` (Dynamic Client Registration). CIMD stays off until its fetch boundary is proven on Workers (`docs/agent-integration/spikes.md`). |
| Authorization server | Better Auth on `https://usefulapply.com` |
| Authorization server metadata | `https://usefulapply.com/.well-known/oauth-authorization-server` |
| Protected resource metadata | `https://usefulapply.com/.well-known/oauth-protected-resource/mcp` |
| Endpoints | Read from discovery. Better Auth serves them under `https://usefulapply.com/api/auth/oauth2/`. Only set `authorizationUrl`, `tokenUrl` or `registrationUrl` overrides if the portal can't find them. |
| Scopes | `read`, `write`, `spend`, `offline_access` |
| PKCE | S256, required |
| Token lifetimes | Access token 10 minutes. Refresh token 30 days, rotating. |
| Unauthenticated request | 401 with a `WWW-Authenticate` header that points at the protected resource metadata. |
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
- Our route: `src/app/.well-known/openai-apps-challenge/route.ts` (PR #156). It returns the value of the `OPENAI_APPS_CHALLENGE` env var.
- Set the value as a Worker secret without echoing it, then redeploy. The host is `usefulapply.com`, the same host as the MCP URL.
- Only one plugin may use a given challenge URL. We have one.

## Listing fields

Limits are from the submission page. Count characters before pasting.

| Field | Limit | Value |
|---|---|---|
| `name` (package) | 64, lowercase, hyphens | `useful-apply` |
| `displayName` | 30 | `Useful Apply` |
| `shortDescription` | 30, one line | `Tailored job applications` (25) |
| `longDescription` | 4000 | The long description in `../submission/listing.md`, which already avoids pricing |
| `developerName` | 80 | Wasim confirms the verified legal name. Draft: `Useful Apply` |
| `category` | a dashboard category | Wasim picks from the dashboard list. Closest fit: productivity or career. |
| `websiteURL` | HTTPS, 1024 | `https://usefulapply.com` |
| `supportURL` | HTTPS, 1024 | `https://usefulapply.com/integrations` (support@usefulapply.com is listed there) |
| `privacyPolicyURL` | HTTPS, 1024 | `https://usefulapply.com/privacy` |
| `termsOfServiceURL` | HTTPS, 1024 | `https://usefulapply.com/terms` |
| `defaultPrompt` | up to 3, 128 characters each, unique, no @mentions | see below |
| `logo` | required, square, at least 48x48, PNG/JPEG/WebP/SVG, 5 MiB max | Useful Apply mark. Wasim supplies the file. |
| `logoDark`, `composerIcon` | optional | skip |
| `brandColor` | optional `#RRGGBB`, 2:1 contrast against white | skip |
| `screenshots` | optional | see `../submission/screenshots.md` |
| Countries | `publication.countries`, uppercase codes | Wasim decides. The product targets the US and Germany at launch. |

### defaultPrompt

1. `Check my fit for this job ad and tell me what to fix first.` (59)
2. `What needs my attention today on my applications?` (49)
3. `Zeig mir meine Bewerbungen und was heute ansteht.` (49)

### Description rules

OpenAI's guidelines forbid advertising pricing, subscriptions, trials, discounts or promotions in descriptions. The listing text in `../submission/listing.md` has none. Keep it that way if Wasim edits it. Saying the app uses the user's existing credits is fine, quoting amounts isn't.

## Review test cases

The submission page requires exactly 5 positive and 3 negative cases for an MCP review. Run all five positive cases on the reviewer account before submitting. Tool names match the 43-tool catalog in PR 5 (`src/lib/mcp/scopes.ts`: 13 read, 24 free writes, 6 spend). The prompts below run as written on the seeded reviewer account.

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

Rules from the guidelines: explicit booleans on every tool, justification no longer required. All 43 tools set `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` (`ToolDefinition.hints` in `src/lib/mcp/tools/framework.ts`). What the code sets:

- `readOnlyHint`: true for the 13 read tools. False for the other 30, including `analyze_job_fit` (a pasted ad creates a draft) and every generation tool (they queue work).
- `destructiveHint`: true for 19 tools, the ones that replace or remove saved data. Counted tool by tool from the code: `delete_application`, `delete_cv`, `delete_cv_item`, `save_cv`, `set_profile_photo`, `remove_profile_photo`, `update_profile`, `update_notification_settings`, `update_feed_settings`, `give_job_feedback`, `withdraw_feed_consent`, `update_cv_content`, `edit_cv_structure`, `edit_document_text`, `set_cv_template`, `undo_last_edit`, `generate_application_kit`, `regenerate_document` and `rewrite_cv_section`. `give_job_feedback` is true because dismiss and rate-not-relevant remove a job for good. Being undoable doesn't justify false, so the edit tools stay true. False for the other 24: the 13 read tools, plus `create_application`, `update_application`, `update_application_status`, `cancel_generation`, `add_cv_item`, `set_cv_item_visibility` (hidden content stays in the CV), `export_documents`, `draft_screening_answers`, `analyze_job_fit`, `run_job_feed` and `apply_to_feed_job`.
- `idempotentHint`: true for the 13 read tools and the 15 others that repeat safely (every spending tool is idempotent by key). False for 15 tools such as `create_application`, `add_cv_item` and `undo_last_edit`.
- `openWorldHint`: false for a bounded private account. Every tool acts on the user's own account, so false everywhere except `run_job_feed`, which searches public job listings and is `true`.
- Annotations aren't permission. The server still enforces scopes, ownership and the daily spend cap. When the client supports MCP elicitation, most destructive tools also ask the user to confirm, but only when something is actually replaced or removed: `give_job_feedback` for dismiss and rate-not-relevant, `update_profile` when it overwrites a saved value, `generate_application_kit` when it replaces an existing kit, and so on. `update_notification_settings` is destructive and has no confirmation.

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

- Credits aren't sold in the app. No tool, description, error or listing text sells, prices or promotes credits or plans.
- Existing users sign in to their existing account and use features included in it. That's the existing-subscriber allowance.
- Out-of-credit and cap errors are neutral facts. If they link anywhere, it's the informational plans page, never checkout or an upgrade flow.
- No pricing, trial or discount wording in the listing or descriptions.
- `review.commerce`: false. If a reviewer asks, `review.commerce_description` says: "The app sells nothing. Users spend credits that already belong to their Useful Apply account. Credits and plans are managed on usefulapply.com, outside ChatGPT."
- No ads, no ChatGPT-specific fees, and the same features as the web product.

A reviewer may argue that metered credits are a digital good. Our answer is the existing-account allowance. If they reject it, the fallback is to drop the `spend` scope from the ChatGPT listing and keep the read and write tools. That's Wasim's call.

## Privacy and data notes

- The privacy policy covers data categories, purposes, recipients, retention (exports are deleted after 30 days) and user controls. The PostHog analytics retention period is still a number Wasim has to supply (see `STATUS.md`).
- The app collects only what its tools need. That's CV and application data the user already keeps in Useful Apply, plus job feed preferences (roles, locations, salary floor), a profile photo (`set_profile_photo`), and contact details including date of birth and nationality (`update_profile`). Name the photo, date of birth and nationality in the privacy policy and in the dashboard's data-collection answers, because OpenAI compares the tools to the policy. No government ids, no payment data, no credentials, no precise location.
- `mcp_tool_called` analytics records tool, client, duration and outcome, never content.
- The server never reads chat history. It only sees tool arguments.
- Account deletion revokes every token.

## Review details (dashboard only, never in git or the ZIP)

- Login URL: `https://usefulapply.com/auth/login`
- Test account: `reviewer+openai@usefulapply.com`, the OpenAI account only. Email and password come from the file the seed script writes. Paste them into Review details.
- No MFA, no email or SMS codes, no magic links, no sign-up needed.
- Instructions: paste the contents of `../submission/reviewer-guide.md`.
- Keep the account and its data in place for later reviews. Wasim resets it by re-running the seed (reviewers can't). Re-run it the day before a review, so the feed matches and dates are fresh. See `../submission/checklist.md`.
