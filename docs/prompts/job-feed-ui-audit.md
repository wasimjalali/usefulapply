# Job Feed UI/UX Audit + Redesign — Opus 4.7 Session Prompt

This is a portable prompt for a fresh Opus 4.7 Claude Code terminal. It kicks off a two-phase UI/UX pass on the Karko AI Daily Job Feed — audit first, redesign after user confirmation.

**Usage:** open a fresh Claude Code session in `/Users/wasimjalali/Desktop/Karko_AI`, set model to Opus 4.7, paste everything between "BEGIN PROMPT" and "END PROMPT".

---

## BEGIN PROMPT

You are redesigning the Karko AI Daily Job Feed UI end-to-end. This is a two-phase task:

- **Phase 1 — AUDIT.** Read every surface, catalog what works and what doesn't, propose a direction. Do NOT touch code. Stop and wait for the human to confirm the direction before implementing.
- **Phase 2 — REDESIGN.** Only after the human has signed off, implement the approved direction one surface at a time. Verify each surface before moving to the next. No batch redesigns.

**Use the `karko-ui-designer` project agent** for the implementation phase when it helps — its system prompt already carries the brand tokens and the humane-design rules. During the audit phase, read files directly.

---

## Who you are designing for

Karko's users are **job seekers**. They are under time pressure. Many have recently been laid off or are in jobs they want to leave. They arrive stressed, often scanning our product next to ChatGPT, Teal, Simplify, and free job boards. They evaluate us in the first 30 seconds.

Design principles for this niche:
- **Calm, not corporate.** Premium feel (Linear / Notion / Vercel territory), not aggressive sales UI.
- **Confidence, not cheerfulness.** No emoji in headings. No cute illustrations that undercut seriousness.
- **Humane, not AI-generated.** (See the anti-slop checklist below.)
- **Scannable.** Job seekers speed-read. Left-aligned, high contrast where it matters, consistent spacing.
- **Empty states with a path forward.** Never a blank screen; always a next action.
- **Respect the user's time.** A single clear CTA per card. Don't bury "Apply with Karko" behind three clicks.

---

## Brand system (strict — do not deviate)

**Colors** (Tailwind v4 tokens in `src/app/globals.css`):

| Token | Hex | Role |
|-------|-----|------|
| `navy-600` | `#1E3A5F` | Main primary — buttons, links, headers |
| `navy-500` | `#3F699F` | Hover, secondary link |
| `navy-200` | `#9FB3CF` | Borders, inactive chips |
| `navy-50` | `#E8EDF4` | Faint tint |
| `cream-100` | `#FAF7F2` | **Main page background** |
| `cream-50` | `#FEFDFB` | **Preferred card surface** (softer than cream-100) |
| `cream-200` | `#F5F0E8` | Subtle dividers |
| `cream-300` / `cream-400` | | **AVOID on large surfaces** — reads as dingy |
| `gold-400` | `#D4A853` | Main accent — **primary CTA ONLY** |
| `gold-500` | `#C4932E` | Pressed / gradient end |
| `gold-100` / `gold-300` | | Soft badge background / border |
| `charcoal` | `#2D3748` | Primary text |
| `warm-gray` | `#6B7280` | Secondary text, metadata |

**Typography:**
- Headers (h1–h3): Georgia, `font-semibold` (not `font-bold` — too AI-slop)
- Body / UI chrome / buttons: Arial (system sans)
- Letter-spacing: `tracking-tight` on headlines only

**Motion:**
- `transition-colors duration-200` default
- Hover lift (`-translate-y-0.5 hover:shadow-md`) on elevated CTAs only
- `Loader2 animate-spin` from lucide for loading
- No fade-in-on-mount for static content

**Iconography:**
- Lucide-react only
- Sizes: `w-3.5` (chrome), `w-4` (inline text), `w-5` (headers)

---

## The user's explicit UX concerns (address each)

1. **Cream intensity.** The user feels cream-heavy surfaces currently read as heavy/dingy. Direction: prefer `cream-50` or pure white for card surfaces; reserve `cream-100` for the page canvas only. Reduce large solid cream-300+ fills.
2. **Anti AI-slop.** The user specifically does NOT want: badge soup, gradient cards, emoji headings, "glassmorphism," tooltips-on-every-icon, card-pulsing animations, auto-scrolling testimonial carousels. Aim for quiet, asymmetric, content-first layouts.
3. **Card density.** Don't overload cards with badges, grades, scores. Less metadata visible per card, more value per card.
4. **Premium professional.** Job seekers evaluate on trust. The UI has to feel like a paid professional tool, not a free demo.
5. **Desktop + tablet first.** Mobile (<768px) is explicitly deprioritized. Do not burn cycles on responsive variants.

---

## Surfaces to audit (all of them)

For each surface, the audit must cover: default state, empty state, loading state, error state, long-content overflow.

### 1. Signed-out landing into Job Feed (`/dashboard` → Job Feed tab when logged out)
**File:** `src/components/job-feed/JobFeedPanel.tsx` — `<SignedOutStage />` around line ~818
- Hero copy + sign-in CTAs + blurred preview cards
- Does the CTA hierarchy feel confident?
- Does the blurred preview sell the value or feel like a teaser wall?

### 2. Upgrade-required state (free tier landed on Job Feed)
**File:** same file — `<UpgradeStage />` around line ~852
- "Upgrade to Plus" CTA — currently gold; is gold alone enough to signal plan gate?
- Blurred preview again — same question as above

### 3. Setup wizard (pre-activation — user has never configured the feed)
**File:** `JobFeedPanel.tsx` — `<JobFeedOnboardingWizard />` around line ~1070 through ~1570
- **Step 1** — Roles + Countries + Cities fields (RoleEntryField, MultiSelectDropdown, RoleEntryField again for cities). Help text, input cap warnings, "Take from my CV" button, "CV updated, refresh?" banner.
- **Step 2** — Work mode multi-select
- **Step 3** — Delivery time + timezone
- **Step 4** — "Fine-tune your feed" (seniority, search style, employment types, languages, minimum salary, skills, work authorization). Collapsible.
- **Save action** — consent checkbox, "Start my daily feed" CTA, "Save and keep paused" link
- Is the wizard too long? Too dense? Does the 4-step progress feel earned?

### 4. Post-activation shell (user has configured feed, is viewing results)
**File:** `JobFeedPanel.tsx` — `<FeedPageHeader />`, `<FeedResultsCard />`
- Page title ("N jobs for you today" or similar)
- Subtitle with roles + countries summary
- Refresh icon + "Edit feed" button
- Feed summary line: "Roles: X | Countries: Y | Delivery: Z"
- "Load more (N)" / "Show less" toggle

### 5. State messages (non-ready feed states)
**File:** `JobFeedPanel.tsx` — `<InlineStateMessage />` around line ~950
- `setup_required` — "Start setup" prompt
- `paused` — feed is paused
- `awaiting_first_run` — setup done, scheduled for tomorrow
- `generating` — active run in progress
- `empty` — run finished with zero matches
- `error` — run failed
Each has an icon, message, optional action. Is iconography consistent? Does each give a clear next step?

### 6. Job card (feed result item)
**File:** `src/components/job-feed/feed-cards.tsx` — `<JobFeedCard />` around line ~260
- Top row: fit-label pill (Strong / Good) + conditional Saved / Applied badges
- Title + company
- MetaPills: location, work mode, salary (optional)
- 2-line description preview
- Right column: "Apply with Karko" gold CTA + Details link + Copy button
- Review: badge count per card, CTA hierarchy, whitespace density

### 7. Job detail modal (opens on Details click)
**File:** `feed-cards.tsx` — `<JobFeedDetailModal />` around line ~360
- Header: company icon + fit label + status badges + title + company + close button
- Meta row: location, work mode, salary, employment type, posted date
- "via {board}" line
- Role details rendered via `<JobFeedDescription />` with heading / bullet / paragraph parsing
- Apply-via sub-section (aggregator links)
- "How does this match feel?" thumbs up/down feedback
- Footer: Copy button + Employer site link + Save + Dismiss + Apply with Karko CTA
- Review: is the modal width right (currently `max-w-5xl`)? Is the close affordance visible enough? Is the feedback section well-placed?

### 8. Diagnostics panel (debug-mode only — don't redesign, just flag issues)
**File:** `JobFeedPanel.tsx` — OperationalSnapshotCard and the 5-button diagnostics card
- Not user-facing in production. Cosmetic consistency with the rest of the page is fine; no deep redesign needed.

---

## Phase 1 deliverable (audit only — no code changes)

Produce a single markdown audit report with this structure:

```
# Karko AI — Job Feed UI/UX Audit

## Executive summary
[3-5 bullets: top themes. e.g. "cream surfaces read heavy", "detail modal is 80% there", "wizard needs to breathe in step 4", "job card badges compete for attention".]

## Per-surface findings

For each of the 8 surfaces above:

### <Surface name>
**File(s):** [path:line]
**Current state:** [2-3 sentences]
**What works:** [bullets]
**What fails:** [bullets — tie each to a design principle or brand token]
**Proposed direction:** [one paragraph — not implementation, intent]
**Open questions:** [if any, for the user to decide]

## Cross-cutting patterns
[Patterns that recur across surfaces — e.g. "cream-200 borders too weak at 1px", "badge families don't share a scale", "help text gets swallowed on focus"]

## Direction proposal (the 3-5 high-impact moves)
1. [Proposed change — tied to user's stated concerns]
2. ...

## Out of scope / not recommended
[Anything the user might expect to redesign but you recommend leaving alone, with justification]
```

**Stop after delivering the audit.** Explicitly ask the user: "Confirm this direction and I will implement surface by surface. Anything you'd remove or prioritize differently?"

---

## Phase 2 deliverable (only after confirmation)

Implement the approved changes **one surface at a time**. For each surface:

1. State the target file(s).
2. Make the edits — reuse existing primitives (`Card`, `Button`, `MetaPill`, `FieldGroup`, etc.) before inventing new ones.
3. Run `npx tsc --noEmit` — must be zero errors (ignore stale `.next/types/validator.ts` warnings).
4. Optional: spawn `ui-tester` agent for Playwright verification at 1280px and 768px.
5. Report back with the diff summary and "ready for the next surface?"

Do NOT batch redesigns. The human wants to see each surface land before the next begins.

---

## Hard rules (cannot be overridden without explicit user approval)

1. **No backend changes.** Do not touch files under `src/app/api/**`, `src/lib/supabase/**`, `src/lib/job-feed/{ingestion,prefilter,server,batch-*,ranking,openai-ranking}.ts`, or Zustand stores. If a UI change requires new data, flag it and stop.
2. **No new npm packages.**
3. **No new custom fonts** beyond Georgia + Arial.
4. **No new color tokens** without updating `globals.css` AND citing them in the audit.
5. **Desktop + tablet first.** Do not spend time on mobile-only fixes.
6. **Never use em-dashes (—)** or en-dashes (–) in user-facing copy. Commas / periods / colons / parentheses only.
7. **Never add emoji to headings.** A single checkmark in a success toast is acceptable.
8. **Never remove working anti-hallucination / anti-AI-slop patterns** that already exist.

---

## Context about what's already been built

- **Brand palette defined** in `src/app/globals.css` — Tailwind v4 inline config. Extend colors there.
- **Shared primitives** live in `src/components/ui/*` (Button, Card, Toast) and `src/components/job-feed/form-controls.tsx` (FieldGroup, ChipField, MultiSelectDropdown, SelectField, etc.). Reuse before inventing.
- **Existing agents** available for parallel work:
  - `karko-ui-designer` (Sonnet 4.6, high effort) — carries brand tokens; use during Phase 2 implementation when it saves context.
  - `ui-tester` (Sonnet 4.6) — Playwright MCP verification.
  - `integration-tester` (Haiku 4.5) — tsc + lint + spot checks. Fast.
- **Recently shipped (don't undo):**
  - Tier caps Plus 15 / Max 25 visible jobs, default 10 shown.
  - "Load more (N)" / "Show less" pagination on FeedResultsCard.
  - "Minimum salary (non-negotiable)" label replacing "Salary floor".
  - "Copy" button on both card and detail modal (CopyJobButton component).
  - "Refresh from my CV" banner in wizard when primary CV is newer than cached suggestion.
  - Debug diagnostics panel with 5 buttons (Run live, skip-if-done, async queue, async force rerun, refresh).
- **Known anti-patterns in current code** (the user has flagged these):
  - Cream feels heavy in large doses — soften toward cream-50 / white for cards.
  - Card badges may feel crowded — reduce to 1-2 max per card.
  - Overall wants a more "humane" less AI-slop feel.

---

## Start here

Begin Phase 1 now. Read the 8 surfaces above in order. Don't spawn any sub-agents for the audit — you need the full visual context in your own working memory to judge consistency. Once you've read all 8 surfaces, produce the audit report in the exact format specified above, and stop for confirmation.

## END PROMPT

---

## Notes for the repo owner

This prompt is intentionally verbose because Opus 4.7 tends to over-optimize without clear constraints, and the opposite failure mode — under-reasoning on a nuanced UX problem — is worse. The explicit palette + anti-slop checklist + per-surface file pointers give the session enough scaffolding to produce a report worth acting on.

**After Opus delivers the audit:**
1. Read the report end-to-end.
2. Disagree with anything that feels off — a design audit that the product owner doesn't push back on isn't actually useful.
3. Approve the top 3-5 moves and tell the session to begin Phase 2 starting with the highest-leverage surface first.
4. Let it work surface-by-surface. Don't accept "I did all 8 in one go."

**If Opus pushes to add new npm packages, new fonts, or new color tokens, refuse unless the justification is airtight.** The brand system works; the problem is in how it's applied, not in its primitives.
