# Task: frame-by-frame audit of the Useful Apply product reel (final pass)

You are auditing a 96-second scripted product reel: a single self-contained
HTML file at `/Users/wasimjalali/Desktop/Useful_Apply/demo-reel-cursor/useful-apply-reel.html`
(vanilla JS/CSS, no build). Everything is deterministic and seekable; the
audit tooling already exists. Your job: run the full audit stack, inspect
every captured frame, confirm a list of previously found defects is fixed,
and report CLEAN or a numbered defect list. Fix nothing yourself unless a fix
is trivial and you are certain; otherwise report.

## State of play (what is already done, what is left)

Done on this exact build: `node audit/verify.mjs` passes 66/66 (copy
assertions, scene schedule, camera law at 1s resolution, click accuracy).
All listed defect fixes are applied in the HTML and the audio track was
regenerated and re-inlined (stage ticks moved to 39.2s and 41.0s).

Left for you, in order:
1. `node audit/audit-numeric.mjs` — the numeric audit has NOT yet been run
   on this final build. It must end with `CLEAN: no violations`. Pay
   specific attention to w4/w5 target-drift (the reason for the 55350/60350
   flip timing). If only isolated frame-delta violations appear, re-run once
   on a quiet machine before treating them as real.
2. `node audit/audit-visual.mjs && node audit/sheets.mjs` — re-shoot all
   frames and contact sheets (the ones on disk are from the previous build).
   Sanity: `md5 -q audit/frames/*.png | sort -u | wc -l` must be in the
   hundreds.
3. Visual inspection of all sheets per the protocol below.
4. Append the report to RESULT.md.

## Setup

```bash
cd /Users/wasimjalali/Desktop/Useful_Apply/demo-reel-cursor
python3 -m http.server 8793   # serve the folder; leave running
```

The page is `http://localhost:8793/useful-apply-reel.html`. Query flags:
`?rec` recording mode (gate overlay, click to play), `?audit` enables the
rAF probe that records every frame into `window.__audit`. The page exposes
`window.seek(ms)` (deterministic state at any timeline ms, animations frozen
at their end state) and `window.tipAt()` (cursor tip in stage coordinates).

## Audit scripts (already built, in demo-reel-cursor/audit/)

- `cdp.mjs` — dependency-free headless Chrome driver (Node 22 built-in
  WebSocket). `launch({width,height})` forces an exact viewport via
  Emulation.setDeviceMetricsOverride, so screenshots are true 1920x1080.
- `verify.mjs` — 66 assertions: verbatim copy strings, absent strings, no em
  dashes, element counts, scene schedule at 1s resolution via seek(), camera
  scale law, click-target accuracy (cursor tip within 1px of target center at
  each press), 6s live-run smoke. Run: `node audit/verify.mjs`. Expect
  `TOTAL: 66 pass, 0 fail`.
- `audit-numeric.mjs` — full live playthrough with the probe, writes
  `frames.json` (~5760 rows), then flags: scale outside [1,1.12] or != 1
  outside click windows, scale/translate discontinuities between frames,
  easing overshoot, click-target drift > 2px during a zoom, cursor tip > 1px
  off target at a press, frame delta > 32ms (after the first 500ms).
  Run: `node audit/audit-numeric.mjs` (headless live playthrough, ~100s).
  If the ONLY violations are isolated frame-delta spikes, re-run once on a
  quiet machine before treating them as real; the reference clean run had
  dt p50 16.7ms p95 17.6ms p99 17.7ms max 18.7ms. `--analyze-only` re-runs
  the analysis on the existing frames.json.
- `audit-visual.mjs` — seeks and screenshots ~796 frames into
  `audit/frames/f-<ms>.png`: every 40ms within +/-300ms of the 8 click
  windows, every 100ms across the 16 scene cuts, every 500ms elsewhere.
  The gate overlay is hidden by the script; seek() drives the reel.
- `sheets.mjs` — builds `audit/frames/index.json` and renders 16-frame
  contact sheets to `audit/sheets/sheet-NN.png` via `sheets.html`.
  Run order: `node audit/audit-visual.mjs && node audit/sheets.mjs`.
  Sanity check first: `md5 -q audit/frames/*.png | sort -u | wc -l` must be
  in the hundreds (all-identical frames means the gate overlay leaked in;
  do not proceed).

## The camera law (what the numeric audit proves)

Scale is exactly 1.000 everywhere except 8 click windows, where it eases to
at most 1.12, holds through the press, and returns to 1.000 before the next
scene cut. Zoom is anchored on the click target's center (target may not
drift more than 2px). No other camera motion exists.

Click windows (ms): [21600-23150] press 22600 first feed card;
[31800-33900] press 33000 "Generate the full kit"; [44100-46100] press 45200
Original/Tailored toggle; [47800-49900] press 49000 Templates tool;
[53800-55350] press 55000 Cover letter tab; [58800-60350] press 60000 Emails
tab; [67000-69200] press 68300 "Answer screening questions";
[71850-73500] press 73000 composer send.

Scene cuts (ms): 0 cold open, 2800 ch1, 5400 build, 11600 feed, 18400 ch2,
21000 feed, 23200 fit, 34600 kit, 42200 CV, 53400 CV (returns from tools),
55350 cover letter, 60350 email, 64000 ch3, 66600 screening, 80600 ch4,
83200 tracker, 89400 close.

## Defects found in the previous pass (fixed in this build — verify each)

1. BLOCKER: tab clicks at 55000/60000 showed no response for 700ms (scene
   flipped at 55700/60700). Fix: camera windows 5/6 now end their ease-out at
   55350/60350 and the scenes flip at that exact rest frame, 350ms after each
   press (an earlier 150ms variant was tried and rejected: flipping
   mid-ease-out moved the anchored tab and produced target drift up to 9px).
   Verify: f-055000 shows the press on the CV tab; f-055400 onward shows the
   cover letter view; numeric audit must show zero w4/w5 target-drift.
2. BLOCKER: kit pipeline stalled (50% for 1.5s, 82% for 2.6s, cut away
   mid-generation at 42200). Fix: stages now land at 37200 (50%),
   39200 (82%), 41000 (all three Done, 100%), holding to the 42200 cut.
   Verify: f-041100..f-042100 shows three Done rows and a full bar.
3. POLISH: cursor materialized on the window-1 target with no travel.
   Fix: cursor sets off at 21200 and glides to the card. Verify:
   f-021200..f-021600 show the cursor visibly approaching, not appearing.
4. POLISH: cursor vanished on the press frame at windows 3 and 8.
   Fix: window 8 keeps the hand through the press (hide moved to 73450).
   Verify: f-073000 has the hand on the send button. For window 3, check
   f-045200: if the hand is genuinely absent, report it (the reel code does
   not hide it there; it may have been a mis-read thumbnail).
5. POLISH: Templates palette opened with an instant 220px layout pop.
   Fix: the strip now eases open over 380ms. Note: seek() freezes CSS
   animations at their end state, so stills cannot show the ease; verify in
   a live playthrough (open the page visibly, click to play, watch 49.0s)
   or accept the code path (`.tstrip{animation:stripIn ...}`).
6. POLISH: sent question duplicated (bubble + composer still filled) for
   1000ms. Fix: composer now clears at 73550. Verify: f-073600 shows the
   composer empty.
7. NIT: close bookend fully static for 6.6s. Fix: the URL pill now breathes
   (opacity pulse). Same frozen-stills caveat as #5.
8. NIT: brief/timeline labels mismatched (chapter titles, target names).
   No reel change; the corrected cut/target list above is authoritative.

Known capture caveat: CSS animations freeze at end state in seeked stills,
so mid-flight fades/slides are judged by their endpoints. The tracker row
gold flash at 83200 (landrow animation) cannot be verified in stills; check
it live if you want, it is cosmetic.

## Visual inspection protocol

Read all ~50 contact sheets in order. Where anything is ambiguous, Read the
full-size frame. Look for: pops, persistent text softening, sliding elements
during static holds, clipped content, stale frames (previous scene after a
cut completes), blank/unstyled frames, camera motion outside the 8 windows,
cursor errors (two cursors, frozen cursor through a cut, off-target press),
overlap/legibility problems, font problems (serif fallback, tofu, broken
accents). Byte-compare adjacent frames (md5) before claiming "frozen".

## Report

Numbered defects with frame filename, timestamp, one-sentence description,
severity (blocker/polish/nit). One line per clean region. End with
`VERDICT: CLEAN` or `VERDICT: N defects (...)`. Plain sentences, no em
dashes. Append the report to
`/Users/wasimjalali/Desktop/Useful_Apply/demo-reel-cursor/RESULT.md`.
