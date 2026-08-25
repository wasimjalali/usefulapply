#!/usr/bin/env python3
"""
UI sound design for the Useful Apply product reel.

Mouse clicks, quiet ticks when a card or stage lands, and a soft paper
settle under each section card. No keyboard, no filter sweeps, no drones, no
room tone, no music of any kind. Silence between events is intentional.

The paper settle is one list (PAPER) and one function; delete both if you want
clicks alone.

Stdlib only. Writes reel-audio.wav, 44.1kHz stereo, 100 seconds, aligned to
the cue times in useful-apply-reel.html.

    python3 make-audio.py
"""

import array
import math
import random
import wave

SR = 44100
# Playback pace, matching --rate in useful-apply-reel.html. Every cue time
# below is authored at 1x and divided by this, so the two stay in lockstep.
RATE = 1.5
DUR = 96.0 / RATE
N = int(SR * DUR)

random.seed(11)  # deterministic output across runs

left = array.array("d", bytes(8 * N))
right = array.array("d", bytes(8 * N))


def add(buf, start_s, samples, gain=1.0):
    i = int(start_s * SR)
    if i < 0:
        return
    end = min(len(buf), i + len(samples))
    for k in range(end - i):
        buf[i + k] += samples[k] * gain


def noise(n):
    return [random.uniform(-1.0, 1.0) for _ in range(n)]


def lowpass(sig, cutoff, poles=1, sr=SR):
    a = math.exp(-2.0 * math.pi * cutoff / sr)
    out = sig
    for _ in range(poles):
        y = 0.0
        nxt = []
        for x in out:
            y = (1 - a) * x + a * y
            nxt.append(y)
        out = nxt
    return out


def highpass(sig, cutoff, poles=1, sr=SR):
    out = sig
    for _ in range(poles):
        lp = lowpass(out, cutoff, 1, sr)
        out = [x - y for x, y in zip(out, lp)]
    return out


def bandpass(sig, lo, hi, poles=2):
    return highpass(lowpass(sig, hi, poles), lo, poles)


def decay(n, attack_s, tail, curve=3.0):
    """Fast attack, exponential-ish tail. tail is in samples."""
    a = max(1, int(attack_s * SR))
    out = []
    for i in range(n):
        if i < a:
            v = i / a
        else:
            t = (i - a) / max(1, tail)
            v = max(0.0, 1.0 - t) ** curve
        out.append(v)
    return out


def norm(sig, peak_to):
    p = max(abs(v) for v in sig) or 1.0
    return [v / p * peak_to for v in sig]


# ── Elements ────────────────────────────────────────────────────────────

def mouseclick(gain=0.115):
    """
    A dry two-part mouse click: the press, then a quieter release about
    70ms later. One transient alone reads as a tap, not a click.
    """
    total = int(0.14 * SR)
    out = [0.0] * total

    def transient(at, level, lo, hi, tail, curve):
        n = int(0.014 * SR)
        sig = bandpass(noise(n), lo, hi, poles=2)
        e = decay(n, 0.0004, int(tail * SR), curve=curve)
        sig = norm([x * y for x, y in zip(sig, e)], level)
        for k in range(n):
            if at + k < len(out):
                out[at + k] += sig[k]

    transient(0, 1.0, 1200, 4200, 0.0055, 3.6)                 # press
    transient(int(0.072 * SR), 0.46, 1600, 5200, 0.0035, 4.0)  # release
    return [v * gain for v in out]


def paper(gain=0.048):
    """
    A section card settling: a short sheet of paper laid down. Fixed mid
    band with a gentle attack, so it reads as paper rather than as the
    filter sweep this replaced.
    """
    n = int(0.26 * SR)
    sig = bandpass(noise(n), 420, 2400, poles=2)
    e = decay(n, 0.022, int(0.20 * SR), curve=2.0)
    return norm([x * y for x, y in zip(sig, e)], gain)


def tick(gain=0.05):
    """A card or a stage landing: quiet, high, very short."""
    n = int(0.026 * SR)
    sig = bandpass(noise(n), 2200, 6000, poles=2)
    e = decay(n, 0.0006, int(0.012 * SR), curve=3.2)
    return norm([x * y for x, y in zip(sig, e)], gain)


# ── Cues, aligned to useful-apply-reel.html ─────────────────────────────

CLICKS = [22.6, 33.0, 45.2, 49.0, 55.0, 60.0, 68.3, 73.0, 82.95]

# Section cards.
PAPER = [2.8, 18.4, 64.0, 80.6]

# Feed-build stages, agent steps, the verdict and the screening answer landing.
STAGE_TICKS = [6.4, 7.3, 9.8, 24.8, 26.4, 28.0, 37.2, 39.2, 41.0, 75.6]

# The three search-plan cards, then the fifteen feed cards staggering in.
CARD_TICKS = [7.5, 8.06, 8.62] + [11.9 + i * 0.09 for i in range(15)]

CLICKS = [t / RATE for t in CLICKS]
PAPER = [t / RATE for t in PAPER]
STAGE_TICKS = [t / RATE for t in STAGE_TICKS]
CARD_TICKS = [t / RATE for t in CARD_TICKS]

for t in CLICKS:
    c = mouseclick()
    add(left, t, c)
    add(right, t, c, 0.97)

for t in PAPER:
    pp = paper()
    add(left, t - 0.05, pp)
    add(right, t - 0.05, pp, 0.95)

for t in STAGE_TICKS:
    k = tick(0.052)
    add(left, t, k)
    add(right, t, k, 0.96)

for t in CARD_TICKS:
    k = tick(0.030)
    add(left, t, k)
    add(right, t, k, 0.94)

# ── Write ───────────────────────────────────────────────────────────────

peak = max(max(abs(v) for v in left), max(abs(v) for v in right)) or 1.0
gain = 0.70 / peak  # headroom; this sits under picture, not over it

frames = array.array("h", bytes(2 * 2 * N))
for i in range(N):
    frames[2 * i] = int(max(-1.0, min(1.0, left[i] * gain)) * 32000)
    frames[2 * i + 1] = int(max(-1.0, min(1.0, right[i] * gain)) * 32000)

with wave.open("reel-audio.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(frames.tobytes())

print(f"reel-audio.wav written: {DUR:.1f}s at {RATE}x, clicks, ticks and paper")
