# Agentic Chat Phase 4: Kit Actions

Status: DRAFT for Wasim's approval, written 2026-08-21. Implements capabilities 13 to 15 of `docs/agentic-chat-plan.md` (the LOCKED spec). Depends on Phase 3 shipping first. Every capability here spends credits, so every one is confirm-gated.

## Kickoff prompt (paste into the new session)

> Read docs/agentic-chat-phase4-plan.md and docs/agentic-chat-plan.md, then implement Phase 4 on branch rebrand/usefulapply. Phase 3 is already shipped. Follow the plan's constraints and verification protocol exactly: tsc clean, lint at the 67-error baseline, adversarial review at high depth (this phase spends credits), deploy with npm run deploy:cf, full Claude-in-Chrome pass on usefulapply.com with my signed-in account, then commit and push. Commit before deploying, not after.

## The rule that governs this whole phase

From the locked spec: *credit-spending or destructive means the model proposes, the UI renders a confirm chip, and a second request with the confirmation executes. Never spend credits on a bare model decision.*

No tool handler in this phase may call a generation endpoint. Handlers return proposals. The click calls the same client paths the buttons already use, so credits are spent by code that already spends them correctly.

## Work items

### 1. Start an application from a pasted ad (capability 13)

Batch 2 already built most of this. `propose_application` (in `chat-tools/intent.ts`) is a no-op tool the model calls when a message is a pasted ad; the client raises the existing credit-aware decision card offering fit analysis (0.5) or the full kit (2.0), and the user's click starts the run.

So capability 13 is **mostly already delivered**. What remains:

- The card currently only appears for the conversation the ad was pasted into. Decide whether "start an application for the Klarna role I saved" (from the feed, not a paste) should also raise it. If yes, that is Phase 3's `propose_feed_application`, not a new tool. Do not build a second path.
- Re-read `MIN_JOB_AD_CHARS` and `isObviousJobAd` in `ChatPanel.tsx` before touching anything here. They were tuned in batch 2 against a real false-positive bug and a real dead-end bug.
- **Do not add a credit-spending `start_application` tool.** The locked spec names this explicitly as out of scope.

### 2. Regenerate with instructions (capability 14)

"Make the cover letter shorter and mention the Munich project."

**This is the one real gap in the phase, so verify it first.** `/api/regenerate` accepts `{ type, context }` and nothing else. There is no instruction field, so the instruction has nowhere to go today.

The prompt layer is closer than the route is. `src/lib/agents/prompts/cover-letter-prompt.ts` already carries a `<user_instructions_rule>` block that honours first-person requests found alongside the job description text, and it already tells the writer to weave them in rather than quote them. The email prompts do not have an equivalent.

The work:

- Add an optional `instruction` to the regenerate route's body. Validate its length hard (a couple of hundred characters is plenty) and treat it as **user-authored, not ad-authored**: it comes from the composer. It still gets flattened before entering a prompt.
- Thread it into the prompt builders as its own labelled block. Do **not** concatenate it into the job description field: that field is attacker-authored and the anti-hallucination rules read it as the job's text, not the applicant's wishes.
- Extend the email and follow-up prompts with the same instruction rule the cover letter has, so the three behave alike.
- **The anti-hallucination rules do not bend for an instruction.** "Mention the Munich project" is honoured only if a Munich project exists in the Primary CV or Master CV. If it does not, the writer omits it and the reply says so. Add this explicitly to the instruction block and to `.claude/rules/agents-and-prompts.md`. This is the highest-risk sentence in the phase.
- The chat side already has the machinery: `detectRegenTarget` in `src/lib/regenerate-client.ts` reads a rewrite request out of the composer, `REGEN_META` carries the cost per target, and `startRegenPrompt` shows the cost chip before the click. Extend that path to carry the instruction through to the click rather than building a tool.
- Writing stays on Sonnet. gpt-oss routes; it never writes CV or letter prose.

### 3. Follow-up drafting (capability 15)

"Write the follow-up for Bosch" after an interview has passed.

- `follow_up_email` is already a regenerate type with its own cost, and `/api/tracker/follow-up` exists. Reuse them.
- The tool proposes; the chip spends. Gate the proposal on `userNamed` against the application, and refuse when `ctx.userMessagePasted` is true, exactly as the tracker writes do.
- The model may **read** the tracker to notice a follow-up is due (Phase 1 tools already do this) and offer to draft one. Offering is free. Drafting is not.
- Land the draft in the Email panel's follow-up tab, the same place the button puts it, so there is one source of truth per application.

### 4. One shared confirm path

By the end of this phase there are several proposals that each spend a different amount. They must all render through the same credit-aware decision card that batch 2 hardened, so that:

- The cost is always stated before the click.
- An insufficient balance shows the upgrade path instead of an error.
- A stale card cannot fire: `handleSend` clears pending proposals when a new message is sent, and effects check the session is still current before applying. Any new proposal must inherit both guards.

## Constraints

- Branch `rebrand/usefulapply`. Never commit to main. npm only. No new packages without asking.
- Touching credit or Stripe logic needs Wasim's explicit sign-off first. Reusing an existing credit-spending route does not, but changing how it reserves or deducts does.
- Use the `agent-expert` agent for anything under `src/lib/agents/**`, including every prompt change in item 2.
- Do not weaken any anti-hallucination guard. If an instruction and a guard conflict, the guard wins.
- Lint baseline is 67. `npx tsc --noEmit` must be zero.

## Verification protocol (the phase is not done without all of it)

1. `npx tsc --noEmit` zero errors; `npm run lint` still at 67.
2. Adversarial review, up to 5 parallel opus agents, at high depth. Required lenses: can any path spend credits without a click; can an instruction smuggle a fabricated claim into a document; can a stale proposal fire against the wrong application; does a failed generation still refund or never reserve.
3. **A hallucination test is mandatory before deploy.** Ask for a rewrite mentioning something that is definitely not in the CV, and confirm the document omits it and the reply says why. Repeat for the cover letter, the application email and the follow-up.
4. Deploy: `npm run deploy:cf`.
5. Claude-in-Chrome pass on usefulapply.com with Wasim's signed-in account. Exercise every proposal: confirm the cost is shown, confirm nothing is charged until the click, confirm the balance moves by exactly the stated amount, and confirm the document lands in the right panel. Ledger check via the Cloudflare API MCP, D1 database id `8cd7059e-4f0b-429b-aace-e379756707e1`.
6. Commit (conventional, one commit for the phase) and push. **Commit and push before deploying.**

## Decisions taken during implementation (2026-08-21)

- **The strict `userNamed` gate carries into Phase 4 unchanged.** Wasim settled this before the confirm flows were written. Every Phase 4 proposal spends credits, so a gate that can be opened by an id the model chose is worse here than it was in Phase 3. An ordinal ("start an application for the second one") still costs one confirming turn: the model names the role back and acts on the answer.
- **Capability 13 added no code.** `propose_application` from batch 2 covers the pasted ad, and Phase 3's `propose_feed_application` covers a role picked from the feed, which is the answer to the plan's open question: yes, it should raise the card, and it already does. No `start_application` tool exists. `MIN_JOB_AD_CHARS`, `isObviousJobAd` and `looksAdShaped` are untouched. Known limit, inherited from Phase 3: `get_feed_digest` reads the latest run inside the retention window, so a role saved on an older day is not addressable from the chat.
- **The rewrite instruction is the composer message itself.** It is user-authored, capped at 300 characters and flattened server-side before it reaches a prompt. Over the cap it is refused out loud rather than truncated: a half-read instruction is worse than none. The cap and the flattener live in `chat-tools/untrusted.ts` so the route and the composer cannot drift.
- **`detectRegenTarget` gained a second verb family.** It only carried shape verbs (shorter, tighten, rephrase), so capability 14's own example minus its shape clause, "mention the Munich project in the cover letter", did not route at all. Content verbs (mention, include, emphasise, remove, lead with) now route too. Widening is safe because a verb alone never routes: the message still has to name a document, or say "it" with one open.
- **The chat cannot say a rewrite was applied when it was not.** The writer returns only the document, so there is no signal to report a specific omission without parsing a trailer out of the prose, which would risk the trailer landing in the letter. What ships is a standing honest line after an instructed rewrite, not a claim the code cannot verify.
- **`propose_follow_up` proposes only.** It reads the row, the CV and the balance, then returns a chip whose label carries the cost. The click runs `regenerateFollowUpForSession`, the same path the tracker's own button runs, so credits are reserved by the code that always reserves them. The draft lands in the Emails tab, one source of truth per application.
- **A follow-up that already exists is named as a replacement.** The tool reads the session and labels the button "Rewrite the X follow-up" rather than "Draft", and tells the model to say plainly that it replaces. Paying to overwrite is part of what the cost means.
- **The tracker follow-up path takes no instruction.** `/api/tracker/follow-up` takes a session id and nothing else, and item 15 never asked for one. Rather than drop a styling note in silence, the tool states the limit: the button writes the standard follow-up, and a note can be applied by asking for a rewrite once it is open. Threading an instruction through a chip that lives in persisted message history would create a stale note that survives reloads, which is the wrong shape; if this is ever wanted it should ride ephemeral pending state like `PendingRegen` does.
- **The follow-up prompt gained the CV.** Item 14's governing sentence is that an instruction is honoured only where the Primary CV or Master CV supports it, and that was impossible for the follow-up, whose only sources were an ad-derived achievement string, employer-authored company context and the primary email. Adding the CV completes item 14 rather than widening it.
- **Persisted confirm chips rely on target-pinning, not expiry.** `confirm-delete-application`, `confirm-feed-apply` and `confirm-follow-up` live in the chat history and survive reloads. They do not inherit the `handleSend` clear the way `pendingRegen` does, deliberately: the plan's stale-card guards were written for a pending, un-clicked proposal whose meaning evaporates when the conversation moves on, and for Phase 3's `pendingFeedRun`, which fires with no further click. These chips are different in kind. Each states its cost in its own label, each has its target baked into the action string so it can never cross-fire, and each checks reality at click time (delete reads the tracker rows, feed-apply refetches the job, follow-up reads the session). A user scrolling back and clicking a priced button is buying what the label says, which is a supported action, not a mistake to expire.

## Adversarial review pass (2026-08-21)

Five parallel Opus reviewers (credit spending, instruction injection, stale proposals, refunds and error handling, spec compliance) at high depth, since every item touches the credit reservation. Confirmed findings and what changed:

- **Prompt chrome was forgeable from the job description.** The highest-severity finding, and one this phase created. Naming a block "the applicant speaking" gave the string real authority, while `jobDescription` is interpolated raw AFTER it, so an ad could reproduce the heading byte for byte and supply its own binding limits. Worse in the follow-up, where the delimiter is an XML tag an ad could close. `sanitizeAdText` in `chat-tools/untrusted.ts` now neutralises angle brackets, the `===` fence and the shouted block labels across all 14 ad-derived interpolations in the three writer prompts. Neutralise, never delete: an ad that legitimately says "binding limits" or "<5 years" survives as readable English. No nonce, which would have broken the static system blocks' prompt cache on every call.
- **`<company_context>` was blessed as a source of facts about the applicant.** Also created by this phase. The follow-up's new instruction rule listed it as a permitted source, but it is built from the employer's own required skills, so "mention my Kubernetes experience" would have passed the test purely because the employer asked for Kubernetes, with no CV in that prompt to contradict it. The source list is now the CV and the primary email; company_context describes what the company wants and is never an applicant claim.
- **Two paid paths could run at once.** The follow-up chip and the rewrite chip shared `runningRegen` and `regenStage` but had separate in-flight guards, and the follow-up switches the session when it lands. Starting one over the other cleared the running rewrite's stage and moved the session out from under it, so its result was dropped in silence after the credits were spent. They now share one guard.
- **An error message claimed nothing was charged when it might have been.** The follow-up route persists the letter and captures before the response is written, so a dropped connection at 40 seconds meant the user was charged, had the draft, and was told it failed. The branch no longer makes a billing claim and points at the Emails tab instead.
- **A capture failure no longer fails the request.** Once the letter is saved it is durable, so the only truthful response is success. The capture is CAS-guarded and idempotent, so it retries once; if it still does not land, the letter is returned, the failure is logged loudly to PostHog, and `releaseStaleReservations` refunds the reservation. That costs at worst one free follow-up in a millisecond-wide D1 failure window, which is the right way to err. Rejected: capturing before persisting, which swaps a free letter for a charge with no letter.
- **The done set was per-mount.** ChatPanel mounts twice on desktop, so a ref could let the second mount pay for the same draft again. Moved to a module-level set, matching the `autostartedApplySessionIds` precedent already in the file.
- **A cost chip stayed rendered under another application's conversation.** It already refused to fire, but showing it at all is the stale card item 4 rules out. Cleared on session switch.
- **Spending against the quoted job was a timing accident.** `regenerateDocument` re-reads the store rather than taking the session it was quoted for, so the invariant held only because no `await` sat between the guard and `buildContext()`. It now takes the expected session id and bails, making it structural.
- **The prompt sent users somewhere they already were.** The new rewrite line said to open that application and ask again there, which is a dead end for a user standing in it with the kit open. It now asks what to change.
- **The balance-short case promised a draft.** `startRegenPrompt` said it would write the letter above a chip that had already swapped to Upgrade. It only promises when affordable.
- **Retry-dedupe comments were false.** Both the route and the client claimed a retry reuses the idempotency key, but every caller passes a fresh id, so a genuine retry reserves again. The comments now say what the code does. The behaviour is unchanged: making retries dedupe is a billing change.

Accepted without change, and why:

- The three persisted confirm chips do not expire. See the decision above: expiry is the wrong precedent (`pendingFeedRun` guards an autonomous fire, not a click), it would punish a legitimate scroll-back purchase, and stripping actions from history would break navigation and upgrade chips too.
- `/api/regenerate` discards `captureReservation`'s result where the follow-up route now logs it. Pre-existing, and the failure direction is a free document rather than a lost charge, which the reconciler corrects.
- `flattenInstruction` duplicates most of `sanitizeUntrustedText`. The route must reject over-length rather than truncate, so the two cannot be one function.
- `sanitizeAdText`'s label list is a fixed enumeration, so a new all-caps heading added to a writer prompt later is forgeable in the lowercase sense until it is added. The angle-bracket and fence rules still block the structural half. Noted in `.claude/rules/agents-and-prompts.md`.

## Chrome verification pass (2026-08-21, deployed version fc6b9aa3)

Run on usefulapply.com with Wasim's signed-in Max account. Budget was three credits; two were spent. Ledger checked against D1 `8cd7059e-4f0b-429b-aace-e379756707e1`.

**The three mandatory hallucination tests all pass.** Each asked for something that is definitely not in the CV, alongside a shape instruction, so the two halves could be told apart:

- "Make the cover letter shorter and mention my Munich fintech project": 193 words to 161, no Munich, no fintech, no placeholder and no vague sentence implying one. Every claim traced to the CV.
- "Rewrite the follow-up and mention my Munich fintech project": 89 words, no Munich. It led on a 38% feature-adoption figure from the CV, which is a different strength from the primary email's $2M ARR. That figure is only reachable because the CV is now in the follow-up prompt, so this doubles as proof of that change.
- "Make the application email shorter and mention my Kubernetes platform work": 86 words, no Kubernetes, no infrastructure claim.

In all three the shape half of the instruction was honoured and the unsupported half was dropped, which is exactly the required behaviour.

Everything else checked:

- Cost stated before every click, and nothing charged until the click. The balance was still 173.5 while the chip sat waiting.
- Four reservations, all reserved then captured, none released or stranded. The balance chain is unbroken: 173.5, 173, 172.5, 172, 171.5. Every step is exactly the amount the chip named.
- Zero failed rows in `llm_generations` for the whole pass.
- `tool_call:propose_follow_up` is attributed as its own operation, and the model called `get_applications` before it, so it proposed against a row it had actually read.
- Sonnet wrote every document; gpt-oss only routed.
- `propose_follow_up` against an application that already had a draft said so, priced the replacement and labelled the button "Rewrite the TeamSnap follow-up (0.5 credits)" rather than "Draft". The draft landed in the Emails tab under the application email, one source of truth per application.
- Follow-up input tokens landed at 2186 and 2750 against the cover letter's 2677, so adding the CV to that prompt did not blow up its cost at a realistic CV size.

One thing observed and not reproduced: the tab stopped responding to screenshots for about two minutes after the first rewrite click. The server side was unaffected (reserve to capture took seven seconds, no error row), the app recovered fully on reload with its state intact, and the next three generations through the same code paths were clean. Recorded rather than diagnosed, since it did not recur.
