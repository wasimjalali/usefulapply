# MCP integration plan: adversarial review by three models (2026-10-20)

## Question
Before building the Useful Apply MCP server (Claude connector, ChatGPT plugin and Claude Code plugin), what does an independent adversarial review find wrong with the plan?

## What ran
- **Subject:** `docs/agent-integration/PLAN.md` v1, including sections 4a (exports) and 4b (ATS standard). Repo at commit `52ae5f1f` plus the uncommitted plan.
- **Brief:** `2026-10-20-mcp-plan-review/brief.md`. Both models got the same brief.
  - It asks for code-verified findings with severity, plus a list of what's missing and a DISMISSED list.
  - Access was read-only.
  - It puts extra pressure on ATS and DIN 5008.
- **Fable 5.1** (`claude-fable-5-1`):
  - Command: `claude -p --model claude-fable-5-1 --output-format json --allowedTools "Read,Grep,Glob,Bash(ls:*),Bash(git log:*),Bash(grep:*),Bash(sed:*),Bash(cat:*),Bash(wc:*)" < brief.md`
  - Run: 288 s, 17 turns, $3.95 (API pricing as reported by the CLI). About 18k output tokens, 8.3k of them thinking.
- **GPT-6.1 Sol, medium reasoning:**
  - Command: `codex exec -C <worktree> -s read-only -c model_reasoning_effort="medium" -o gpt-6-1-sol-medium.md - < brief.md`
  - Run: 254 s, 194.7k tokens, on the Codex subscription with no per-run charge.
- **DeepSeek Flash** via the DeepSeek Harness (`dsh --profile headless`, model `deepseek-flash`): blocked. The harness had no `DEEPSEEK_API_KEY` stored. It runs once Wasim adds the key, and its results get appended here.
- **Aborted run:** a first run of both models was stopped after about 3 minutes because the ATS section was added to the plan mid-run. Its partial files are kept with the `aborted-run1-` prefix.

## Results
Raw output: `fable-5-1.md` (from `fable-5-1.json`) and `gpt-6-1-sol-medium.md`.

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

**Rejected or adjusted:**
- Fable's "make spending need an explicit client key" was kept. Its "45 s wait is wrong" was adopted as immediate return plus an optional wait of 20 s or less.
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
- 13 more tools (41 total);
- spikes before PR 1 and the renderer;
- a negative-path E2E suite;
- an ATS eval with a baseline and a manual real-ATS check.
