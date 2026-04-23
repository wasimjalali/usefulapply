# Karko Daily Feed UI Desktop Handoff

Last updated: 2026-04-23
Status: Active handoff for the next UI-focused session

## Purpose

This file exists so a fresh chat can continue the Job Feed UI work without losing context.

Use this as the current UI source of truth together with:

- `docs/karko-daily-feed-plan.md`
- `docs/karko-daily-feed-foundations-todo.md`

## Current checkpoint

What is already done:

- the Job Feed backend foundations are largely built
- real Inngest wiring exists
- ranked feed items, feedback actions, and Apply with Karko AI handoff already exist
- the visible Job Feed screen has already been cleaned up once so it no longer exposes branch milestones or phase wording
- the signed-out screen is now gated properly instead of showing the full setup form
- diagnostics and debug tools are hidden unless explicitly enabled

What is not done yet:

- the desktop UI is not finished
- the onboarding flow still needs to be redesigned into a better premium setup experience
- the signed-in premium states still need real-data polish
- the job result cards and detail flow still need a stronger premium product feel
- mobile is not the current priority

## Confirmed product direction for the next session

### Priority order

1. Desktop UI first
2. Signed-in premium onboarding and feed states next
3. Mobile pass later, only after desktop feels finished

### UX goals

- simple
- easy
- enjoyable
- premium
- professional
- low-friction
- product-facing, not internal

### Important constraint

Do not drift back into backend-first work unless the UI task is blocked by missing data or missing state handling.

The next session should treat the backend as mostly available and focus on the product surface.

## Confirmed UI decisions

### 1. Desktop-first design

- make decisions for desktop layout first
- use the browser at desktop width while iterating
- do not spend time polishing mobile until the desktop version is coherent

### 2. Onboarding should become step-by-step

The current long scrolling setup form is not the desired final experience.

Recommended direction:

- replace the long all-at-once setup form with a progressive multi-step onboarding flow
- reveal the next step only after the current step is complete or intentionally skipped
- keep the first-time setup feeling short and guided
- show progress clearly
- reduce the amount of visible form at one time

Recommended desktop onboarding structure:

1. Step 1: target roles and target market
2. Step 2: preferred locations and remote preference
3. Step 3: delivery hour and timezone
4. Step 4: optional refinements
5. Step 5: consent, enable feed, and review

Important:

- only the truly required fields should block progress
- optional refinements should feel skippable, not mandatory
- the user should not feel punished for wanting to finish quickly

### 3. Prefer structured inputs where possible

- use dropdowns/selects/autocomplete wherever practical
- timezone should move toward a proper dropdown or searchable select
- preferred locations should feel structured and launch-scope aware
- US and Canada support matter first

### 4. Target roles should eventually become CV-aware

Desired future behavior:

- when a CV exists, suggested target roles should be relevant to the user’s CV
- the user should be able to tap one or two strong suggested roles instead of typing everything manually
- manual role entry still needs to remain available

Important implementation note:

- if CV-aware role suggestions are not already available through current client-side data, do not invent fake AI behavior in the UI
- it is okay for the next session to improve the component shape first and leave the actual CV-derived suggestion logic as a follow-up integration task

## UI slices to work on in order

### Slice 1: onboarding shell

Goal:

- redesign setup into a premium desktop wizard instead of a long scrolling form

Focus:

- progress indicator
- step container layout
- lighter cognitive load
- clear next/back/skip actions
- strong completion CTA

### Slice 2: signed-out and free-plan states

Goal:

- make the value proposition clear without overwhelming the user

Focus:

- signed-out state
- signed-in but non-premium upgrade state
- premium framing
- concise CTA language

### Slice 3: post-setup premium state cards

Goal:

- make `awaiting_first_run`, `generating`, `ready`, `thin_feed`, `empty`, and `error` feel intentional and polished

Focus:

- clearer hierarchy
- better premium visual feel
- less dashboard-diagnostic energy
- stronger “what happens next” guidance

### Slice 4: job list cards

Goal:

- make the result cards feel like a curated feed, not raw records

Focus:

- hierarchy of title / company / fit / meta
- stronger first-action emphasis
- improved spacing, density, and readability
- cleaner action grouping

### Slice 5: job detail modal

Goal:

- make review and decision-making feel clean and trustworthy

Focus:

- clearer reading structure
- better employer/apply affordances
- premium polish
- continuity with the card design

### Slice 6: final desktop polish

Goal:

- tighten the whole desktop surface once the major slices are in place

Focus:

- spacing consistency
- visual rhythm
- CTA consistency
- premium tone

### Slice 7: mobile follow-up

Goal:

- adapt the now-finished desktop experience to mobile

Important:

- do not start here

## Verification expectations for the next UI session

After each major slice:

- reload localhost
- inspect the desktop version in-browser
- verify the change visually
- keep hidden debug controls hidden unless explicitly enabled
- run targeted lint if the touched file changes substantially
- re-run typecheck and build before stopping

## Files most likely to change next

- `src/components/job-feed/JobFeedPanel.tsx`

Possible follow-up extraction candidates if the file becomes too large:

- `src/components/job-feed/JobFeedOnboardingWizard.tsx`
- `src/components/job-feed/JobFeedStateCard.tsx`
- `src/components/job-feed/JobFeedResultCard.tsx`
- `src/components/job-feed/JobFeedDetailModal.tsx`

## Suggested checkpoint commit message

`Productize daily feed UI states and document desktop-first onboarding plan`

## Copy/paste prompt for the next chat

```text
Continue the Karko AI Daily Feed work in /Users/wasimjalali/Desktop/Karko_AI.

First read:
- docs/karko-daily-feed-plan.md
- docs/karko-daily-feed-foundations-todo.md
- docs/karko-daily-feed-ui-desktop-handoff.md

Important:
- preserve existing uncommitted changes
- do not touch secrets or env files
- do not use destructive git commands
- do not focus on mobile yet
- desktop UI is the priority

Current backend status:
- Job Feed backend foundations, ranked feed items, feedback, Apply with Karko AI handoff, and real Inngest wiring already exist
- do not redo backend work unless the UI is blocked

Your task:
1. Focus only on the Job Feed desktop UI first
2. Redesign onboarding from the current long scrolling setup form into a progressive step-by-step wizard
3. Keep the setup easy, simple, premium, and low-friction
4. Prefer structured controls where possible
5. Improve the signed-in premium flow one slice at a time:
   - onboarding wizard
   - signed-out / free-plan / upgrade states
   - ready / thin / empty / generating / error states
   - job cards
   - job detail modal
6. Verify each major UI slice in the browser on localhost desktop width before moving on
7. Update the markdown trackers as the UI work progresses
8. Run targeted lint, typecheck, and build before stopping

Keep the work sequential, and optimize for the best desktop premium UX first.
```
