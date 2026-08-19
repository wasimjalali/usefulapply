# Build plan: the UX redesign, flows 1 to 7

**Written:** 19 August 2026, after all seven flows were locked.
**Roles:** Grok 4.6 (Grok CLI, reads `AGENTS.md`) is the **implementer**. Claude Code is the **orchestrator and verifier**: it reviews Grok's work, fixes findings, runs the checks, commits, pushes and opens the PR. Wasim kicks off each Grok session and reports back to Claude when Grok says it's done.

## The loop, per batch

1. Wasim pastes the batch's **kickoff prompt** into a fresh Grok 4.6 session in this repo.
2. Grok reads `BUILD-PLAN.md`, then its `batch-N-*.md`, then the flow docs and PNGs it names, and implements on the batch branch. **Grok does not commit or push.** It ends with the report format below.
3. Wasim pastes Grok's report into the Claude session.
4. Claude verifies: `npx tsc --noEmit`, `npm run lint`, the `ui-tester` agent against the flow PNGs, a read of the diff against the flow doc and `design-philosophy.md` rules, `/code-review` (Wasim runs it), the adversarial review where the batch touches auth, credits or data. Claude fixes findings itself (small) or writes a **follow-up prompt** for Grok (large) and the loop repeats from step 1 with that prompt.
5. When clean: Claude commits (conventional commits), pushes the branch, opens the PR, waits for green, merges into `rebrand/usefulapply`, deploys staging (`npm run deploy:cf`) and confirms live.
6. Next batch.

## Batches

| # | File | Flows | Branch | Why this grouping |
|---|---|---|---|---|
| 1 | `batch-1-shell.md` | 1 | `build/flow-1-shell` | The shell and the guided line. Everything else depends on it. Biggest. |
| 2 | `batch-2-kit.md` | 2 | `build/flow-2-kit` | The kit canvas: tabs, ATS view, templates, cover letter, emails, answers. Big. |
| 3 | `batch-3-feed.md` | 3 | `build/flow-3-feed` | The feed conversation and canvas, setup by chips, detail view, Edit feed. Big. |
| 4 | `batch-4-tracker-settings.md` | 4 + 5 | `build/flow-4-5-tracker-settings` | Tracker table + conversation; settings modal. Two medium flows. |
| 5 | `batch-5-auth-marketing.md` | 6 + 7 | `rebrand/usefulapply` (direct) | Auth pages; marketing site. Two small flows; marketing last because its shots are real screenshots of the built screens. |

Order is fixed. A batch starts only after the previous one is merged into `rebrand/usefulapply`. Batches 1 to 4 are merged (19 August 2026).

**From batch 5 on, work directly on `rebrand/usefulapply`.** No more per-batch build branches: that branch is the redesign's own trunk, and the per-batch branches were only ever a staging area. `main` is still off limits. Every batch appends its backend gaps to `BACKEND-GAPS.md`.

## After the batches: the sweep (batches 6 to 8)

**Agreed 19 August 2026.** Building seven flows in five batches leaves debris: the batches ran in sequence, each one replaced screens the previous one had just wired up, and each one was fenced off from backend files it was standing on. Once batch 5 is merged, the redesign is not finished. Run a sweep across everything the five batches touched, in two or three passes, each one landing as its own branch and PR.

The sweep is not a rebuild and not a redesign. It is: delete what is no longer reachable, and fix what is broken.

**Pass 1, dead code and dead links.** Grep every component, route, store and helper the batches replaced and confirm it is either used or gone. Known candidates as of batch 4: `CreditIndicator.tsx` (rendered nowhere, kept only for its `CREDIT_UPDATE_EVENT` export), anything still importing the retired `SettingsScreen` / `TrackerPanel` / `JobFeedPanel` shapes, the four unused `notify_tips` / `notify_updates` / `notify_weekly` profile columns, orphaned routes under `src/app` that now only redirect, and any `/pricing` or `/subscription` link that should be a `?settings=` deep link. Every deletion needs a grep for references first, and gets listed in the PR.

**Pass 2, the bug hunt.** Walk all seven flows end to end on staging as a real user, on a Free account and a paid one, and fix what breaks. This is where the cross-batch seams show: a store written by batch 1 and read by batch 4, a session loaded by the feed and mutated by the tracker, an SSE stream that has to survive a trip to another workspace. Use the `debugger` agent for anything with a stack trace and the adversarial review for anything touching auth, credits or data.

**Pass 3, close the backend gaps that are cheap.** Work `BACKEND-GAPS.md` top to bottom and land the entries marked Small. The Medium and Large ones become their own tickets. The file is the work list; nothing in it gets dropped without a decision written next to it.

Order matters: dead code first, so the bug hunt is not chasing code nobody calls, and the gaps last, so they land on a clean tree.

## Rules for the implementer (Grok)

- Read, in this order, before writing code: `AGENTS.md` (loads automatically), this file, your batch file, `docs/ux-audit-2026-08-18/design-philosophy.md` section 5 (the 12 rules), the flow doc(s) for your batch, the PNGs under `flow-N-artboards/png/`, `.claude/rules/design-system.md`. The PNGs are the target; the flow doc's "Notes for the spec and build" are requirements.
- Branch: `git checkout rebrand/usefulapply && git pull && git checkout -b <batch branch>` (if the branch exists, check it out and continue). Never touch `main`. **Do not commit. Do not push.** Leave the work in the working tree.
- `npm` only. No new packages without saying so in the report and stopping.
- `npx tsc --noEmit` zero errors and `npm run lint` clean before you report. If either fails and you can't fix it, report it as failing; never report it as passing.
- Surgical changes. Delete dead code only after `grep` shows zero references, and list every deletion in the report.
- Copy rules for every user-facing string: no em dashes (`—`), contractions, short sentences, no filler, "X, Y and Z", prices on the control ("· 0.5 credits"), no subtitle under a heading unless it prevents a mistake.
- Design system: gold is the only button fill and there is one per surface; outlined for everything else; `font-serif` semibold for anchoring headings only; radius roles `rounded-full` / `rounded-lg` / `rounded-2xl`; surfaces `cream-50` on `cream-100`, white only for documents; shadows `shadow-sm` / `shadow-md` / `shadow-lg`; Lucide icons only.
- Anything that costs credits says so on the control before the click, and when the balance is short the control becomes the upgrade path with the reason inline (`?settings=usage` deep link once batch 4 lands; until then the existing upgrade route).
- Do not touch: Stripe webhook or credit-deduction logic, D1 schema or migrations, Better Auth config, `src/lib/agents/**` prompts. If a task seems to need it, stop and put it in the report under "Needs a decision".
- Desktop first (1440x900 is the reference). Tablet ≥768 must not break. Mobile is not a priority.
- If something in the flow doc is impossible or contradicts the code, do the rest and write it under "Needs a decision". Don't invent a different design.
- **Backend gaps go in `BACKEND-GAPS.md` (same folder).** Whenever the design shows a screen or control that the backend, route, prompt, schema or data does not support yet, build the UI honestly against what exists and append an entry there under your batch. That file is the backend work list once all seven flows are built; nothing gets lost in a chat report.

## Report format (Grok ends every session with exactly this)

```
## Batch N report
Branch: <name>  (uncommitted)
Done:
- <task>: <files>
Not done / partial:
- <task>: why
Checks: tsc <0 errors | N errors: ...>, lint <clean | ...>
Deleted: <files or "none">
New strings: <count>, all reviewed for copy rules: <yes/no>
Needs a decision:
- <question>
How to see it: <route(s) and the test account/state to use>
```

## What Claude checks before committing (orchestrator checklist)

1. `git status` matches the report; nothing outside the batch's scope changed.
2. `npx tsc --noEmit`, `npm run lint`.
3. `ui-tester` at 1440x900 against each PNG named in the batch; note every visual gap.
4. Walk the flow doc's "Screen by screen" and "Notes for the spec and build" line by line against the code.
5. `grep -rn "—" src/` for em dashes in new strings; one gold button per surface; prices on controls.
6. `/code-review` (Wasim runs it; `high` when auth, credits or data are touched, else `medium`). Adversarial review per the global rules when triggered.
7. Fix small findings directly; batch the rest into a follow-up prompt for Grok.
8. Commit, push, PR, green, merge to `rebrand/usefulapply`, deploy staging, confirm live, then mark the batch done at the top of its file.

## Kickoff prompts

Each batch file ends with its kickoff prompt. They all have the same shape: who you are, which files to read, which branch, don't commit, report format.
