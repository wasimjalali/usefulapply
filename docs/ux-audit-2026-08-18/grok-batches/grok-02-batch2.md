# Batch 2 of 3: job feed, CV surfaces and tracker (B11 to B19, B23, B30, B31)

Same ground rules and report format as the kickoff prompt. Full repro, evidence and cause for each bug are in `docs/ux-audit-2026-08-18/bugs.md`. Read the entry first. Anchors are starting points only. Batch 1 already changed `src/components/ui/CreditIndicator.tsx`, `ChatPanel.tsx`, `feed-card-actions.ts`, tracker status default, and `src/lib/job-feed/helpers.ts` dedupe. Read those files fresh; do not undo Batch 1 changes.

Order: B31, B30, B14, B13, B15, B16, B17, B18, B19, B23, B12, B11 (B11 last, it is intermittent and the most time-consuming).

---

## B31. Blocked feed action still marks the job "Application started" (P2, do first)

`src/components/job-feed/feed-card-actions.ts` (badge `'Application started'` at ~149, `'Continue in Useful Apply'` at ~90/139/152) and the click handlers in `src/components/job-feed/JobFeedPanel.tsx` / the card component. When the action is refused (no CV, insufficient credits, any pre-flight failure), nothing must be persisted: no `apply_started` feedback row (`src/lib/job-feed/server.ts:811-816` writes it), no session id, no generation id, no URL change. Find the exact order: the pre-flight check must run before the optimistic state and before the feedback write. Verify by tracing the no-CV path end to end and listing every write that used to happen and now does not.

## B30. Removing the CV leaves live Check Fit and Generate Kit buttons (P2)

Same files. When the user has no CV, the feed cards' Check Fit and Generate Kit buttons must be disabled (or swap to a single "Upload your CV" action that routes to Documents). Find how the panel already knows there is no CV (the banner text "Upload your CV and Useful Apply builds your daily feed automatically" proves that state exists). Reuse it. Keep the graceful toast for anything that still gets through. Verify by reading; describe the rendered state.

## B14. Job feed notification popover swallows clicks on the Cover Letter and Email tabs (P2)

`src/app/dashboard/page.tsx:~877` (`new roles for you today`). The popover must not overlap the Application Kit tab strip, or must not intercept pointer events outside its own box. Prefer positioning it so it does not cover the tabs; if that is not possible, `pointer-events-none` on the wrapper and `pointer-events-auto` on the popover body. Also make it dismiss on any click outside. Verify with `npm run dev` if you can render the dashboard signed out (probably not), otherwise code-level plus a precise description of the fix so the reviewer can check in the browser at 1441x902.

## B13. "Edit feed" has no exit once scrolled (P2)

`src/components/job-feed/JobFeedPanel.tsx` (grep "Edit feed"). Add a sticky close/back control that stays visible while the edit panel is scrolled (a sticky top bar with a "Back to feed" button is fine), and make clicking the Job Feed tab while the editor is open close the editor. Keep the existing × too. Verify by describing the DOM change and reading the tab-click handler.

## B15. Feed elapsed timer shows a carried-over value (P2)

`src/components/job-feed/SmartFeedProgressCard.tsx` and `JobFeedSetupBuildingCard.tsx` (both keep `elapsedSeconds` state). The timer must start from 0 for a new run. Find what start timestamp it counts from and why a second run on the same account reuses the previous run's start (likely a start time stored in a store/localStorage keyed by user rather than by run, or a component that never remounts). Fix at the source, not by clamping the display. Verify by explaining the exact stale source and how the new run resets it.

## B16. "Set up your daily feed" renders above a full feed of existing results (P2)

`src/components/job-feed/preview-utils.ts:118-138` and `JobFeedPanel.tsx:~1219-1242`. When `state === 'setup_required'` for a paid account, the panel must not render the previous run's cards underneath the setup prompt. Decide whether to hide the stale cards or to show them with a clear "Previous feed" header below the setup card; the minimal correct behaviour is to hide them. Verify by reading the render branch and stating what renders in `setup_required` now.

## B17. Completing feed setup lands on a stale feed instead of running one (P2)

Same panel plus the setup wizard submit path (`Build my feed`). After setup completes, either a fresh run must start, or if a run already happened today the panel must clearly say so and offer "Refresh now". Prefer starting a run when there is no run since the settings were saved. Trace where the "Building your AI feed" card hands off to the feed and why it picks up `latestRun` from before setup. Verify by describing the new flow.

## B18. Tracker header count contradicts the row count (P2)

`src/components/TrackerPanel.tsx` (`ALL_STATUSES` at ~52, tab counts around ~154, "jobs" line). Find why "18 ALL" and "10 jobs" disagree: probably one counts sessions/rows including duplicates or archived items and the other counts unique jobs. Make both numbers come from the same list. If Batch 1 added a new status for B4, make sure it is included in `ALL_STATUSES` and in the counts. Verify by stating the single source both now read from.

## B19. Duplicate tracker rows (P2)

Find where tracker rows are created (repo under `src/db/repos/`, likely `sessions.ts` or the job-feed apply path) and why the same job (same title, company, date, score) gets two rows. Likely two writers (chat generation and feed-card action) both create a row, or a retry creates a second one. Add an idempotency guard on the write path (look up existing row by user + job identity before insert). No schema change, no unique index migration; if a proper fix needs a unique index, do the application-level guard now and note the migration as a follow-up. Verify with a read-only D1 query showing existing duplicates so the reviewer can watch them stop growing:
`npx wrangler d1 execute usefulapply-db --remote --json --command "SELECT user_id, job_title, company, COUNT(*) n FROM <table> GROUP BY 1,2,3 HAVING n > 1 LIMIT 20"` (find the real table and column names first).

## B23. Feed card company name does not match the job description (P2)

`src/lib/job-feed/openai-ranking.ts` (ranking prompt ~99-126, output mapping ~389) and the ingestion normalisation. Aggregator data gives the wrong employer in `company` while the description names the real one. Repo rule: the LLM already reads the description, so let it fix this. Add to the ranking output a `company_display` (or reuse an existing field) that the model sets to the employer named in the description when it clearly differs from the source `company`, otherwise keep the source. Use it on the card. Keep the change small; do not rework the prompt. Verify by showing the prompt diff and where the card reads the value.

## B12. Template picker shows blank white cards for about eight seconds (P2)

`src/components/cv-templates/TemplateSelector.tsx` and `index.tsx`, `src/components/CVPanel.tsx`. Two problems: (a) previews render as empty white until something heavy finishes, (b) header says "6 Templates" but only two are reachable with no scroll affordance. For (a) find what the preview waits on (fonts, an image, a full CV render per card, an async import) and either render a lightweight placeholder/skeleton immediately or make the previews cheap. For (b) make all six reachable: horizontal scroll with visible arrows, or a wrapping grid. Verify by describing what paints at t=0 now and how the user reaches template 3 to 6.

## B11. English CV renders with German section headings, intermittent (P2, last)

`src/lib/cv-parser/section-splitter.ts` (language detection ~412-430, "counts language-specific header matches") and its caller `src/app/api/parse-cv/route.ts`. Also check the LLM parse route: `parse-cv` sends the PDF to Claude and gets a `StructuredCV`; find where the base render picks German headers ("Berufliches Profil", "Kernkompetenzen", "Sprachkenntnisse", "Berufserfahrung", "Heute"). The bug is intermittent, so the cause is likely one of: (1) a tie or near-tie in the header-count heuristic that flips on small differences, (2) the model returning a `language` field that is sometimes wrong and the code trusting it over the detector, (3) the detector running on text before/after a different extraction path. Find which. Prefer making the model's returned language authoritative only when the heuristic agrees or is inconclusive, or the other way round, and default to English when the CV body is clearly English (a simple stopword ratio on the body text is acceptable as a tiebreaker). Then run the parse against `~/Downloads/Alex_Morgan_CV.pdf` at least three times if you have a way to call the route or the function locally, and report the detected language each time. If you cannot execute it, say "code-level only, needs reviewer" and describe the exact decision logic so the reviewer can test with several uploads.

---

When done, produce the report in the kickoff format for all twelve bugs, then the Checks block (tsc, lint, git status) and Open questions.
