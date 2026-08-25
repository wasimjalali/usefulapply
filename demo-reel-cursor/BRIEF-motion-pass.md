# Motion pass: Useful Apply product reel

You are improving the animation and motion of a finished 64-second product
reel, then rendering it to MP4. The reel is correct and audited; what it lacks
is craft in how things move. Treat this as a motion design pass, not a rebuild.

## The file

`/Users/wasimjalali/Desktop/Useful_Apply/demo-reel-cursor/useful-apply-reel.html`

One self-contained HTML file, ~1.15MB. Vanilla JS and CSS, no build step, no
framework. The font and the audio track are inlined as base64. It renders a
fake but pixel-accurate Useful Apply app at a true 1920x1080 and plays a
scripted 64-second walkthrough of it.

Serve it and open it:

```bash
cd /Users/wasimjalali/Desktop/Useful_Apply/demo-reel-cursor
python3 -m http.server 8793
# http://localhost:8793/useful-apply-reel.html?rec
```

`?rec` shows a click-to-play gate. `?audit` adds a per-frame probe on
`window.__audit`.

## How it works

- **Timeline.** A flat `CUES` array of `{ t, fn }`, fired from one rAF loop
  against `performance.now()`, with a 250ms `setInterval` backstop so a
  backgrounded tab still plays out. `at(t, fn)` registers a cue.
- **Pace.** `--rate` on `:root` is the single source of truth, currently
  `1.5`. Every cue time, camera window, cursor tween, the typing cadence and
  every CSS transition and animation duration divides by it. The authored
  constants in the source are all 1x (96s); the reel plays at 64s. Set
  `--rate` to 1 to see the original pace.
- **Seeking.** `window.seek(ms)` puts the reel in a deterministic state at any
  timestamp. It stamps `.seeking` on `<html>`, which is
  `transition:none!important; animation:none!important`. That means **a seeked
  still shows every element at its base CSS state**. Any animation you add must
  have its resting CSS equal to its final state, with the keyframes supplying
  only the entrance. Break that rule and seeked frames render wrong.
- **Camera.** A transform wrapper (`#cam`) between `#stage` and `#app`. Scale
  is exactly 1.000 everywhere except inside 9 click windows, where it eases to
  at most 1.12, holds through the press, and returns to 1.000 before the next
  cut. Zoom is anchored on the click target's centre so the target stays put.
- **Cursor.** `reach(sel, moveAt, clickAt)` measures the real element, moves
  the cursor tip to its centre with a CSS transform transition, and presses.
  `window.tipAt()` reports the tip in stage coordinates.
- **Audio.** `make-audio.py` (stdlib only) generates `reel-audio.wav` from cue
  lists that mirror the HTML timeline, including `RATE = 1.5` which must match
  `--rate`. If you move a click or a cut, update the lists, re-run it, encode
  to mp3 and re-inline the base64 into the `<audio id="bed">` tag.

## What to improve

The reel is accurate and the pacing is right. The motion is functional and
uniform, and that is the problem. Specific weaknesses:

1. **The camera does exactly one thing, nine times.** Every click beat is the
   same 1.0 to 1.12 quartic ease. There is no variation in weight between a
   small tab click and the moment the whole kit is generated. Consider varying
   depth and duration by the significance of the beat, within the law below.
2. **All 17 scene cuts feel the same.** A crossfade plus a small translate,
   with three variants (`.rise`, `.push`, `.settle`) that read almost
   identically at speed. Chapter cards, entering a document, and returning to a
   screen you already saw should not transition the same way.
3. **Content lands instead of arriving.** Progress steps flip to Done, tags
   appear, the CV rebuilds block by block with a plain fade. The tracker rows,
   the fit card, the templates strip and the kit pipeline could all carry more
   considered motion.
4. **The cursor is mechanical.** Straight-line travel on `ease-out-quart`. Real
   pointer motion arcs slightly and settles rather than arriving dead-on. Any
   change here must keep the tip within 1px of the target centre at the press.
5. **Dead holds.** The tracker sits still for about 4 seconds and the close
   bookend for about 4.4. Both need a reason to be on screen that long, or the
   time should go somewhere better.
6. **Nothing has been reviewed in playback.** Because `seek()` freezes CSS
   animations, every audit so far judged the reel by its settled frames. The
   entrance motion has literally never been looked at frame to frame. Watch it
   play before you change anything.

## Hard constraints

- One HTML file. No build step, no npm, no animation library. Web Animations
  API and CSS only.
- `seek(ms)` and `tipAt()` must keep working exactly as they do now, including
  the base-state rule above.
- True 1920x1080 geometry. Desktop only, no responsive work.
- Every user-facing string in the fake app must stay verbatim: it mirrors the
  real product.
- **No em dashes** anywhere, in the reel or in anything you write.
- `--rate` stays the single source of pace. Do not hardcode scaled values.
- The camera law holds: scale exactly 1.000 outside the click windows, ceiling
  1.12, anchored so the click target drifts no more than 2px, back to 1.000
  before the next cut. If you deliberately change the law, update
  `audit/verify.mjs` and `audit/audit-numeric.mjs` to match and say so.

## Verification, in this order

All of this already exists in `audit/`.

```bash
node audit/verify.mjs          # 68 assertions: copy, scene schedule, camera law, click accuracy
node audit/audit-numeric.mjs   # live playthrough: scale, discontinuities, drift, cursor error, frame deltas
node audit/audit-visual.mjs && node audit/sheets.mjs   # 672 frames, 42 contact sheets in audit/sheets/
```

`verify.mjs` must end `TOTAL: 68 pass, 0 fail`. `audit-numeric.mjs` must report
no camera, drift or cursor violations; isolated `frame-delta-over-32ms` entries
are machine contention and move between runs, so re-run once on a quiet machine
before treating them as real.

Then **watch it play**, at full size, with sound. The contact sheets cannot
show you entrance motion. If you only look at stills you will ship the same
uniform motion you started with.

## Rendering

```bash
node audit/render-video.mjs 30
```

Writes `useful-apply-reel.mp4` (1920x1080, H.264, audio muxed from
`reel-audio.mp3`), `useful-apply-reel.webm` and `reel-poster.jpg`.

It records via Chrome's screencast and resamples the frames onto a constant
grid by their timestamps. A note on a dead end so you do not repeat it: an
earlier version used `Emulation.setVirtualTimePolicy` to advance the clock one
frame at a time. That deadlocks, because `Page.captureScreenshot` waits for a
new frame and paused virtual time never produces one. The result looked fine
but the content ran roughly 3x ahead of its own timestamps.

Verify any render before calling it done: pull frames at known landmarks and
check the content matches. At 30fps the reel should show chapter 1 at 2.5s, the
feed with the camera zoomed on the first card at 15.0s, the tracker at 56.0s
and the close bookend at 62.0s.

## Report

When you are done, append to `demo-reel-cursor/RESULT.md`: what you changed and
why, anything you tried and rejected, the audit numbers, and the render output
path. Plain sentences, no em dashes.
