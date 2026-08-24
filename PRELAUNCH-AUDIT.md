# Pre-launch Audit and Patch Tracker (2026-08-23)

Consolidated, deduplicated findings from a 3-model read-only audit (GPT 5.6 Sol via Codex CLI, GLM 5.2 via opencode, Opus 5 subagent, plus a manual GLM 5.2 Max run). This file is the single source of truth for the patch phase: the implementer patches each bug and updates its Status line in place.

**Status values:** `TODO` | `IN PROGRESS` | `FIXED (short note: what was changed)` | `SKIPPED (reason)` | `NEEDS DECISION (question for Wasim)`

**Implementer rules:**
- Work on branch `fix/prelaunch-audit`. Never run git commands (no commits, no branch changes); the orchestrator handles git.
- Surgical edits only. Match existing style. No new npm packages. No drive-by refactors.
- D1 schema changes: write the migration file in `migrations/d1/` but NEVER apply it. Mark the bug `NEEDS DECISION` after writing.
- After each batch: `npx tsc --noEmit` must be zero errors, `npm run lint` clean for touched files.
- UI copy: no em dashes anywhere, use contractions, short sentences, no "X, Y, and Z" Oxford comma.
- If a fix is risky or ambiguous, set `NEEDS DECISION` with a one-line question instead of guessing.

**Verification key:** [V] = verified against code by orchestrator; [2x]/[3x] = independently found by 2 or 3 models.

---

## Batch A: Conversion killers (patch first)

### A1 [CRITICAL] [2x] Signup drops the paid-plan intent
- Files: `src/app/pricing/page.tsx:86`, `src/components/home/HomePricingButtons.tsx:18`, `src/app/auth/signup/page.tsx`, `src/app/auth/callback/page.tsx:29`, `src/app/api/auth/signup/route.ts:40`
- What: Signed-out visitors clicking Plus/Max are sent to `/auth/signup?plan=<tier>` but nothing ever reads `plan`. Email verification callback and Google OAuth both land on `/dashboard`. Every paid-intent visitor becomes a free user with no checkout.
- Fix: Persist the plan intent through signup (query param threaded into the verification `callbackURL` and OAuth `next`, or the existing `writeResumeIntent`/`readResumeIntent` localStorage pattern from GuidedLine). After first authenticated landing, route straight into checkout for that plan.
- Status: FIXED (preserved Plus/Max intent through email verification, Google OAuth and login, then started checkout from the authenticated pricing return)

### A2 [CRITICAL] [3x] Guided first-run line swallows every kit failure, including out-of-credits
- Files: `src/components/shell/GuidedLine.tsx:170-172` (error set), `:239-253` (failure routes to `fit-result`), `:786/844` (`lineError` rendered only when `step === 'job'`)
- What: On the analyze-first path, failures return the user to `fit-result`, where `lineError` is never rendered. Out-of-credits, model errors, network failures: screen snaps back unchanged. The insufficient-credits message also has no upgrade control (plain text, no button).
- Fix: Render `lineError` on the `fit-result` step (and any step a failure can land on). For insufficient credits, show an upgrade action (pattern: ChatPanel's DecisionChips calling `openSettings('usage')` at `ChatPanel.tsx:2135-2162`).
- Status: FIXED (rendered guided-line failures on both return steps and added an inline Usage upgrade action for insufficient credits)

### A3 [HIGH] [3x] Checkout return: stale credits, no processing state, app stays on old plan, refresh kills feedback
- Files: `src/components/settings/UsageBillingPane.tsx:61-101, 220-230`, `src/components/settings/SettingsModal.tsx:36-49`, `src/hooks/useCreditsBalance.ts:53`
- What: After Stripe checkout the pane polls 8x2s with no "payment processing" indicator; if the webhook is slow the user who just paid sees "Free plan, 4 credits". Polling updates only pane-local state, never dispatches `CREDIT_UPDATE_EVENT`, so gates/sidebar stay Free until reload. SettingsModal strips the `settings` param, so a refresh mid-window shows the dashboard with no feedback at all.
- Fix: Show an explicit processing state while polling; on success dispatch the credit-update event so the whole app refreshes; on poll exhaustion show a "still processing, refresh in a moment" message instead of silence; survive refresh (keep or re-derive the success intent while `success=true&session_id` present).
- Status: FIXED (added persistent checkout processing feedback, webhook-aware polling, global credit refresh and a delayed-payment message)

### A4 [HIGH] Free users get a credit-pack CTA that always fails with a browser alert
- Files: `src/app/pricing/page.tsx:293, 322` (and `alert()` usages at `:99, 104, 125, 130`), `src/app/api/stripe/create-addon-checkout/route.ts:70`
- What: The pricing page renders an enabled $19.99 pack button for signed-in free users; the API 403s ("Plus and Max subscribers" only) and the client shows a native `alert()`.
- Fix: For free users, point the pack CTA at the Plus upgrade (or disable with a short explanation). Replace all native `alert()` calls on the pricing page with inline error UI.
- Status: FIXED (free users now get a Plus upgrade CTA and all pricing checkout failures render inline instead of native alerts)

---

## Batch B: Billing correctness

### B1 [CRITICAL] [V][3x] Subscription events grant full credits without payment check; same-tier events refill for free
- Files: `src/app/api/stripe/webhook/route.ts:127-132, 286-373`, `src/db/repos/credits.ts:745-749`
- What: Every `customer.subscription.created`/`updated` calls `applyPlanChange` regardless of `subscription.status` (an `incomplete` unpaid sub gets credits). Same-tier counts as upgrade (`isDowngrade` false), so any portal event (cancel-at-period-end toggle, payment-method change) resets `monthly_credits` to the full allowance.
- Fix: Only grant credits when status is `active` or `trialing`. In `applyPlanChange`, treat same-tier as a no-op for credits (update status/subscription id only). Sync status fields regardless.
- Status: FIXED (credit grants now require active or trialing status, same-tier events preserve balances and subscription status still syncs)

### B2 [CRITICAL] [V][2x] Move-to-Max creates a second subscription (double billing)
- Files: `src/app/api/stripe/create-checkout/route.ts:71-126`, `src/components/settings/UsageBillingPane.tsx:185, 298`
- What: The upgrade path always creates a new `mode: 'subscription'` Checkout Session. An existing Plus subscriber upgrading keeps Plus and adds Max; Stripe bills both; the DB tracks only the newer subscription id.
- Fix: If the user already has an active subscription, modify it (Stripe subscription item update with proration) or send them through the billing portal's plan-change flow instead of a fresh checkout. At minimum, block a second subscription checkout when one is active.
- Status: FIXED (active subscribers are blocked from creating a second checkout and paid plan changes now open the billing portal)

### B3 [HIGH] [V] Webhook failures permanently suppressed; credit-write failures still return 200
- Files: `src/app/api/stripe/webhook/route.ts:96-126` (dedupe insert before processing), `:162-242` (swallowed credit failures), `:188`
- What: The dedupe row is inserted before the handler runs; if the handler throws, the route returns 500 but the row stays, so Stripe's retry is answered "duplicate". Inside `handleCheckoutCompleted`, credit-write failures are logged and swallowed with a 200. A paying customer can get nothing, permanently.
- Fix: On handler failure, delete the dedupe row (or store a status column and let retries reprocess failed events) before returning 500. Propagate credit-write failures out of the handler so the route returns non-200.
- Status: FIXED (failed webhook events now release their dedupe row and checkout credit-write failures propagate for Stripe retry)

### B4 [HIGH] [V] Every successful invoice is treated as a monthly renewal
- Files: `src/app/api/stripe/webhook/route.ts:415-440`
- What: `handlePaymentSucceeded` calls `applyRenewalReset` for every `invoice.payment_succeeded`, with no `billing_reason` check. The initial invoice after activation double-grants (Plus can start at 100, Max at 300 via rollover); proration invoices trigger early refills.
- Fix: Only run the renewal reset when `invoice.billing_reason === 'subscription_cycle'`.
- Status: FIXED (renewal credits now reset only for subscription-cycle invoices)

### B5 [HIGH] [V] Partial refunds remove credits more than once; amount map breaks on non-standard charges
- Files: `src/app/api/stripe/webhook/route.ts:455-495`
- What: Each `charge.refunded` event recomputes removal from Stripe's cumulative `charge.amount_refunded` without subtracting what earlier refund events already removed. Two $5 refunds on Plus remove ~38 credits instead of ~25. Also the amount-to-credits map only knows 7999/1999 and falls back to current `plan_tier` for anything else (prorations, multi-period charges).
- Fix: Track credits already removed per charge (ledger row keyed by charge id) and remove only the delta. Prefer the individual refund object's amount over the cumulative field.
- Status: FIXED (refunds now reconcile against one charge-keyed ledger entry using exact refund amounts and Stripe checkout or invoice price metadata)

### B6 [HIGH] [V][3x] Full kit for 1.5 credits via forged or expired contextId
- Files: `src/app/api/agent-v2/route.ts:667-757`
- What: The `generate_with_context` cache-miss fallback runs the complete `runJobCopilot` while charging `GENERATION_AFTER_FIT` (1.5) on the assumption that fit analysis (0.5) already ran, but nothing verifies that. Direct API call with a bogus `contextId` = full kit at 25% off.
- Fix: Before applying the 1.5 discount, verify a captured `FIT_ANALYSIS` reservation exists for this user (idempotency key lookup or a fit marker tied to the flow). Otherwise reserve `FULL_APPLICATION` (2.0).
- Status: FIXED (the 1.5-credit continuation now requires a captured fit reservation tied to the server-issued context ID)

### B7 [HIGH] [V][3x] Stale-reservation reconciler cron is disabled
- Files: `wrangler.jsonc:337`, `src/cron/index.ts:49-64`
- What: `*/10 * * * *` is commented out; it is the only caller of `releaseStaleReservations` and `expireStaleJobFeedApplicationGenerations`. Interrupted generations strand credits forever and stuck feed generations never expire. Three routes explicitly defer recovery to this reconciler.
- Fix: Uncomment only the `*/10 * * * *` line (leave the other disabled crons off). Confirm `src/cron/index.ts` handles it.
- Status: FIXED (enabled only the ten-minute reconciler cron; the other disabled cron entries remain off)

### B8 [HIGH] [2x] Regenerations charge for empty output and before delivery; retries re-charge
- Files: `src/app/api/regenerate/route.ts:226-243`, `src/lib/regenerate-client.ts:176`
- What: Cover-letter and email paths capture the reservation without validating non-empty output (`generateCoverLetter` returns `''` on empty model content). The route also persists nothing server-side, so a response lost after capture loses the paid rewrite, and each retry generates a new request id (new charge).
- Fix: Validate non-empty output before capture and release the reservation on empty (mirror `tracker/follow-up/route.ts:160-167`). Persist the result to the session server-side before or with the capture.
- Status: FIXED (regenerations now reject empty output, persist to the owned session before capture and reuse the same request ID on retry)

### B9 [CRITICAL] Charged kit can disappear permanently
- Files: `src/app/api/agent-v2/route.ts:145, 952`, `src/hooks/useSupabaseSync.ts:645`, `src/lib/open-session.ts:23`
- What: Credits are captured before the browser receives `workflow_complete`. `persistGeneratedArtifacts` skips `session-*` ids (every local first-run session), so a dropped SSE connection loses the entire paid kit with no server copy. For persisted sessions, recovery data goes to `generated_artifacts`, a column no hydration path ever reads.
- Fix: Read `generated_artifacts` during session hydration (merge into `generated_cv`/`cover_letter`/`email` when the normal columns are empty). For first-run local sessions, create the server session before generation (or persist the kit under a recoverable key) so there is always a server copy once credits are captured.
- Status: FIXED (paid generation now persists local sessions first, requires server artifact storage before capture and hydrates missing kit fields from generated artifacts)

### B10 [MEDIUM] `handleCheckoutCompleted` clobbers monthly credits without OCC
- Files: `src/app/api/stripe/webhook/route.ts:236-248`, `src/db/repos/credits.ts:599-620`
- What: Uses `updateUserCreditsRow` (plain UPDATE, no version guard, no balance preservation) to hard-set `monthly_credits`, wiping unused credits on upgrade-via-checkout. `handleSubscriptionUpdate` uses the safer `applyPlanChange`; this path does not.
- Fix: Use `applyPlanChange` (with B1's status/same-tier gating) in the checkout-completed handler.
- Status: FIXED (checkout now retrieves the actual subscription and applies its plan through the version-guarded plan-change path)

### B11 [MEDIUM] Concurrent replay: one reservation, several generations
- Files: `src/db/repos/credits.ts:982-1006`, `src/app/api/agent-v2/route.ts:854`
- What: An existing in-flight (`reserved`) reservation returns `success: true`, and the route then runs another full generation. Simultaneous requests with the same `x-request-id` and different job descriptions each run a kit for one charge.
- Fix: When `reserveCredits` returns an existing reserved reservation (not newly created), reject the request as a duplicate in-flight run instead of proceeding.
- Status: FIXED (existing in-flight reservations now return a distinct duplicate response and never authorize another generation)

### B12 [MEDIUM] Spent reservation replay returns a misleading "insufficient credits / upgrade" error
- Files: `src/app/api/agent-v2/route.ts:536-549`, `src/db/repos/credits.ts:1000-1006`
- What: A reused `x-request-id` on a spent key returns `RESERVATION_SPENT`, which the route maps to `INSUFFICIENT_CREDITS` with `available: 0`. A paid user retrying sees "upgrade required".
- Fix: Handle `RESERVATION_SPENT` distinctly ("This request already completed") and do not emit the upgrade path.
- Status: FIXED (spent request IDs now return an already-completed response without an upgrade prompt)

### B13 [LOW] Plan changes write no credit-ledger row
- Files: `src/app/api/stripe/webhook/route.ts:236-248`, `src/db/repos/credits.ts` (`applyPlanChange`)
- What: Checkout and plan-change paths update balances without inserting a `credit_transactions` row, leaving gaps in the Usage panel's history.
- Fix: Insert a ledger row on plan grant/change.
- Status: FIXED (credit-changing plan updates now write an atomic balance ledger row alongside the version-guarded update)

### B14 [LOW] Paid users have no overdue-reset fallback if a renewal webhook is lost
- Files: `src/db/repos/credits.ts:526-562`
- What: `processOverdueMonthlyResets` sweeps only `free` tier. A dropped `invoice.payment_succeeded` leaves a paid user without their refill until the next successful webhook.
- Fix: Add a paid-tier overdue sweep with a generous grace period (e.g. reset when `next_reset_date` is >3 days past and status is active).
- Status: FIXED (the daily sweep now resets active paid plans only after a three-day overdue grace period with a due-date guard)

### B15 [MEDIUM] [2x] Fit-analysis context deleted before generation success is known
- Files: `src/app/api/agent-v2/route.ts:801-836`
- What: `removeCachedContext` runs unconditionally after `runWithContext` returns (which returns `{success:false}` rather than throwing), so a failed generation destroys the cached context. Refresh-after-failure forces a 0.5-credit fit re-run.
- Fix: Delete the cached context only on success.
- Status: FIXED (fit context is now removed only after successful persistence, capture and completion enqueue)

### B16 [MEDIUM] [2x] Anonymous free fit check consumed before the client receives results
- Files: `src/app/api/agent-v2/route.ts:590-605`
- What: `recordAnonymousGenerationSafe(ipHash)` runs before the `fit_analysis_complete` SSE enqueue. A dropped connection in that window spends the free check with nothing shown; retry hits the limit wall.
- Fix: Record after the enqueue succeeds (accepting the small inverse race), or tolerate one retry within a short window.
- Status: FIXED (anonymous usage is now recorded only after the fit result is enqueued to the response stream)

---

## Batch C: Security and data integrity

### C1 [CRITICAL] [V] Anonymous free-generation gate is racy and has no DB constraint
- Files: `src/db/schema.ts:111-118`, `src/db/repos/anonymous.ts:18-20`, `src/app/api/agent-v2/route.ts:414-434`
- What: `anonymous_generations` has only an index on `ip_hash` (no UNIQUE), and the gate is check-then-write. Concurrent requests from one IP all pass, each burning a real Bedrock call. Open cost drain.
- Fix: Write a migration in `migrations/d1/` adding a unique index on `ip_hash` (dedupe existing rows first in the migration), switch the gate to INSERT-first (`INSERT OR IGNORE`, proceed only if the row was inserted). Do NOT apply the migration; mark NEEDS DECISION when written.
- Status: FIXED (Wasim approved 2026-08-23: migration 0008 applied to local and production D1; 0007 was already live in production, and both entries are now reconciled in the drizzle journal. The E1 conditional-INSERT gate is also correct without the index, so code and schema are consistent either way.)

### C2 [HIGH] Client-controlled IP headers can defeat rate limits and the anonymous gate
- Files: `src/lib/middleware/rateLimiter.ts:214-222`
- What: `getClientIP` falls back from `cf-connecting-ip` to `x-vercel-forwarded-for`/`x-forwarded-for`/`x-real-ip`, all client-settable. If the CF header is ever absent, an attacker rotates apparent IPs freely (unlimited free generations combined with C1).
- Fix: In production (Workers), trust `cf-connecting-ip` only; keep the fallbacks behind a dev-environment check.
- Status: FIXED (production now trusts only Cloudflare's connecting-IP header; forwarded-header fallbacks remain development-only)

### C3 [HIGH] All anonymous users share one context-cache namespace (CV PII replay)
- Files: `src/app/api/agent-v2/route.ts:75-77, 583, 629`
- What: Cache keys are `anon:<contextId>` for every anonymous user. Anyone who obtains a `contextId` within the 30-min TTL can fetch another person's parsed CV (name, email, phone, experience) via `generate_with_context`.
- Fix: Scope anonymous cache keys by `ipHash` (key = `anon:<ipHash>:<contextId>`) and require the same ipHash on read.
- Status: FIXED (anonymous context cache keys now include the server-derived IP hash on write, read and delete)

### C4 [HIGH] `/api/regenerate` trusts a client-authored MasterContext (anti-hallucination bypass)
- Files: `src/app/api/regenerate/route.ts:46-174`
- What: The route rebuilds `masterContext` entirely from request-body fields (`rawCV`, `masterCV`, `optimizedCVData`, `verifiedMetrics`) with no session ownership check; `context.sessionId` is never validated. The anti-hallucination guards then verify the rewrite against a haystack the caller chose.
- Fix: Require a valid `sessionId`, load the session server-side (`getSession(user.id, sessionId)`, 404 on miss, pattern from `tracker/follow-up/route.ts:49-52`), and source `rawCV`/`masterCV` from server-held data, not the request body.
- Status: FIXED (regeneration now loads the owned session and stored CV documents, ignoring client-authored source CV, job, match and applicant data)

### C5 [HIGH] Stale sync requests leak one account's data into another
- Files: `src/hooks/useSupabaseSync.ts:172, 287`
- What: Document/session load effects await network calls then write global persisted Zustand stores with no abort or active-user check. After logout or account switch, an old request can repopulate the new account's stores with the previous user's CV, photo and applications (persisted to localStorage).
- Fix: Capture the user id per effect run and bail before every store write if the active user changed; add cleanup/abort on user change.
- Status: FIXED (document and session hydration now capture the user ID and cancel or bail before writes after an account change)

### C6 [HIGH] Tracker store survives account switches
- Files: `src/contexts/AuthContext.tsx:57`, `src/store/useTrackerStore.ts:95`, `src/components/tracker/TrackerCanvas.tsx:76`
- What: Auth cleanup resets CV/session/UI/feed stores but not the tracker store. A second account sees the previous user's companies, roles, statuses and tracker conversation; an in-flight load can overwrite the new account's data.
- Fix: Add a tracker reset to the auth cleanup and a stale-request guard on `loadRows`-style effects.
- Status: FIXED (auth cleanup now resets tracker state and a generation guard prevents stale tracker loads from committing)

### C7 [MEDIUM] [V] Negative inbox offset bypasses the free-tier visibility cap
- Files: `src/app/api/job-feed/inbox/route.ts:42-60`
- What: The route parses `offset` without clamping; `visibleCap - offset` with `offset=-100` exposes far more than the 5 allowed roles (the data layer clamps its own copy to 0, so page zero returns).
- Fix: Clamp `offset` to `>= 0` in the route.
- Status: FIXED (the inbox route now clamps offset to zero before querying and applying the free-tier visibility cap)

### C8 [MEDIUM] Chat message cap computed from client-supplied history
- Files: `src/app/api/chat/route.ts:148-154`
- What: The per-application message cap trusts the history array the client sends, so the cap is bypassable by sending a trimmed history.
- Fix: Count messages server-side (session-scoped) or accept and document the soft cap.
- Status: FIXED (the chat route now verifies session ownership and counts stored user messages server-side)

---

## Batch D: State, flow and UX correctness

### D1 [HIGH] [V][2x] Streaming completion writes into whichever application is open
- Files: `src/components/chat/useAgentWorkflow.ts:783` (capture), `:913-1025` (writes via `updateCurrentSession`)
- What: The hook captures `workflowSessionId` but every completion handler writes through `updateCurrentSession`. Switching applications mid-generation overwrites the other application's CV/letter/email locally, then sync persists the corruption.
- Fix: Write results via `updateSessionById(workflowSessionId, ...)` (already used by regenerate/screening paths).
- Status: FIXED (fit and kit streams now write result fields and completion messages only to their originating session)

### D2 [HIGH] Edit buffers follow the user across session switches
- Files: `src/components/CVPanel.tsx:117`, `src/components/CoverLetterPanel.tsx:66`, `src/components/EmailPanel.tsx:46`
- What: Panel edit buffers are component-local and not reset when `currentSession.id` changes; Save targets whatever session is current at save time. Editing A, opening B, saving writes A's content into B.
- Fix: Reset edit buffers (and exit edit mode) on session id change; save against the session id captured when editing began.
- Status: FIXED (CV, cover-letter and email edit buffers now reset on application changes and save only to the captured session ID)

### D3 [HIGH] Returning user on a fresh browser is treated as brand new
- Files: `src/hooks/useSupabaseSync.ts:299, 418`, `src/app/dashboard/page.tsx:170`, `src/components/shell/GuidedLine.tsx` (step pinned in `useState` initializer)
- What: Two paths: (1) a transient session-load failure still marks hydration complete, hiding saved applications and routing into first-run onboarding; (2) the sessions effect can win the race against the documents effect, so a paid user on a second device gets asked to re-upload their CV.
- Fix: Surface load failures with a retry instead of completing hydration; gate first-run routing on both sessions AND documents hydration; let GuidedLine advance its step when a CV arrives after mount.
- Status: FIXED (first-run waits for successful session and document hydration, load failures show retry and late CV hydration advances the guided line)

### D4 [MEDIUM] [2x] Expired session shows "create a free account" to a signed-in user
- Files: `src/components/ChatPanel.tsx:240-242, 292-298`, `src/app/api/agent-v2/route.ts:414-423`, `src/components/tracker/TrackerConversation.tsx:81`, `src/lib/regenerate-client.ts:258`
- What: The SSE path can't distinguish "anonymous" from "session expired", so expired users are told to create an account (risking duplicate signups). The tracker chat ignores the `SIGNED_OUT` code entirely and says "try again in a moment" forever.
- Fix: Distinguish signed-out (present a "Sign in again" action, pattern already exists at `ChatPanel.tsx:1256-1261`); handle `SIGNED_OUT` in the tracker conversation.
- Status: FIXED (signed-in clients now turn anonymous or 401 responses into a sign-in-again action, including tracker follow-ups)

### D5 [MEDIUM] [2x] Auth flows can spin forever
- Files: `src/app/auth/callback/page.tsx:28-55`, `src/components/auth/GoogleSignInButton.tsx:20`
- What: Rejected promises in the callback session lookup and the Google sign-in call are uncaught; loading states never clear. A network blip leaves "Completing sign in..." forever.
- Fix: try/catch both paths, clear loading, show a retry action.
- Status: FIXED (callback and Google sign-in failures now clear loading, show an error and offer a retry)

### D6 [MEDIUM] Rejected CV files are silently ignored in the first-run uploader
- Files: `src/components/shell/GuidedLine.tsx:499`
- What: Dropzone `maxSize`/`accept` rejections have no `onDropRejected` handler; oversized or unsupported files make the picker look dead.
- Fix: Add `onDropRejected` with a short size/type message.
- Status: FIXED (rejected uploads now show a short size or file-type message)

### D7 [MEDIUM] CV parsing has no client-side timeout and the progress bar stalls
- Files: `src/components/shell/GuidedLine.tsx:284-290, 414-426`
- What: No timeout around parse; the staged progress bar is designed to stall near the end, so a hung request looks like slow progress forever.
- Fix: Add a timeout with a friendly retry message.
- Status: FIXED (CV parsing now aborts after 60 seconds and offers a friendly retry message)

### D8 [MEDIUM] Non-CV documents pass parsing as valid CVs
- Files: `src/app/api/parse-cv/route.ts:255, 899`
- What: Only a 50-char minimum is enforced; a job ad or letter parses into an empty-profile CV and lets the user burn credits downstream.
- Fix: After parsing, require minimal CV signals (a name plus at least one of experience/education/skills); return a friendly "this doesn't look like a CV" error otherwise.
- Status: FIXED (parsed documents now require a name plus experience, education or skills before acceptance)

### D9 [MEDIUM] Invalid CV model output is billed as a successful kit
- Files: `src/lib/agents/unified-writer-agent.ts:1191`
- What: JSON parse/mapping failures fall back to an empty structured CV; the workflow still completes and captures credits. Unvalidated casts can also crash templates (`exp.bullets.map`).
- Fix: Fail the CV step on parse failure (release reservation, emit step_error) instead of returning the empty fallback.
- Status: FIXED (invalid structured CV output now fails the generation step instead of returning an empty billed kit)

### D10 [MEDIUM] Cover letters and emails are English-only for 5 of 7 detected languages
- Files: `src/lib/agents/prompts/email-prompts.ts:18`, `src/lib/agents/prompts/cover-letter-prompt.ts:357`
- What: Language handling is a German/English boolean; French, Spanish, Portuguese, Italian and Dutch ads get a localized CV with an English letter/email.
- Fix: Generalize the instruction to write in the detected/override language.
- Status: FIXED (cover letters, application emails and follow-ups now follow all seven detected languages)

### D11 [MEDIUM] Job-feed daily run race: `queued` status unhandled
- Files: `src/lib/job-feed/server.ts:1325, 1573`
- What: The raced-insert loser handles `completed` and `running` winners but not the default `queued`, so both callers proceed to run the full workflow (duplicate SerpAPI + ranking spend).
- Fix: Treat a `queued` winner as claimable by exactly one caller (atomic claim on the status transition).
- Status: FIXED (queued job-feed runs now use an atomic queued-to-running claim so only one caller proceeds)

### D12 [MEDIUM] Paid fit result loses its continuation on refresh
- Files: `src/components/chat/useAgentWorkflow.ts:689`, `src/hooks/useSupabaseSync.ts:599`, `src/components/ChatPanel.tsx:1984`
- What: `pendingFitAnalysis` (contextId + fallback context) is never persisted or rehydrated. Refresh after a paid feed fit check removes the "generate kit" continuation; redoing it charges another 0.5.
- Fix: Persist `pendingFitAnalysis` with the session and map it back on hydration.
- Status: FIXED (authenticated fit results now persist on the session and rehydrate for 30 minutes after refresh)

### D13 [MEDIUM] Scheduled cancellation shown as "next invoice"
- Files: `src/components/settings/UsageBillingPane.tsx:230`, webhook `:359`
- What: `cancel_at_period_end` is stored but never loaded by the pane; after cancelling, the user sees "next invoice <date>" and no confirmation.
- Fix: Load the subscription row and render a "plan ends <date>" state when cancellation is scheduled.
- Status: FIXED (billing now loads the subscription row and shows the plan end date for scheduled cancellations)

### D14 [MEDIUM] Anonymous free check is one per IP forever
- Files: `src/db/repos/anonymous.ts`, `src/app/api/agent-v2/route.ts:424-433`
- What: No TTL and no cleanup on `anonymous_generations`. Office NAT/CGNAT users find the "no account needed" demo permanently spent by a stranger.
- Fix: Check against a window (e.g. 30 days) rather than forever. Coordinate with C1's migration.
- Status: FIXED (anonymous IP claims now renew after a 30-day window using the C1 unique key)

### D15 [MEDIUM] Daily job-feed gate trusts a user-settable timezone
- Files: `src/app/api/job-feed/run/route.ts:48-62`, `src/lib/job-feed/server.ts:1269-1272`
- What: The once-per-day gate keys off a client-supplied timezone; changing it re-arms the daily run.
- Fix: Gate on a server-side UTC window (or persist the timezone server-side at settings time and ignore the request value).
- Status: FIXED (job-feed run gating, cooldowns and today classification now use a server-owned UTC day)

### D16 [LOW] Credit counter contradicts the refund message
- Files: refund/stop paths in `src/components/chat/useAgentWorkflow.ts` + `src/hooks/useCreditsBalance.ts`
- What: After a refunded failure the chat says credits weren't charged while the counter still shows the deduction until reload.
- Fix: Dispatch `CREDIT_UPDATE_EVENT` after a refund lands.
- Status: FIXED (refund and stop error paths now refresh the visible credit balance after the reservation releases)

### D17 [LOW] Anonymous fallback throw leaves a feed generation `running` for 15 minutes
- Files: `src/app/api/agent-v2/route.ts:676-697, 967-974`
- What: If `reserveCredits` throws before `activeReservationUserId` is set, the catch block skips the failed transition; the row waits for the stale-lease sweeper.
- Fix: Transition on `clientSessionId` + authenticated user, not on the reservation variable.
- Status: FIXED (failed generation transitions now use the authenticated user even if credit reservation setup throws)

### D18 [LOW] Dead duplicate `full_optimization` branch
- Files: `src/app/api/agent-v2/route.ts:896-946`
- What: `if (action === 'full_optimization')` and its `else` are identical; the `else` is unreachable.
- Fix: Optional cleanup; skip if anything is unclear.
- Status: FIXED (the duplicate unreachable full-optimization branch was collapsed into one workflow call)

---

## Excluded (audited, judged not bugs)
- GLM: `detectLanguage` global-flag regexes (safe with `String.match`), `addCredits` negative-amount guard (no live caller), and "client never stores fit backup" (false: `useAgentWorkflow.ts:689` handles `fit_analysis_complete`; only the unused `useAgentV2` hook lacks it).

## Model scorecard (round summary)
- GPT 5.6 Sol (Codex): 29 findings, highest precision, owned billing correctness. Selected as patch implementer.
- Opus 5: 19 findings, best conversion-journey catches (A1, A2).
- GLM 5.2 (delegated): 20 findings incl. unique security items (C1-C4); 3 padded non-bugs, 1 false finding.
- GLM 5.2 Max (manual): 6 findings, precise, low recall.

## Batch E: Adversarial review round 1 (5 independent Opus reviewers over the A-D diff)

These are confirmed regressions or gaps introduced by the A-D patches, plus a few pre-existing items the review surfaced. Same rules and status conventions as above. Criticals first.

### E1 [CRITICAL] Anonymous gate is fail-open without migration 0008 (confirmed by all 5 reviewers; supersedes C1/D14 status)
- Files: `src/db/repos/anonymous.ts:8-27`, `migrations/d1/0008_unique_anonymous_ip_hash.sql`
- What: `claimAnonymousGeneration` relies on `INSERT OR IGNORE` conflicting on a UNIQUE index that exists only in the unapplied migration. Live schema: INSERT always succeeds, `changes==1`, every request is granted (unlimited free Bedrock calls). And an IP with a >30-day row gets 2 changes and is wrongly denied forever.
- Fix: Make the claim correct WITHOUT the unique index: a single conditional statement, e.g. `INSERT INTO anonymous_generations (id, ip_hash, generated_at) SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM anonymous_generations WHERE ip_hash = ?2 AND generated_at >= ?4)` and claim only when changes==1 (handles the 30-day window: stale rows don't block the insert). Keep migration 0008 as defense in depth, add `IF NOT EXISTS` to its CREATE UNIQUE INDEX.
- Status: FIXED (anonymous claims now use one conditional insert that works before migration 0008, with the unique index kept as idempotent defense in depth)

### E2 [CRITICAL] C8 fix broke chat for every new conversation
- Files: `src/app/api/chat/route.ts:147-160`, callers at `src/components/chat/useAgentWorkflow.ts:468, 586`
- What: The route now 409s (`CHAT_SESSION_REQUIRED`) unless a D1-persisted UUID sessionId is sent. New conversations use local `session-*` ids (or none), which only persist after a kit generation, so first-run and pre-generation chat is permanently broken.
- Fix: Accept a missing or local (`session-*`) sessionId again. Enforce ownership only when a UUID id is provided. Count server-side messages only for persisted sessions; for local sessions fall back to capping on the (client-sent) history length as before. Remove the hard 409.
- Status: FIXED (new and local conversations can chat again, while persisted sessions keep ownership checks and server-side message counts)

### E3 [CRITICAL] Hydration deadlock: dashboard spins forever (StrictMode reproduces on every dev load)
- Files: `src/hooks/useSupabaseSync.ts:190-191, 318-319, 438`, `src/app/dashboard/page.tsx:176`
- What: Both load effects set their run-once refs before awaiting, and the new `cancelled` cleanup makes run 1 bail after the await while run 2 bails on the ref. `setDocumentsHydrated`/`setSessionsHydrated` never fire, `hydrationError` stays null, spinner never resolves, retry unreachable, session sync permanently disabled.
- Fix: Reset the run-once refs in the effect cleanup (so a re-run reloads), or set the hydrated flags on every terminal path of a cancelled run. Must be StrictMode-safe.
- Status: FIXED (document and session load guards now reset during effect cleanup so StrictMode reruns can complete hydration)

### E4 [CRITICAL] Regeneration retry is a permanent false upgrade wall
- Files: `src/app/api/regenerate/route.ts:152-168`, `src/db/repos/credits.ts:1094-1104, 1174-1180`, `src/components/ChatPanel.tsx:859`
- What: Retry reuses the same requestId; the failed attempt released the reservation (status `released`); `reserveCredits` replay maps any non-reserved status to failure; the route maps every reserve failure to 402 INSUFFICIENT_CREDITS with `available: 0, upgradeRequired: true`.
- Fix: (1) In `reserveCredits`, allow re-reserving a key whose existing status is `released` (a released reservation is not spent). (2) In `/api/regenerate`, map `RESERVATION_SPENT`/`RESERVATION_IN_FLIGHT` to distinct, honest errors (mirror agent-v2's B12 payload), never to insufficient credits. (3) In the write-then-verify recovery branch where THIS call's deduct succeeded and the row exists, return success as before instead of IN_FLIGHT failure that strands held credits.
- Status: FIXED (released reservations can be claimed again, write-then-verify recognizes this call's row and regeneration replay states have honest 409 responses)

### E5 [HIGH] B14 sweep grants most new subscribers a free extra month
- Files: `src/db/repos/credits.ts:544-548`, `applyPlanChange`, `handleCheckoutCompleted`
- What: Nothing aligns `next_reset_date` to the Stripe billing anchor at subscribe time, so the paid overdue sweep fires on the signup anniversary and grants a full refill before the first real renewal.
- Fix: On plan change/checkout completion, set `next_reset_date` from the subscription's `current_period_end`. The sweep then fires only when a real renewal was missed.
- Status: FIXED (plan changes now align the fallback reset date to Stripe's current period end)

### E6 [HIGH] B3 rework enables double grants and permanent retry loops
- Files: `src/app/api/stripe/webhook/route.ts:178-182, 203, 236, 253, 487, 519`, `src/db/repos/credits.ts:697-715, 855-866`
- What: (1) Deleting the dedupe row on ANY throw means a D1 committed-but-response-dropped failure double-grants add-ons and renewals on Stripe retry. (2) Permanent conditions (missing `metadata.userId`, unknown planTier, non-string subscription, user-not-found, unclassifiable refund) now throw, so Stripe retries a hopeless event for ~3 days.
- Fix: Make the grants idempotent with ledger keys derived from the Stripe object id (per `invoice.id` for renewals, per `session.id` for add-ons, matching the per-charge refund pattern), keep the dedupe-row release only for transient errors, and log-and-return-200 for permanent conditions.
- Status: FIXED (add-on and renewal grants now use Stripe-object ledger keys, transient failures alone release dedupe and permanent malformed events return 200)

### E7 [HIGH] Failed-card checkout locks the user out of paying (B1+B2 interaction)
- Files: `src/app/api/stripe/create-checkout/route.ts:79-84`, `src/app/api/stripe/webhook/route.ts:347-354`
- What: An `incomplete` subscription id gets persisted (grantCredits=false path still writes id+status), and the new guard 409s every checkout retry until Stripe expires it (~23h). `incomplete_expired`/`unpaid` trap permanently.
- Fix: Block a second checkout only when the existing subscription status is `active`, `trialing` or `past_due`.
- Status: FIXED (checkout retries are blocked only for active, trialing or past-due subscriptions)

### E8 [HIGH] Plus-to-Max upgrade may be impossible via the portal
- Files: `src/app/api/stripe/create-portal/route.ts:39-42`, `src/app/pricing/page.tsx` (logged-in paid flow)
- What: The portal session has no `flow_data` and relies on the dashboard's default portal config having plan switching enabled. If not, upgrades are blocked entirely. Pricing page still sends paid users to create-checkout, which now 409s.
- Fix: For a paid user upgrading, create the portal session with `flow_data: { type: 'subscription_update', subscription_update: { subscription: <id> } }`. Route logged-in paid users on /pricing to that flow instead of checkout.
- Status: FIXED (paid pricing upgrades now open Stripe's subscription-update portal flow for the existing subscription)

### E9 [HIGH] C4 rewrite guts the anti-hallucination allow-list
- Files: `src/app/api/regenerate/route.ts:434` (applicantFromDocument), prompts consuming skills/experiences/verifiedMetrics
- What: The server-built applicant has hardcoded empty skills/tools/languages/experiences and drops verifiedMetrics, so regenerated letters/emails render a binding-but-empty allow-list. Quality regression on every regen.
- Fix: Populate applicant fields and verifiedMetrics from server-held data: the session's stored optimizedCVData/fit context, or the parsed structured primary CV document. Never send an empty allow-list when server data exists.
- Status: FIXED (regeneration now restores applicant facts and verified metrics from persisted generation provenance, then trusted CV documents, with optimized output only as a final fallback)

### E10 [HIGH] D9 validator rejects valid CVs missing optional sections
- Files: `src/lib/agents/unified-writer-agent.ts:672-676, 1293-1302, 1342`
- What: Requires languages/certifications/technologies arrays that the mapper below happily defaults; a CV with no certifications fails the whole 2.0-credit run. Specific messages are swallowed by the generic rethrow; tokens are untracked on failure.
- Fix: Require only `personal` and `experience` shapes; coerce missing optional lists to `[]`; keep token tracking on the failure path.
- Status: FIXED (optimized CV validation now requires only personal and experience, normalizes optional lists and nested string arrays and retains provider-ledger token usage on invalid output)

### E11 [HIGH] persistGeneratedArtifacts now throws away billed output
- Files: `src/app/api/agent-v2/route.ts:170-184, 609, 770, 840, 936`
- What: Changed from best-effort to throwing, awaited before every terminal SSE event; a transient D1 write failure (or a `session-*` id reaching the route) destroys a generated, billed kit and refunds instead of delivering.
- Fix: Restore best-effort semantics (log, continue, still emit the SSE event with results). Recovery persistence must never block delivery.
- Status: FIXED (artifact recovery writes are best-effort again, so missing local sessions or transient D1 failures are logged without blocking the completed SSE result)

### E12 [HIGH] B9 eager session creation breaks fit-only-local design and session reuse
- Files: `src/components/chat/useAgentWorkflow.ts:644` (and the fit flow), `src/hooks/useSupabaseSync.ts:473-490`
- What: Every fit check now creates a permanent tracker row (the code explicitly avoided "Unknown Company" clutter), and authenticated sessions never hit the `isLocalSession` branch so `findReusableSession` merging is dead: repeat generations duplicate rows.
- Fix: Create the server session eagerly only when kit generation starts (runAgentWorkflow), not for fit-only flows. Preserve the reuse/merge behavior where possible; if a residual reuse regression remains, note it in the Status.
- Status: FIXED (fit-only checks stay local again and server session creation waits for kit generation; the existing eager kit save still bypasses reusable-session matching and needs a separate lifecycle redesign)

### E13 [HIGH] CVPanel save can wipe ATS analysis after refresh
- Files: `src/components/CVPanel.tsx:598`
- What: Save looks up `sessions.find(id === editSessionId)`; after refresh the open session lives only in `currentSession`, lookup misses, and `analysis`/`sectionHeaders`/`localizedStrings` are saved as undefined.
- Fix: Fall back to `currentSession` when its id matches `editSessionId` (same pattern as `updateSessionById`).
- Status: FIXED (optimized CV saves now fall back to the matching current session before preserving ATS analysis and localized fields)

### E14 [HIGH] GuidedLine late-CV effect swallows the new D6/D7 error states
- Files: `src/components/shell/GuidedLine.tsx:195-196, 513`
- What: The effect advances off `cv` whenever a currentCV exists, so parse-timeout and file-rejection messages are never seen by users re-uploading over an existing CV.
- Fix: Gate the auto-advance on first hydration (a ref set once), and never advance while `uploadError` or a parse failure is being shown.
- Status: FIXED (late CV hydration advances only once and never moves past the upload step while a rejection or parse error is visible)

### E15 [HIGH] Anonymous claim leaks on the validation early-return (B16 incomplete)
- Files: `src/app/api/agent-v2/route.ts:450, 546-553`
- What: The claim is taken before `jobDescription`/`currentCV` validation; that branch returns without throwing, burning the visitor's free check on a malformed request.
- Fix: Move the claim after input validation (or release it on that early return).
- Status: FIXED (anonymous fit usage is now claimed only after the required job description and CV pass validation)

### E16 [HIGH] B6 discount is replayable (fit never consumed)
- Files: `src/app/api/agent-v2/route.ts:666-671`, `hasCapturedFitReservation`
- What: The check only asks whether a captured fit ever existed for the contextId; nothing marks it spent, so one 0.5 fit unlocks unlimited 1.5 kits with arbitrary client context.
- Fix: Consume the fit on use: mark the fit reservation's metadata (e.g. `continuation_used_at`) atomically when the discount is granted, and refuse the discount when already used.
- Status: FIXED (the 1.5-credit continuation now claims the captured fit atomically per request, falls back to the full price on a lost race and releases the claim only after a failed reservation is refunded)

### E17 [HIGH] D10 language interpolation is a prompt-injection sink
- Files: `src/lib/agents/prompts/cover-letter-prompt.ts:382`, `src/lib/agents/prompts/email-prompts.ts:53, 121, 313, 377`, `src/app/api/regenerate/route.ts:184`
- What: Unknown language codes fall back to interpolating the raw client string into a CRITICAL prompt line; `userLanguageOverride` comes unvalidated from the request body.
- Fix: Allowlist to `LANGUAGE_NAMES` keys everywhere `outputLang` is consumed; unknown values fall back to `'en'`. Validate `userLanguageOverride` at the route boundary too.
- Status: FIXED (all generation language inputs now pass through the seven-code allowlist, including regeneration overrides, and unknown values fall back to English)

### E18 [MEDIUM] Regenerated cover letters come back stripped of structured fields
- Files: `src/app/api/regenerate/route.ts:256-266`
- What: The new persist writes a fixed object with empty salutation/addresses/date/signature, destroying the stored structured letter; only `body` survives.
- Fix: Merge into the existing stored cover_letter (update body, keep other fields).
- Status: FIXED (cover-letter regeneration now replaces only the body and timestamp while preserving stored addresses, date, salutation, closing and signature on both server and client)

### E19 [MEDIUM] syncProfileTier still swallows its error
- Files: `src/app/api/stripe/webhook/route.ts:37-46`
- What: If the profile tier write fails, the event completes with 200 and the dedupe row kept; a paying user keeps free-tier feed caps with no retry path.
- Fix: Propagate the error like the rest of the B3 rework.
- Status: FIXED (profile subscription synchronization now propagates write failures so Stripe can retry the event)

### E20 [MEDIUM] Checkout params never cleaned on the delayed/exhausted path
- Files: `src/components/settings/UsageBillingPane.tsx:135-142`
- What: `clearCheckoutParams()` runs only on success; after a lost webhook the URL replays the full poll + processing banner on every future visit.
- Fix: Clear the params (or stamp a give-up marker) when the poll exhausts.
- Status: FIXED (billing return parameters are now cleared when webhook polling exhausts as well as when it succeeds)

### E21 [MEDIUM] A1 auto-checkout fires from a bare query param
- Files: `src/app/pricing/page.tsx:114-123`
- What: A signed-in user following any link with `?checkout=max` is auto-POSTed into a real Stripe Checkout with no gesture (phishing-friendly).
- Fix: Gate the auto-start on a same-session intent marker written when the user actually clicked the plan CTA (the resume-intent pattern); otherwise require a click.
- Status: FIXED (pricing auto-checkout now requires a fresh same-tab plan intent written by the user's CTA click and consumes it before starting checkout)

### E22 [MEDIUM] Refund ledger row mutated in place breaks append-only history; clamped removals silently re-collect later
- Files: `src/db/repos/credits.ts:930-955, 982-989`
- What: ON CONFLICT rewrites amount/balance_after with stale balance_before and timestamp; a near-zero-balance refund under-removes and the shortfall is later taken from a fresh paid grant.
- Fix: Write a per-refund child ledger row keyed on the Stripe refund id, keep per-charge tracking in metadata; record the unrecovered remainder explicitly instead of re-collecting it later.
- Status: FIXED (each Stripe refund now writes an immutable child ledger row, tracks charge-level progress from prior rows and records any unrecovered credits without taking them from later grants)

### E23 [MEDIUM] 'unknown' IP fallback creates one shared rate-limit bucket
- Files: `src/lib/middleware/rateLimiter.ts:215-218`
- What: Header-less production requests all share the literal 'unknown' key: one client can exhaust every anonymous limiter (and the shared anonymous gate hash).
- Fix: When `cf-connecting-ip` is absent in production, reject anonymous-gated requests outright (fail closed per request) instead of pooling on a sentinel.
- Status: FIXED (production requests without Cloudflare's trusted client IP now fail closed before any shared rate-limit or anonymous-usage key can be created)

### E24 [MEDIUM] D15 UTC switch: use the server-stored timezone instead, and handle cutover
- Files: `src/app/api/job-feed/run/route.ts:47-62`, `src/lib/job-feed/server.ts:1042, 1263`
- What: Hardcoding UTC changes rollover to odd local times and mismatches existing local-date rows (one duplicate run per user at cutover).
- Fix: Key the daily gate on the server-persisted `settings.user_timezone` (ignore the request value), not UTC. Fall back to UTC only when no stored timezone exists.
- Status: FIXED (job-feed gating, run keys, inbox day counts and next-run times now use the persisted valid timezone with UTC fallback and a completion-time cutover guard)

### E25 [LOW] New copy and error codes
- Files: `src/app/api/chat/route.ts:150` area, `src/components/chat/useAgentWorkflow.ts` error switch, new strings in auth/sync surfaces
- What: "could not"/"has not" strings violate the contraction rule; `REQUEST_IN_PROGRESS`/`REQUEST_ALREADY_COMPLETED` render as the self-contradictory generic "Please try again".
- Fix: Use contractions (couldn't, hasn't); add dedicated messages for the two new codes ("That request is still running." / "That request already finished. You weren't charged twice.").
- Status: FIXED (new user-facing failure copy now uses contractions and regeneration replay codes show dedicated in-progress and already-finished messages)

### E26 [LOW] Remove the blanket eslint-disable file headers
- Files: `src/components/chat/useAgentWorkflow.ts:1`, `src/hooks/useSupabaseSync.ts:1`, `src/components/CVPanel.tsx:1`, `src/app/api/parse-cv/route.ts:1`
- What: File-wide `no-explicit-any` (and `exhaustive-deps` in useSupabaseSync) disables were added to pass lint, silencing rules across thousands of unrelated lines including the rewritten hydration effects.
- Fix: Delete the headers; type the touched code properly or scope disables to single lines with a reason.
- Status: FIXED (the four blanket lint-disable headers are removed, affected values now have explicit types and the hydration dependency warning is resolved)

## Batch F: Adversarial review round 2 (3 reviewers over the E deltas; no criticals, converging)

Round 2 verified all four round 1 criticals as fixed and 18 E-items as correct. These are the residual findings. Same rules and status conventions.

### F1 [HIGH] Partial-refund double removal still reachable (event-pair keying)
- Files: `src/app/api/stripe/webhook/route.ts:519-521`, `src/db/repos/credits.ts:951-973`
- What: `refund.created` and `charge.refunded` are two events for the same refund. On API version 2026-01-28 the Charge payload does not include `refunds`, so `handleChargeRefunded` falls back to a charge-keyed ledger row and the cumulative-delta math; if it processes first, the sibling `refund.created` adds the same amount again. A 50% refund can remove 100% of credits.
- Fix: Key idempotency on the refund id in BOTH paths: in `handleChargeRefunded`, resolve the refund via `stripe.refunds.list({ charge })` (newest first) and use its id; and in `applyRefundRemoval`, trust the authoritative cumulative (`nextRefundedCents = clamp(options.cumulativeRefundedAmountCents, totalAmountCents)`) instead of summing per-row amounts.
- Status: FIXED (both refund paths now pair the newest refund ID with a live charge snapshot and remove against its authoritative cumulative total)

### F2 [HIGH] `getClientIP` throw is too wide; uncaught in the Better Auth catch-all
- Files: `src/lib/middleware/rateLimiter.ts:217`, `src/app/api/auth/[...all]/route.ts:26`
- What: Throwing whenever `cf-connecting-ip` is absent in production turns header-less sign-in/sign-up/password-reset requests into bare 500s (that call site has no try/catch), and can lock out authenticated users on every rate-limited route.
- Fix: Don't throw from `getClientIP`. Return a null/sentinel; fail closed ONLY where the anonymous free-generation gate is consulted (agent-v2 anonymous path rejects cleanly). Authenticated routes fall back to the user id as the limiter key; unauthenticated non-gated routes may use the sentinel bucket.
- Status: FIXED (the IP helper now returns a sentinel, authenticated routes use the user ID when needed and only anonymous agent generation rejects a missing trusted IP)

### F3 [HIGH] Cancellation still swallows the profile-tier write; canceled users can't re-subscribe
- Files: `src/app/api/stripe/webhook/route.ts:453` (handleSubscriptionDeleted), `src/app/pricing/page.tsx` (paid branch gating)
- What: `setProfileSubscription` failure is swallowed, leaving `profiles.subscription_tier` at plus/max after cancellation; the pricing page then routes the user to create-portal, which 404s (no subscription id), and they can't re-subscribe.
- Fix: Propagate the error like the other E19 sites. Also gate the pricing page's portal branch on a live subscription (credits row has `stripe_subscription_id` and an active-ish status), falling back to checkout otherwise.
- Status: FIXED (cancellation profile writes now propagate for retry and pricing consults the live credits-row subscription gate before opening the portal)

### F4 [HIGH] Webhook dedupe short-circuit can permanently drop a crashed event
- Files: `src/app/api/stripe/webhook/route.ts:96-126, 178-182`
- What: The dedupe row is written before processing and only removed in the catch. A Worker killed mid-handler (or a failing `deleteWebhookEvent`) leaves the row, and the Stripe retry is answered "duplicate": a paid credit pack is silently never granted. Now that every grant is idempotent per Stripe object id, reprocessing is safe.
- Fix: Stop short-circuiting on the pre-processing row: mark the row processed only AFTER the handler succeeds (add a `processed_at` column via a NEW migration file `0009_webhook_events_processed_at.sql`, do not apply it; or simplest: insert the dedupe row after successful processing and rely on the per-object idempotent grants for the concurrent-retry window). Pick the simplest safe option and note it.
- Status: FIXED (events are recorded only after success and cancellation retries no longer refill credits; object-level idempotency covers concurrency without a migration)

### F5 [HIGH] Hydration error screen over-triggers, blocking working dashboards
- Files: `src/app/dashboard/page.tsx:184-188`, `src/hooks/useSupabaseSync.ts` (documents loader)
- What: A transient failure of the documents/profile-photo fetch alone sets `hydrationError` and replaces the whole dashboard with the error screen, even when sessions loaded and the user has kits.
- Fix: Show the blocking error screen only when the SESSIONS load failed (or both loaders failed). A documents-only failure degrades gracefully (log, optional toast) and the dashboard renders.
- Status: FIXED (document hydration failures now log and settle gracefully while only a sessions failure blocks the dashboard)

### F6 [HIGH] E21 intent marker breaks A1's email-verification path
- Files: `src/app/pricing/page.tsx:106-125`, signup flow
- What: The auto-checkout gate reads a sessionStorage marker written on plan click, but email verification opens a fresh tab where sessionStorage is empty; the paid-intent user lands on /pricing with no checkout. Google OAuth and same-tab login still work.
- Fix: Write the intent marker to localStorage (with a short TTL, e.g. 1 hour, cleared on use), so it survives the new-tab verification flow on the same browser. Keep requiring the marker (no bare-URL auto-checkout).
- Status: FIXED (the required checkout marker now uses localStorage with a one-hour TTL and is cleared when consumed, so verification tabs retain intent)

### F7 [LOW] Settings-pane upgrade buttons don't request the portal update flow
- Files: `src/components/settings/UsageBillingPane.tsx:363-367`
- Fix: Pass `{ flow: 'subscription_update' }` from the plan buttons for paid users (same as the pricing page).
- Status: FIXED (paid plan buttons now open the billing portal with the subscription-update flow)

### F8 [LOW] REQUEST_IN_PROGRESS / REQUEST_ALREADY_COMPLETED unhandled in useAgentWorkflow
- Files: `src/components/chat/useAgentWorkflow.ts:780, 1129-1141`
- Fix: Branch on both codes in the error switch (fit and workflow paths) with the E25 copy ("That request is still running." / "That request already finished. You weren't charged twice."), no error emoji, no "try again".
- Status: FIXED (fit and kit streams now show dedicated replay messages, preserve in-flight state and restore completed job-feed runs to succeeded)

### F9 [LOW] Three new strings miss the contraction rule
- Files: `src/app/auth/callback/page.tsx:13, 56`, `src/app/dashboard/page.tsx:187-188`
- Fix: "could not" -> "couldn't" in all three.
- Status: FIXED (the callback and dashboard failure messages now use couldn't)

### F10 [LOW] GuidedLine never wires onSessionExpired
- Files: `src/components/shell/GuidedLine.tsx:161`
- Fix: Pass an `onSessionExpired` handler in the useAgentWorkflow options that sets the session-expired lineError.
- Status: FIXED (GuidedLine now surfaces a session-expired line error through the workflow callback)

### F11 [LOW] Failed kit attempts leave empty tracker rows; Stop race during eager create
- Files: `src/components/chat/useAgentWorkflow.ts:826-849`
- Fix: Create the AbortController BEFORE the eager `createStoredSession` and check `signal.aborted` after the await; delete (or mark) the eagerly created session row on a terminal failure before any artifacts were produced. The findReusableSession residual stays disclosed in E12's status.
- Status: FIXED (Stop is active during eager persistence, cleanup stays busy and deletes rows only before dispatch or after an explicit terminal server failure)

### F12 [LOW] Two refund misclassifications
- Files: `src/app/api/stripe/webhook/route.ts:510` area
- Fix: Invalid `creditsToAdd` metadata on an add-on refund is a PermanentWebhookError (log + 200), not a retry loop. A refund whose customer has no user_credits row should be logged loudly (and lightly retried), not permanently swallowed.
- Status: FIXED (invalid add-on refund metadata is now permanent while a missing credits row logs identifiers and remains retryable)

### F13 [LOW] reserveContinuation assigns the active reservation key too late
- Files: `src/app/api/agent-v2/route.ts:682-717`
- Fix: Assign `activeReservationKey`/`activeReservationUserId` immediately after each successful reserve inside `reserveContinuation` so the outer catch can always release.
- Status: FIXED (continuation reservations are now tracked immediately after each successful reserve and cleared only after a confirmed release)

### F14 [LOW] Stale UTC comment above the timezone-gated daily-run code
- Files: `src/app/api/job-feed/run/route.ts:55-58`
- Fix: Update the comment to describe the persisted-timezone gate with UTC fallback.
- Status: FIXED (the daily-run comment now describes the persisted user timezone with UTC fallback)

### F15 [LOW] Chat-sync debounce dep widened to whole currentSession
- Files: `src/hooks/useSupabaseSync.ts:753`
- Fix: Narrow the effect dep back to the chat-messages slice (keeping lint clean with a scoped, reasoned disable if needed).
- Status: FIXED (chat sync now depends on the session ID and chat-message slice instead of the whole session object)

## Batch G: /code-review max findings on PR #90 (10 finder angles, 13 verified candidates: 11 confirmed, 1 plausible, 2 refuted)

Refuted (no action): webhook same-tier double-grant (OCC loop converges, delta 0), anonymous-claim `changes === 1` semantics (measured correct).

### G1 [HIGH] tracker/follow-up still assumes the old reserveCredits contract
- Files: `src/app/api/tracker/follow-up/route.ts`
- What: E4 changed `reserveCredits` to return distinct replay codes for in-flight/spent keys; this untouched caller treats any reserve failure as a 500. A retried request gets a false error instead of the honest replay message.
- Fix: Handle `RESERVATION_IN_FLIGHT` / `RESERVATION_SPENT` like `/api/regenerate` does (honest 409-style copy, no upgrade prompt, no 500).
- Status: FIXED (follow-up regeneration now returns honest 409 replay responses for in-flight and already-spent reservation keys)

### G2 [HIGH] Chat route TypeError on non-string sessionId
- Files: `src/app/api/chat/route.ts` (session gate)
- What: The E2 rework calls `.startsWith('session-')` on `context.sessionId` without the old `typeof` guard; a non-string value from an authenticated caller throws, returning 500 instead of 400.
- Fix: Restore the type check (treat non-string as absent/local).
- Status: FIXED (chat now treats a non-string session ID as absent before any UUID or local-session checks)

### G3 [HIGH] Fit-continuation claim never released by the sweeper (retry overcharge)
- Files: `src/db/repos/credits.ts` (releaseStaleReservations, claimFitContinuation), `src/app/api/agent-v2/route.ts`
- What: When a worker dies mid-generation, the stale-reservation sweeper refunds the 1.5 reservation but never clears the fit-continuation stamp (single `releaseFitContinuationClaim` call site). The user's retry then fails the E16 claim and reserves FULL_APPLICATION: 0.5 + 2.0 total instead of 0.5 + 1.5.
- Fix: Release the continuation claim when the sweeper refunds a GENERATION_AFTER_FIT reservation (or key the claim to the reservation so a released reservation frees it).
- Status: FIXED (fit claims now link to their discount reservation, so a released reservation reopens the claim even if cleanup is interrupted)

### G4 [HIGH] Regenerate trusts D1 while the client debounce hasn't flushed (cv_section + follow-up email)
- Files: `src/app/api/regenerate/route.ts`, `src/hooks/useSupabaseSync.ts` (session sync)
- What: The C4/E9 server-sourcing reads the session from D1, but client edits sync on a 2s debounce, so a rewrite fired just after an edit uses stale content. Aggravator: a FAILED session sync still sets `lastSyncedSessionRef`, so the stale window can extend indefinitely.
- Fix: (1) Only mark the session synced when the write succeeded. (2) For cv_section/follow-up context, flush the pending session sync before calling regenerate (client), or let the route accept the specific edited section text while keeping identity/anti-hallucination sources server-side.
- Status: FIXED (failed session writes no longer mark synced, and regeneration uses only the live edited section or email while keeping server-owned identity and source data)

### G5 [MEDIUM] Checkout params stuck for signed-out visitors; modal re-forced on reload
- Files: `src/components/settings/UsageBillingPane.tsx`, `src/components/settings/SettingsModal.tsx`
- What: Signed-out visitors landing with checkout params never clear them (pane never mounts), and a signed-in user who closes the modal early gets it forced back open on every reload until a poll cycle completes.
- Fix: Clear checkout params when signed out or when the user dismisses the modal (stamp consumed intent), not only after a completed poll.
- Status: FIXED (signed-out checkout returns and explicit modal dismissal now consume checkout URL parameters while open polling keeps its feedback)

### G6 [MEDIUM] Client permanent free-check flag contradicts the 30-day server window
- Files: client anonymous gate flag (localStorage) used by GuidedLine/ChatPanel
- What: The client sets a permanent "free check used" flag and hard-blocks before any server call, while D14/E1 moved the server to a 30-day rolling window.
- Fix: Store a timestamp instead and let it expire after 30 days (server remains the authority).
- Status: FIXED (the anonymous client gate now stores a timestamp, expires after 30 days and migrates legacy boolean flags)

### G7 [MEDIUM] Workflow completion/error messages for background sessions are lost on refresh
- Files: `src/components/chat/useAgentWorkflow.ts`, `src/hooks/useSupabaseSync.ts`
- What: Messages appended to a non-current session live only in the in-memory `sessions[]` array; refresh before reopening loses them (the kit itself is persisted).
- Fix: Sync chat messages for background sessions too (or persist the completion message server-side with the artifacts).
- Status: FIXED (one message-ID-scoped sync pass now persists unsynced chat messages from current and background sessions)

### G8 [MEDIUM] Unknown Stripe price IDs hard-ignored on refund removal AND credit grant
- Files: `src/app/api/stripe/webhook/route.ts` (resolveRefundSource, handleSubscriptionUpdate)
- What: F-series rework returns permanent-ignore (200) for price IDs outside STRIPE_PRICES; after any repricing, refunds stop removing credits and subscription events stop granting, silently. Old code degraded via the amount map.
- Fix: Keep the strict path for known prices, but on unknown price IDs log loudly, capture to PostHog, and fall back to the charge-amount map (7999/1999) before giving up; never silently ignore a grant for an active subscription.
- Status: FIXED (unknown prices now log and report to PostHog, use the 1999/7999 amount fallback and keep active unmatched grants retryable)

### G9 [MEDIUM] Re-running fit on a reopened kit session clobbers the kit snapshot
- Files: `src/app/api/agent-v2/route.ts` (fit path persistGeneratedArtifacts), `src/lib/open-session.ts`
- What: Reopened kit sessions expose the analyze chip pre-hydration; re-firing fit on the same session id overwrites `generated_artifacts` (plain column SET), destroying the prior kit's recovery snapshot.
- Fix: On the fit path, merge into existing generated_artifacts (preserve kit fields) or skip the artifacts write when a kit snapshot already exists for that session.
- Status: FIXED (fit persistence now merges pending analysis into an existing recovery snapshot while full generation still replaces stale kit fields)

### G10 [MEDIUM] Daily feed gate: timezone collision wrong-block and early-unlock abuse
- Files: `src/app/api/job-feed/run/route.ts`, `src/lib/job-feed/server.ts` (daily gate)
- What: Comparing today's key against a `local_date` written under a different timezone can wrongly block a user who waited 26 real hours, and flipping to a later timezone can unlock a second run ~2 hours after the first.
- Fix: Add a real-time floor alongside the date key: block when the last run's created_at is less than ~20 hours ago, allow when more than ~28 hours regardless of date-string comparison.
- Status: FIXED (the daily gate now enforces a 20-hour floor and 28-hour ceiling from each run's refreshed start time, with controlled date-key reruns)

### G11 [LOW] Eager-session double-fire reentrancy guard (plausible, defense only)
- Files: `src/components/chat/useAgentWorkflow.ts` (eager createStoredSession)
- What: Mechanism exists for a double eager-create if the entry point ever re-fires mid-await; currently masked by dead flags, no reachable trigger.
- Fix: Add a cheap reentrancy guard (ref) around the eager-create block. Skip if it risks touching working behavior.
- Status: SKIPPED (a hook-local guard would miss the two mounted workflow instances, while a module-global lock risks stale locks in working generation flows)

## Patch log (implementer updates per batch)
- Batch A: FIXED (A1-A4 patched; TypeScript passed and touched files are lint clean)
- Batch B: FIXED (B1-B16 patched; TypeScript passed and touched files are lint clean)
- Batch C: COMPLETE (C2-C8 fixed; C1 migration written and left NEEDS DECISION; TypeScript passed and touched files are lint clean)
- Batch D: FIXED (D1-D18 patched; TypeScript passed and touched files are lint clean; UI smoke was blocked by no browser session)
- Batch E: FIXED (E1-E26 patched; TypeScript passed and all Batch E files are lint clean; full lint still reports unrelated pre-existing errors outside the touched files)
- Batch F: FIXED (F1-F15 patched; TypeScript passed and all Batch F files are lint clean; full lint still reports unrelated pre-existing errors outside touched files)
- Batch G: COMPLETE (G1-G10 fixed and G11 skipped; TypeScript passed and all Batch G files are lint clean)
