# MCP integration plan: adversarial review by three models (2026-10-20)

## Question
Before building the Useful Apply MCP server (Claude connector, ChatGPT plugin and Claude Code plugin), what does an independent adversarial review find wrong with the plan?

## What ran
- **Subject:** `docs/agent-integration/PLAN.md` v1, including its sections 4a (exports) and 4b (ATS standard). These became sections 5 and 6 in v2. Repo at commit `52ae5f1f` plus the uncommitted plan.
- **Brief:** `2026-10-20-mcp-plan-review/brief.md`. Both models got the same brief.
  - It asks for code-verified findings with severity, plus a list of what's missing and a DISMISSED list.
  - Access was read-only.
  - It puts extra pressure on ATS and DIN 5008.
- **Fable 5.1** (`claude-fable-5-1`):
  - Command: `claude -p --model claude-fable-5-1 --output-format json --allowedTools "Read,Grep,Glob,Bash(ls:*),Bash(git log:*),Bash(grep:*),Bash(sed:*),Bash(cat:*),Bash(wc:*)" < brief.md`
  - Settings: Claude Code CLI defaults for effort and thinking. Date: 2026-10-20, 09:50 UTC start.
  - Run: 284 s model time (288 s wall clock), 17 turns, $3.95 (API pricing as reported by the CLI). About 18k output tokens, 8.3k of them thinking.
- **GPT-6.1 Sol, medium reasoning:**
  - Command: `codex exec -C <worktree> -s read-only -c model_reasoning_effort="medium" -o gpt-6-1-sol-medium.md - < brief.md`
  - Settings: model `gpt-6.1-sol` from `~/.codex/config.toml`, reasoning effort medium. Same date and start time.
  - Run: 254 s, 194.7k tokens, on the Codex subscription with no per-run charge.
- **DeepSeek Flash** (`deepseek-flash`, DeepSeek-V4.1-Flash) via the DeepSeek Harness.
  - The first attempt failed with `MISSING_CREDENTIAL`. The key existed, but the shipped `headless` profile disables the local credentials plugin, while the `web` profile enables it.
  - Fixed per run with a `--patch` overlay (`dsh-headless-credentials.patch.yml`), leaving Wasim's profiles unchanged.
  - Command: `DSH_PERMISSION_MODE=read-only dsh --profile headless --patch dsh-headless-credentials.patch.yml - < brief-deepseek-v2.md`
  - It reviewed plan **v2**, not v1, because it ran after the first two reviews were folded in. The brief adds a note to that effect.
  - Run: 493 s, harness default reasoning effort, on the DeepSeek API key (the harness reports no cost).
- **Aborted run:** a first run of both models was stopped after about 3 minutes because the ATS section was added to the plan mid-run. Its partial files are kept with the `aborted-run1-` prefix.

## Results
Raw output: `fable-5-1.md` (from `fable-5-1.json`), `gpt-6-1-sol-medium.md` and `deepseek-flash.md`.

| | Fable 5.1 | GPT-6.1 Sol (medium) |
|---|---|---|
| Findings | 17 (2 critical, 9 high, 6 low) | 17 (14 high, 3 low) |
| "Missing" items | 10 | 6 |
| Dismissed items | 11 | 9 |

**Both models found:**
- The print route can't load the CV photo, because the files route needs a cookie. Fix: render HTML on the server, inline the photo and call `quickAction("pdf", { html })`.
- The web client's 2-second wholesale sync will overwrite server-side or agent writes. Fix: a revision column and conditional updates.
- There is no job-level idempotency, so MCP retries and Queue redelivery can double-charge or re-run.
- `german-ats` DOM order puts the sidebar before experience, so ATS reading order breaks.
- Chromium doesn't set all the claimed PDF metadata, and tagged output isn't an ATS guarantee.
- The PR dependency table contradicted the prose.
- DIN 5008 was a sketch, not measurements. Both gave the Form B geometry.
- Prompt injection through job descriptions, and a looping agent draining credits.

**Only Fable found:**
- The Queue consumer isn't wired into OpenNext's `worker.ts`.
- The feed already has a leased-runner pattern to reuse.
- `premium-ats` supports a photo today, so a "never on US" rule would silently change a shipped template.
- `quickAction` doesn't run locally.
- The "EU" rules are really DACH rules.
- Revocation versus JWT lifetime.

**Only GPT-6.1 Sol found:**
- All 6 templates silently cut skills to 5 per group (`render-caps.ts`), so exports drop content. Verified.
- The cover letter "body" is already a full letter, so wrapping it duplicates the header. Verified in `cover-letter-prompt.ts`.
- Refund paths can lose a refund after a crash (`credits.ts:1420`, `:1472`).
- Chat CV and template tools only return client effects and don't persist.
- Annotations understated destructive effects.
- The OpenResume parser reads PDFs only.
- Browser Run's documented fonts include Arial and Georgia. The plan's rationale for self-hosting was wrong, but self-hosting stays for determinism.
- The cost figure mixed in session concurrency pricing.

**Adopted in a changed form:**
- Fable's point that the 45 s in-request wait is the wrong primitive was adopted as immediate return plus an optional wait of 20 s or less. Its required client idempotency key was adopted as is.
- Codex's "offer a single-column ATS default" was adopted as a recommendation in `list_cv_templates`, not as a removal of visual templates.

**My own catch while applying them:** the plan's US date format used an en dash, which the product's writing rules forbid. It now uses a hyphen.

## Conclusion
The plan's direction held: one MCP server, Better Auth OAuth, a service layer, Queue generation and a shared server renderer. The data-integrity and export layers did not hold. Without the reviews we would have shipped:
- agent edits silently lost to open tabs;
- possible double charges;
- photo-less German PDFs;
- a broken reading order in the German ATS template;
- exports still missing skills;
- duplicated letter headers.

Cost: $3.95 plus subscription usage.

## What changed
`PLAN.md` v2 adds:
- revisioned writes, and the web client taken off wholesale sync;
- an `agent_operations` table with required idempotency keys;
- atomic refunds and reconcile;
- a leased Queue consumer;
- HTML-in rendering with inlined assets, no print route;
- template fixes (no caps, DOM order, page breaks, fonts);
- a structured cover-letter contract;
- measured DIN 5008 Form B;
- per-tool scopes and revocation;
- injection wrapping;
- a daily MCP spend cap;
- 16 more tools (40 total, up from 24);
- spikes before PR 1 and the renderer;
- a negative-path E2E suite;
- an ATS eval with a baseline and a manual real-ATS check.

## Third review: DeepSeek Flash on plan v2

- **Counts:** 16 findings (4 critical, 10 high, 2 low), 7 "missing" items and 15 dismissed.
- **What it found that the first two reviews didn't, verified by the orchestrator where checkable:**
  - **CIMD on Workers needs a pinned, redirect-refusing transport.** Better Auth's CIMD security boundary covers this, and a simple size and time cap isn't enough.
  - **A `confirm: true` argument is set by the model,** so a hostile job description can defeat it. Replaced by client approval (`destructiveHint`), MCP elicitation where supported, and an `undo_last_edit` tool.
  - **CSS `order` changes paint order,** so PDF text order would still follow it. Fix: grid column placement. `modern-professional` is a second sidebar-first template. Verified at `USModernATSTemplate.tsx:175-190`.
  - **Fixed template widths plus `@page` margins would clip A4 overrides or double the margins.** Today's 12 px body is 9 pt, not 9.5 pt.
  - **DIN 5008 zones:** the recipient starts in the Anschriftzone at about 62.7 mm, not at 45 mm. The Informationsblock and fold marks were missing.
  - **Idempotency still relied on clients reusing keys.** Now there's also a dedupe on input hash within 10 minutes.
  - **Persist, capture and cancel weren't one atomic state machine,** and other routes also write the kit columns.
  - **Free but costly operations had no quota:** CV parse, screening answers and Browser Run exports.
  - **Loopback redirects need Better Auth's `infer` application type,** not exact match.
  - **`cv-tools.ts` imports `render-caps.ts`,** which PR 3 changes.
  - **Every template uses an en dash in date ranges.** Verified.
  - **Missing tools:** add a CV item, a hide toggle, notification settings, answers export and a cover letter layout preview.
- **Where it corrected an earlier review:** it showed that `premium-ats` accepts `photoUrl` but never renders it. That contradicts Fable's finding 7. Verified, so the US templates already follow the no-photo norm.
- **What was wrong or not adopted:**
  - Its tool count of 39 counted the photo row as one tool. The real count is 40 for v2 and 44 for v3.
  - It also said Greenhouse's upload cap is 100 MB with 2.5 MB as a parse target. Adopted as wording only.
- **What changed:**
  - `PLAN.md` v3.
  - The running builders for PRs 1-4 got the relevant deltas by message the same hour:
    - PR 1: CIMD transport, loopback.
    - PR 2: dedupe, atomic success, all writers, hygiene.
    - PR 3: grid order, paper and margins, server rendering, DIN zones, hyphens, `cv-tools.ts`, hide flag, letter locale, answers export, preview.
    - PR 4: recipient handling, persisting `cover_letter_language`.
- **Cost of all three reviews:** $3.95 (Fable via the API), plus Codex subscription usage, plus DeepSeek API usage (not reported by the harness).
