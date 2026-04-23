# Karko Daily Feed Foundations TODO

Status: In progress
Scope: Phases 0-6 MVP foundations plus Phase 4 ranking materialization

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
- background orchestration foundation with a real backend run path

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
- [ ] Apply the new Supabase migration in the target environment
- [x] Finish the Strong/Good ranking pass on top of the deterministic shortlist
- [x] Call the LLM ranking stage on the deterministic shortlist
- [x] Materialize ranked feed items once the ranking stage is live
- [ ] Replace the temporary scheduler shim with real Inngest functions once dependency install is available
