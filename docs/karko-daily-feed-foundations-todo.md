# Karko Daily Feed Foundations TODO

Status: In progress
Scope: Phases 0-6 MVP foundations plus ranking materialization, orchestration handoff prep, and dependency triage

## Working branch

- Active branch: `codex-daily-feed-foundations-phase-0-2`

## Milestone

Deliver the current feed foundations slice:

- feed-first `Job Feed` shell
- persistent `job_feed_settings`
- run tracking for daily feed generation
- raw SerpApi fetch + canonical job ingestion
- deterministic prefilter + shortlist prep before ranking
- Strong/Good ranking + ranked feed-item materialization
- simple feed feedback state plus real apply-session handoff
- background orchestration foundation with a shared backend dispatch path

## Checklist

- [x] Create dedicated feature branch
- [x] Add Supabase migration for `job_feed_settings`
- [x] Add Supabase migration for `job_feed_runs`
- [x] Add Supabase migration for raw job fetches + canonical jobs
- [x] Update generated Supabase TypeScript types
- [x] Add shared job-feed domain types and helpers
- [x] Extract shared SerpApi request/response helpers from the legacy manual search route
- [x] Add authenticated API for reading/updating feed settings
- [x] Add authenticated API for reading latest feed run state
- [x] Replace manual-search-first Job Feed UI with feed-first shell
- [x] Add in-context feed setup UI with simple v1 settings
- [x] Add paused / setup required / generating / empty states
- [x] Add background orchestration foundation for daily runs
- [x] Replace the stub per-user workflow with real raw/canonical ingestion
- [x] Persist raw provider payloads per run
- [x] Normalize canonical jobs with practical dedupe across fetches
- [x] Add code-based prefilter and deterministic shortlist prep before ranking
- [x] Keep ranking prep shaped around `Strong` / `Good` only
- [x] Add product analytics events for feed setup/open/state views
- [x] Refresh feed-panel/debug copy so the UI matches the current backend foundation
- [x] Lint and typecheck touched code
- [x] Commit and push the earlier Phase 0-2 branch state

## Next slice

- [x] Phase 5 foundation: expose real shortlisted jobs through the feed API and panel
- [x] Add Supabase migration for Phase 6 feedback state + application-session linkage
- [x] Phase 6: wire real Apply with Karko AI handoff plus saved/dismissed/applied feedback events
- [x] Add Supabase migration for ranked feed items
- [x] Apply the new Supabase migration in the target environment
- [x] Finish the Strong/Good ranking pass on top of the deterministic shortlist
- [x] Call the LLM ranking stage on the deterministic shortlist
- [x] Materialize ranked feed items once the ranking stage is live
- [x] Extract a shared orchestration boundary so scheduler/debug routes no longer own workflow execution details
- [x] Add a lightweight latest-run diagnostics snapshot for ranking cost and run health visibility
- [x] Add lightweight retention cleanup for old raw payloads and old run metadata
- [x] Add a same-day force rerun path for debug recovery without duplicating run rows
- [x] Replace the current direct orchestration adapter with real Inngest functions
- [x] Triage the current direct/runtime dependency exposure and land the low-risk manifest cleanup plus patch-level upgrades
- [x] Productize the visible Job Feed UI so it no longer presents branch milestones, phase language, or internal implementation framing to end users
- [x] Tighten the setup and state UX for ready, thin-feed, empty, awaiting-first-run, generating, and error cases
- [x] Keep diagnostics and debug controls hidden unless explicitly enabled for verification
- [x] Re-run targeted lint, typecheck, and build after the UI pass
- [ ] Verify the signed-in premium Job Feed states with real data after the UI pass
- [ ] Verify the deployed `/api/inngest` endpoint with `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` configured
- [ ] Verify local Inngest dev sync and confirm the three expected Job Feed functions register correctly
- [ ] Verify the app-side debug flow from Job Feed through queued or forced rerun behavior
- [ ] Disable any old cron that still hits the temporary internal scheduler route after the Inngest cron is active

## Execution order from here

1. Signed-in frontend verification:
   confirm the newly productized Job Feed UI with a premium-capable account and real feed data
2. Local workflow verification:
   verify `INNGEST_DEV=1 npm run dev`, then sync the local Inngest dev server against `/api/inngest`
3. Signed-in backend verification:
   confirm the app-side debug actions queue or rerun the backend workflow correctly from the Job Feed screen
4. Wasim-only environment setup:
   add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` locally and in the deployed environment without sharing the values
5. Production cleanup:
   identify and disable the old scheduler cron only after the Inngest path is verified

## Wasim follow-up

- [ ] Keep a signed-in premium-capable account ready for live Job Feed verification
- [ ] Run the local Inngest dev server against `http://localhost:3000/api/inngest` when prompted and share whether the expected functions appear
- [ ] Create or find `INNGEST_EVENT_KEY`
- [ ] Create or find `INNGEST_SIGNING_KEY`
- [ ] Add the Inngest keys to `.env.local`
- [ ] Add the Inngest keys to the deployed environment
- [ ] Disable the old scheduler cron only after the new Inngest path is verified
