# Useful Apply product reel

Variant A, code-derived. The screens are rebuilt as live HTML from the real
components and design tokens, then animated on a scripted timeline. 1:04.

Pace is set by `--rate` on `:root`, currently 1.5. The timeline constants in
the source are all authored at 1x, which is the original 1:36 cut; every cue
time, camera window, cursor tween, typing cadence and CSS duration divides by
`--rate`. `RATE` in `make-audio.py` must match it.

The reel is divided into four chapters, each announced on its own full frame
so the product screens stay clear of overlay text. The chapter titles are the
clauses of the product's own tagline: Find jobs worth applying to / Write
tailored applications / Get answers to the screening questions / Track all your
applications in one place, paid off by the closing card, All in one app for the
job seekers.

The app is laid out at its true 1920 desktop geometry, so the three columns
land at the widths the app itself computes: sidebar 224, conversation
`clamp(400px, 100vw - 1169px, 1000px)` = 751, canvas 945. Nothing is scaled
internally, which is why the CV fills its canvas instead of floating in it.

## Files

| File | What it is |
|---|---|
| `useful-apply-reel.html` | The reel. Self-contained, 1920x1080 stage, sound inlined. |
| `make-audio.py` | Generates the sound design track. Stdlib only. |
| `reel-audio.wav` | The generated track, 64s stereo, cue-aligned to the reel. Gitignored, regenerate it. |
| `reel-audio.mp3` | The same track encoded for inlining into the page. |
| `audit/` | Verification and render tooling. See below. |
| `BRIEF-motion-pass.md` | The open brief: improve the motion, then render. |

## Recording it

The page needs to be served, not opened from `file://`, because of the audio.
The Plus Jakarta Sans wordmark font is inlined as a data URI from
`pjs700.woff2`, so the reel renders the same with no network.

```bash
cd demo-reel
python3 -m http.server 8791
```

Open `http://127.0.0.1:8791/useful-apply-reel.html?rec` (the `?rec` flag hides
the control bar), start your recorder, then click to play. `R` toggles the
control bar, space replays.

### Window size

On this machine (2560x1440 logical, DPR 2) a Chrome window of **1932 x 1210**
gives a viewport of exactly **1920 x 1080**, so the stage renders at scale
1.0000. Chrome's own frame accounts for the difference: 12px of width, 130px of
height. At DPR 2 the captured frame is 3840 x 2160, so a 1080p export is
downsampled from 4K and stays sharp.

Chrome's programmatic resize is unreliable and sometimes silently no-ops. If
the numbers below are wrong, drag the window by hand until they are right.

Verify it any time by pasting this in the console:

```js
innerWidth + ' x ' + innerHeight   // want 1920 x 1080
```

The reel does not depend on hitting that exactly. Within 3% of 16:9 the stage
covers the window rather than letterboxing, so a slightly-off window loses a
pixel of margin instead of showing black bars. Past 3% it falls back to fitting
inside the window so nothing gets cropped.

**Keep the window focused for the whole take.** The timeline runs on
`requestAnimationFrame`, so a backgrounded tab pauses rather than skipping.

Then lay the audio under the picture:

```bash
python3 make-audio.py     # only if you changed the cue times
ffmpeg -i take.mov -i reel-audio.wav -map 0:v -map 1:a -c:v copy -shortest reel.mp4
```

## Audio

Mouse clicks (a dry press with a quieter release 70ms later), quiet ticks when
a card or stage lands, and a soft paper settle under each chapter card. No
keyboard, no sweeps, no drones, no room tone, nothing tonal. Generated from the
script, so there is no third-party asset to license or vet. Most of the runtime
is silent, which is deliberate.

To drop the paper settle, delete the `PAPER` list and the `paper()` function in
`make-audio.py` and regenerate. Nothing else depends on them.

**The track is inlined into the page**, so the reel plays with sound in the
browser on its own. That is why the HTML is ~1.4MB. Playback starts from your
click on the gate, which is what satisfies the browser autoplay policy.

Whether a screen recorder captures it depends on your setup: QuickTime does not
record system audio without a loopback device. The reliable route is to record
silent and mux the WAV underneath:

```bash
ffmpeg -i take.mov -i reel-audio.wav -map 0:v -map 1:a -c:v copy -shortest reel.mp4
```

If you retime a beat in the HTML, update the matching cue in `make-audio.py`,
regenerate, re-encode the MP3 and re-inline it:

```bash
python3 make-audio.py
ffmpeg -y -i reel-audio.wav -codec:a libmp3lame -b:a 96k reel-audio.mp3
```

## Fidelity

Everything on screen is checked against the source or the live app. The labels,
button copy, credit costs, status pills, chips, stage titles and CV layout are
copied, not invented. The persona (Amara Osei) and the employers are fictional
sample data.

Verified against the live app at usefulapply.com:

- The UI renders in the **system sans**, not Inter, so the reel matches that.
  See the known issue below.
- Sidebar status pills are `Now` / `Kit ready` / `Drafted` / `Applied` only.
- The conversation column is the spine layout: greeting, four suggested
  prompts, composer pinned at the bottom reading "Paste a job ad or ask
  anything".
- Pasting an ad produces a decision card: **Check my fit · 0.5 credits**,
  **Not a job ad, just a question**, and a **Skip the check, generate the full
  kit now** link.
- `Templates` is a toolbar dropdown that opens the strip. It is not a
  permanently visible row.
- The CV toolbar order is Templates, Edit, Copy, Download PDF.
- `Download all` appears only once a kit exists.

Built from source but **not** confirmed against the live app, because the test
account's Job Board is not built yet:

- The Job Board feed cards and the job detail view.
- The Tracker table.

Both were written against `FeedJobCard.tsx`, `FeedJobDetail.tsx`,
`FeedCanvas.tsx` and `TrackerCanvas.tsx`, so the copy and structure are right,
but nobody has eyeballed them next to the real thing.

## Known issue found while building this

The app intends Inter (`--font-sans` in `globals.css`, loaded via `next/font`)
but the shipped body renders in Tailwind's default `ui-sans-serif, system-ui`
stack. Measured on production: rendered text width matches the system font, not
Inter, and `getComputedStyle(document.documentElement).getPropertyValue('--font-sans')`
comes back empty. Inter *is* loaded, it just never reaches `body`. Worth a
separate fix.

## Verification

Run before shipping, from the browser console with the reel loaded:

- `seek(ms)` jumps to any point in the timeline, applying every cue up to it.
- `tipAt()` returns where the cursor's point currently sits, in stage
  coordinates, for checking that a click lands on its target.

Careful with screenshots when auditing: the capture pipeline sometimes returns
a stale frame, which makes correct states look broken. DOM assertions against
`document.querySelector('.scene.on')` are the reliable check.

Last full pass: 96 one-second samples with exactly one scene on and no empty
scenes or horizontal overflow; 26 content assertions across every chapter;
9 click targets landing 0-1px from centre in live playback; and a live
end-to-end run reaching all 16 scenes in order.

## Verification and rendering

Serve the folder first (`python3 -m http.server 8793`), then:

```bash
node audit/verify.mjs          # 68 assertions: copy, scene schedule, camera law, click accuracy
node audit/audit-numeric.mjs   # live playthrough: scale, discontinuities, drift, cursor error, frame deltas
node audit/audit-visual.mjs && node audit/sheets.mjs   # 672 frames and 42 contact sheets
node audit/render-video.mjs 30 # mp4, webm and a poster frame
```

The audit scripts keep their own timeline tables authored at 1x and divide by
their own `RATE`, so they track the reel when the pace changes.

One caveat that shapes everything: `seek(ms)` stamps `.seeking` on `<html>`,
which is `animation:none !important`. A seeked still therefore shows an
element's **base** CSS, not the end of its animation. Any animation added to
the reel must have its resting state equal to its final state, with the
keyframes supplying only the entrance. It also means the contact sheets cannot
show entrance motion at all: that has to be judged by watching it play.
