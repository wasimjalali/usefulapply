# Agentic Chat Batch 2: Fixes and Polish

Status: APPROVED by Wasim on 2026-08-21. Implementation plan for a fresh session. Follows `docs/agentic-chat-plan.md` (the LOCKED spec); this batch fixes issues found after Phases 1+2 shipped (commit `c4fafb15`, deployed and Chrome-verified on 2026-08-20).

## Kickoff prompt (paste into the new session)

> Read docs/agentic-chat-batch2-plan.md and docs/agentic-chat-plan.md, then implement all six work items in the batch-2 plan on branch rebrand/usefulapply. The root causes are already located; verify them, then apply the specified solutions. Follow the plan's constraints and verification protocol exactly: tsc and lint clean, adversarial review, deploy with npm run deploy:cf, full Claude-in-Chrome pass on usefulapply.com with my signed-in account (including the responsive audit at the listed window sizes), then commit and push when verified.

## Context the implementer needs

- Phases 1+2 of the agentic chat are live: tool registry in `src/lib/agents/chat-tools/`, function calling in `src/lib/models/workers-ai.ts`, tool loop in `src/app/api/chat/route.ts`, executed-effects handling in `src/components/chat/useAgentWorkflow.ts`, chips and confirm-delete in `src/components/ChatPanel.tsx`.
- `ChatPanel` renders in exactly one place, `src/components/shell/ConversationColumn.tsx`, always with `spine`. Code behind `!spine` is legacy and does not render.
- Chat sessions: `createNewSession()` (in `useSessionStore`) makes a local `session-<timestamp>` container for messages. `useSupabaseSync.ts:446` only creates a D1 row once `generatedCV` exists, so chat-only sessions never reach the server; they live in the store and localStorage.
- Confirmation policy (locked): reads execute immediately; reversible writes execute immediately and state the change; anything credit-spending or destructive only proposes, and a user click is the confirming request. Nothing may auto-spend credits.
- Injection rules (locked): job-ad-derived text is flattened and `<< >>`-delimited (`src/lib/agents/chat-tools/untrusted.ts`); row writes gate on `userNamed`.
- Voice rules apply to every new user-facing string: no em dashes, contractions, short sentences, no filler.

## Work items

### 1. Chat-only conversations must not appear as applications

Symptom: chatting without an application shows a "New application / Role not set" entry in the sidebar.

Root cause: any first chat message calls `createNewSession()`; `src/components/shell/Sidebar.tsx` (~line 109) renders every `useSessionStore.sessions` entry unfiltered, and the history overlay in `ChatPanel` does the same.

Solution:
- Export `isApplicationSession(session)` from `src/store/useSessionStore.ts`: true when the session has a `jobDescription`, a `generatedCV` or a `pendingFitAnalysis`.
- Filter the sidebar list and the `ChatHistory` overlay list by it. Chat-only sessions stay usable as the current conversation but are never listed; they appear the moment a job ad lands in them. Do NOT change the sync gate; D1 is already clean.

### 2. Template and dashboard-awareness tools

Symptom: the chat cannot say which CV template is in use, list templates, or answer "where do I..." questions about the app.

Root cause: no tool covers templates; template selection is client state (`useUIStore.cvTemplateId`, localStorage default in `src/lib/cv-templates/default-template.ts`, session column `selected_template`).

Solution:
- New server-safe catalog `src/lib/cv-templates/catalog.ts`: id, display name, market for the 6 templates. Source the ids from `src/components/cv-templates/index.tsx` and `TemplateStrip.tsx` (fallback id is `premium-ats`); do not import client components into the registry.
- Context: the client adds `cvTemplateId` to the chat request context; the main prompt states "CV template in use: <name>".
- New tool `get_application_overview`: reads `getSession(userId, sessionId)` and returns company/role (wrapped `<< >>`), status, match score, which artifacts exist (CV, cover letter, email, follow-up), `screening_turns_used`, `selected_template`, created date.
- New tool `set_cv_template`: args `{ template_id }` validated against the catalog enum; returns executed effect `{ type: 'set_cv_template', templateId }`. Client applies `setCvTemplateId`, `updateCurrentSession({ selectedTemplate })` and `writeDefaultTemplate`. Reversible, so it executes immediately and the reply states the change.
- Add a short app map to `buildMainChatPrompt` (what the kit panels, tracker, feed, documents and billing pages do) so navigation answers are accurate.
- Do NOT add feed-settings, feed-run or kit-generation tools; those are locked Phase 3/4 scope.

### 3. Adaptive suggestion chips

Symptom: the three empty-state chips are static; new users see "Which follow-ups are due?" with zero applications.

Root cause: chips are hardcoded in `ChatPanel`'s spine empty-state block.

Solution: one helper, `buildSuggestedPrompts(state)`, returning the top 3 by this ladder:
1. No CV uploaded: "How does Useful Apply work?", "Show me today's job feed".
2. Zero applications (first-time user with a CV): "How does Useful Apply work?", "What should I do today?", "Anything strong in today's feed?".
3. Overdue or due follow-ups: "Which follow-ups are due?".
4. Upcoming interview: "What interviews do I have this week?".
5. New feed run (badge count > 0): "Anything strong in today's feed?".
6. Default first chip for active users: "What should I do today?".

Data sources: `currentCV`, `useSessionStore.sessions` (filtered by `isApplicationSession`), `useTrackerStore` rows (lazy `load(user.id)` once if not loaded), `useJobFeedBadge`. Clicking still sends the text straight to `handleGeneralChat` (never through JD detection). Keep the existing fresh-job-ad chips ("Analyze this job description", "How well do I fit this role?") as they are.

### 4. Job ad vs question detection moves to gpt-oss (Wasim: accuracy here is critical)

Symptom: Check fit / Generate kit buttons appear for normal questions.

Root causes:
- `ChatPanel.tsx` ~line 545 `looksLikeJobAd`: without a generated CV, ANY message over 100 chars or containing one marker word ("apply", "salary", "position"...) shows the decision chips.
- `useAgentWorkflow.handleSend`: the no-session branch treats any message matching `/job|position|role|.../` as a JD, and the with-session branch auto-starts a paid `apply_directly` run from marker counting. Heuristic auto-spend is exactly what the product rules ban.

Solution:
- Deterministic fast path ONLY for unambiguous ads: `isObviousJobAd(text)` = (length > 350 AND >= 3 distinct marker hits) OR length > 1800 (chat caps at 2000). These show the decision chips instantly, as today.
- Everything else goes to `/api/chat`. Add a no-op registry tool `propose_application` ("call only when the user's message is a pasted job advertisement; never for questions about jobs") whose handler returns executed effect `{ type: 'propose_application' }`. Add the matching rule to the main system prompt: when the message is a pasted ad, call the tool and do not summarize or answer it.
- Client: `useAgentWorkflow` options gain `onProposeApplication(jd: string)`; `handleGeneralChat` invokes it with the just-sent message when the effect arrives; `ChatPanel` passes `setPendingDecisionJd`, so the existing credit-aware decision card renders. The chips remain the user's confirm; classification never starts a run and never spends credits.
- Remove the heuristic branches: `looksLikeJobAd` in ChatPanel is replaced by `isObviousJobAd`; the auto-run heuristics in `useAgentWorkflow.handleSend` route to `handleGeneralChat` instead. KEEP the explicit-mode paths (`explicitMode` / `awaitingJobDescription`, the hero buttons): a clicked mode is user intent, including the anonymous free-generation flow, which must not break (anonymous users get 401 from /api/chat, so they must never depend on the model path).
- Test both ways in the Chrome pass: a real pasted ad shows the chips; "should I apply to roles with a lower salary?" gets an answer with no chips.

### 5. De-crowd the chat action buttons

Symptom (screenshot from Wasim): a reply carries View CV, View Cover Letter, View Email and Start New Application chips while the canvas already shows those tabs and the sidebar has New application.

Root cause: `extractActions()` in `src/app/api/chat/route.ts` appends all three view buttons plus Start New Application whenever an analysis exists and the reply mentions cv/letter/email; `useAgentWorkflow` also emits Start New Application chips on the stop message and the chat-limit message.

Solution:
- In `extractActions`: delete the whole `hasAnalysis` block. Keep only the Upload CV action when `!hasCV`.
- In `useAgentWorkflow`: drop the `start-new-application` chips from the stop message and the chat-limit message (the sidebar button covers it). Keep the `handleAction` case so chips in stored history still work.
- Keep the spine "Answer screening questions" DecisionChips flow untouched; that is the one follow-up button Wasim wants.

### 6. Responsive sizing audit at common desktop sizes

Symptom: on Wasim's 13" MacBook Air the dashboard reads off (some elements too small, some too large); on his 5K monitor it looks right. Desktop and tablet (>= 768px) are the product target.

Method (Claude in Chrome, `resize_window`): audit the dashboard (sidebar + chat + canvas with a generated kit), the job feed and the tracker at these viewport widths, which cover the common fleet: 1280x800 and 1440x900 (13" MacBook looks-like resolutions), 1512x982 (14" MacBook Pro), 1710x1112 (16"), 1920x1080 (most common external monitor), 2560x1440 (4K/5K looks-like). Screenshot each, compare type scale, spacing, the CV preview scale and the three-column fit.

Fix rules:
- Surgical fixes per finding; follow `.claude/rules/design-system.md` exactly (it path-loads on any UI file).
- Look specifically for: fixed pixel widths that starve the chat or canvas column at 1280 to 1440; type below 12px effective; the CV preview page scale at narrow widths; the 760px chat max-width interacting with narrow canvases; horizontal scroll anywhere (never acceptable).
- If a finding needs a layout decision rather than a correction (for example a breakpoint where the canvas should collapse), write it down and ask Wasim instead of inventing one.

## Constraints

- Branch `rebrand/usefulapply`. Never commit to main. npm only. No new packages without asking. No schema changes are needed for any item; if one seems needed, stop and ask.
- `docs/agentic-chat-plan.md` is LOCKED: do not pull Phase 3 to 5 capabilities beyond what item 4 specifies (intent detection only, no credit-spending start_application tool).
- All new tool results carrying ad-derived text go through `flattenUntrusted` / `sanitizeUntrustedText` and `<< >>` wrapping. Tool arguments never carry a user id.
- Known deferred items, do not "fix" in passing: tracker chat keeps its own JSON-intent protocol (helpers are shared); the `refresh_credits` executed effect is intentionally unused until Phase 4; "archive" has no schema support.
- Lint baseline is 67 pre-existing errors; add zero new ones. `npx tsc --noEmit` must be zero.

## Verification protocol (a phase is not done without all of it)

1. `npx tsc --noEmit` zero errors, `npm run lint` no new findings.
2. Adversarial review (up to 5 parallel opus agents per the global rules); fix confirmed findings. Items 2 and 4 touch the tool registry and API route, so review at high depth.
3. Deploy: `npm run deploy:cf`.
4. Claude-in-Chrome pass on usefulapply.com with Wasim's signed-in account: exercise every changed behavior (sidebar without the chat-only entry, template question and template change, adaptive chips per state, ad vs question detection both ways, de-crowded replies) plus the responsive audit sizes. Ledger check: `llm_generations` rows via the Cloudflare API MCP (D1 database id `8cd7059e-4f0b-429b-aace-e379756707e1`), confirm `tool_call:<name>` operations and no failure spike.
5. Commit (conventional, one commit for the batch) and push `rebrand/usefulapply`.
