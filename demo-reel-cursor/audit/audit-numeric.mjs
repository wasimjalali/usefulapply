// Numeric audit: one full live playthrough with the ?audit probe recording
// every rAF frame, then the violation pass from the follow-up brief.
// Writes frames.json (raw) and violations.json (analysis) next to this file.
import { launch } from './cdp.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const PAGE_URL = 'http://localhost:8793/useful-apply-reel.html?audit&rec';
const CLICKS = [22600, 33000, 45200, 49000, 55000, 60000, 68300, 73000, 82950];
const WINDOWS = [
  [21600, 22500, 22650, 23150], [31800, 32800, 33300, 33900],
  [44100, 45100, 45500, 46100], [47800, 48800, 49300, 49900],
  [53800, 54800, 55050, 55350], [58800, 59800, 60050, 60350],
  [67000, 68000, 68600, 69200], [71850, 72850, 73050, 73500],
  [82350, 82880, 83020, 83320],
];
// Authored at 1x above; the reel plays at --rate.
const RATE = 1.5;
for (let i = 0; i < CLICKS.length; i++) CLICKS[i] /= RATE;
for (const w of WINDOWS) for (let i = 0; i < 4; i++) w[i] /= RATE;
const END = 96000 / RATE;
const out = (f) => new URL(`./${f}`, import.meta.url);

let rows;
if (process.argv.includes('--analyze-only')) {
  rows = JSON.parse(readFileSync(out('frames.json'), 'utf8'));
} else {
  const { page, close } = await launch();
  await page.goto(PAGE_URL);
  await page.eval(`document.getElementById('gate').click(); 'go'`);
  const deadline = Date.now() + 160000;
  let lastT = 0;
  while (Date.now() < deadline) {
    lastT = await page.eval(`window.__audit.length ? window.__audit[window.__audit.length-1].t : 0`);
    if (lastT >= END - 100) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  rows = await page.eval('window.__audit');
  await close();
  writeFileSync(out('frames.json'), JSON.stringify(rows));
  console.log(`frames: ${rows.length}, last t: ${lastT}`);
}

// ── violation pass ──────────────────────────────────────────────────────────
const v = [];
const EPS = 1e-6;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (r.win === -1 && Math.abs(r.s - 1) > EPS) v.push([r.t, 'scale-not-1-outside-window', r.s]);
  if (r.s > 1.12 + EPS) v.push([r.t, 'scale-over-peak', r.s]);
  if (r.s < 1 - EPS) v.push([r.t, 'scale-under-1', r.s]);
  if (r.t > 500 && r.dt > 32) v.push([r.t, 'frame-delta-over-32ms', r.dt]);
}
// A discontinuity means a jump the easing curve cannot produce. Quartic
// ease-in-out (8u^4 / mirrored) peaks at 4x average slope at u = 0.5, so a
// continuous frame pair can move at most that much in the frame's dt;
// anything beyond, with slack for timer quantization, is a real snap.
const DELTA = 0.12;
function scaleAllowance(r, dt) {
  for (const [a, b, c, d] of WINDOWS) {
    if (r.t >= a && r.t <= b) return DELTA * 4 * dt / (b - a) * 1.25 + 5e-4;
    if (r.t > c && r.t <= d) return DELTA * 4 * dt / (d - c) * 1.25 + 5e-4;
    if (r.t > b && r.t <= c) return 5e-4;   // hold: no motion at all
  }
  return 5e-4;                              // outside windows: identity
}
const levers = WINDOWS.map((_, wi) => {
  const ts = rows.filter(r => r.win === wi && r.tgt);
  return ts.length
    ? Math.max(...ts.map(r => Math.hypot(r.tgt[0] - 960, r.tgt[1] - 540)))
    : 800;
});
for (let i = 1; i < rows.length; i++) {
  const p = rows[i - 1], r = rows[i];
  const dt = Math.max(1, r.t - p.t);
  const allowS = scaleAllowance(r, dt);
  if (Math.abs(r.s - p.s) > allowS)
    v.push([r.t, 'scale-discontinuity', +(r.s - p.s).toFixed(5), 'allowed', +allowS.toFixed(5)]);
  const lever = levers[r.win] ?? 800;
  const allowT = lever * allowS + 0.5;
  if (Math.abs(r.tx - p.tx) > allowT || Math.abs(r.ty - p.ty) > allowT)
    v.push([r.t, 'translate-discontinuity', +(r.tx - p.tx).toFixed(2), +(r.ty - p.ty).toFixed(2)]);
}
WINDOWS.forEach(([a, b, c, d], wi) => {
  const wr = rows.filter(r => r.win === wi);
  if (!wr.length) { v.push([a, `window-${wi}-empty`]); return; }
  for (let i = 1; i < wr.length; i++) {
    const p = wr[i - 1], r = wr[i];
    if (p.t < b && r.t <= b && r.s < p.s - 1e-9) v.push([r.t, `w${wi}-easein-not-monotonic`, p.s, r.s]);
    if (p.t >= c && r.t >= c && r.s > p.s + 1e-9) v.push([r.t, `w${wi}-easeout-not-monotonic`, p.s, r.s]);
  }
  const base = wr.find(r => r.tgt);
  if (!base) { v.push([a, `window-${wi}-no-target-samples`]); return; }
  for (const r of wr) {
    if (!r.tgt) continue;
    const dd = Math.hypot(r.tgt[0] - base.tgt[0], r.tgt[1] - base.tgt[1]);
    if (dd > 2) v.push([r.t, `w${wi}-target-drift`, +dd.toFixed(2)]);
  }
  const clickAt = CLICKS[wi];
  for (const r of rows.filter(r => Math.abs(r.t - clickAt) <= 50)) {
    if (!r.tgt || !r.tip) { v.push([r.t, `w${wi}-press-missing-data`]); continue; }
    const dd = Math.hypot(r.tip[0] - r.tgt[0], r.tip[1] - r.tgt[1]);
    if (dd > 1) v.push([r.t, `w${wi}-press-tip-off-target`, +dd.toFixed(2)]);
  }
});
writeFileSync(out('violations.json'), JSON.stringify(v, null, 1));

// summary
const dts = rows.slice(1).map(r => r.dt).filter(x => x > 0);
dts.sort((x, y) => x - y);
const pct = (q) => dts[Math.floor(q * (dts.length - 1))];
console.log(`frames: ${rows.length}  dt p50 ${pct(.5)}ms  p95 ${pct(.95)}ms  p99 ${pct(.99)}ms  max ${dts.at(-1)}ms`);
const scales = rows.map(r => r.s);
console.log(`scale min ${Math.min(...scales)}  max ${Math.max(...scales)}`);
console.log(v.length ? `VIOLATIONS: ${v.length}` : 'CLEAN: no violations');
v.slice(0, 40).forEach(x => console.log(' ', JSON.stringify(x)));
process.exit(v.length ? 1 : 0);
