# MCP integration: status tracker

Last updated 2026-10-25, session 5. The plan is `PLAN.md` (v3) in this folder; this file says what's done, what's in flight and what's left. A new session starts here.

## Resume here (session 5)

1. **Live since 2026-10-21:** 43 tools at https://usefulapply.com/mcp, the Claude Code plugin ([wasimjalali/usefulapply-plugin](https://github.com/wasimjalali/usefulapply-plugin)) and /integrations. Production on 2026-10-25: Worker version `7121506b`, migrations through 0015 applied.
2. **Submission pack is current** (session 5): `submission/` and `openai/` match the live catalog, the submission docs as read on 2026-10-25, and OpenAI's new ZIP flow (`openai/package/`).
3. **Wasim, to submit:** the production reviewer seed is done (2026-10-25, `reviewer+anthropic@` and `reviewer+openai@`, see `submission/checklist.md`). The interview date (5 days out) and the feed matches (24 hours) go stale, so re-run the seed right before each review window. Then the connector and plugin at claude.ai/directory/manage, then the OpenAI app at platform.openai.com/plugins (identity verification and `OPENAI_APPS_CHALLENGE` first).
4. **Done 2026-10-25:** the privacy policy names date of birth and nationality and states PostHog retention (usage events 12 months, session recordings 30 days).
5. **Follow-ups** as in "Follow-ups", plus: `rewrite_cv_section` returns its before/after text unwrapped while the other CV edit tools wrap it; no spec asserts the top-level `language` code in `get_cv` stays unwrapped.

**Kill switch:** set `MCP_ENABLED` to `"false"` in `wrangler.jsonc` and deploy. /mcp, the OAuth server and /integrations return 404. The footer "AI integrations" link stays (it can't read the var), so it would 404 too: drop it from `Footer.tsx` in the same change.

## Session 6 (2026-10-25): feed data and settings parity

- PR `feature/feed-data-mcp-parity`: two new tools, `update_feed_searches` and `regenerate_career_profile` (45 tools: 13 read, 26 free writes, 6 spend; 20 destructive). `update_feed_settings` takes every feed setting and a required `revision`; `run_job_feed` takes optional `queries`. Production `tools/list` returns 45 once that PR is deployed; re-run the catalog drift check and the reviewer seed before the next review window.

## Session 5 progress (2026-10-25): submission prep

- **Catalog drift check.** Production `tools/list` (over the plugin's live OAuth connection) returned the same 43 names as `TOOL_SCOPES`: 13 read, 24 free writes, 6 spend. Hints rechecked in code: 19 destructive, `run_job_feed` the only open-world tool. `update_notification_settings` takes only `followUpDue` and `interviewTomorrow` (#194 removed `marketing` and `creditsLow`); none of the pack named the removed fields. #197 (`employmentTypes` on `update_feed_settings`, a job URL on create and update must be http or https) was still open and not deployed; nothing in the pack names those fields, so nothing changes when it ships.
- **Drift fixed in the pack:** the authorization server metadata URL (`/.well-known/oauth-authorization-server/api/auth`; the bare path is 404, correct for an issuer with a path), the OpenAI flow (now a ZIP upload, package in `openai/package/`), the Anthropic plugin flow (portal "Plugin bundle", GitHub connection, data handling, four acknowledgements), the icon (`public/useful-apply-logo.png`), and every "open until launch" status.
- **Plugin repo:** matches the live catalog, `claude plugin validate` passes. No PR needed.
- **Production, read-only:** `/mcp` 401 with `WWW-Authenticate` (resource metadata and scopes), protected resource and authorization server metadata 200, `/integrations`, `/privacy`, `/terms`, `/auth/login` 200, `/.well-known/openai-apps-challenge` 404 (secret not set yet). MCP Inspector CLI reached production and stopped at OAuth, which needs a person at the keyboard; the authenticated list came from the plugin connection.
- **Reviewer seed after 0015:** fresh local D1 (all 15 migrations), preview on 8797, two runs as `reviewer+local@usefulapply.com`, both exit 0 (the second reused the account). Rows: verified email, Max, 200 credits, `subscription_status` NULL, 1 subscription, Halcyon applied and Fjordwerk interview (both kits succeeded), 1 CV, 8 chat messages, 5 ranked feed items, a career profile. The production run is the next bullet.
- **Production reviewer seed:** on 2026-10-25 around 00:45 CEST, with Wasim's yes, from main at `ec8c6020`: `reviewer+anthropic@usefulapply.com` and `reviewer+openai@usefulapply.com`, both exit 0. A read-only D1 check showed the same rows as the local run for each, plus no Stripe id. Credentials in `~/Documents/usefulapply-reviewers/` (mode 0600, outside the repo).
- **MCP E2E:** `E2E_MCP=1 npx playwright test --project=mcp` on main at `a757d2c1` (after #194), through the heavy lock: 125 passed in 10.8 minutes, including `01-catalog` (tools/list equals `TOOL_SCOPES`) and `98-every-tool-is-called`. Report: `verify/fix-mcp-submission-pack/playwright-report/` in the main checkout. A first attempt was stopped by the lock at 18% free memory while another session's suite ran; the rerun waited for it.
- **Privacy gaps found:** see Resume here, item 4.

## Session 4 progress (2026-10-21)

**Live tests after launch (production, Worker `3fe2c059`):**
- **MCP Inspector CLI:** 43 tools listed, schema 0 errors, 109 portability warnings across 28 tools.
- **Raw MCP client over real OAuth** (Wasim's account, through Aside): 38 of 43 tools pass. The other 5 (`save_cv`, `delete_cv`, `set_profile_photo`, `remove_profile_photo`, `withdraw_feed_consent`) would destroy real data, so they run on a throwaway account.
  - Every edit was undone, both test applications deleted, and the feed, profile and notification settings were written back unchanged.
  - Credits 293.5 to 290.5: fit 0.5, kit 1.5, follow-up regen 0.5, feed fit 0.5. A cancelled kit released its 2 reserved credits.
  - Side effects: that day's feed run was used (30 fetched, 20 ranked) and one job was rated helpful.
- **Exports:** all 7 formats returned 200 and were checked by eye (`verify/feature-mcp-launch/live-export-*`, renders in `render/`). Fonts embedded, no overlap or clipping. Two findings:
  - the CV contact line shows `wasimjalali.com` twice (PDF and Word);
  - the screening answers state an unsupported claim ("a 100 % improvement in recall") and an invented notice period.

**Bug found live, fixed on `fix/rewrite-claim-guard`:** `rewrite_cv_section` refused every rewrite as `unsupported_claim` (0 credits). The web app's CV section rewrite (`/api/regenerate`) shares the path and was broken too.
- **Cause:** `introducedClaims()` checked every word of the rewritten section against the CVs only. The kit writer paraphrases ("Tested" in the CV becomes "evaluated" in the summary), so any rewrite that kept the kit's wording was refused. The number guard had the same blind spot.
- **Fix:** a word the section already holds isn't counted as introduced, and neither is an inflection of one ("evaluating" from "evaluated"). A bare root needs the exact word ("Goes beyond" can't back the language "Go"), and role and title words ("lead", "manager", "architects", "VP" and so on) always do. "went", "goes", "going" and "gone" are neutral; bare "go" isn't.
- **Numbers are unchanged:** the section backs none. Three review rounds found ways for every section-based number rule to move a kit number onto a new metric, so a number only the section has makes the rewrite refuse. That costs a retry, not credits.
- **Round 3, narrow fix on `fix/rewrite-claim-guard-narrow` (replaces the part-of-speech lexicon of #170, rejected after two review rounds):** `isNeutral` now also frees an inflection of a listed word by its stem ("including" from "included"; never a role word, never "featured" or "sentenced"), and the closed class words of the output language (prepositions, conjunctions, articles, pronouns, auxiliaries, particles; 137 English, 220 German, from UD 2.18) need no backing, in lowercase or opening a prose sentence, never as a name or list item. Nothing main refuses passes: 0 new misses on 531 + 14,911 injections and 190 reviewer probes. No stored rewrite changes verdict (19 false refusals of 52, before and after): the words this frees were not what refused them. A model-based claim check is the next PR. Write-up: `evals/results/2026-10-21-rewrite-claim-guard.md`.
- **Tests:** `unified-writer-agent.claim-guard.test.ts` (23, now in `npm test`; nothing in CI runs it, the repo has no workflows) and a production-shaped rewrite in `e2e/mcp/02-happy-path.spec.ts` step 5c.

**Job feed, no scheduler (decided by Wasim, 2026-10-21):** the feed is user-triggered by design. The user in the web app, or `run_job_feed`, starts at most one run a day; nothing runs on a schedule. That's why every production run is `manual_user`. AGENTS.md now says so, and the MCP tool descriptions no longer claim the feed "runs by itself".

**#166 merged and deployed (Worker `69de1834`):** `nextRunAt` was different on every call while a run was in flight (each call's seconds carried over) and ignored the 20-hour floor. Now stable and equal to the gate's time; verified live on Wasim's account (two calls, same `2026-10-22T11:04:03.275Z`).

## Session 3 progress (2026-10-21)

- **#162 merged** (not deployed yet, ships with #159): the refund reconciler's `LIKE 'Released reservation <id>%'` was 58 bytes, over D1's 50-byte LIKE limit, so the daily cron threw whenever a released reservation existed. Now `instr()`, and zero-amount reservations are skipped. Reviewed by Sonnet + Codex + Opus (high), 0 high, 2 lows fixed.
- **#159:** round 3 fix pushed (3f5a250e; fuzz before/after H1 405→0, H2 122→0, H3 328→0; `data` 27/27). Round 3 review: Codex 1 high (partial Discard leaves the discarded document in the editor's lineage), confirmed real by an Opus arbiter; Sonnet 6 lows. Fix in progress by the Opus debugger in `.claude/worktrees/fix-159`.
- **PR 5:** `mcp-tools/e2e` merged in; PLAN says 43 tools. Full `data` + `oauth` + `mcp` with the expiry test: 130/130. `mcp-exports`: 3/3 after a fix (a seven-format export hit the 6-per-minute render limit on its 7th file; only PDFs, which use Browser Run, now count). `d14` passes inside the `d` scenarios spec.
- **Plugin PR #1 merged** after two Sonnet rounds.
- **#161:** listing, reviewer guide, checklist and OpenAI sheet updated to the 43 tools (95b71396). Open item for its review: the seed doesn't reset notification switches or the photo, and the seeded tailored CVs have no projects. (`give_job_feedback` is now destructive and confirms dismissals, fixed in PR 5 round 1.)
- **Learned:** a new worktree needs `.dev.vars` copied (plain `cp`) or every preview returns 500 on the OAuth metadata route; Playwright needs `npx playwright install ffmpeg` for the video-recording specs.

## Session 2 progress (2026-10-20)

- **#160 merged:** the lockfile was out of sync with `package.json` (not a better-sqlite3 peer conflict). A plain `npm ci` works again; `--legacy-peer-deps` is no longer needed.
- **#159 (`fix/discard-and-short-jd`):** opened. Round 1: Codex 2 highs, Sonnet 6 lows; fixed in 849012b7 (fuzz: 563 of 2,000 seeds failing before, 0 after; `data` 27/27). Round 2: 3 new highs and 6 lows (see Resume here).
- **PR 5 (`feature/mcp-tool-catalog`):** all 44 tools built by five workers in parallel and merged into the branch (`account`, `applications`, `cv`, `spend`, `feed`, `profile` modules under `src/lib/mcp/tools/`, registered through `catalog.ts`). `run_job_feed` now queues the run on `agent-generation` (message `{ kind: 'job_feed_run', userId, runId }`) and returns at once; kits queued by `apply_to_feed_job` finalize the feed row. tsc 0, eslint 0 errors. Not yet run end to end.
  - Decisions: `update_notification_settings` drops the default CV template (it's browser-local only); the unused `notify_tips`, `notify_updates` and `notify_weekly` columns were dropped. CV undo keeps the current screening answers. A regenerated kit has no undo (the runner's atomic batch writes no history; the confirm question says so).
- **PR 6b:** plugin repo [wasimjalali/usefulapply-plugin](https://github.com/wasimjalali/usefulapply-plugin) created (public), PR #1 open there. OpenAI submission sheet, reviewer seed script and submission pack on `feature/mcp-distribution-pack` (not pushed yet); the seed runs locally only until launch.

## Done: merged and live in production

| PR | What | Production |
|---|---|---|
| #149, #150 | Plan v1 to v3; three-model plan review (Fable 5.1, GPT-6.1 Sol, DeepSeek Flash) in `evals/results/2026-10-20-mcp-plan-review.md` | docs |
| #151 | tsc excludes the frozen Devin eval harness | n/a |
| #152 | Structured cover letter: verified recipient (verbatim from the ad), no guessed titles in 7 languages, DACH and US rules, `cover_letter_language` saved | live |
| #153 | OAuth server (Better Auth 1.7.11 `mcp` + `cimd` + `jwt`), consent page, Connected apps (revoke, daily agent credit limit), scopes `read`/`write`/`spend`, consent-generation token binding, `/mcp` with `get_account` | live, `MCP_ENABLED=true` since 2026-10-21 |
| #154 | Server-side export via Cloudflare Browser Run: ATS-readable PDF (tagged, embedded fonts, real text), new CV Word, US and DIN 5008 letters, 7 languages, all 6 templates single-column, fit pass, signed R2 links, web downloads switched | live |
| #157 | Hotfix: localized letter dates ("20. Oktober 2026") | live |
| #155 | Data integrity: revisioned writes, new client sync engine with sticky conflict notices, server-side `persistKit`, `agent_operations` with idempotency and single-flight, `agent-generation` queue plus DLQ, atomic reserve, refund and reconcile | live |

**Production version:** `7121506b` (2026-10-24).

**Production state:**
- **Migrations applied:** all, through 0015 (checked 2026-10-25).
- **Restore bookmarks:**
  - before 0009: `00002253-00000000-0000510a-3d0903b46b16d2719196570752add4b2`
  - before 0010: `00002277-00000000-0000510a-8009d4a7e5b3e2de94c26df59b2e0315`
  - before 0011 (2026-10-21, session 3): `000022fb-00000000-0000510b-b2fb610efe00565f2843d3e573f3a49b`
- **Secrets set:** `EXPORT_SIGNING_SECRET`.
- **Queues created:** `agent-generation`, `agent-generation-dlq`.

**Live checks run on Wasim's account, all passing:**
- the structured German letter;
- exports (PDF/Word/letter text, fonts, A4, tags, clean links, DIN block);
- the save path (edits persist, server-saved kit survives reload, two-tab conflict notice, exactly 2.0 credits);
- sessions survive the Better Auth upgrade.

**Evidence and evals:**
- `evals/results/2026-10-20-ats-export.md`: before, 0 of 870 items extractable; after, all, in 6 extractors including Apache Tika.
- `evals/results/2026-10-20-structured-cover-letter.md`
- `evals/results/2026-10-20-sync-fuzz.md`
- `verify/<branch>/` in the main checkout.

## Left to do, in order

Everything from the old "In flight" and "Left to do" lists (the Discard and short-ad fixes, PR 5, PR 6a and 6b, the launch) has shipped; git history has the old text.

1. **Production reviewer seed:** done on 2026-10-25, one account per portal. Re-run it right before each review window: the interview date (5 days out) and the feed matches (24 hours) go stale.
2. **Wasim submits** at claude.ai/directory/manage (connector, then plugin) and at platform.openai.com/plugins (identity verification and `OPENAI_APPS_CHALLENGE` first).

## Follow-ups (smaller, any time)

- **Export polish from the last judge pass:**
  - French narrow space before a colon in the Projets line;
  - natural es/fr degree lines ("Grado en Ingeniería Informática");
  - a 1-2 px SKILLS heading offset in modern-professional;
  - a lone "Kafka)" wrap;
  - rebuild the baseline for the 11 newer fixtures.
- **ATS eval as a pre-deploy gate** for changes to templates, export or print CSS.
- **`npm ci` fails on main** (better-sqlite3 12 vs 13 peer conflict; lockfile drift). Fix the lockfile and the peers so a plain `npm ci` works. Until then use `npm ci --legacy-peer-deps`.
- **Drop `account.issuer`** in a later migration (Better Auth 1.7.3+ never writes it; it has a default today).
- **Update AGENTS.md:**
  - `src/lib/services/`, the client sync engine, `e2e/` with `npm run test:e2e` and `npm run test:sync`;
  - queues, migrations 0009 to 0011, the export service and Browser Run, `MCP_ENABLED`;
  - the credit table (a kit after a fit check is 1.5, not 2.0).
- **Run the model-evals sync** for the new write-ups: `python3 "$HOME/Developer/model-evals/tools/sync.py" --pr`.

## Needs Wasim (ask once, at the end)

- **Reviewer seed re-run:** a yes in session right before each review window.
- **Marketplace submissions:** Anthropic and OpenAI accounts, OpenAI identity verification, a GitHub connection on claude.ai for the plugin.
- **Uninstall CodeRabbit:** github.com/settings/installations, then CodeRabbit, Configure, Uninstall.
- **Optional:** add `MCP_ENABLED=true` and `EXPORT_SIGNING_SECRET=` to `.dev.vars.example` (hooks block agents from that file).

## How we work on this (learned in session 1)

- **Reviews:** sensitive PRs get Sonnet + Codex (`codex exec -s read-only`, high) + Opus, split by area so every file has one owner; at most 3 rounds, then an Opus arbiter; lows are always fixed.
- **Design work:** a clean Opus judge (`claude -p --setting-sources "" --disable-slash-commands`, Read only, screenshots only) plus Wasim. Copy the latest parity images from the worker's worktree `verify/` into the main checkout's `verify/` before judging; a stale copy gave one false verdict.
- **Type check:** use `npx tsc --noEmit --incremental false`. In a long-lived worktree, `npm ci --legacy-peer-deps` first: stale `node_modules` from before a dependency change makes tsc recurse until it runs out of memory.
- **Deploy:** order is migration (with a time-travel bookmark first), then deploy from the main checkout after `npm ci --legacy-peer-deps`, then a smoke check, then a live check on Wasim's account through Aside.
- **Secrets:** create them with `openssl rand -hex 32 | npx wrangler secret put NAME`, so no value is ever shown.
- **Ports:** oauth 8791 (plus 8792, 8796, 8799 spawned by its spec), data 8794 with fake Anthropic on 18793, exports dev 8793, tool catalog 8798 and 18798. Workers kill only their own processes.
- **DeepSeek CLI:** `dsh --profile headless` can't see the API key unless you pass `--patch <file>`, where the file contains `- id: credentials` / `name: '@deepseek-ai/dsh-credentials-local'` / `disabled: false`. A copy is at `evals/results/2026-10-20-mcp-plan-review/dsh-headless-credentials.patch.yml`.
