# Submission checklist

Status as of 2026-10-21, after the pack was matched to the 43-tool catalog. "Wasim" means it needs his account, identity, money or a decision. Sources: Anthropic https://claude.com/docs/connectors/building/submission, OpenAI https://developers.openai.com/plugins/deploy/submission and https://developers.openai.com/apps-sdk/app-submission-guidelines.

## Product readiness (blocks every submission)

| Requirement | Status | Owner |
|---|---|---|
| Full tool catalog merged: 43 tools (13 read, 24 free writes, 6 spend) | built in PR 5, branch `feature/mcp-tool-catalog`. Merge before submitting | agent |
| `/integrations`, privacy and terms pages live (PR #156) | open, merge after PR 5 | agent |
| `MCP_ENABLED=true` deployed | open, launch step | agent |
| `/mcp` reachable over public HTTPS | built, off behind the flag | agent |
| Unauthenticated `/mcp` request returns 401 with `WWW-Authenticate` | built (PR #153) | done |
| Protected resource metadata at `/.well-known/oauth-protected-resource/mcp` | built (PR #153), 404 until flag is on | done |
| PKCE S256, exact redirect URIs, loopback allowed | built (PR #153) | done |
| Every tool has `title` and explicit `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` | in the code for all 43 tools (`ToolDefinition.hints`). Recheck in the portal's Tools step | agent |
| Tool names 64 characters or fewer, read and write tools separate | in the code. The longest name is 28 characters | agent |
| No prices or upgrade text in any tool output | open, part of PR 5, check before submit | agent |
| `run_job_feed` `openWorldHint: true` (searches public listings) | in the code. Docs match | done |
| Each tool run once as a custom connector in Claude | open, launch live check | Wasim or agent |
| Tested in ChatGPT developer mode, desktop and mobile | open, launch live check | Wasim |
| MCP Inspector run clean | open, launch live check | agent |

## Reviewer account

| Requirement | Status | Owner |
|---|---|---|
| Seed script written, idempotent, no MFA, verified email | done, `scripts/seed-reviewer-account.ts`, verified locally twice | done |
| Reviewer is on Max with no Stripe ids, so screening and the job feed work | done in the seed. The monthly sweep never selects it (see Reset and plan survival below) | done |
| One reviewer account per portal: `reviewer+anthropic@usefulapply.com` for Anthropic and `reviewer+openai@usefulapply.com` for OpenAI, each seeded with `--email` and its own credentials file | open | Wasim |
| Seeded on production | open | Wasim runs it with `--remote --yes-production` (Cloudflare login needed) |
| Re-run the seed the day before each review, so the feed matches and the follow-up and interview dates are fresh | open | Wasim |
| Credentials entered in the matching portal only, files kept outside git | open | Wasim |
| Accounts and data kept available for later reviews | ongoing | Wasim |

## Listing materials

| Requirement | Status | Owner |
|---|---|---|
| Name, one-liner, short and long description | drafted in `listing.md` | done |
| 3+ example prompts that exercise different tools | 5 drafted, each checked against the seeded reviewer account | done |
| Documentation URL | `/integrations` (PR #156) | done once merged |
| Privacy policy URL, with retention | page in PR #156. Needs the PostHog analytics retention number | Wasim |
| Terms URL | page in PR #156 | done once merged |
| Support contact | support@usefulapply.com. Confirm the mailbox exists and is read | Wasim |
| Icon / logo, square, 48 px or larger | open | Wasim |
| Categories | pick in each portal | Wasim |
| Slug `useful-apply` (permanent) | confirm | Wasim |
| Company name, website, review contact | open | Wasim |
| Screenshots (optional for Anthropic, optional for OpenAI) | shot list in `screenshots.md` | Wasim, after launch |
| Demo recording URL (OpenAI, required) | open | Wasim, after launch |

## Anthropic connector directory (claude.ai/directory/manage)

| Requirement | Status | Owner |
|---|---|---|
| Any paid Claude plan to submit | confirm | Wasim |
| Connection step passes (URL reachable, OAuth) | open, needs launch | Wasim |
| Tools step shows no missing-title or annotation flags | open, needs PR 5 deployed | agent |
| Listing, use cases, company, authentication, data handling | field values in `listing.md` | Wasim pastes |
| Test and launch: instructions and credentials | `reviewer-guide.md` plus the credentials file | Wasim |
| Confirm every tool was run (MCP Inspector or custom connector). `reviewer-guide.md` steps 1 to 39 cover all 43 | open | Wasim |
| Seven compliance acknowledgments | positions in `listing.md` | Wasim ticks |
| Read the Anthropic Software Directory Terms and Policy | open | Wasim |

## Anthropic plugin directory

| Requirement | Status | Owner |
|---|---|---|
| Public repo `wasimjalali/usefulapply-plugin` with `plugin.json`, `marketplace.json`, `.mcp.json`, `apply-to-job` skill | open, separate PR 6b piece | agent |
| `claude plugin validate` passes | open | agent |
| Read https://claude.com/docs/plugins/submit (not read for this pack) | open | agent |
| Connector submitted too, so the plugin can pair with it | open | Wasim |

## OpenAI app directory (platform.openai.com)

| Requirement | Status | Owner |
|---|---|---|
| Individual or organization verified in the Platform dashboard | open | Wasim |
| Field sheet | done, `../openai/app-submission.md` | done |
| Domain challenge route (PR #156) and `OPENAI_APPS_CHALLENGE` secret | route open until merge. Secret needs the portal token | Wasim |
| Registration method `dcr`, scopes, redirect URIs | documented in the sheet. Compare with the dashboard's callback | Wasim |
| 5 positive and 3 negative test cases, all positive ones run | drafted in the sheet | Wasim runs |
| Test account with no MFA, no sign-up needed | seed script supports it | Wasim |
| No digital goods, credits or upgrade promotion in the app | designed in. Check tool output before submit | agent |
| No pricing, trial or promotion wording in descriptions | listing text complies | done |
| Policy attestations in the Submit dialog | open | Wasim |
| Only one active review at a time | note | Wasim |
| MCP URL can't change after submit (needs support) | decide the final URL first. It's `https://usefulapply.com/mcp` | Wasim |

## Things only Wasim can provide

- OpenAI identity verification and a Claude paid plan for submitting.
- The OpenAI domain challenge token, set as `OPENAI_APPS_CHALLENGE`.
- The PostHog analytics retention period for the privacy policy.
- Logo, company details, review contact and categories.
- Running the seed on production, and entering the credentials in the portals.
- The demo recording and the post-launch screenshots.
- A decision on the commerce risk: ship `spend` to ChatGPT, or drop it if OpenAI rejects credits.

## Reset and plan survival (internal, never pasted into a portal)

Reviewers can't reset an account. They email support, and Wasim re-runs the seed. Steps 37 to 39 of `reviewer-guide.md` replace the CV, delete it and withdraw feed consent, so a finished review leaves that account without a CV and without consent until it's reseeded.

The seed restores the plan, the credits, the applications, the CV, the career profile, the chat history, the feed items, the dates and the feed settings, and keeps the same login. It doesn't reset the notification switches or the profile photo, so undo steps 25 and 27 by hand. It touches only the reviewer's own rows and the shared feed postings keyed `reviewer-seed:`.

```
npx tsx scripts/seed-reviewer-account.ts \
  --base-url https://usefulapply.com \
  --email reviewer+<anthropic|openai>@usefulapply.com \
  --credentials-out <path outside the repo> \
  --remote --yes-production
```

The script only accepts `reviewer@usefulapply.com` or `reviewer+<label>@usefulapply.com`, and `--remote` needs `--yes-production`. It prints what it will do first. Run it from the repo root with a Cloudflare login that can write to the production database. Reuse each account's own `--credentials-out` file. If that file is missing or stale, the script deletes the account and creates it again with a new password, so update that portal afterwards.

Does the plan survive? Yes. The account is Max in the profile, the credits row and the subscriptions row, with no Stripe ids and `user_credits.subscription_status` empty.

- The daily cron sweep (`processOverdueMonthlyResets`) resets a paid row only when its `subscription_status` is `active` and its reset date is more than 3 days past. This row's status is empty, so the sweep never selects it.
- Stripe webhooks look users up by customer or subscription id. The reviewer has none, so no event can match it.
- Nothing refills credits automatically. When the balance runs low, re-run the seed. Credits are the only thing that drifts, so re-run it after each review round and before a resubmission.
