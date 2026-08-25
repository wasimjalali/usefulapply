# Task: upgrade the Useful Apply product reel to a broadcast-grade take

Repo root: `/Users/wasimjalali/Desktop/Useful_Apply`.

**Work in a new folder.** First copy `demo-reel/` to `demo-reel-kimi/` at the repo root, then do all
your work inside `demo-reel-kimi/`. The original `demo-reel/` stays untouched, byte for byte. Another
agent is working on a parallel copy at the same time, so do not write anywhere else.

Read `demo-reel/README.md` first, then `useful-apply-reel.html` (1678 lines, self-contained) and
`make-audio.py`.

The reel is a 96-second, 1920x1080 scripted screen-capture of the product, rebuilt as live HTML from
the real components and design tokens. It plays from a click, runs off a `requestAnimationFrame` cue
timeline, and is recorded with a screen recorder. It works today and is factually verified. Your job
is to make it look like a product film instead of a slideshow, without breaking any of that.

## Hard constraints

- One HTML file, no build step, no npm packages, no third-party animation library. CSS, the Web
  Animations API and plain JS only. `make-audio.py` stays Python stdlib.
- Write only inside `demo-reel-kimi/`. You may read `src/**` for accuracy work, never edit it.
- `seek(ms)` and `tipAt()` must keep working. They are the review tools and the whole verification
  protocol depends on them.
- The stage stays 1920x1080 at true desktop geometry (sidebar 224, conversation 751, canvas 945).
  Nothing gets scaled to fake a layout the app does not produce.
- Every on-screen string stays verbatim from the app, with the one deliberate exception below. No em
  dashes anywhere, on screen or in comments. Use commas, periods, parentheses or a plain hyphen.
- Timeline and audio stay in lockstep. See the audio contract below.

## Copy change, do this first

Two lines overclaim and get replaced. The new wording is a grounding statement, not a guarantee:

- Line ~927: `Your kit for Lumen Systems is ready. Tailored CV (ATS 91%), a cover letter and two
  emails. Nothing was invented.` becomes `... a cover letter and two emails. Grounded on your CV.`
- Line ~1213: `Answered from your CV, nothing invented. It's in the Answers tab.` becomes
  `Grounded on your CV. It's in the Answers tab.`

The app currently ships "Nothing was invented" in `src/components/chat/useAgentWorkflow.ts`. This
divergence is deliberate. Do not restore the app string during the accuracy pass, and do not edit the
app. Sweep the rest of the HTML for any other absolute claim of the same shape and report it rather
than rewriting it on your own.

## What to build

### 1. A camera

The reel has no camera today. Add one: push-in, pull-back, and slow drift on the beats that carry the
story. Suggested beats, tune them by eye:

- Cold open: a slow 1.04 to 1.00 settle so the first frame breathes.
- The fit result landing: push in on the score block, hold, pull back before the next cue.
- The CV rebuild: push in on the document as blocks fill in, then pull back to the full canvas.
- The tracker row landing: push in on the fresh row.
- Chapter cards: a small counter-move so the cut in and out of a card has direction.

Implementation notes that matter more than the exact beats:

- Put the camera on a new wrapper between `#stage` and `#app`. Animate `transform` only.
- `aimAt()` derives its scale factor as `stage.getBoundingClientRect().width / 1920`. A camera
  transform breaks that assumption and the cursor lands off-target. Map the cursor through the full
  composed transform instead. Acceptance test: all 8 click targets land 0 to 1px from centre in live
  playback, measured with `tipAt()`.
- The cursor does not scale with the camera. It stays constant size on screen.
- Camera state must be a pure function of the cues applied so far, so `seek(ms)` reproduces the exact
  framing of live playback at that ms. Suppress transitions during a seek, then restore them.
- Cap the zoom so a 1080p export downsampled from a 4K DPR-2 capture stays sharp. Roughly 1.6x is the
  ceiling. Text must never look resampled.

### 2. Motion inside the scenes

Scenes cross-fade in 500ms today and content mostly just appears. Replace that with directed motion:

- Transitions with intent: a push where the user moves forward, a settle where a result lands, a cut
  where a cut is honest. Not one transition reused 16 times.
- Staged entrances for lists, progress stages, cards and CV blocks, using the easing curves already in
  the token block (`--ease-out-quart`, `--ease-spring`).
- Progress bars and stage rows that animate their fill instead of snapping between renders.
- The typed screening question should read like typing, not like a ticker. Vary the cadence.

### 3. Performance

The take must hold 60fps for the whole runtime, because a dropped frame is visible in the export.

- Animate `transform` and `opacity` only. No animated `box-shadow`, `filter`, `width`, `height`,
  `top` or `left`.
- Several cues rewrite `innerHTML` on every progress step, which drops the subtree and forces layout.
  Patch the nodes that change instead.
- Use `will-change` only on elements currently animating, and remove it after.
- Keep the 250ms `keepAlive` backstop working, so a backgrounded window still plays out.
- "Faster" means smoother playback and tighter pacing, not a smaller file. Do not minify, and do not
  remove the inlined audio: it is what lets the page play with sound on its own.

### 4. Accuracy

`README.md` names what is verified and what is not. Two surfaces were built from source and never
checked against the live app: the Job Board feed cards and job detail, and the Tracker table.
Re-derive them from `src/components/job-feed/FeedJobCard.tsx`, `FeedJobDetail.tsx`, `FeedCanvas.tsx`
and `TrackerCanvas.tsx` and correct anything that drifted. Re-check credit costs against
`src/lib/supabase/credits.ts` (fit check 0.5, full kit 2.0). Report every correction.

### 5. Professional polish

- The wordmark font is pulled from Google Fonts, so the page needs a server and a network and the
  wordmark reflows if the load fails mid-take. Make it resilient: inline the font if you can get it,
  otherwise gate the reel on `document.fonts.ready` and give the wordmark a metric-matched fallback.
- Sharpen the pacing. Cut dead air, hold the beats that deserve a hold. Keep the four chapters and the
  16 scenes. Changing the running length is allowed if the reel is better for it.
- Anything else that reads as amateur to you: fix it and say what you fixed.

## Audio contract

`make-audio.py` generates the cue-aligned track inlined into the page. If you retime a beat, update
the matching entry in `CLICKS`, `PAPER`, `STAGE_TICKS` or `CARD_TICKS`, then:

    python3 make-audio.py
    ffmpeg -y -i reel-audio.wav -codec:a libmp3lame -b:a 96k reel-audio.mp3

and re-inline the base64 into the `#bed` audio element. If the running length changes, `DUR` in the
HTML (96000) and `DUR` in `make-audio.py` (96.0) both change, and the `1:36` labels with them.

## Verification, run it and paste the real output

Serve your folder on port 8791 (`python3 -m http.server 8791` from `demo-reel-kimi/`) and drive the
page. Screenshots lie here, the capture pipeline returns stale frames, so assert against the DOM:

1. 96 one-second samples via `seek()`: exactly one `.scene.on`, no empty scene, no horizontal overflow.
2. Content assertions across every chapter, at least the 26 the current pass runs.
3. All 8 click targets landing 0 to 1px from centre in live playback, via `tipAt()`.
4. One live end to end run reaching every scene in order.
5. Frame timing over a full live run: record rAF deltas and report the count of frames over 32ms.
   After the first 500ms that count should be zero.

A claim that something works is only worth reporting if a command in this session produced it.

## Report back

Write `demo-reel-kimi/RESULT.md` with:

- Files changed, and what changed in each.
- The new motion and camera beats as a timestamp list.
- Every accuracy correction, with the source file that settled it.
- The verification output, pasted, including the frame-time numbers.
- Anything you chose not to do, and why.

Plain sentences. No em dashes, no "it's important to note", no closing summary that repeats itself.

## Tooling available

python3, ffmpeg, Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and a
Playwright chromium cache under `~/Library/Caches/ms-playwright`. Verification tooling may use
whatever is already installed. The reel itself gains no dependencies.
