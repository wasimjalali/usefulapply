Written when the product was called Karko AI.

# Job Feed Redesign Plan

## Context

The Job Feed UI is overloaded at every stage. Each stage repeats the same information across multiple cards, stat boxes, and sections. The audience is non-technical job seekers who need clarity, not explanation walls.

This plan covers cleanup + rebuild from Stage 0 through Stage 4.

---

## Step A — Code Cleanup (Before Any UI Work)

### A1. Remove LegacyJobBoardPanel
- **File:** `src/components/JobBoardPanel.tsx`
- **Action:** Delete the entire `LegacyJobBoardPanel` function (~880 lines), all its supporting types (`Job`, `FilterOption`, `SearchFilter`, `SearchResponse`, `JobSearchState`), constants (`COUNTRY_OPTIONS`, `JOB_SEARCH_STORAGE_KEY`), and inline components (`FormattedDescription`, `JobDetailModal`).
- **Keep:** The `JobBoardPanel` export — simplify it to just `return <JobFeedPanel />;` without the env-var gate.
- [ ] Done

### A2. Remove legacy search API route
- **File:** `src/app/api/jobs/search/route.ts`
- **Action:** Verify no other caller references this route, then delete the file.
- [ ] Done

### A3. Extract preview utilities out of JobFeedPanel
- **From:** `src/components/job-feed/JobFeedPanel.tsx`
- **To:** `src/components/job-feed/preview-utils.ts`
- **Move:** `getJobFeedPreviewMode`, `buildJobFeedPreviewSnapshot`, `buildJobFeedPreviewJobs`, `toPreviewJobFeedSettings`, `buildPreviewJobFeedRun`, `JobFeedPreviewMode` type (~400 lines)
- [ ] Done

### A4. Extract reusable form components
- **From:** `src/components/job-feed/JobFeedPanel.tsx`
- **To:** `src/components/job-feed/form-controls.tsx`
- **Move:** `ChipField`, `ChoiceGrid`, `SelectField`, `InputField`, `ToggleRow`, `RoleEntryField`, `FieldGroup`, `InlineNotice`, `ActivationChoiceCard` (~400 lines)
- [ ] Done

### A5. Extract feed display components
- **From:** `src/components/job-feed/JobFeedPanel.tsx`
- **To:** `src/components/job-feed/feed-cards.tsx`
- **Move:** `JobFeedCard`, `JobFeedDetailModal`, `JobFeedDescription`, `MetaPill`, `RunStatPill`, `FeedResultsCard` (~500 lines)
- [ ] Done

---

## Step B — Stage Rebuilds

### B0. Stage 0 — Anonymous Visitor (Not Signed In)

**Current problems (confirmed by screenshot):**
- Dark hero header + 3 stat cards + "Get Started" card with 3 feature rows + 3 CTA buttons + "What Happens First" 4-step list + "Before the First Run" card with 4 icon rows + "How It Works" 4-step list = 7 distinct content sections, ~4 viewport heights of scrolling
- Same message repeated in 3 different formats
- Marketing buzzwords: "premium assistant surface", "background research", "strongest matches surfaced first"

**After redesign:**
- ONE section: clean hero with a gradient background (keep the navy gradient feel but lighter)
- Headline: short, benefit-focused, plain English
- One sentence of explanation
- Two buttons: "Sign up free" (gold) and "Sign in" (outline)
- Below: 3 small blurred/dimmed preview job cards showing what the feed looks like when active — SHOW don't TELL
- No stat boxes, no numbered steps, no feature rows, no "how it works", no "what you'll personalize"
- Total: fits in ONE viewport

**What gets deleted:**
- `SignedOutJobFeedCard` component
- The marketing variant of `JobFeedStageHeader` for signed-out state
- "What Happens First" step list
- "Before the First Run" preview card
- "How It Works" section
- All stat boxes for anonymous state

- [ ] Done

### B1. Stage 1 — Free User, Upgrade Required

**Current problems (confirmed by screenshot):**
- Same dark hero as Stage 0 + 3 stat cards + "Premium Status" card with 3 stat rows + "From Here" section + "Premium Access" card with 3 lettered features + "Premium Preview" card with 4 icon rows + "How It Works" = 7+ sections, same scrolling problem
- Two separate "View plans" buttons in different cards saying the same thing
- Everything says "upgrade" in different ways

**After redesign:**
- ONE section: upgrade pitch card
- Headline: clear and direct about what they get
- One sentence of value
- One gold CTA button with price shown
- Below: same 3 blurred preview cards as Stage 0 (reuse component)
- No stat boxes, no lettered feature lists, no "how it works", no "premium preview"

**What gets deleted:**
- `UpgradePromptCard` component
- The marketing variant of `JobFeedStageHeader` for upgrade state
- All redundant explanation cards and step lists

- [ ] Done

### B2. Stage 2 — Paid User, Setup Required + Setup Wizard

**Current problems (confirmed by screenshots):**
- Before wizard: hero + stat cards + status card with 3 stat rows + "from here" section + preferences summary + "how it works" = 5+ sections before even starting setup
- The wizard itself: step indicator bar + progress bar + step content + "at a glance" summary + "readiness" checklist + sticky footer = extremely heavy for what amounts to filling in 2-3 fields
- 5 steps when the essential information is: roles, market, timing. Everything else is optional refinement.

**After redesign — Pre-setup state:**
- No hero header for returning paid users. They already know what Karko is.
- Simple inline message: "Set up your daily feed" with a short sentence and "Start setup" button
- No stat boxes, no "how it works", no preference summary (nothing to summarize yet)

**After redesign — Setup flow:**
- Progressive inline form, NOT a multi-page wizard
- Shows as an expanding card on the same page

**Chunk 1 (required — shown first):**
- "What jobs are you looking for?"
- Role chips with suggestions (keep existing RoleEntryField — it works)
- Market selector (3 options, keep ChoiceGrid)

**Chunk 2 (revealed after Chunk 1 is filled):**
- "Where and how do you want to work?"
- Work mode: remote/hybrid/onsite selector
- Optional: "Add preferred cities" expander (collapsed by default)

**Chunk 3 (revealed after Chunk 2):**
- "When should we deliver your jobs?"
- Quick-pick time grid (6 buttons: 7am, 8am, 9am, 12pm, 6pm, 8pm)
- Timezone auto-detected, shown as small text, editable link

**Final action (revealed after Chunk 3):**
- Consent as inline text: "By starting, Karko will search for jobs for you once a day."
- One gold button: "Start my daily feed"
- One text link: "Save and keep paused"

**Refinements (Step 4 from old wizard):**
- NOT part of initial setup
- Available as "Fine-tune your feed" link in the preference summary AFTER the first feed is delivered
- Opens as a separate settings panel (reuses existing form components)

**What gets deleted:**
- 5-step wizard navigation (progress bar, step indicators, "Step X of 5")
- Review step (Step 5) — unnecessary for a 3-field form
- "At a Glance" summary inside wizard
- "Readiness" checklist inside wizard
- "How It Works" section
- All stat boxes for setup state
- `PrimaryStateCard` for setup_required state
- `JobFeedOnboardingWizard` component (rebuilt as progressive form)

- [ ] Done

### B3. Stage 3 — Active Feed (Ready / Thin Feed) ✓

**Current state (from code, no screenshot):**
- Stage header card with stat boxes
- RunStatPill row (Feed date, In feed, Strong, Good, Freshly surfaced)
- Job cards with: rank badge, fit label, pipeline badge, title, company, 5 meta pills, via source, description preview, 5 action buttons
- Preference summary panel at bottom

**After redesign:**
- Simple page header: "Your jobs for [date]" — one line, small text showing count
- Gear icon for settings, refresh icon — compact, not full button sections

**Job cards — simplified:**
- One fit badge only: "Strong match" or "Good match" (colored dot + text, not a full pill)
- Job title (prominent)
- Company name
- One line of meta: location + work mode + salary (if available). That's it on the card.
- Two-line description preview
- Two actions only: "Apply with Karko" (gold button) and "Details" (text link)
- Save/Dismiss: accessible via the detail modal, not on every card
- "Employer site" link: inside detail modal only

**What gets removed from cards:**
- Rank badge (#1, #2...) — position communicates rank
- "Freshly surfaced" badge — users don't understand pipeline stages
- Save button on card
- Dismiss button on card
- "Employer site" link on card
- Employment type pill (moved to detail)
- Posted date pill (moved to detail)
- Via source text (moved to detail)

**Preference summary:**
- Compact single row at bottom: "Roles: X, Y | Market: US+CA | Delivery: 8am ET" with edit link
- Not a full card with 4 stat boxes

**Transitional states (paused, awaiting, generating, empty, error):**
- Each gets a simple inline message with one icon, one headline, one sentence, one action
- NOT a full card with icon + badges + stat rows + guidance text
- Max 3 lines of content per state

- [x] Done

### B4. Stage 4 — Application Handoff from Feed ✓

**Current state:**
- Button click → API call → toast → redirect. Invisible transition.

**After redesign:**
- On click: card shows inline "Opening..." state (button becomes spinner, card subtly highlights)
- Toast is more specific: "[Job Title] at [Company] — opening your application"
- On the application workspace: small dismissible banner at top: "Applying for [Job Title] at [Company]" — gives context for what the agent is working on
- If no CV uploaded: redirect to application kit with clear message about uploading CV first

- [x] Done

---

## Design Principles (Enforced Throughout)

1. **One action per screen state.** Never show 3 buttons when 1 will do.
2. **6th-grade reading level.** No "premium assistant surface." Say "daily job list."
3. **Show, don't tell.** Preview cards > explanation paragraphs.
4. **Progressive disclosure.** Show the next thing only when the current thing is done.
5. **Cards only for distinct content items** (individual jobs). Status messages, instructions, and empty states use clean text + spacing, not cards.
6. **Premium feel = restraint.** White space, clean typography, purposeful color. Not more stuff.
7. **Brand colors stay.** Navy #1E3A5F, Cream #FAF7F2, Gold #D4A853, Charcoal #2D3748.

---

## Execution Order

1. Step A (cleanup) — all 5 tasks
2. B0 — Anonymous visitor
3. B1 — Upgrade required
4. B2 — Setup flow
5. B3 — Active feed
6. B4 — Application handoff
7. Final tsc check
