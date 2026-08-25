// Visual audit: deterministic seek(ms) + settle + screenshot, at three
// densities: 40ms around click windows, 100ms across scene cuts, 500ms
// elsewhere. Writes frames/f-<ms>.png for every sampled timestamp.
import { launch } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const PAGE_URL = 'http://localhost:8793/useful-apply-reel.html?rec';
const RATE = 1.5;
const DUR = 96000 / RATE;
const CLICK_WINDOWS = [
  [21600, 23150], [31800, 33900], [44100, 46100], [47800, 49900],
  [53800, 55350], [58800, 60350], [67000, 69200], [71850, 73500],
  [82350, 83320],
];
const CUTS = [2800, 5400, 11600, 18400, 21000, 23200, 34600, 42200,
  53400, 55350, 60350, 64000, 66600, 80600, 81800, 83320, 89400];

for (const w of CLICK_WINDOWS) { w[0] /= RATE; w[1] /= RATE; }
for (let i = 0; i < CUTS.length; i++) CUTS[i] /= RATE;

// Build the sample set, densest rule wins.
const stamps = new Map(); // ms -> tag
const add = (ms, tag) => {
  if (ms < 0 || ms > DUR) return;
  ms = Math.round(ms);
  const prev = stamps.get(ms);
  if (!prev || tag < prev) stamps.set(ms, tag); // 'a' click < 'b' cut < 'c' fill
};
for (const [a, d] of CLICK_WINDOWS)
  for (let ms = a - 300; ms <= d + 300; ms += 40) add(ms, 'a');
for (const c of CUTS)
  for (let ms = c - 300; ms <= c + 600; ms += 100) add(ms, 'b');
for (let ms = 0; ms <= DUR; ms += 500) add(ms, 'c');

const list = [...stamps.entries()].sort((x, y) => x[0] - y[0]);
console.log(`samples: ${list.length}`);

mkdirSync(new URL('./frames/', import.meta.url), { recursive: true });
const pathFor = (ms) => new URL(`./frames/f-${String(ms).padStart(6, '0')}.png`, import.meta.url);

const { page, close } = await launch();
await page.goto(PAGE_URL);
// seek() drives the reel behind the gate overlay; hide the gate or every
// screenshot is the gate.
await page.eval(`document.getElementById('gate').style.display = 'none'; 'gate off'`);

const t0 = Date.now();
let i = 0;
for (const [ms] of list) {
  await page.eval(`seek(${ms}); 'sought'`);
  // Two composited frames so any layout the seek triggered is painted.
  await page.eval(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const png = await page.shot();
  writeFileSync(pathFor(ms), png);
  if (++i % 100 === 0) console.log(`${i}/${list.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await close();
console.log(`done: ${list.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
