# Karko Daily Feed UI Progress

Last updated: 2026-04-23
Status: Active desktop audit source of truth

## Purpose

This file is the durable tracker for the Job Feed desktop UI work.

Start here in every new chat before making more UI changes.

## Current checkpoint

This pass is auditing the desktop slices that were previously treated as "done."

Nothing should be called fully done unless it has both:

- code changes completed
- localhost desktop-width browser verification completed

If localhost cannot be reached, mark the slice as code-audited only.

## Design goals

- premium feel
- beginner-friendly
- low-friction
- easy to understand at a glance
- desktop first
- one-column reading flow where possible
- no cramped side-by-side helper panels
- structured controls over free-form inputs where practical

## Status by user-facing UI area

### 1. Signed-out user

Status: Code-audited, browser recheck pending

What is implemented:

- single-column desktop layout
- clearer premium value framing
- signed-out entry now supports both new and returning users
- `Create account` and `Sign in` actions are both visible
- first-run explainer now follows a more beginner-friendly sequence

What still needs to happen:

- fresh localhost desktop screenshot
- final spacing and copy review in the live browser

### 2. Signed-in free-plan user / upgrade-required state

Status: Code-audited, browser recheck pending

What is implemented:

- single-column desktop layout
- cleaner upgrade framing
- stacked premium preview summary
- state metrics now use state-specific messaging instead of generic "next run" copy

What still needs to happen:

- fresh localhost desktop screenshot
- live browser pass to check spacing, duplication, and visual hierarchy

### 3. Signed-in premium user before active feed cards

Status: In progress

What is implemented:

- onboarding changed from long form to wizard
- setup no longer auto-opens below the fold in `setup_required`
- `Start setup` now opens the wizard intentionally and scrolls it into view
- wizard step chrome has been simplified
- duplicate step-progress surface removed
- step map is now collapsible instead of always open
- summary and readiness are kept in a simpler stacked support card

What still needs to happen:

- fresh localhost desktop screenshot
- live browser verification of open/close behavior
- real signed-in premium test
- final polish on step copy and ordering after the live pass

### 4. Signed-in premium user with active feed cards and job detail flow

Status: Not finished

What is already in place:

- preview plumbing for desktop review
- partial work on primary state card
- partial work on empty-state card

What still needs to happen:

- final premium pass for `ready`, `thin_feed`, `empty`, `generating`, and `error`
- job cards redesign
- job detail modal redesign
- full browser verification at desktop width
- real-data premium review

## Audit log

### 2026-04-23

Audit findings fixed in code:

- signed-out UI previously pushed only toward sign-in; it now supports both account creation and sign-in
- `setup_required` previously left the setup experience feeling buried below the fold; wizard opening is now intentional and scroll-linked
- wizard steps were shown in multiple places at once; the step map is now collapsible and the duplicate progress card was removed
- locked/setup state metrics previously implied a future run too generically; messaging is now state-specific

Audit corrections to tracking:

- signed-out and free-plan slices are no longer treated as fully complete without a fresh browser pass

## Browser verification

Previously checked in an earlier pass, but needs a fresh audit after the latest code changes:

- `jobFeedPreview=signed_out`
- `jobFeedPreview=upgrade_required`
- `jobFeedPreview=setup_required`

Still needed:

- full desktop screenshots for the three slices above
- real signed-in premium verification
- premium active-feed screenshots

## Current blocker

Live localhost verification is currently blocked from this environment.

What happened:

- `npm run dev -- --hostname 127.0.0.1 --port 3000` failed with `listen EPERM`
- escalated retry was rejected by the approval backend with a 404 deployment error

Practical meaning:

- code audit can continue
- browser screenshots and live desktop verification need a user-run localhost session

## Files touched in this audit pass

- `src/components/job-feed/JobFeedPanel.tsx`
- `docs/karko-daily-feed-ui-progress.md`

## Recommended next order

1. recheck signed-out desktop state in the browser and capture screenshot
2. recheck free-plan desktop state in the browser and capture screenshot
3. recheck setup-required wizard open/close flow in the browser and capture screenshot
4. then continue into `ready`, `thin_feed`, `empty`, `generating`, and `error`
5. then redesign job cards
6. then redesign the job detail modal

## Validation checklist

- targeted lint on `src/components/job-feed/JobFeedPanel.tsx`
- full typecheck
- full build
