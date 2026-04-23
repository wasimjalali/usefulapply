# Karko Daily Feed Foundations TODO

Status: In progress
Scope: Phases 0-2

## Working branch

- Intended branch: `codex/daily-feed-foundations-phase-0-2`
- Fallback until write access is available: current branch

## Milestone

Deliver the feed foundations slice:

- feed-first `Job Feed` shell
- persistent `job_feed_settings`
- run tracking for daily feed generation
- background orchestration foundation
- stub per-user generation flow with idempotent runs

## Checklist

- [x] Create dedicated feature branch
- [x] Add Supabase migration for `job_feed_settings`
- [x] Add Supabase migration for `job_feed_runs`
- [x] Update generated Supabase TypeScript types
- [x] Add shared job-feed domain types and helpers
- [x] Add authenticated API for reading/updating feed settings
- [x] Add authenticated API for reading latest feed run state
- [x] Replace manual-search-first Job Feed UI with feed-first shell
- [x] Add in-context feed setup UI with simple v1 settings
- [x] Add paused / setup required / generating / empty states
- [x] Add background orchestration foundation for daily runs
- [x] Add stub per-user workflow with idempotent run creation
- [x] Add product analytics events for feed setup/open/state views
- [x] Lint and typecheck touched code
- [ ] Commit and push working branch

## Next slice

- [ ] Apply the new Supabase migration in the target environment
- [ ] Add canonical raw/normalized job ingestion tables
- [ ] Replace the temporary scheduler shim with real Inngest functions once dependency install is available
- [ ] Materialize ranked feed items and the first read API for real jobs
