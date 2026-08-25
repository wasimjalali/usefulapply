# Visual Audit Brief — Useful Apply product reel (demo-reel-cursor)

You are the visual auditor for a 96-second product reel. The numeric audit is
already done and CLEAN. Your job is the visual layer: inspect every captured
frame and report defects. You did not build the reel; everything you need is
in this brief and the files it points to.

## What the reel is

`/Users/wasimjalali/Desktop/Useful_Apply/demo-reel-cursor/useful-apply-reel.html`
is a single self-contained HTML file (no build, vanilla JS/CSS) that plays a
scripted 1920x1080 product demo of "Useful Apply", a job-application copilot.
A virtual cursor moves, clicks, types; scenes cross-fade; a camera zooms
(max 1.12x, anchored on click targets) only during 8 click windows. An audio
bed plays in live mode (irrelevant to stills).

## What was built this session (A to Z)

- Camera engine v2: `scale 1.000` everywhere except 8 click windows
  (ease to max 1.12, hold, return before next scene), anchored so the click
  target's on-screen center does not move. No drift, no chapter-card
  counter-moves, no cold-open settle.
- Directed scene transitions: `.rise` (bookends, chapter cards), `.push`
  (forward moves), `.settle` (translateY dip on dense scenes: CV page,
  tracker table).
- Staged entrances: `fadeUp` keyframes staggered on chat messages, chips,
  cards, tracker rows, chapter/bookend content.
- Animated progress: bars via `transform: scaleX`, DOM patching (no innerHTML
  rewrites) for the named-stage and agent-progress bars.
- Deterministic variable-cadence typing (seeded PRNG, seek-safe).
- Accuracy pass: feed cards, job detail, tracker table, credit costs,
  copy lines re-derived from the app's real source components.
- Fonts inlined (Plus Jakarta Sans woff2 as data URI), audio inlined as mp3
  data URI. No network needed beyond the local server.
- Copy contract: two overclaiming lines replaced ("Grounded on your CV."),
  no em dashes anywhere in visible text.

## Numeric audit (already CLEAN, do not redo)

Full live playthrough in Cursor's in-app browser, probe on the rAF loop:
5762 frames, dt p50 16.7ms p95 17.6ms p99 17.7ms max 18.7ms, scale min 1.000
max 1.12, zero violations of: scale outside window, scale > 1.12, scale/translate
discontinuity, easing overshoot, target drift > 2px, cursor tip > 1px off at
press, frame delta > 32ms. Raw data: `audit/frames.json`, analysis:
`audit/violations.json` (empty array), analyzer: `audit/audit-numeric.mjs
--analyze-only`.

## Your materials

- `audit/frames/` — 796 PNGs, `f-<ms>.png` (zero-padded timeline ms).
  Sampled: every 40ms within +/-300ms of each click window, every 100ms
  across each scene transition (-300ms to +600ms), every 500ms elsewhere.
  Each frame was captured by `seek(ms)` + settle, so it shows the exact
  deterministic state of that instant (entrances applied, camera applied).
- `audit/sheets/sheet-00.png` .. `sheet-49.png` — contact sheets, 16 frames
  each in timeline order, 4 per row, each labeled with its ms. Read these
  first, all 50, in order.
- If a thumbnail is ambiguous, Read the full-size frame from `audit/frames/`.
  Do that freely for click presses and cuts.

## Timeline map (scene cuts)

| ms | scene | what |
|---|---|---|
| 0 | s-cold | cold open bookend: "Find jobs, write tailored applications," |
| 2800 | s-ch1 | chapter card "01 Your feed, already built" |
| 5400 | s-build | chat + pipeline stages build the feed; JD typing in panel |
| 11600 | s-feed | job board feed, 15 cards, 3 strong matches |
| 18400 | s-ch2 | chapter card "02 One job, one kit" |
| 21000 | s-feed | feed again, cursor to first card (Lumen Systems) |
| 23200 | s-fit | job detail drawer + fit panel (Good Fit 82) |
| 34600 | s-kit | kit generation pipeline, then kit workspace |
| 42200 | s-cv | tailored CV view, ATS 91%, "see every change" |
| 53400 | s-cv | diff view (green/red segments) |
| 55700 | s-cover | cover letter tab |
| 60700 | s-email | email tab: application email + follow-up |
| 64000 | s-ch3 | chapter card "03 Screening questions" |
| 66600 | s-screen | screening Q&A, typed answers, generate-more, save |
| 80600 | s-ch4 | chapter card "04 Everything tracked" |
| 83200 | s-tracker | tracker table, 6 rows, fresh Lumen row flashes gold |
| 89400 | s-close | close bookend: usefulapply.com CTA |

## The 8 click windows (ease-in, press, hold, ease-out)

| # | window ms | press at | target |
|---|---|---|---|
| 1 | 21600-23150 | 22600 | first feed card (Lumen Systems) |
| 2 | 31800-33900 | 33000 | "Generate the full kit" button |
| 3 | 44100-46100 | 45200 | "see every change" chip |
| 4 | 47800-49900 | 49000 | CV template palette swatch |
| 5 | 53800-55650 | 55000 | "Cover letter" tab |
| 6 | 58800-60650 | 60000 | "Email" tab |
| 7 | 67000-69200 | 68300 | "Generate 2 more answers" button |
| 8 | 71850-73500 | 73000 | "Save 4 answers" button |

During each window the camera zooms toward the target (max 1.12x) and the
cursor hand must be exactly on the target at the press frame. Outside these
windows the camera must be at rest (no visible zoom/pan at all).

## What to look for (the defect list)

1. Pops: content that jumps position/size between adjacent frames without an
   animation cue (a cut is fine; a mid-scene teleport is not).
2. Text softening: blurry/ghosted text that persists after a transition has
   settled (transient motion softness during a .5s transition is expected).
3. Sliding elements: anything drifting that should be static (the camera is
   at scale 1.000 outside windows, so NOTHING may move between two frames of
   a static hold).
4. Clipped elements: text or cards cut off by panel edges, the caption bar,
   or the viewport when they should be fully visible.
5. Stale frames: a frame showing the previous scene's content after a cut
   has completed, or repeated frames where motion should be happening
   (typing, progress bars).
6. Blank/empty frames: missing scene, empty stage, unstyled flash.
7. Camera violations visible in pixels: zoom outside click windows, target
   drifting during a zoom, scene content sliding during the zoom.
8. Cursor: hand glyph at targets during windows; arrow elsewhere when
   visible; never two cursors; never a cursor frozen mid-screen during a cut.
9. Overlap/legibility: caption bar covering critical content; chat bubbles
   overlapping panels; toast overlapping the button it confirms.
10. Font/rendering: wrong font ( serif fallback instead of the wordmark font
    on bookends), missing glyphs (tofu boxes), broken emoji/accents.

Known-acceptable by design: the `.seeking` capture freezes CSS animations,
so mid-transition frames show the settled end state rather than a half-faded
cross. Judge each frame as the state at its timestamp, not as a movie frame.

## Report format

Return a numbered list of defects. For each: frame filename(s) or sheet +
position, timestamp, one-sentence description, severity (blocker / polish /
nit). If a region is clean, say so in one line (e.g. "windows 1-4 clean").
End with: `VERDICT: CLEAN` or `VERDICT: N defects (B blockers, P polish, N
nits)`. Do not fix anything. Do not edit files. Plain sentences, no em dashes.
