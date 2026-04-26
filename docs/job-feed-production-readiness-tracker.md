# Job Feed Production Readiness Tracker

Last updated: 2026-04-27

## Working Rules

- Fix confirmed bugs first, in priority order.
- Keep suspicious edge cases parked until the confirmed bug pass is complete.
- Keep the real plan model to `free`, `plus`, and `max` only. Remove legacy `starter`, `pro`, and `enterprise` references where they affect product logic, types, and Job Feed behavior.
- Job Feed access requires an authenticated user and an active paid plan: `plus` or `max`.
- Job Feed setup can use the user's CV suggestions, but only after authentication and paid-plan access checks pass.
- Manual QA checklist items are test scripts, not open product questions.

## Confirmed Bugs

### 1. Job Feed schema is not reproducible

Status: Fixed in code, pending DB migration execution

Scope:
- Add SQL migrations for Job Feed tables, constraints, indexes, RLS assumptions, and status fields needed by the fixes below.
- Include account deletion/cascade behavior for user-owned Job Feed data.
- Resolve batch workflow schema drift or disable unsupported batch columns.

### 2. Users can act on jobs outside their feed

Status: Fixed in code, pending integration verification

Scope:
- Require every save, dismiss, rate, open, and apply action to target a ranked item owned by the authenticated user.
- Add shared server-side authorization helper for Job Feed job actions.

### 3. Apply is marked complete before generation succeeds

Status: Fixed in code, pending integration verification

Scope:
- Separate apply intent from generation success.
- Persist generation states: pending, running, succeeded, failed, cancelled.
- Restore retry behavior for failed or interrupted generation.

### 4. Apply autostart is lost on refresh or new tab

Status: Fixed in code, pending browser verification

Scope:
- Make Job Feed autostart durable through URL consumption and/or persisted application session status.
- Ensure refresh/new-tab flow either starts generation or shows a clear retry/start action.

### 5. Feedback writes are race-prone

Status: Fixed in code, pending concurrent-action verification

Scope:
- Add atomic upsert behavior and DB uniqueness for feedback.
- Disable all mutating job actions while any action is pending for that job.

### 6. Batch ranking path can fail at runtime

Status: Fixed in migration/types

Scope:
- Align batch columns with migrations and types, or keep batch workflow safely disabled until schema support exists.

### 7. Setup UI allows invalid work mode state

Status: Fixed in code

Scope:
- Match frontend setup validation with backend validation for remote/work mode preferences.
- Show inline validation before submit.

### 8. Account deletion likely leaves Job Feed data

Status: Fixed in code and migration

Scope:
- Delete or cascade user-owned Job Feed rows during account deletion.
- Keep shared canonical jobs only if detached from deleted user data.

### 9. External apply option links are not fully sanitized

Status: Fixed in code

Scope:
- Validate all external apply option links as HTTP(S).
- Drop unsafe links before rendering.

## Legacy Plan Cleanup

Status: Fixed in code and migration

Scope:
- Remove product logic references to `starter`, `pro`, and `enterprise`.
- Keep `free`, `plus`, and `max` as the supported plan set.
- Confirm Job Feed only unlocks for `plus` and `max`.

## Suspicious Edge Cases To Verify After Bug Fixes

- New run in `running` state can display older completed jobs; UI now labels those cards as the most recent completed feed. Pending browser verification.
- Settings changed while a run is active may leave the UI showing new preferences while the running job uses old preferences.
- Large multi-country setups now cap searched countries to the query cap explicitly. Pending run-plan regression test.
- Saved then dismissed jobs are hidden, and direct API mutation now rejects terminal feedback states. Pending manual API regression test.
- Dashboard badge last-seen state is now user-scoped. Pending browser regression test.
- Agent credit deduction before generation completion may need refund or recovery behavior on failure.
- Empty, thin, ready, failed, and running feed states need manual QA after state fixes.

## Manual QA Script For The End

- Authenticate as `free`, `plus`, and `max`.
- Confirm Job Feed is blocked for `free` and available only for `plus` and `max`.
- Complete setup using CV suggestions.
- Attempt setup with missing required fields and confirm inline validation.
- Generate or simulate feed states: ready, empty, thin, failed, and running.
- Open details, save, dismiss, rate helpful, rate not relevant, refresh, and confirm persistence.
- Test saved jobs after dismiss, rate, and apply.
- Test Apply with Karko success, insufficient credits, SSE failure, user stop, refresh mid-generation, and new-tab URL.
- Repeat save, dismiss, rate, and apply rapidly from one tab and two tabs.
- Delete account and verify user-owned Job Feed rows are gone.

## Missing Logs And Analytics To Add

Status: Parked until confirmed bugs are fixed

Events to add:
- `job_feed_action_rejected`
- `job_feed_apply_session_created`
- `job_feed_generation_started`
- `job_feed_generation_succeeded`
- `job_feed_generation_failed`
- `job_feed_generation_cancelled`
- `job_feed_retry_clicked`
- `job_feed_feedback_conflict`
- `job_feed_scheduler_due_users`
- `job_feed_run_idempotency_conflict`
- `job_feed_unsafe_external_link_dropped`

## Architectural Decision To Revisit

Status: Parked until confirmed bugs are fixed

Recommendation:
- Move Job Feed application generation to a durable database-backed state machine. The database should be the source of truth for every transition, and the UI/chat/notifications should reflect that state instead of relying on transient client-only state.
