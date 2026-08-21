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

## Decisions taken during implementation (2026-08-21)

- **`run_feed` returns immediately.** The tool checks the tier gate and the one-run-per-local-day cooldown so the reply can explain itself, then returns an executed effect. The client raises `pendingFeedRun` on `useUIStore`, switches to the feed column, and `FeedConversation` runs the existing `triggerRun` path with its build progress UI. The run itself still goes through `/api/job-feed/run`, so the tier gate, the per-user rate limit and the IP gate are untouched. Holding the tool call open for a 120-second run would have risked the whole reply timing out inside the 3-round loop.
- **Target roles are not settable from chat.** `/api/job-feed/settings` mirrors `target_roles`, `user_skills`, `languages` and seniority off the AI career profile and never takes them from the client. `update_feed_settings` carries those fields through untouched, which also makes "never empty target_roles" structurally impossible. "Drop the sales roles" is an excluded term, and the tool description and the system prompt both say so.
- **`enabled` and consent are not settable from chat.** The plan forbids a single call disabling the feed, so the argument does not exist. Both are carried through from the saved row.
- **Settings writes stay Plus and Max** (`canAccessJobFeed`), matching the settings route. Saving a role is free (`canViewJobFeed`); dismissing needs Plus or Max, and a free account gets that back as data, not as a failure.
- **The search strategy is not regenerated by the tool.** It is cached against a hash of the settings, so a settings change invalidates it and the next run rebuilds it.
- **`propose_feed_application` reuses the feed handoff.** The confirm chip carries `confirm-feed-apply:<mode>:<jobId>`; the click runs `startFeedHandoff`, the same path a feed card runs, so credits are reserved by the code that always reserves them. An insufficient balance returns as data with a billing chip instead of a confirm chip.

## Adversarial review pass (2026-08-21)

Five parallel Opus reviewers (security, logic, data integrity, error handling and billing, spec compliance). Confirmed findings and what changed:

- **Pasted-text gate widened.** `update_feed_settings` and `run_feed` now refuse when `ctx.userMessagePasted` is true, like every other write. A hostile ad could otherwise add excluded terms, drop a country or spend the day's single run.
- **Per-user rate limits inside the tools.** The chat route limits per IP and one message can run several tool calls, so `update_feed_settings` and the save/dismiss path apply the same `job-feed-settings` and `job-feed-feedback` ceilings the routes enforce.
- **`userNamed` hardened.** App vocabulary ("feed", "remote", "today", "hiring", …) joined the generic-token list, so a company that names itself "Remote Talent" cannot open the write gate on "show me the remote ones".
- **Ordinals take one extra turn, deliberately.** Capability 12 asks for "save the second one", which `userNamed` alone cannot satisfy. A position-word gate was tried and reverted: two independent security reviews landed on the same defect, and they were right. A regex can tell that the user said "second", but not *which row* that is, so the gate would pass for whatever id the model sent, which is exactly what an instruction buried in a job ad wants. Binding the position word to an action verb did not fix it either ("application" and "fit" are everywhere in this app). So the strict `userNamed` gate stands, and the model is told to answer an ordinal by naming the role back and asking. The user's answer names the role and the write goes through. **This is a change to capability 12 as written and worth Wasim's eye:** "save the second one" costs one confirming turn rather than none.
- **`run_feed` preconditions.** It now refuses when the feed is off, unconsented or unconfigured, and when a run is already in flight. Before, it promised a run the route would reject with a 500, and a second chat-triggered run tore down the progress UI of the one still going. Consent is only ever granted on the feed page, where the copy is.
- **`get_feed_settings` is a read gate.** Free accounts already see their settings on the feed page, so reading is `canViewJobFeed`; only writing is Plus and Max.
- **Enum values are refused, not filtered.** An unrecognised work mode or employment type fails the call instead of being silently dropped. Work modes and employment types gained `add_` variants so widening cannot wipe the saved list.
- **Salary floor is bounded** at 10,000,000. It is a hard prefilter reject, so an LLM unit slip would have emptied the feed with nothing said.
- **Item length matches the normalizer** (80 chars). A term echoed at full length but stored truncated could never be removed again.
- **The saved row is carried through, not its display view.** `toJobFeedInput` fills defaults for nullable columns; writing those back would have invented a seniority and a work authorization the user never chose, and pushed both into the cover letter context.
- **Set comparisons are order-insensitive**, so a model re-emitting the same work modes in a different order no longer reports a change that did not happen.
- **Implied countries are announced.** Adding Berlin adds Germany; the echo-back now says so.
- **Empty `employment_types` heals to `full_time`**, matching the route, instead of hitting the table's non-empty constraint.
- **The confirm chip cannot double-fire.** An in-flight set stops a double click creating two sessions, a done set makes an old chip say "already open" rather than silently doing nothing, and the analytics event only fires when a generation actually starts.
- **Run attribution is explicit.** `startFeedHandoff` inferred the run from which tab was open, which means nothing for a role picked in the chat. The chat passes null and the server resolves the job's own run.
- **The Saved list refetches** after a chat save or dismiss instead of only being cleared, which used to blank the Saved tab if the user was looking at it.
- **The CV is checked before the button.** `propose_feed_application` refuses without a primary CV instead of letting the click fail.
- **The `pendingFeedRun` signal carries a timestamp** and expires after a minute, so a request nothing picked up cannot fire an unasked-for run later.

Accepted without change, and why:

- `upsertJobPreferences` failing after the settings write is logged and the change still reports success. The settings route behaves the same way; making the two disagree would be worse than the stale preference row.
- `mergeQuietSettings` can prefer a local copy if the user hits Save in the settings panel at the same instant a chat write lands. Narrow race, and the next load corrects it.
- Item 5's "existing credit-aware decision card" does not exist as a component. What shipped is the confirm chip with the cost in the label, which meets the requirement: the cost is visible before the click, an insufficient balance shows the billing path instead of an error, and no handler spends credits.
