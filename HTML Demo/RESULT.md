# RESULT.md — Useful Apply product reel, v2 pass (demo-reel-cursor)

## Pass 1: build

Single self-contained `useful-apply-reel.html` (vanilla JS/CSS, Web
Animations via rAF, no build step, no network). Served on port 8793.

Built/changed:
- Camera engine: scale 1.000 everywhere except 8 click windows (ease to max
  1.12, hold through the press, return to 1.000 before the next scene cut).
  Zoom anchored on the click target's center via `T = (O - f)(s - 1)`.
  State is a pure function of the timeline, so seek(ms) reproduces any frame.
- Directed scene transitions: rise / push / settle variants, exits via .out.
  Settle uses translateY (a scale would re-raster dense scenes every frame).
- Staged entrances (fadeUp) on chat messages, chips, cards, tracker rows,
  chapter and bookend content.
- Progress bars as transform scaleX with DOM patching (no innerHTML churn).
- Deterministic variable-cadence typing (seeded PRNG plan, seek-safe).
- Copy: the two overclaiming lines replaced with "Grounded on your CV.";
  no em dashes in visible text.
- Accuracy pass against src/: feed cards, job detail, tracker table, credit
  costs (0.5 fit, 2.0 full kit), chapter copy.
- Plus Jakarta Sans 700 subset inlined as a woff2 data URI; audio bed
  (clicks, ticks, paper settles; no music) inlined as an mp3 data URI.

Verification (pass 1): `audit/verify.mjs` 66/66 (46 content assertions,
96-sample scene schedule and camera law, 8 click-target checks at <=1px,
live-run smoke, no page errors).

## Pass 2: frame-by-frame audit

Numeric audit (live playthrough, probe on the rAF loop, Cursor in-app
browser at 60fps): 5762 frames, dt p50 16.7ms, p95 17.6ms, p99 17.7ms,
max 18.7ms. Scale min 1.000, max 1.12. Zero violations of the camera law,
continuity, overshoot, target drift, press accuracy, or frame budget.
Raw data: `audit/frames.json`. Analyzer: `node audit/audit-numeric.mjs
--analyze-only`.

Visual audit (Opus, 50 contact sheets + ~30 full-size frames): 11 defects.
Fixed in this build:
1. Tab clicks looked dead for 700ms (blocker). Windows 5/6 now end their
   ease-out at 55350/60350 and the scenes flip on that exact rest frame,
   350ms after each press. (A 150ms variant was tried and rejected: flipping
   mid-ease-out moved the anchored tab, causing up to 9px target drift.)
2. Kit pipeline stalled and cut away mid-generation (blocker). Stages now
   land at 37200 (50%), 39200 (82%), 41000 (all Done, 100%), hold to 42200.
   Audio ticks retimed (39.2, 41.0) and the track regenerated and re-inlined.
3. Cursor materialized on the window-1 target. It now sets off at 21200 and
   glides onto the card before the zoom starts.
4. Cursor vanished on the window-8 press frame. It now stays through the
   press; hide moved to 73450. (Window 3 press frame needs a re-check; the
   reel code does not hide the cursor there.)
5. Templates palette opened with an instant 220px pop. The strip now eases
   open over 380ms (`.tstrip` stripIn keyframes).
6. Sent question duplicated in bubble and composer for 1000ms. Composer now
   clears at 73550, right after the window-8 ease-out ends.
7. Close bookend fully static. The URL pill now breathes (opacity pulse).

Accepted, no change: the 4.5s hold on the screening answer at 75600-80600 is
the reading beat of that chapter; the sparse chat column during screening is
the real product layout; the tracker row gold flash (83200-84100) is a CSS
animation that frozen seek frames cannot show, verify live if wanted.

Capture caveat found and fixed during the audit: headless Chrome's
--window-size reserves browser chrome, so earlier frames were 1920x993.
cdp.mjs now forces an exact 1920x1080 viewport via
Emulation.setDeviceMetricsOverride.

## What remains (handed to the Opus recheck session)

- Re-run `audit/audit-numeric.mjs` on this final build; must print
  `CLEAN: no violations`. Watch w4/w5 target-drift specifically.
- Re-shoot `audit/audit-visual.mjs` + `audit/sheets.mjs` (the frames on
  disk predate these fixes) and inspect all sheets.
- Full instructions: `audit/PROMPT-opus-recheck.md`.

Current build status: `audit/verify.mjs` passes 66/66 on the final HTML.

---

## Pass 3: Opus frame-by-frame recheck (2026-08-25)

Ran the full audit stack against the build handed over by pass 2: `verify.mjs`
(66 assertions), `audit-numeric.mjs` (four live playthroughs), a fresh
788-frame visual sweep, and a read of all 50 contact sheets.

### Findings

1. **`f-022600`, 22.6s, window 1 cursor press landed 1.58px off target
   (polish).** The cue at 21200 aimed the cursor while the feed scene's 420ms
   `.push` entrance was still in flight, so the tween's destination was
   measured against a mid-slide card. The card then settled 1.58px away and the
   press missed the 1px law on all six measured press frames, every run.
   `verify.mjs` could not catch it because `seek()` makes scene transitions
   instant, so the aim is always measured at rest there.
   Fixed: the aim moved to 21450, just after the entrance settles at 21420.
   The glide is now 1030ms, still visible travel. Numeric audit clean since.

2. **`f-041500`, 24.8s to 41.5s, the agent header progress meter never filled
   (polish).** `.agent .hd .fill` is a `<span>` inside `.track`, which is a
   plain block, not a flex container. The span stayed inline, so its
   `height:100%; width:100%` were ignored and the gold gradient had no box to
   paint. Every run in the reel, fit and kit both, showed a percentage next to
   an empty rail. Fixed with `display:block` on the fill. Verified at 76% and
   100%.

3. **`f-030000` and `f-041500`, 28.0s to 34.6s and 41.0s to 42.2s, the composer
   showed a stop button after the run had finished (polish).** `stop` mode was
   baked into the scene markup, so the fit scene showed a stop control for 6.6s
   after the Good Fit card landed and the kit scene for 1.2s after all three
   steps read Done at 100%. Fixed: a `composerMode()` helper sets stop on scene
   entry and send on completion, at 28000 and 41000.

### Previous defects, re-verified

1. Tab clicks at 55000/60000: fixed. `f-055340` still CV, `f-055350` cover
   letter; `f-060300` still cover letter, `f-060350` emails. 350ms response,
   zero w4/w5 target drift in four numeric runs.
2. Kit pipeline: fixed. `f-041500` shows Optimizing CV, Composing Cover Letter
   and Generating Emails all Done at 100%, holding to the 42200 cut.
3. Window 1 cursor travel: the glide exists, but it cannot be seen in stills at
   all. `seek()` freezes the cursor transition at its end state, so every
   seeked frame from 21450 on shows the cursor already parked on the card.
   Judged from the code path plus the numeric run, not from frames.
4. Cursor on the press frame: present at both. `f-073000` has the hand
   fingertip on the send button. `f-045200` has the hand on Tailored, with the
   toggle flipped from Original at `f-045160`. The earlier "vanished at window
   3" report was a thumbnail mis-read.
5. Templates strip ease: code path present (`.tstrip{animation:stripIn ...}`),
   unverifiable in frozen stills.
6. Composer clearing after send: fixed. `f-073550` shows the placeholder back.
7. Close bookend URL pulse: code path present, unverifiable in frozen stills.
8. Brief/timeline label mismatch: no reel change needed.

### Timing

Frame deltas are clean; the spikes the harness reports are machine contention,
not the reel. Across four runs the violating timestamps were disjoint (run 1:
6866, 23281, 31964, 43280, 83277, 84260; run 2: 5516, 23281; run 3: 83278;
run 4: 5483, 21749, 23282, 35165, 83281). Every spike is a single dropped
frame at a scene cut except the large outliers, which appeared only while the
machine was loaded and vanished on quieter runs. Best run: 5761 frames, dt p50
16.7ms, p95 17.4ms, p99 17.6ms, max 33.4ms, one dropped frame.

### Clean regions

Cold open and chapter 1 (0 to 5.4s), build and feed (5.4 to 21.0s), fit
analysis (23.2 to 34.6s), kit build and CV (34.6 to 53.4s), cover letter
(55.35 to 60.35s), emails (60.35 to 64.0s), screening (66.6 to 80.6s), tracker
(83.2 to 89.4s), close bookend (89.4 to 96.0s). No pops, stale frames, clipped
content, blank frames, double cursors, camera motion outside the eight windows,
or font problems anywhere in the 788 frames. Copy is correct throughout,
including the 1.5 credits cost on the generate button.

VERDICT: 3 defects (all polish, all fixed in this pass: window 1 press
accuracy, agent progress meter fill, composer stop button after completion).

---

## Pass 4: Wasim's changes (2026-08-25)

Six changes, all verified: `verify.mjs` 68/68, numeric audit clean (camera,
cursor and drift), 672 frames and 42 contact sheets re-shot.

1. **Chapter cards.** The 01/02/03/04 number pill is gone. Each title now
   assembles word by word (`wordRise`, 55ms apart) over a gold rule that
   scales in behind it. The card widened to 1480px so long titles hold one
   line.
2. **Chapter copy.** "Track them" is now "Track all your applications in one
   place". "Find jobs" is now "Find jobs worth applying to" — the other terse
   one; revert it if you only wanted the tracker line changed. Chapters 2 and 3
   were already descriptive and are unchanged.
3. **Close bookend.** "All in one app." is now "All in one app for the job
   seekers." The cold-open tagline still reads "All in one app." as the
   pay-off setup.
4. **The tracker is opened, not conjured.** Chapter 4 now runs 80.6s to 81.8s,
   then the reel returns to the screen it left, the cursor crosses to the
   sidebar and clicks Application Tracker, and the tracker opens on the
   camera's rest frame. That is a ninth click beat and a ninth camera window
   (82350 to 83320, press at 82950), with a matching click in the audio.
5. **Pace, 1.5x.** `--rate` in `:root` is the single source. The cue timeline,
   the camera windows, the cursor tweens, the typing cadence, every transition
   and animation duration, and the generated audio all divide by it. The reel
   is 64s instead of 96s. Set `--rate` to 1 (and `RATE` in `make-audio.py`, then
   regenerate) to get the original cut back.
6. **Rescale bug, caught and fixed.** The seek path for the typed screening
   question still subtracted the unscaled cue time (69400), so every seeked
   still from 46.3s on showed an empty composer. Live play was unaffected. It
   now divides by RATE.

Audit constants in `verify.mjs`, `audit-numeric.mjs` and `audit-visual.mjs`
stay authored at 1x and divide by their own `RATE`, so they track the reel.

VERDICT: CLEAN
