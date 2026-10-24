# Submission checklist

Status as of 2026-10-25, checked against production (Worker version `7121506b`, migrations through 0015 applied) and the submission docs read that day. "Wasim" means it needs his account, identity, money or a decision. Sources: Anthropic https://claude.com/docs/connectors/building/submission and https://claude.com/docs/plugins/submit, OpenAI https://developers.openai.com/plugins/deploy/submission and https://developers.openai.com/apps-sdk/app-submission-guidelines.

## Product readiness (blocks every submission)

| Requirement | Status | Owner |
|---|---|---|
| Full tool catalog live: 43 tools (13 read, 24 free writes, 6 spend) | done. Production `tools/list` on 2026-10-25 returned the same 43 names as `TOOL_SCOPES` | done |
| `/integrations`, privacy and terms pages live | done, all 200 on 2026-10-25 | done |
| `MCP_ENABLED=true` deployed, `/mcp` reachable over public HTTPS | done, live since 2026-10-21 | done |
| Unauthenticated `/mcp` request returns 401 with `WWW-Authenticate` | done, checked 2026-10-25 (`resource_metadata` and `scope` in the header) | done |
| Protected resource metadata at `/.well-known/oauth-protected-resource/mcp` | done, 200. Authorization server metadata at `/.well-known/oauth-authorization-server/api/auth` (issuer `https://usefulapply.com/api/auth`), DCR endpoint `/api/auth/oauth2/register`, S256 only | done |
| PKCE S256, exact redirect URIs, loopback allowed | done (PR #153) | done |
| Every tool has `title` and explicit `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` | done for all 43 (`ToolDefinition.hints`), rechecked 2026-10-25. Recheck in the portal's Tools step | done |
| Tool names 64 characters or fewer, read and write tools separate | done. The longest name is 28 characters | done |
| No prices or upgrade text in any tool output | done. Tool text has none. The out-of-credit error names the plans page (`/pricing`), never checkout | done |
| `run_job_feed` `openWorldHint: true` (searches public listings) | done | done |
| Each tool run once as a custom connector in Claude | done on 2026-10-21: 38 tools on Wasim's account, the 5 data-destroying ones on a throwaway account (`../STATUS.md`) | done |
| Tested in ChatGPT developer mode | desktop done on 2026-10-21. Mobile open | Wasim |
| MCP Inspector run | done on 2026-10-21 (43 tools, schema 0 errors). On 2026-10-25 the CLI reached production and stopped at OAuth, which needs a person at the keyboard (`MCP_AUTO_OPEN_ENABLED=true`); the authenticated list came from the live plugin connection instead | done |
| MCP E2E (`--project=mcp`) green on main after #194 | done on 2026-10-25: 125 passed (`../STATUS.md`, session 5) | done |
| Privacy policy names every field the tools collect | done on 2026-10-25: date of birth and nationality (`update_profile`, web profile) named in section 1, the US data table and section 15 | done |
| Privacy policy retention for PostHog product analytics | done on 2026-10-25: usage events 12 months, session recordings 30 days (section 5, Wasim's call). PostHog's project retention must match | done |

## Reviewer account

| Requirement | Status | Owner |
|---|---|---|
| Seed script written, idempotent, no MFA, verified email | done, `scripts/seed-reviewer-account.ts`. Re-run on a fresh local D1 after migration 0015 on 2026-10-25: two runs, both exit 0 (see `../STATUS.md`) | done |
| Reviewer is on Max with no Stripe ids, so screening and the job feed work | done in the seed. The monthly sweep never selects it (see Reset and plan survival below) | done |
| One reviewer account per portal: `reviewer+anthropic@usefulapply.com` for Anthropic and `reviewer+openai@usefulapply.com` for OpenAI, each seeded with `--email` and its own credentials file | done on 2026-10-25. Credentials in `~/Documents/usefulapply-reviewers/{anthropic,openai}.json` (mode 0600, outside the repo) | done |
| Seeded on production | done on 2026-10-25 around 00:45 CEST, with Wasim's yes, from main at `ec8c6020`. Both runs exit 0. Read-only D1 check per account: email verified, Max, 200 credits, `subscription_status` NULL, no Stripe id, 1 subscription row, Halcyon (applied) and Fjordwerk (interview) kits succeeded, 1 CV, 8 chat messages, 5 ranked feed items | done |
| Re-run the seed right before each review window opens, and again if the review is delayed. The briefing counts feed matches from the last 24 hours and interviews in the next 7 days, and the seed puts the interview 5 days out, so the dates go stale fast | open | Wasim |
| Credentials entered in the matching portal only, files kept outside git | open | Wasim |
| Accounts and data kept available for later reviews | ongoing | Wasim |

### Production seed (done 2026-10-25; re-run only after Wasim says yes)

From the main checkout on an up-to-date `main`, with a Cloudflare login that can write to the production database. One run per portal:

```bash
npx tsx scripts/seed-reviewer-account.ts --base-url https://usefulapply.com --email reviewer+anthropic@usefulapply.com --credentials-out ~/Documents/usefulapply-reviewers/anthropic.json --remote --yes-production
```

```bash
npx tsx scripts/seed-reviewer-account.ts --base-url https://usefulapply.com --email reviewer+openai@usefulapply.com --credentials-out ~/Documents/usefulapply-reviewers/openai.json --remote --yes-production
```

Create `~/Documents/usefulapply-reviewers/` first. It's outside every repo, and the script writes each file with mode 0600.

## Listing materials

| Requirement | Status | Owner |
|---|---|---|
| Name, one-liner, short and long description | done, `listing.md` | done |
| 3+ example prompts that exercise different tools | 5 drafted, each checked against the seeded reviewer account | done |
| Documentation URL | `https://usefulapply.com/integrations`, live | done |
| Privacy policy URL, with retention | live. See the two privacy rows above | done |
| Terms URL | `https://usefulapply.com/terms`, live | done |
| Support contact | support@usefulapply.com. Confirm the mailbox exists and is read | Wasim |
| Icon / logo, square, 48 px or larger | `public/useful-apply-logo.png` (512 x 512 PNG, the mark on cream), also in the OpenAI package as `assets/logo.png` | done |
| Categories | pick in each portal | Wasim |
| Slug `useful-apply` (permanent) | confirm | Wasim |
| Company name, website, review contact | open | Wasim |
| Screenshots (optional for Anthropic, optional for OpenAI) | shot list in `screenshots.md` | Wasim |
| Demo recording URL (OpenAI, required) | open | Wasim |

## Anthropic connector directory (claude.ai/directory/manage, Submit new, MCP connector)

| Requirement | Status | Owner |
|---|---|---|
| Any paid Claude plan to submit | confirm | Wasim |
| Connection step passes (URL reachable, OAuth) | the server is live | Wasim |
| Tools step shows no missing-title or annotation flags | all 43 set them | Wasim checks |
| Listing, use cases, company, authentication, data handling | field values in `listing.md` | Wasim pastes |
| Test and launch: instructions and credentials | `reviewer-guide.md` plus the credentials file | Wasim |
| Confirm every tool was run (MCP Inspector or custom connector). `reviewer-guide.md` steps 1 to 39 cover all 43 | done on 2026-10-21 (see Product readiness) | Wasim ticks |
| Seven compliance acknowledgments | positions in `listing.md` | Wasim ticks |
| Read the Anthropic Software Directory Terms and Policy | open | Wasim |

After submitting, Anthropic scans it and by default lists it as a Community connector. Some submissions also get a human review.

## Anthropic plugin directory (claude.ai/directory/manage, Submit new, Plugin bundle)

| Requirement | Status | Owner |
|---|---|---|
| Public repo `wasimjalali/usefulapply-plugin` with `.claude-plugin/plugin.json`, `marketplace.json`, `.mcp.json`, `apply-to-job` skill, README, MIT license | done. Matches the live catalog (43 tools, no removed fields) on 2026-10-25; no changes needed | done |
| `claude plugin validate` passes | done on 2026-10-25 (`Validation passed`). The portal's Validate step runs more checks | done |
| Submission page read | done on 2026-10-25, steps in `listing.md` | done |
| GitHub account connected on claude.ai in the submitting organization, with push access to the repo | open | Wasim |
| Data handling answers and four compliance acknowledgements | values in `listing.md` | Wasim |
| Connector submitted too, so the plugin can pair with it | open | Wasim |

## OpenAI app directory (platform.openai.com/plugins)

| Requirement | Status | Owner |
|---|---|---|
| Individual or organization verified in the Platform dashboard | open | Wasim |
| Package ZIP (OpenAI now starts every submission with an upload) | done, `../openai/package/` plus the zip command in `../openai/app-submission.md` | done |
| Field sheet | done, `../openai/app-submission.md` | done |
| Domain challenge route and `OPENAI_APPS_CHALLENGE` secret | route live (404 until the secret is set). Secret needs the portal token | Wasim |
| Registration method `dcr`, scopes, redirect URIs | in `package/mcp.json` and the sheet. Compare with the dashboard's callback | Wasim |
| 5 positive and 3 negative test cases, all positive ones run | drafted in the sheet | Wasim runs |
| Test account with no MFA, no sign-up needed | seeded on production 2026-10-25 (`reviewer+openai@usefulapply.com`) | done |
| No digital goods, credits or upgrade promotion in the app | done (see Product readiness) | done |
| No pricing, trial or promotion wording in descriptions | listing text complies | done |
| Policy attestations in the Submit dialog | open | Wasim |
| Only one active review at a time | note | Wasim |
| MCP URL can't change after submit (needs support) | final URL `https://usefulapply.com/mcp` | done |

## Things only Wasim can provide

- OpenAI identity verification and a Claude paid plan for submitting.
- The OpenAI domain challenge token, set as `OPENAI_APPS_CHALLENGE`.
- Company details, review contact and categories.
- Entering the reviewer credentials in the portals, and a seed re-run right before each review window.
- The demo recording and the screenshots.
- A decision on the commerce risk: ship `spend` to ChatGPT, or drop it if OpenAI rejects credits.

## Reset and plan survival (internal, never pasted into a portal)

Reviewers can't reset an account. They email support, and Wasim re-runs the seed. Steps 37 to 39 of `reviewer-guide.md` replace the CV, delete it and withdraw feed consent, so a finished review leaves that account without a CV and without consent until it's reseeded.

The seed restores the plan, the credits, the applications, the CV, the career profile, the chat history, the feed items, the dates and the feed settings, and keeps the same login. It doesn't reset the two notification switches (follow-up due, interview tomorrow) or the profile photo, so undo steps 25 and 27 by hand. It touches only the reviewer's own rows and the shared feed postings keyed `reviewer-seed:`.

The production commands are in "Production seed" above. The script only accepts `reviewer@usefulapply.com` or `reviewer+<label>@usefulapply.com`, and `--remote` needs `--yes-production`. It prints what it will do first. Reuse each account's own `--credentials-out` file. If that file is missing or stale, the script deletes the account and creates it again with a new password, so update that portal afterwards.

Does the plan survive? Yes. The account is Max in the profile, the credits row and the subscriptions row, with no Stripe ids and `user_credits.subscription_status` empty.

- The daily cron sweep (`processOverdueMonthlyResets`) resets a paid row only when its `subscription_status` is `active` and its reset date is more than 3 days past. This row's status is empty, so the sweep never selects it.
- Stripe webhooks look users up by customer or subscription id. The reviewer has none, so no event can match it.
- Nothing refills credits automatically. When the balance runs low, re-run the seed. Credits are the only thing that drifts, so re-run it after each review round and before a resubmission.
