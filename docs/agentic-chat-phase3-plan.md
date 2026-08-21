# Agentic Chat Phase 3: Job Feed Control

Status: DRAFT for Wasim's approval, written 2026-08-21. Implements capabilities 10 to 12 of `docs/agentic-chat-plan.md` (the LOCKED spec). Phases 1 and 2 shipped 2026-08-20; the batch-2 fix pass shipped 2026-08-21 (`edbbf95c`), adversarially reviewed and verified live.

## Kickoff prompt (paste into the new session)

> Read docs/agentic-chat-phase3-plan.md and docs/agentic-chat-plan.md, then implement Phase 3 on branch rebrand/usefulapply. The surfaces are already located; verify them, then apply the specified solutions. Follow the plan's constraints and verification protocol exactly: tsc clean, lint at the 67-error baseline, adversarial review, deploy with npm run deploy:cf, full Claude-in-Chrome pass on usefulapply.com with my signed-in account, then commit and push. Commit before deploying, not after.

## Context the implementer needs

The tool registry lives in `src/lib/agents/chat-tools/`: `types.ts` (ChatTool, ChatToolContext, ExecutedEffect), `index.ts` (registry + executeChatTool), `read-tools.ts`, `write-tools.ts`, `app-tools.ts`, `intent.ts`, `navigate.ts`, `untrusted.ts` (shared defenses). The tool loop and both system prompts are in `src/app/api/chat/route.ts`; executed effects are applied in `src/components/chat/useAgentWorkflow.ts` (`applyExecutedEffects`); confirm chips render in `src/components/ChatPanel.tsx`.

Feed surfaces this phase talks to, all already built and gated:

| Concern | Route | Notes |
|---|---|---|
| Settings read/write | `/api/job-feed/settings` | Shape is `JobFeedSettingsInput` in `src/lib/job-feed/types.ts`, 18 fields |
| Suggested settings from CV | `/api/job-feed/settings/suggest` | Returns `JobFeedSettingsSuggestion` |
| Run the feed | `/api/job-feed/run` | Tier gate (`canViewJobFeed`), per-user rate limit `job-feed-run`, IP gate |
| Latest run + items | `/api/job-feed/overview`, `listLatestJobFeedItemsAdmin` | Already read by `get_feed_digest` |
| Save / unsave / dismiss | `/api/job-feed/feedback` | Actions: `opened`, `saved`, `unsaved`, `dismissed`, `rated_helpful`, `rated_not_relevant`. `dismissed` and the ratings are Plus/Max only; `opened`/`saved`/`unsaved` are the free set |
| Apply to a feed job | `/api/job-feed/apply` | Takes `mode`, spends credits, returns `sessionId` |

## Invariants from batch 2 that Phase 3 must not break

- Reads execute immediately. Reversible writes execute immediately and the reply states exactly what changed. Anything credit-spending or destructive only proposes, and a user click is the confirming request. Nothing auto-spends credits.
- Every handler re-derives `userId` from `ChatToolContext`. Tool arguments never carry a user id.
- Ad-derived text (job titles, company names, match reasons) goes through `flattenUntrusted` / `sanitizeUntrustedText` and `<< >>` wrapping.
- Row-touching writes gate on `userNamed` AND refuse when `ctx.userMessagePasted` is true. Feed writes that name a job the user did not name themselves need the same treatment: a feed item's title is attacker-authored.
- Executed effects that touch the open application check the session is still current before applying.
- Voice rules on every new user-facing string: no em dashes, contractions, short sentences, no filler, no Oxford comma.

## Work items

### 1. `get_feed_settings`, a read tool

Returns the current settings in plain language: target roles, countries and cities, remote preference, salary floor, seniority, employment types, languages, excluded terms, and whether the feed is enabled. Flatten every user-authored string (a role or an excluded term is typed by the user, but a city can arrive from a CV suggestion). This exists so the model never guesses the current state before changing it.

### 2. `update_feed_settings`, a reversible write with a mandatory echo-back

Capability 10 is "only remote roles", "add Berlin and Amsterdam", "drop the sales roles". The risk is a wrong parse silently narrowing the feed to nothing.

- Arguments are a **partial** patch over `JobFeedSettingsInput`, never the whole object: the model must not have to restate 18 fields to change one, and a field it omits must not be cleared.
- List fields take an operation, not a replacement: `{ field, add: [], remove: [] }`. "Add Berlin" must never wipe the existing cities.
- Validate every value server-side against the same rules the settings UI enforces. Reject unknown enum values rather than coercing them.
- Never let a single call disable the feed or empty `target_roles`. A feed with no roles returns nothing, which reads as a broken product. If the parse implies that, refuse and ask.
- The tool result carries the **complete resulting settings**, and the system prompt requires the reply to echo what changed plus what the feed now targets, in one or two short sentences. The spec calls for this so a wrong parse is visible immediately.
- Executed effect `{ type: 'feed_settings_updated' }` so the settings panel and the feed store refresh live.

### 3. `run_feed`, a reversible write

Capability 11. The run is not credit-spending, so it executes immediately, but it is expensive and rate-limited.

- Call the existing run path so the tier gate, the per-user rate limit and the IP gate all still apply. Do not reimplement any of them.
- A 429 or 403 is an answer, not an outage: return it as data with a plain-language reason so the model can relay "your feed already ran recently, here's what it found" rather than claiming failure.
- Runs are slow. Decide and write down which of these the phase ships: return immediately with `{ type: 'navigate', target: 'job-feed' }` so the user watches the existing progress UI, or hold the tool call open until the run completes. The first is strongly preferred: the chat route caps at 3 tool rounds and a long hold risks the whole reply timing out. **Ask Wasim if you want the second.**

### 4. `save_feed_job` and `dismiss_feed_job`, reversible writes

Capability 12's first two thirds: "save the second one", "dismiss the Amazon job".

- The model addresses jobs by an id taken from `get_feed_digest`, never by an index it inferred. Ordinals like "the second one" resolve from the digest it already read, so `get_feed_digest` must return a stable id per item and the digest must be in the conversation before either tool can be called.
- Gate on `userNamed` against the item's company or title, and refuse when `ctx.userMessagePasted` is true. Feed titles are attacker-authored, so an instruction hidden in a job ad must not be able to dismiss a competitor's listing from the user's feed.
- `dismissed` is Plus/Max only. On a free account, return that as data so the model explains it instead of reporting a failure.
- Executed effect `{ type: 'feed_item_updated'; jobId; action }` so the feed canvas updates without a reload.

### 5. Applying to a feed job stays a proposal

Capability 12's last third is credit-spending, so per the locked confirmation policy the tool only proposes.

- `propose_feed_application` returns a confirm chip carrying the job id, exactly like `delete_application` does today. The click routes through the existing `/api/job-feed/apply` path with its credit reservation, so credits are spent by the same code that spends them from the feed UI.
- Reuse the existing credit-aware decision card so the user sees the cost before the click, and so an insufficient balance shows the upgrade path rather than an error.
- Never call the apply route from a tool handler.

### 6. Prompt and registry wiring

- Add the tools to `CHAT_TOOLS` and give the feed a short section in `buildMainChatPrompt` explaining that settings changes are echoed back, that a run takes a while, and that applying costs credits and needs a click.
- The app map added in batch 2 already describes the feed page; extend it rather than duplicating it.

## Constraints

- Branch `rebrand/usefulapply`. Never commit to main. npm only. No new packages without asking.
- No schema changes should be needed. If one seems necessary, stop and ask.
- Do not pull Phase 4 or 5 capabilities forward. No kit generation, no regeneration, no CV edits.
- Use the `job-feed-specialist` agent for anything under `src/lib/job-feed/**`, `src/app/api/job-feed/**` or `src/components/job-feed/**`.
- Lint baseline is 67 pre-existing errors. Add zero. `npx tsc --noEmit` must be zero.

## Verification protocol (the phase is not done without all of it)

1. `npx tsc --noEmit` zero errors; `npm run lint` still at 67.
2. Adversarial review, up to 5 parallel opus agents. This phase writes user settings and touches a credit-spending path, so review at high depth. Fix confirmed findings.
3. Deploy: `npm run deploy:cf`.
4. Claude-in-Chrome pass on usefulapply.com with Wasim's signed-in account. Exercise: read settings, add a city, drop a role, confirm the echo-back is correct and the settings panel agrees; run the feed; save and dismiss a job and watch the canvas update; propose an application and confirm the cost chip appears without spending anything until clicked. Ledger check via the Cloudflare API MCP, D1 database id `8cd7059e-4f0b-429b-aace-e379756707e1`: confirm `tool_call:<name>` rows and no failure spike.
5. Commit (conventional, one commit for the phase) and push. **Commit and push before deploying**, not after: uncommitted work on this branch has been stashed by another session once already.
