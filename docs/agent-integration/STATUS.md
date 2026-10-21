# MCP integration: status tracker

Last updated 2026-10-21, session 4 (in progress). The plan is `PLAN.md` (v3) in this folder; this file says what's done, what's in flight and what's left. A new session starts here.

## Resume here (session 4)

1. **Shipped in session 3:** #162 (refund reconciler, D1 LIKE limit), #159 (Discard data-safety fix), #163 (PR 5, the 43-tool MCP catalog; migration 0011 applied remote), #161 (submission pack, reviewer seed), #156 (/integrations, privacy and terms; MCP analytics kept 12 months) and the launch PR (`MCP_ENABLED=true`, footer link always shown, plugin install commands on /integrations). MCP is live at https://usefulapply.com/mcp.
2. **Live tests** after launch: every tool in MCP Inspector, Claude Code (plugin), the Claude.ai custom connector and ChatGPT developer mode, through Aside on Wasim's accounts. Artifacts in `verify/feature-mcp-launch/`.
3. **Wasim, when ready to submit:** run the reviewer seed against production (`scripts/seed-reviewer-account.ts`, full command in `submission/checklist.md`), then submit at claude.ai/directory/manage (connector and plugin) and in the OpenAI app directory (identity verification and `OPENAI_APPS_CHALLENGE` first).
4. **Follow-ups** as in "Left to do", plus: `rewrite_cv_section` returns its before/after text unwrapped while the other CV edit tools wrap it; no spec asserts the top-level `language` code in `get_cv` stays unwrapped; AGENTS.md still lists `/applications`, removed long ago.

**Kill switch:** set `MCP_ENABLED` to `"false"` in `wrangler.jsonc` and deploy. /mcp, the OAuth server and /integrations return 404. The footer "AI integrations" link stays (it can't read the var), so it would 404 too: drop it from `Footer.tsx` in the same change.

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
- **Tests:** `unified-writer-agent.claim-guard.test.ts` (8, now in `npm test`; nothing in CI runs it, the repo has no workflows) and a production-shaped rewrite in `e2e/mcp/02-happy-path.spec.ts` step 5c.
- **Second fix, `fix/rewrite-claim-guard-2`:** after #165 rewrites were still refused for ordinary words ("including"), because any word outside the 400-word `NEUTRAL_WORDS` list counted as a claim. The guard now decides by part of speech whether a word can carry a claim at all: claim words (`claim-vocabulary.ts`), then a generated EN/DE lexicon of verbs, qualitative adjectives, adverbs and function words (`claim-free-lexicon.generated.ts`, from Open English WordNet and Universal Dependencies via `scripts/build-claim-free-lexicon.ts`). Nouns, names and unknown words stay claims. Eval: `evals/results/2026-10-21-rewrite-claim-guard.md` (false refusals 23 to 10 of 52, misses 10 to 10 of 531). Claim-guard tests: 13.

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
  - Decisions: `update_notification_settings` drops the default CV template (it's browser-local only); `notify_tips`, `notify_updates` and `notify_weekly` aren't exposed (nothing reads them). CV undo keeps the current screening answers. A regenerated kit has no undo (the runner's atomic batch writes no history; the confirm question says so).
- **PR 6b:** plugin repo [wasimjalali/usefulapply-plugin](https://github.com/wasimjalali/usefulapply-plugin) created (public), PR #1 open there. OpenAI submission sheet, reviewer seed script and submission pack on `feature/mcp-distribution-pack` (not pushed yet); the seed runs locally only until launch.

## Done: merged and live in production

| PR | What | Production |
|---|---|---|
| #149, #150 | Plan v1 to v3; three-model plan review (Fable 5.1, GPT-6.1 Sol, DeepSeek Flash) in `evals/results/2026-10-20-mcp-plan-review.md` | docs |
| #151 | tsc excludes the frozen Devin eval harness | n/a |
| #152 | Structured cover letter: verified recipient (verbatim from the ad), no guessed titles in 7 languages, DACH and US rules, `cover_letter_language` saved | live |
| #153 | OAuth server (Better Auth 1.7.11 `mcp` + `cimd` + `jwt`), consent page, Connected apps (revoke, daily agent credit limit), scopes `read`/`write`/`spend`, consent-generation token binding, `/mcp` with `get_account` | live, **`MCP_ENABLED=false`** (all OAuth and MCP paths return 404) |
| #154 | Server-side export via Cloudflare Browser Run: ATS-readable PDF (tagged, embedded fonts, real text), new CV Word, US and DIN 5008 letters, 7 languages, all 6 templates single-column, fit pass, signed R2 links, web downloads switched | live |
| #157 | Hotfix: localized letter dates ("20. Oktober 2026") | live |
| #155 | Data integrity: revisioned writes, new client sync engine with sticky conflict notices, server-side `persistKit`, `agent_operations` with idempotency and single-flight, `agent-generation` queue plus DLQ, atomic reserve, refund and reconcile | live |

**Production version:** `0d6ac237` (recorded at deploy time).

**Production state:**
- **Migrations applied:** 0009, 0010 and 0011.
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

## In flight (branches pushed, not merged)

### PR 5: tool catalog, branch `feature/mcp-tool-catalog` (no GitHub PR opened yet)
- **State:** pushed at `2c9e4770`. Foundations only. **No catalog tools exist yet.** Nothing new is tested, and the web regenerate change has to pass the `data` project. `tsc` is clean.
- **Built:**
  - Migration `0011_application_edit_history.sql` adds `application_edit_history` and `agent_operations.result`. It's in the schema and journal but hasn't been applied anywhere.
  - `src/lib/services/edit-history.ts` keeps the last 10 prior versions with undo, with `cv.ts` writing through it, plus a 30-day cron cleanup.
  - `inline-operations.ts` and `fit-analysis.ts` provide idempotent paid in-call tools (fit, regenerate, section rewrite, screening). The sweeper knows about them.
  - The daily MCP spend cap is enforced in `reserveCredits`, and `enqueueKitGeneration` takes `input.spendLimit`.
  - **`/api/regenerate` now calls `src/lib/services/regenerate.ts`.** That changes the web route, so the `data` Playwright project must pass before merge.
  - The tool framework is in `src/lib/mcp/tools/{framework,errors,shared}.ts`, plus quotas and analytics modules.
  - Rate-limit namespaces 3150-3152 are added to `wrangler.jsonc`.
- **Next:**
  1. Apply 0011 locally and run the `data` project.
  2. Write the tool modules for the full catalog in PLAN.md section 4. That's 43 tools if `set_profile_photo` and `remove_profile_photo` count as one row, 44 if they count as two. Register them in `server.ts` and `TOOL_SCOPES`.
  3. Use the `list_applications` query already added to `sessions.ts`.
  4. Remove `test_write_stub` and update `e2e/mcp-oauth.spec.ts`, which asserts the tool list.
  5. Build a feed-settings service.
  6. Add the `mcp` Playwright project on ports 8798/18798, plus the fake-model additions (section rewrite, German parse) and the negative paths from PLAN.md section 7.
  - **Elicitation** only applies to clients on the 2026-07-28 protocol; legacy clients run the tool directly.
  - **Open question:** `update_notification_settings` says it covers the default CV template, but there's no backing store for that. Either add a `profiles` column in 0011 or drop it from the tool.

### Bug fixes, branch `fix/discard-and-short-jd` (no GitHub PR opened yet)
- **State:** pushed at `f7c359a6`. Both bugs are fixed. `tsc` is clean, eslint has 0 errors and `test:sync` passes.
  - The new fuzz case for bug 2 failed 59 of 2,000 seeds before the fix and 0 after; the seeds are logged in the sync-fuzz write-up.
  - Spec `b-stale-tab` (b3) and the new `e2e/specs/i-short-job-ad.spec.ts` pass.
  - Short ads on an application without a kit no longer replace its job description until the user picks a button.
- **Next:**
  1. Run the full `data` project, e.g. `E2E_PREVIEW_PORT=8814 FAKE_ANTHROPIC_PORT=18813 E2E_INSPECTOR_PORT=19377 npx playwright test --project=data`.
  2. Open the PR, review with Sonnet + Codex, merge and deploy.
  - Note: the test ad is 166 characters (the brief said 176).

- **Bug 2 (data safety, came in with #155):** on a conflict notice, Dismiss then Discard leaves the discarded text in the open editor with its base rebased, so Save overwrites the newer server version without a conflict.
  - Cause: `session-sync-engine.ts` `discardConflict` reuses `acknowledgeConflict(sessionId)`, and the panels only rebase.
  - Fix: pass a `discarded` flag; panels reset the draft like Cancel.
- **Bug 1 (predates today, since b4972e41):** a 176-character job ad gets "Pick a button" but no buttons.
  - Cause: `ChatPanel.tsx` `MIN_JOB_AD_CHARS = 200` silently drops the proposal.
  - Fix: an 80-character floor, a "this looks short" hint from 80 to 199, and a plain "too short" message below 80.

### PR 6a: `/integrations` page, privacy and terms, branch `feature/mcp-distribution-docs`, PR #156 (open)
- Round 1 review done and fixed. The page is gated behind `MCP_ENABLED`.
- **Merge only after PR 5**, so everything the page and legal text describe exists. Run round 2 (Sonnet + Codex, medium) right before merging.

## Left to do, in order

1. **Ship the bug fixes** on `fix/discard-and-short-jd`. Review: Sonnet + Codex. Then merge and deploy.
2. **Finish PR 5,** the tool catalog in PLAN.md section 4 (see its state above).
   - Review: Sonnet + Codex + Opus at high (it touches credits and spend), up to 3 rounds, then an Opus arbiter for any high left.
   - Migration `0011_application_edit_history.sql` is reserved for it.
   - Merge, apply 0011, deploy (tools stay off behind `MCP_ENABLED`).
3. **PR 6b, distribution:**
   - **Public plugin repo `wasimjalali/usefulapply-plugin`:** `.claude-plugin/plugin.json`, `marketplace.json`, `.mcp.json` pointing at `https://usefulapply.com/mcp`, and one `apply-to-job` skill. Run `claude plugin validate`.
   - **OpenAI app package:** manifest; the domain challenge route already exists in #156 (`/.well-known/openai-apps-challenge`, env `OPENAI_APPS_CHALLENGE`).
   - **Reviewer account seed:** verified email, credits, primary CV, one US and one German application with kits, feed consent, no MFA.
   - **Submission pack:** listing text (name, one-liner, description), 3+ example prompts, screenshots, privacy, terms and support URLs, reviewer credentials file (never in git).
4. **Merge PR 6a (#156)** after its round 2.
5. **Launch:**
   - set `MCP_ENABLED=true` in `wrangler.jsonc`;
   - make the footer "AI integrations" link unconditional (client-bundled footers can't read the flag);
   - add the `/plugin marketplace add` line on `/integrations`;
   - deploy;
   - live checks with the Claude.ai custom connector (every tool), Claude Code, MCP Inspector and ChatGPT developer mode.
6. **Wasim submits** at claude.ai/directory/manage (connector and plugin) and in the OpenAI app directory (identity verification first).

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
- **Run the model-evals sync** for the new write-ups: `python3 "$HOME/Desktop/Model Evals/tools/sync.py" --pr`.

## Needs Wasim (ask once, at the end)

- **PostHog analytics retention period:** the privacy policy and OpenAI's review need a number.
- **Marketplace submissions:** Anthropic and OpenAI accounts, plus OpenAI identity verification.
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
