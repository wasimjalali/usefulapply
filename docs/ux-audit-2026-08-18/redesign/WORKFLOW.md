# The UX redesign workflow, end to end

**Purpose:** the record of how this redesign was run, from the first screenshot to the last locked flow, written so it can be turned into a reusable skill once the build is done. Steps 1 and 2 are complete; step 3 is next.

---

## Step 0. Preconditions

- A product that is live (staging is enough) with real accounts to drive.
- A design system the mockups can be built from (`.claude/rules/design-system.md`: tokens, type, radius, CTA, shadow rules) and the real component source to lift exact values from.
- One decision-maker (Wasim) available to pick between options at each gate.

## Step 1. The audit (done 18 August 2026)

1. **Capture every state** of every flow end to end as screenshots, at one fixed viewport (1441x902 here), with a fixed test CV and job ad, for each tier (anonymous, free, paid). Name folders by flow and number the screens in order. (108 screenshots, folders `00` to `16` and `99-misc`.)
2. Write **`flow-map.md`**: the journey as it actually behaves, with click counts, timings and decision points per flow. End with "what the shape tells you".
3. Write **`friction-log.md`**: every point that cost thought, time, trust or money, rated Critical / High / Medium / Low by effect on activation, each with evidence and a one-line fix. End with the patterns behind the list and "if you change one thing".
4. Write **`bugs.md`**: every defect, P0 to P3, with repro, evidence and confirmed cause (read the code to confirm, don't guess).
5. Write **`HANDOFF.md`** for the bug-fix session: mission in order, the one bug that matters most, grouping, environment facts, repo rules, definition of done. Explicitly forbid starting UX work in that session.
6. **Fix the bugs first** (separate session, branch, verify each against its repro, code review, PR, merge, deploy, confirm live). Only then open the UX conversation.

Why this order: friction items are impossible to judge while the product is lying to the user (wrong balances, phantom state). About 25 of the 34 friction items were closed as bugs before any design started, which left a short, honest list for the redesign.

## Step 2. The redesign (done 19 August 2026)

### 2a. Philosophy first, in writing
- Ask the decision-maker what inspires them; research it (here: Cursor's design team and the Grok Bot launch, what users praised in the first week). Capture quotes, not paraphrase.
- Write **`design-philosophy.md`**: the inspiration, the one-line thesis, the rules every flow must pass (12 here), the flow order. This is the contract every later session reads first, so consistency doesn't depend on memory.

### 2b. Decompose into flows, most impactful first
- One flow = one surface a user lives in: first run, kit, feed, tracker, settings, auth, marketing. The shell is decided inside flow 1 and inherited.
- Agree the sequence (design all flows first, then build) before starting.

### 2c. Per flow, the same loop
1. **Context:** re-read the flow's screenshot folder and its open friction items. Read the real components for anything the mockup must match.
2. **Brainstorm** (superpowers `brainstorming` skill): classify, then ask only the two or three decisions that genuinely change the layout. Offer a recommendation first in every question. Batch independent questions.
3. **Show, don't tell:** when the decision-maker wants to see options, draw variants on a **Claude Design canvas** (`/design` skill): one artboard per variant at 1440x900, a sticky note per variant with its case and its tradeoff, a note per canvas with the common ground. Never a rigged vote: make the case for every option.
4. **Decide:** the decision-maker picks per decision and usually adds one or two concrete tweaks. Apply them. If a reference screenshot arrives, adapt that layout rather than defend the draft.
5. **Lock:** build the final artboards for the flow (every key moment, including working states and the short-on-credits or free-tier state), republish the canvas at the same URL (variants stay in version history), render PNGs into the repo, write **`flow-N-<name>.md`** (canvas link, PNG path, sources, the decision, screen-by-screen, notes for the spec and build, out of scope), update `design-philosophy.md` and the README, commit and push.
6. **Propagate shell changes back.** When a later flow changes a shell rule (gold-only buttons in flow 2, the settings modal in flow 5), update the earlier flows' sources, re-render their PNGs and republish their canvases so every canvas matches.

### 2d. Tooling that made it cheap
- `flow-1-artboards/lib.mjs`: design tokens, icons, header, CV document, stage checklist, progress bar, the `.dc.html` wrapper. Built once from the real CSS and components.
- `flow-1-artboards/final/spine.mjs`: the app shell (sidebar, conversation, composer, kit canvas). `settings.mjs`: the settings modal. Every flow imports these, so a shell change is one edit.
- Per flow `genN.mjs`: composes artboards from the partials; `node genN.mjs` writes the `.dc.html` files. Variant generators export their partials so the locked generator can reuse them.
- The `/design` skill's `seed-canvas.mjs` seeds a canvas from the `.dc.html` files plus a `canvas.json` (layout, titles, sticky notes); the Artifact tool publishes it; passing the existing URL republishes in place.
- `shoot.mjs`: renders every `.dc.html` in a folder to PNG with Playwright, so the repo carries the visuals, not only the links.
- Preview loop: a tiny local static server plus a screenshot to catch overflow and wrapping before publishing. Most fixes were width arithmetic (toolbars, tables, cards) and one import bug.

### 2e. What to watch for
- Mockup widths: the canvas column is about 645 px beside a 520 px conversation; toolbars, tables and cards overflow easily. Stack rows or drop the least useful column rather than shrinking text.
- Keep the copy real: actual names, numbers and job ads from the test data, no lorem, no filler rows.
- Rules are checked on every artboard: one primary action, price on the control, named stages, no blank canvas, say it once, no em dashes.

## Step 3. The build (next)

Per flow, in order 1 to 6 (7 after it's designed): spec from the flow doc → implementation plan (`writing-plans`) → feature branch → implement → `ui-tester` against the PNGs → `/code-review` → PR → merge → deploy → confirm live. Flow 1 first, because it's the shell.

## Artifacts of this track

```
docs/ux-audit-2026-08-18/
  README.md, HANDOFF.md (audit), flow-map.md, friction-log.md, bugs.md, job-description.md
  design-philosophy.md
  00-16, 99-misc/              screenshots
  redesign/
    HANDOFF.md                 this track's handoff
    WORKFLOW.md                this file
    flow-1-first-run.md ... flow-6-auth.md
    flow-N-artboards/          genN.mjs, canvas.json, png/, (flow 1 also lib.mjs, final/spine.mjs, final/settings.mjs, final/gen2.mjs)
    shoot.mjs
```
