# Karko Daily Feed UI Progress

Last updated: 2026-04-23
Status: Active desktop UI source of truth

## Purpose

This file is the durable tracker for the Job Feed UI work so a new chat can continue without losing context.

Use this file first when resuming desktop Job Feed UI work.

## Design goals

- premium feel
- beginner-friendly
- low-friction
- easy to understand at a glance
- desktop first
- one-column reading flow where possible
- no cramped side-by-side helper panels

## Current checkpoint

The current UI work is focused on desktop layout only.

The page has been reshaped away from the earlier two-column helper-heavy layout into a cleaner stacked flow for the slices touched in this pass.

## Status by user-facing UI area

### 1. Signed-out user

Status: Desktop v1 done for this checkpoint

What is already implemented:

- stronger signed-out value proposition
- cleaner premium framing
- single stacked flow instead of split helper columns
- clearer "what happens first" explanation
- clearer "what you’ll personalize" summary
- browser-checked on localhost desktop width

What can still be improved later:

- final copy polish after the premium signed-in flow is fully finished

### 2. Signed-in free-plan user / upgrade-required state

Status: Desktop v1 done for this checkpoint

What is already implemented:

- cleaner premium upgrade framing
- stacked single-column layout
- better "what unlocks after upgrade" explanation
- better premium status card
- browser-checked on localhost desktop width

What can still be improved later:

- final spacing and copy polish after the active premium feed is complete

### 3. Signed-in premium user before active feed cards

Status: In progress

What is already implemented:

- onboarding redesigned from long form into a progressive wizard
- desktop setup now moves step by step
- strong structured controls added for market, remote preference, timing, and optional filters
- wizard progress, readiness, and review sections added
- page-level layout flattened into a more readable stacked flow
- `setup_required` preview state browser-checked on localhost desktop width

What still needs to be added or finished:

- final polish for every wizard step with real signed-in premium data
- final confirmation of the best step ordering and copy
- real-data validation for the premium setup flow, not just preview states
- final review of empty/paused/awaiting/generating/error transitions in the premium signed-in flow

### 4. Signed-in premium user with active feed cards and job detail flow

Status: Not finished

What is already implemented:

- preview plumbing exists for desktop UI review
- primary state card has been improved
- feed header has started improving
- empty-state card has started improving

What still needs to be added or finished:

- full premium polish for `ready`, `thin_feed`, `empty`, `generating`, and `error`
- final job feed card redesign
- final job detail modal redesign
- full browser verification for the active feed screens at desktop width
- final real-data pass with a signed-in premium-capable account

## Browser verification already completed

- `jobFeedPreview=signed_out`
- `jobFeedPreview=upgrade_required`
- `jobFeedPreview=setup_required`

All of the above were visually checked on localhost desktop width during this pass.

## Files changed in this UI pass

- `src/components/job-feed/JobFeedPanel.tsx`
- `docs/karko-daily-feed-ui-progress.md`

## Recommended next order

1. finish the single-column premium signed-in setup flow polish
2. finish premium active-feed state cards
3. redesign the job cards
4. redesign the job detail modal
5. verify every premium active state in the browser at desktop width
6. only do mobile after desktop feels finished

## Commit scope for this checkpoint

This checkpoint is a desktop UI checkpoint only.

It should be treated as:

- signed-out desktop state: checkpoint complete
- free-plan desktop state: checkpoint complete
- premium onboarding desktop state: in progress
- active feed desktop state: not complete yet
