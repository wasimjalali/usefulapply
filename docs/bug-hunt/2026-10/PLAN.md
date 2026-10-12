# Engine bug hunt: plan (2026-10-12)

Run it in a fresh session. Paste the kickoff prompt at the bottom.

## Goal

Find and fix the bugs a real user would hit in Useful Apply. The focus is the engine: kit generation, prompts, what gets rendered and every screen the user sees on desktop. Auth gets a smaller, targeted pass. Every bug found gets a written finding with a repro, a fix in a PR, and a check that proves it's fixed.

Out of scope: mobile layouts (not a target), marketing pages beyond broken links, new features, refactors with no user-facing bug behind them.

## Starting point

- Production generates with Claude Sonnet 5.5 since PR #136 (see `evals/results/2026-10-12-sonnet-46-vs-55.md`). The open items from that work are listed under "Follow-ups from the Sonnet 5.5 switch" below. They're known work, not findings to rediscover.
- Kit documents now fail independently and length is a prompt standard rather than a failure (branch `feature/isolated-kit-failures`). If that PR isn't merged and deployed when this session starts, finish it first.
- There's no Playwright suite in the repo. Phase 4 adds one for the core journeys; it is the repeatable artifact of this hunt.

## Follow-ups from the Sonnet 5.5 switch

Work these as their own fix batches in phase 4, alongside the hunt's findings. Each goes through the change loop.

1. **Fit-score recalibration.** Sonnet 5.5 scores fit 5 to 23 points higher than 4.6 on the same input; a junior synthetic CV showed "95% Strong fit" live. Re-derive the 85/70/55 bands (fit prompt, system prompt, `computeFitLevel`) from the eval's 5.5 score distribution, or anchor the prompt with calibrated examples. Prompts row: `agent-expert`.
2. **`skill_matching` bait handling.** The unchanged `skill_matching` prompt marks requirements the CV lacks as claimable on every model, and that feeds the fit text and the letter allow-list. Fix the prompt, then rerun the eval's bait cases (syn-02, 04, 07, 10, 12, 14, 15) with `evals/run-eval.ts` and compare.
3. **Structured outputs.** Replace the "respond with ONLY valid JSON" suffix and the brace scanner with `output_config.format` JSON schemas on every JSON task (CV, emails, extraction). Check Sonnet 5.5 support in the current Anthropic docs first.
4. **Native PDF parse path on 5.5.** Type-checked only. Run a real PDF and a DOCX through `/api/parse-cv` on production or local and confirm the Sonnet 5.5 request shape works.
5. **Banned-phrase lists.** Optional: an ablation of the cover-letter banned-phrase lists, and the validator phrases missing from the prompt (see `evals/prompt-variants/sonnet55/CHANGES.md`).
6. **Email subjects built in code.** Optional now that length no longer fails a document: build the subject from the localized prefix, the role title and the applicant name in code, so subjects stay consistent and under 60 characters without relying on the model.
7. **Watch production after the switch.** Check the LLM ledger and PostHog for availability or start-date lines in emails (the one fabrication class 5.5 showed in the eval) and for the retry rate per email task since the parser change. Report numbers in `REPORT.md`.
8. **Open decision for Wasim, not code:** when evals and judges run on subscription agents versus the paid Anthropic API credit (the Opus API judge cost $74 in the 5.5 eval).

## Phases

1. **Setup (orchestrator, about 20 min).** Local dev with local D1, R2 and KV bindings (`SETUP.md`), a seeded test account with a primary and master CV (synthetic, from `evals/dataset/cvs/`), `npm install -D @playwright/test` (the repo has no Playwright yet; add a minimal `playwright.config.ts` in a setup PR) and `npx playwright install chromium`. Confirm one end-to-end kit generates locally before starting the fleet.
2. **Hunt (fleet, read-only plus live checks).** Each agent owns one area below, reads the code, runs the flows that touch it and writes findings to `docs/bug-hunt/2026-10/<area>.md` in the shared schema. Agents don't fix in this phase.
3. **Triage (orchestrator, Opus).** Merge all findings, dedupe, confirm every high and critical with a repro, drop what doesn't reproduce, group the rest into fix batches by file ownership. One table: `docs/bug-hunt/2026-10/TRIAGE.md`.
4. **Fix (fleet, worktrees).** One worker per batch, each in its own worktree with its own files. Each fix ships with the check that proves it (a Playwright spec for anything a user can see, a scripted repro otherwise). Then the change loop: PR, reviews by row (sensitive batches get Sonnet + Codex + Opus at high), merge one at a time, deploy with `npm run deploy:cf` from `main` (a merge alone changes nothing on usefulapply.com), verify on production.
5. **Close.** Playwright suite green on the merged main, a dated write-up `docs/bug-hunt/2026-10/REPORT.md` (found, fixed, deferred with reasons, cost), memory updated.

## Fleet (phase 2)

Up to 10 agents at once locally, so it runs as two waves. Live checks against the local dev server take turns (shared ports and local D1); static reading runs in parallel.

| # | Area | Owns (main paths) | Agent, model, effort | Wave |
|---|---|---|---|---|
| 1 | Generation engine and SSE | `src/app/api/agent-v2/`, `src/lib/agents/unified-writer-agent.ts`, `context-builder.ts`, `src/hooks/useAgentV2.ts`, `AgentProgressV2.tsx` | `debugger` (Opus, high) | 1 |
| 2 | Prompts, validators and output quality (EN and DE) | `src/lib/agents/prompts/`, validators in the writer agent, `src/lib/cv-parser/` | `agent-expert` (Opus, high), may reuse `evals/` on synthetic cases | 1 |
| 3 | CV rendering and PDF export | `src/components/cv-templates/`, `src/lib/cv-templates/`, `EditableCVCanvas.tsx`, `CVPanel.tsx`, `src/lib/cv-structure/` | `sonnet-sweeper` (high), Playwright screenshots of all 6 templates in EN and DE | 1 |
| 4 | Kit panels and regenerate | `CoverLetterPanel.tsx`, `EmailPanel.tsx`, `src/components/kit/`, `src/app/api/regenerate/`, `src/lib/regenerate-client.ts` | `sonnet-sweeper` (high) | 1 |
| 5 | CV upload and parsing | `FileUpload.tsx`, `CVInputZone.tsx`, `src/app/api/parse-cv/`, `src/app/api/files/`, `src/lib/cv-upload-limits.ts`, `src/lib/storage/` | `sonnet-sweeper` (high), real PDF, DOCX and photo uploads | 1 |
| 6 | Session state and sync | `src/store/`, `src/hooks/useSupabaseSync.ts`, `src/lib/open-session.ts`, KV context cache | `debugger` (Opus, high) | 1 |
| 7 | Credits on generation | `src/lib/credit-costs.ts`, `src/db/repos/credits.ts`, refund-on-failure paths, `src/lib/anonymous-generation.ts` | Opus subagent (high), sensitive | 1 |
| 8 | Dashboard, applications and tracker | `src/app/dashboard/`, `src/components/tracker/`, `src/app/api/tracker/`, `src/components/shell/` | `sonnet-sweeper` (high) | 2 |
| 9 | Chat | `ChatPanel.tsx`, `src/components/chat/`, `src/app/api/chat/` | `sonnet-worker` (medium) | 2 |
| 10 | Job feed | `src/lib/job-feed/`, `src/app/api/job-feed/`, `src/components/job-feed/` | `job-feed-specialist` (Sonnet, high) | 2 |
| 11 | Auth and sessions | Better Auth config, `src/app/api/auth/`, `src/app/auth/`, session checks in every API route | Codex Sol (high, read-only) plus `sonnet-sweeper` for live sign-up, sign-in, OAuth, reset | 2 |
| 12 | API route pattern | every `src/app/api/**/route.ts`: session auth, rate limit, input length limits, generic errors | Codex Sol (high, read-only) | 2 |
| 13 | Golden journeys, live | Playwright on local dev, desktop: sign up, upload CV, paste JD, fit check, generate kit, edit CV, regenerate letter, export PDF, tracker | `ui-tester` (Sonnet), one EN run and one DE run | 2 |

Codex rows run only if Codex has credits; otherwise an Opus subagent takes the slot and the report says so.

## Finding schema

Every finding, in each area file:

```
### <area>-<n>: <one-line title>
- Severity: critical | high | medium | low
- Where: file:line (and the screen, if visible)
- Repro: exact steps or input, starting state, account
- Expected / Actual
- Evidence: screenshot or log path under the main checkout's `verify/bug-hunt/` (never only in a worker worktree, which is deleted after merge)
- Suspected cause and suggested fix (optional)
```

Severity: critical = data loss, wrong charge, security, or a kit that can't be generated; high = a core flow broken or wrong output shown to the user; medium = a workaround exists or a secondary flow; low = cosmetic. A finding without a repro can't be high or critical.

## Cost

- Agents run on the subscription. No Anthropic API credit except real generations through the app.
- Each local kit costs about $0.21 on the Anthropic credit (Sonnet 5.5). Cap live generations at 60 for the whole hunt (about $13), tracked by the orchestrator. Prefer synthetic CVs.
- No Stripe charges. Credit checks use the local D1 and test accounts.

## Exit criteria

- Every critical and high fixed, merged, deployed and verified on production.
- Every medium fixed or deferred with a reason in `TRIAGE.md`.
- Lows fixed per the change loop.
- Playwright suite for the golden journeys checked in and green, HTML report in the main checkout's `verify/bug-hunt/`.
- `REPORT.md` written with counts per area and severity, which agent and model found what, and spend.

## Kickoff prompt for the new session

> Run the engine bug hunt in `docs/bug-hunt/2026-10/PLAN.md` in this repo. Follow it phase by phase: setup, hunt with the fleet in two waves, triage, fix in worktrees through the change loop, close. Opus orchestrates and checks every result before it lands. Use Codex Sol for rows 11 and 12 if it has credits. Cap live generations at 60. Report at the end per the global final-report rule.
