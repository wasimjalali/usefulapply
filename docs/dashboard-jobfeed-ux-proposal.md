# Dashboard UX Proposal v2

Branch: `feature/dashboard-jobfeed-ux-proposal`  
Base branch: `feature/job-board`  
Date: `2026-04-23`

## Scope

This document captures the revised dashboard direction after your feedback:

- keep only 3 primary destinations in the dashboard
- move `Documents` into the profile dropdown
- remove `ATS Score` as a top-level tab
- show ATS score inline as a clickable score pill
- remove the extra application-context row
- make panel controls larger and more visible
- make the credits control feel more premium
- make the chat resize handle visible on hover or while resizing, not all the time

## Final Information Architecture

### Primary navigation

Use exactly 3 top-level tabs:

1. `Application Kit`
2. `Job Feed`
3. `Tracker`

### Why this is the right level

These 3 destinations match the 3 actual user jobs:

- create and refine the application package
- discover jobs
- track applications

That is much clearer than mixing document outputs, analysis, file management, and tracking in one flat nav.

## Final Decisions

### 1. `Documents` moves into the profile dropdown

`Documents` should not stay in the main dashboard nav.

Reason:

- it is a utility/support destination
- it is not part of the user’s main navigation decision every time they land in the app
- profile/account utilities are a more natural home for it

### 2. `ATS Score` becomes an inline score control

`ATS Score` should not be a top-level tab.

Instead:

- show the score directly in the `Application Kit` UI
- make the score clickable
- open a modal or popup with the full ATS analysis and the list of changes

This keeps the score visible without wasting a whole primary navigation slot on it.

### 3. Remove the extra application-context row

The extra row between top navigation and `CV / Cover Letter / Email` is not needed.

Reason:

- it adds vertical noise
- it makes the page feel more enterprise-heavy than necessary
- the dashboard is cleaner if the only persistent secondary row is the local navigation itself

This was the right pushback.

### 4. Panel controls should be larger and clearer

The toolbar controls in `CV`, `Cover Letter`, and `Email` should be visually stronger:

- larger hit areas
- stronger contrast
- clearer labels
- more obvious importance

The goal is to make the most-used actions readable at a glance.

### 5. Credits control should feel premium

The credits indicator should read like an account-status control, not a plain badge.

Desired characteristics:

- rounder pill shape
- more depth
- clearer plan/tier signal
- visually consistent with a premium SaaS header

### 6. Resize handle should stay quieter

The divider between results and chat should not always call attention to itself.

Behavior:

- hidden or near-invisible by default
- becomes visible on hover
- fully visible while resizing

## Desktop Layout

### Global header

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Logo | Application Kit | Job Feed | Tracker        Upgrade CTA | Credits Pill | History/New | Profile ▼ │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Profile dropdown

```text
┌───────────────────────────────┐
│ Avatar / Name / Email         │
├───────────────────────────────┤
│ Profile                       │
│ Account                       │
│ Subscription                  │
│ Notifications                 │
│ Documents                     │
├───────────────────────────────┤
│ Sign Out                      │
└───────────────────────────────┘
```

### Application Kit shell

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ CV | Cover Letter | Email                                             ATS Score Pill 82%    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Large panel toolbar: section-specific actions                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Active panel content                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Panel Sketches

### CV panel

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Original] [Optimized]   [Templates]   [Edit]   [Copy]   [Download PDF]                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ CV preview / editable canvas                                                               │
│                                                                                             │
│ Large readable preview area                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Cover Letter panel

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Edit]   [Regenerate]   [Copy]   [Download]                                                │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Cover letter document card                                                                 │
│                                                                                             │
│ Address / opening / body / closing                                                         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Email panel

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Application Email] [Follow-Up Email]   [Edit]   [Copy]   [Regenerate]                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Active email card                                                                          │
│                                                                                             │
│ Subject                                                                                    │
│ Body                                                                                       │
│ Sending tips                                                                               │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### ATS modal

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ATS Insights                                                            [Close]             │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Score bar                                                                                   │
│ Optimization summary                                                                        │
│ Key improvements                                                                            │
│ Keywords added                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Job Feed

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Job Feed                                                                                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Existing Job Board panel                                                                    │
│                                                                                             │
│ Search / filters / job cards / job detail modal                                             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Tracker

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Tracker                                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Pipeline counts                                                                             │
│ Search / filter                                                                             │
│ Application table                                                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Mobile Layout

### Top bar

```text
[Logo] [Upgrade] [Credits] [Profile ▼]
```

### Bottom navigation

Chat still needs to remain accessible on mobile, so mobile uses:

```text
[Chat] [Kit] [Feed] [Tracker]
```

### Mobile Application Kit

```text
┌───────────────────────────────────────────────┐
│ [CV] [Letter] [Email]      [ATS 82%]         │
├───────────────────────────────────────────────┤
│ Inline mobile panel toolbar                  │
├───────────────────────────────────────────────┤
│ Active panel content                         │
└───────────────────────────────────────────────┘
```

## What Changed From Proposal v1

### Removed from the previous version

- `Source Docs` utility button in the main header
- the separate application-context information row
- `Documents` as a dashboard tab
- `ATS Score` as a dashboard tab

### Added after feedback

- profile dropdown with settings destinations plus `Documents`
- ATS score pill + ATS modal behavior
- larger, more prominent panel toolbars
- premium-style credits pill
- quieter resize handle behavior

## UX Rationale

### Why `Application Kit` stays first

The dashboard’s center of gravity is still creating the application package. `Job Feed` is important, but the product’s main differentiated output is still the package generation workflow.

### Why `Documents` belongs in profile utilities

Primary navigation should reflect core workflows. Utility areas such as account, settings, notifications, billing, and document management are better grouped together instead of competing with workflow destinations.

### Why ATS becomes a score pill

Users want two things from ATS:

- a quick score at a glance
- detailed changes on demand

A score pill plus modal supports both needs with less clutter than a dedicated tab.

### Why bigger toolbars matter

The most-used actions in the dashboard are:

- switch output view
- edit
- copy
- regenerate
- download

Those actions should not feel secondary or tiny, because they are the actions people repeat most often.

## Implementation Checklist

### Header and navigation

- Replace the old multi-item nav with `Application Kit`, `Job Feed`, `Tracker`
- Add profile dropdown
- Move `Documents` into the profile dropdown
- Upgrade the credits pill styling

### Application Kit

- Keep local tabs: `CV`, `Cover Letter`, `Email`
- Add ATS score pill on the same row as local tabs
- Open ATS details in a modal
- Remove the application-context row

### Panels

- Increase the visual weight of panel toolbars
- Keep CV controls prominent
- Keep Cover Letter controls prominent
- Split Email into `Application Email` and `Follow-Up Email` local tabs

### Chat divider

- Keep resize capability
- Hide the visual handle until hover or resize

## Final Recommendation

The cleanest version of this dashboard is:

- 3 primary destinations only
- profile dropdown for utilities and documents
- ATS score shown inline, details on click
- no extra context row
- stronger panel controls
- premium account/credits treatment

That is the direction this file defines.
