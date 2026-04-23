# Karko AI Daily Feed Implementation Plan

Last updated: 2026-04-23
Status: Living planning document

## Purpose

This file is the durable source of truth for the Karko AI Daily Feed feature planning work.

We will use it to:

- preserve architecture decisions across chats
- review the feature phase by phase
- challenge anything that feels overengineered, underpowered, or off-product
- update the plan before implementation starts

This is intentionally a planning document, not an implementation log.

## Product Direction

Karko AI should not feel like a manual search board with some AI added on top.

The intended product experience is:

- Karko researches jobs in the background
- the user opens Karko and sees the best opportunities already prepared
- the user can quickly decide to save, dismiss, or apply
- discovery flows directly into the existing Karko application workflow

For v1, the product direction is:

- feed-first, not search-first
- US + Canada first
- English-first output
- premium users only
- one durable background execution layer
- one primary LLM provider for ranking

## Current Position

### Implementation checkpoint as of 2026-04-23

The current branch has completed the foundations through Phase 6 MVP, plus the first real ranking/materialization pass:

- Phase 0: feed-first cleanup is in place
- Phase 1: `job_feed_settings` is implemented and wired
- Phase 2: `job_feed_runs` plus the scheduler/debug workflow foundation are implemented
- Phase 3: raw provider fetches plus canonical normalized jobs are implemented
- Phase 4: code-based prefiltering, deterministic Strong/Good fallback labels, and the LLM ranking pass on the capped shortlist are implemented
- Phase 5 foundation: ranked feed items are exposed in the feed API/panel with ready, thin-feed, empty, and detail states
- Phase 6 MVP: saved/opened/dismissed/applied feedback plus a real `Apply with Karko AI` session handoff are implemented

Current next sequence:

- Apply the new ranked-item migration in the target environment
- Replace the temporary scheduler shim with real Inngest functions once dependency install is available
- Then Phase 7 - Cost, Analytics, Retention, Cleanup

### What exists today

- A `Job Feed` tab already exists in the dashboard shell.
- There is an existing SerpApi-backed manual job search route.
- There is already a strong downstream application workflow for fit analysis, CV generation, cover letters, emails, and session tracking.
- There is already an application tracker and session persistence model.

### What does not exist yet

- No production Inngest-backed orchestration yet
- No advanced seen-job suppression beyond simple dismiss feedback
- No heavier feedback learning loop yet

### Important conclusion

The current manual Job Board UI is not the product foundation for this feature.

The reusable parts from the current codebase are mainly:

- the dashboard tab placement
- the SerpApi integration knowledge
- the existing Karko application pipeline
- the current application session model

The visible manual job-board behavior itself should not define the new system.

## Working Rules For This Feature

- We review one phase at a time.
- Every phase must be explained in plain language before implementation.
- Every phase must be critically analyzed:
  - what problem it solves
  - what changes it requires
  - what risks it introduces
  - whether it is too much, too little, or correct for MVP
- We keep updating this file as decisions change.
- We implement only after the phases are reviewed and agreed.

## Phase Overview

### Phase 0 - Cleanup & Reset

Goal:
Reset the current Job Feed area so we do not accidentally build the new feature on top of the wrong product shape.

Why this exists:
The current Job Feed is a manual search board. The new feature is an autonomous daily feed. Those are different products.

Core idea:

- keep the Job Feed tab
- stop treating manual search as the core experience
- preserve only the reusable technical parts
- move toward a feed-first surface

### Phase 1 - Feed Data & User Settings

Goal:
Give the system a stable definition of what a good job match means for each user.

Why this exists:
Without persistent preferences and consent data, the feed cannot be personalized or scheduled correctly.

Core idea:

- store target roles
- store location and remote preferences
- store salary floor and seniority
- store timezone and delivery time
- store consent and agent enablement
- store market targeting

### Recommended v1 settings scope

The v1 settings model should stay practical and focused.

Recommended fields:

- enabled
- consent_accepted_at
- user_timezone
- delivery_hour_local
- target_market
- target_roles
- adjacent_roles_enabled
- adjacent_roles
- preferred_locations
- remote_preference
- salary_floor
- languages
- seniority_target
- employment_types
- work_authorization_status
- aggressiveness

Recommended storage shape:

- use a dedicated `job_feed_settings` table
- do not overload `profiles` with feed-specific discovery logic

### Setup UX direction for v1

The first-time setup should be easy and low-friction.

Recommended setup behavior:

- show suggested options first wherever possible
- let the user choose from common predefined options
- include a write-in option when the listed choices do not fit
- let AI help interpret and normalize the user's written input before saving

Examples:

- target roles: pick common roles or type a custom role
- preferred locations: pick suggested places or type custom locations
- remote preference: choose from simple options
- seniority: choose from simple options
- aggressiveness: strict / balanced / broad

Important constraint:

- do not ask the user to write too much during first-time setup
- use structured options first, custom input second

### Things intentionally deferred from v1

These should not be part of the first version unless later review changes that:

- deep preference weighting systems
- detailed exclusion rule builders
- advanced market localization settings
- company-type preference matrices
- overly granular targeting controls

### Confirmed review outcome for Phase 1

Approved direction:

- use a dedicated settings table
- keep the v1 settings focused and practical
- keep first-time setup simple
- prefer option-based setup with a write-in fallback
- avoid advanced preference systems in v1

### Phase 2 - Background Engine

Goal:
Create the durable asynchronous system that actually generates feeds automatically.

Why this exists:
The feed cannot depend on user-triggered requests. It has to run in the background reliably.

Core idea:

- add Inngest
- schedule daily feed generation
- process one user feed run independently
- support retries, idempotency, and run tracking

### Recommended v1 orchestration shape

The background architecture should stay durable but simple.

Recommended v1 shape:

- use Inngest as the only orchestrator
- use scheduled Inngest functions directly
- avoid layering extra queue systems or extra schedulers on top
- run one isolated feed-generation workflow per eligible user

### What this phase should do

This phase should provide:

- scheduled wake-up for feed generation
- user eligibility checks
- fan-out into one per-user run
- isolated retries
- run logging
- idempotency per user per local date

### What this phase should avoid

Do not add these in v1 unless later review changes the scope:

- multiple orchestration vendors
- extra queue layers on top of Inngest
- too many tiny workflows too early
- provider failover complexity inside the orchestration layer
- UI-facing routes that also own background execution logic

### MVP durability principle

If one user run fails:

- that failure should not block other users
- the failed run should be retryable
- the failure should be visible in run tracking

### Confirmed review outcome for Phase 2

Approved direction:

- use Inngest directly
- keep the orchestration layer simple
- schedule and fan out one run per eligible user
- include retries, idempotency, and run tracking
- avoid multi-vendor or multi-queue orchestration complexity in v1

### Phase 3 - Job Ingestion & Normalization

Goal:
Fetch jobs, normalize them, and store them in a stable internal format.

Why this exists:
Raw external job data is messy, inconsistent, and unreliable as a direct UI source.

Core idea:

- fetch from SerpApi
- persist raw responses
- normalize jobs
- deduplicate jobs
- create reusable canonical job records

### Recommended v1 ingestion shape

This phase should create two layers:

1. Raw layer

- keep the original SerpApi response payload
- keep source metadata such as query context, market, and fetch time

2. Normalized layer

- convert raw jobs into a stable internal Karko job format
- use normalized jobs for feed logic, ranking, UI display, feedback, and apply handoff

### Why this phase matters

Raw external job data is good enough for temporary search results, but not good enough to become the durable source for:

- daily feeds
- ranking
- seen-job logic
- feedback learning
- application-session linking

### Recommended normalization focus for v1

Normalize the fields that are directly useful for product behavior:

- title
- company
- location
- work mode
- salary if present
- employment type
- description
- apply URL
- source identifiers
- timestamps and fetch metadata

### Recommended dedupe direction for v1

This phase should support:

- global dedupe of the same job across fetches
- stable canonical identity for downstream reuse

Do not try to build an overly complex enrichment or taxonomy system at this stage.

### What this phase should avoid

Do not add these in v1 unless later review changes the scope:

- expensive enrichment during ingestion
- giant enterprise-style schemas
- advanced ontology or taxonomy work
- multiple enrichment providers
- deep NLP understanding at ingestion time

### Confirmed review outcome for Phase 3

Approved direction:

- store both raw and normalized jobs
- use normalized jobs as the durable internal layer
- implement practical canonical dedupe
- keep ingestion focused and avoid over-enrichment in v1

## Detailed Review - Phase 4

## Phase 4 - Prefilter & AI Ranking

### What this phase is

This phase decides which fetched jobs deserve user attention.

It has two parts:

- prefilter in code
- final ranking with the LLM

### What this phase is for

This phase protects the product from two problems:

1. Too much noise

If weak jobs reach the feed, the user stops trusting Karko.

2. Too much cost

If too many jobs reach the LLM, the system becomes unnecessarily expensive.

### Core product principle

The LLM should not be the garbage filter.

The system should first remove obviously bad jobs in code, then ask the LLM to judge only plausible matches.

### Confirmed review outcome for Phase 4

Approved direction:

- do code-based prefilter before the LLM
- keep only `Strong` and `Good` as visible v1 fit states
- do not show `Stretch` to the user in v1
- show up to 5 jobs by default
- allow expansion up to 10 if enough good jobs exist
- cap LLM intake to a controlled shortlist
- prefer fewer high-quality jobs over a larger weak feed

### Phase 4 - Prefilter & AI Ranking

Goal:
Decide which jobs are worth showing and in what order.

Why this exists:
Showing every fetched job would be noisy, expensive, and low-trust.

Core idea:

- do rule-based filtering first
- send only survivors to the LLM
- rank them into Strong / Good

### Recommended v1 fit presentation

For v1, the visible user-facing fit states should be:

- Strong
- Good

Do not expose `Stretch` in the UI in v1.

Reason:

- two labels are easier for users to understand quickly
- the feed should feel curated, not padded
- if a job is too weak to be called `Good`, it usually should not be shown

### Recommended v1 filtering and ranking flow

1. Fetch jobs from SerpApi
2. Apply rule-based prefilters in code
3. If too many jobs survive, shortlist deterministically before the LLM
4. Send only the shortlist to the LLM
5. Let the LLM do the final fit check and ranking
6. Show only high-quality user-facing jobs

### Recommended v1 volume and cost caps

These should be the default v1 operating shape:

- SerpApi queries per user per day: target 2 to 4, hard cap 4
- Raw jobs fetched per user per day: hard cap 40
- Jobs surviving prefilter before LLM: target 8 to 15, hard cap 15
- Jobs stored as ranked feed items per day: up to 10
- Jobs shown by default to the user: 5
- User can expand to see more, up to 10 total, if enough good jobs exist

### Why this shape is recommended

This balances:

- quality
- user attention
- API cost
- LLM cost
- trust

The user should not need a feed-size setting in v1.

Recommended product behavior:

- Karko chooses the best results automatically
- the first view shows the best 5
- if more high-quality jobs exist, the user can expand to see up to 10

### Recommended v1 prefilter behavior

Prefilter should happen before the LLM and should be code-based, not LLM-based.

Examples of code-based rejects:

- wrong location
- wrong remote/on-site mode
- wrong employment type
- clear salary mismatch
- explicit work authorization mismatch
- clear seniority mismatch
- obvious duplicate or repost
- already seen and suppressed jobs

### If too many jobs survive prefilter

If more than the LLM cap survives, apply a deterministic shortlist before the LLM, such as:

- freshness
- exact title alignment
- salary present and acceptable
- remote alignment
- duplicate collapse

Then pass only the strongest shortlist into the LLM.

### Phase 5 - Feed APIs & Feed UI

Goal:
Expose the feed and its states to the user in a clear, useful way.

Why this exists:
A strong backend is useless if the user cannot understand what happened overnight or what to do next.

Core idea:

- build a feed-first panel
- support setup, loading, ready, thin-feed, empty, paused, and error states
- add an in-context settings panel

### Recommended v1 UI actions

Primary action:

- Apply with Karko AI

Secondary actions:

- See Details
- Save
- Dismiss

### Recommended `See Details` behavior

`See Details` should open the full job detail view for the selected job.

That detail view should include:

- full job description
- job metadata such as location, work mode, salary, and freshness when available
- the source apply destination

Important product behavior:

- Karko AI helps the user discover the job and generate the application package
- the user still completes the final submission themselves on the employer's application page

Because of that, the detail view should include a clear direct external-apply button that takes the user to the real job application page.

### Role of the two apply paths

Both apply paths are useful and should coexist:

1. Apply with Karko AI

- start the Karko application-generation workflow for that job

2. Direct external apply

- take the user to the employer or source application page when they are ready to submit

This keeps the flow realistic and matches how job applications actually get completed.

### Recommended v1 feed states

The UI should support these honest system states:

- setup required
- loading or generating
- ready
- thin feed
- empty
- paused
- error

### Recommended v1 display behavior

- show the best 5 jobs by default
- allow expansion up to 10 if enough good jobs exist
- use concise cards for quick scanning
- keep the full job description in the detail view, not in the default card

### Setup and settings UX direction

The feed setup and settings should live in-context inside Job Feed.

Recommended setup style:

- structured options first
- simple choices and toggles
- custom write-in only when needed

### Confirmed review outcome for Phase 5

Approved direction:

- build a feed-first panel
- include honest feed states
- keep setup simple and in-context
- use `Apply with Karko AI` as the primary action
- include `See Details` as a secondary action
- the detail view should show the full job description
- the detail view should include a direct external-apply button for final submission

### Phase 6 - Apply Handoff & Feedback

Goal:
Connect discovery directly to Karko's existing application workflow and capture learning signals.

Why this exists:
The feed should increase application throughput and retention, not sit as a disconnected browse screen.

Core idea:

- save / dismiss / opened / applied events
- apply directly from a feed item
- create a real application session tied to the surfaced job

### Recommended v1 apply handoff

When the user clicks `Apply with Karko AI`, the system should:

- create a real application session for that exact job
- attach the job identity to the session
- preload the correct job data into the Karko workflow
- move the user directly into the existing application-generation flow

The user should not need to reconstruct the job manually.

### Recommended v1 feedback scope

Keep the first version simple.

Recommended feedback events:

- opened
- saved
- dismissed
- applied

### Recommended v1 behavior from feedback

In v1, feedback should mainly drive:

- suppression of bad or already-seen jobs
- remembering saved jobs
- basic future reinforcement from saved or applied jobs

Do not build a complex learning or ML-heavy system yet.

### Important product principle

Discovery should connect directly to application generation, but the final submission still happens on the employer's real application page.

That means:

- Karko prepares the application package
- the user completes the final external submission

### What this phase should avoid

Do not add these in v1 unless later review changes the scope:

- auto-submission of applications
- overly complex feedback taxonomies
- heavy ML learning systems
- too much manual feedback burden on the user

### Confirmed review outcome for Phase 6

Approved direction:

- build a clean apply handoff from feed item to real application session
- capture simple v1 feedback events
- use feedback for suppression and light reinforcement
- keep final job submission external to Karko

### Phase 7 - Cost, Analytics, Retention, Cleanup

Goal:
Keep the system sustainable, observable, and operationally safe.

Why this exists:
Background AI systems become expensive and messy quickly without safeguards.

Core idea:

- token and provider cost tracking
- feed generation analytics
- retention limits
- payload cleanup
- internal rerun/debug support

### Recommended analytics direction for v1

Use the existing PostHog setup for product analytics and behavior tracking.

Recommended examples:

- setup completed
- feed opened
- item opened
- saved
- dismissed
- `Apply with Karko AI` clicked
- direct external-apply clicked
- thin-feed shown
- empty-feed shown

Do not build a separate internal analytics product for v1.

### Important distinction

PostHog is the right place for:

- product analytics
- user behavior tracking
- funnel analysis
- event-based usage reporting

But PostHog should not replace operational source-of-truth records such as:

- run tracking
- per-run status
- retry visibility
- rerun targeting
- pipeline idempotency state

Those still belong in the application database because they are operational records, not just analytics events.

### Recommended v1 operational approach

- use PostHog for analytics
- use database records for operational truth and debugging
- avoid building a separate internal analytics dashboard in v1
- keep rerun/debug tooling lightweight and practical

### Confirmed review outcome for Phase 7

Approved direction:

- use PostHog for feed analytics and behavior events
- do not build a separate analytics system in v1
- still keep operational run data in the database
- keep retention, cleanup, and debugging support lightweight but real

## Detailed Review - Phase 0

## Phase 0 - Cleanup & Reset

### What this phase is

This phase is not about building the new feed yet.

It is about removing the wrong assumptions from the current Job Feed implementation so the new system starts from the right shape.

### What this phase is for

This phase protects us from three bad outcomes:

1. Wrong UX inheritance

If we keep the manual search board as the base, we will keep drifting toward a search product instead of an autonomous discovery product.

2. Wrong backend inheritance

The current job search route is designed for live user searches, not scheduled multi-step feed generation.

3. Wrong success metric

The current system measures search usage. The new system should measure feed quality, relevance, and conversion to applications.

### What we keep

We should keep:

- the dashboard `Job Feed` tab itself
- reusable SerpApi request and localization logic
- the existing Karko application pipeline
- the existing application session and tracker system

### What we should stop using as product behavior

We should not carry forward these behaviors into the visible v1 feed:

- manual keyword search as the main interaction
- localStorage-driven search state as the main persistence pattern
- monthly manual search counters as the main commercial model
- copy-to-chat as the primary application entry
- direct external apply links as the primary action

### Proposed cleanup strategy

Recommended approach: soft cleanup

That means:

- the visible `Job Feed` becomes feed-first
- the old manual board is hidden from the user-facing product
- the old board can temporarily remain in the codebase as a fallback or internal debug surface
- useful SerpApi logic is extracted into shared helpers
- after the new feed is stable, the old board can be fully removed

### Why soft cleanup is the best option

If we delete everything immediately:

- we lose a useful debugging surface for SerpApi behavior
- we reduce our fallback options while building a complex background system

If we keep the old board visible:

- the product message gets weaker
- users keep doing manual labor
- the feed becomes a secondary add-on instead of the main experience

Soft cleanup gives the best balance:

- strong product direction
- lower engineering risk
- cleaner migration path

### Critical analysis

My current opinion:

- Keeping the old UI visible would be the wrong product move.
- Deleting the old search implementation immediately would be too aggressive.
- Reusing only the shell and useful backend pieces is the right middle path.

This phase is not overengineered.

It is necessary product cleanup so later phases do not inherit the wrong structure.

### Current default decision for Phase 0

- Visible product direction: feed-first
- Existing manual board: hidden temporarily, not user-facing
- SerpApi integration: partially reused through extracted helpers
- Old search quotas: legacy, not central to the new feature
- End state: old manual board removed after the new feed stabilizes

### Confirmed review outcome for Phase 0

Approved direction:

- use soft cleanup
- keep the old manual job board hidden temporarily if needed for fallback or debugging
- do not keep it as part of the user-facing product
- treat the hidden legacy search code as temporary only

Required reminder for implementation:

- if any hidden or legacy manual-search code still remains after the new feed is stable, remove it before this feature is considered fully complete

## Decision Log

### Locked decisions so far

- Orchestrator direction: Inngest
- Visible product direction: feed-first
- Launch market for v1: US + Canada
- Current cleanup recommendation: soft cleanup
- Phase 0 review result: approved with explicit end-of-project cleanup reminder
- Phase 1 review result: approved with dedicated settings table and simple option-first setup UX
- Phase 2 review result: approved with simple Inngest-only durable background execution
- Phase 3 review result: approved with raw + normalized storage and practical dedupe
- Phase 4 review result: approved with Strong/Good only, code prefilter, shortlist cap, and 5-default / 10-max display shape
- Phase 5 review result: approved with feed-first UI, full detail view, and direct external-apply path
- Phase 6 review result: approved with real session handoff, simple feedback events, and external final submission
- Phase 7 review result: approved with PostHog analytics plus DB-backed operational run tracking

## Open Review Workflow

When reviewing a phase, we should answer:

1. Is this phase actually necessary?
2. Is this phase too early or too late?
3. Is this phase too complex for MVP?
4. Is anything missing that would make the feature useless?
5. Is anything included that adds complexity without enough user value?

## Next Review Target

Next phase to analyze in detail:

- Full approved plan review and implementation breakdown
