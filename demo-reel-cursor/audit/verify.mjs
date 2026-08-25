// v1 verification protocol: seek samples, verbatim content assertions, click
// target accuracy, camera law at 1s resolution, live-run smoke test.
import { launch } from './cdp.mjs';

const URL = 'http://localhost:8793/useful-apply-reel.html?rec';
const CLICKS = [
  [22600, '#feedlist [data-fit="0"]'], [33000, '#genkit'], [45200, '#segTail'],
  [49000, '#toolslot [data-tpl]'], [55000, '#s-cv [data-tab="cl"]'],
  [60000, '#s-cover [data-tab="em"]'], [68300, '#scr-btn'], [73000, '#sendbtn'],
  [82950, '#s-screen [data-nav="tracker"]'],
];
const WINDOWS = [
  [21600, 23150], [31800, 33900], [44100, 46100], [47800, 49900],
  [53800, 55350], [58800, 60350], [67000, 69200], [71850, 73500],
  [82350, 83320],
];
const SCENES = [
  [0, 's-cold'], [2800, 's-ch1'], [5400, 's-build'], [11600, 's-feed'],
  [18400, 's-ch2'],   [21000, 's-feed'], [23200, 's-fit'], [34600, 's-kit'],
  [42200, 's-cv'], [53400, 's-cv'], [55350, 's-cover'], [60350, 's-email'],
  [64000, 's-ch3'], [66600, 's-screen'], [80600, 's-ch4'], [81800, 's-screen'],
  [83320, 's-tracker'],
  [89400, 's-close'],
];
// The reel runs at --rate; the tables above stay authored at 1x.
const RATE = 1.5;
for (const c of CLICKS) c[0] /= RATE;
for (const w of WINDOWS) { w[0] /= RATE; w[1] /= RATE; }
for (const sc of SCENES) sc[0] /= RATE;
const sceneAt = (ms) => SCENES.filter(([t]) => t <= ms).at(-1)[1];
const inWindow = (ms) => WINDOWS.some(([a, d]) => ms >= a && ms <= d);

let pass = 0, fail = 0;
const bad = [];
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; bad.push(label); console.log('  FAIL', label); }
}

const { page, close } = await launch();
await page.goto(URL);
await page.eval(`window.addEventListener('error', e => { window.__lastError = String(e.message); }); 'hooked'`);

// ── content assertions ──────────────────────────────────────────────────────
const asserts = await page.eval(`(() => {
  // textContent, not innerText: scenes sit visibility:hidden until their cue.
  const txt = document.body.textContent;
  const html = document.documentElement.innerHTML;
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const camScale = () => {
    const m = q('#cam').style.transform;
    const s = /scale\\(([\\d.]+)\\)/.exec(m || '');
    return s ? parseFloat(s[1]) : 1;
  };
  const out = {};
  out.strings = [
    'Find jobs, write tailored applications, track them.',
    'All in one app.', 'usefulapply.com',
    'Building your feed. I’ll show you what I’m doing on the right.',
    'Reading your profile', 'Ranking against your CV',
    '3 searches today, in priority order.',
    '3 strong matches in this list: Lumen Systems and Halden Digital.',
    '15 new roles today',
    'Ranked for Senior Frontend Engineer · Germany · last run 22:09',
    'Only remote', 'Raise my salary floor',
    'Check fit', '· 0.5', 'Generate the full kit', '· 1.5 credits',
    'Good Fit',
    'a cover letter and two emails. Grounded on your CV.',
    'Tailored for Lumen Systems.', 'ATS 91%', 'see every change',
    'Answer screening questions',
    'Grounded on your CV. It’s in the Answers tab.',
    'Here’s where things stand.', 'One interview', 'Two follow-ups overdue',
    'kit is ready but not sent.', 'Prep me for Halden Digital',
    'Draft the Vela Group follow-up',
    'Follow up by 3 Sep', 'Waiting', 'Send it',
    'Describe a time you migrated a large codebase without pausing feature delivery. What was your approach?',
  ].map(s => [s, txt.includes(s)]);
  out.absent = ['Nothing was invented', 'nothing invented', 'Hide rejected',
    'Your CV as you uploaded it'].map(s => [s, !txt.includes(s)]);
  out.emDash = !txt.includes('\\u2014');
  out.cards = qa('#feedlist .jobcard').length === 15;
  out.strong = qa('#feedlist .jobcard.strong').length === 3;
  out.queries = qa('#qlist .qcard').length === 3;
  out.trows = qa('#s-tracker .trow').length === 6;
  out.scenes = ['s-cold','s-ch1','s-ch2','s-ch3','s-ch4','s-build','s-feed','s-fit',
    's-kit','s-cv','s-cover','s-email','s-screen','s-tracker','s-close']
    .every(id => !!document.getElementById(id));
  out.camWraps = q('#cam') && q('#cam').contains(q('#app'));
  out.fontInlined = !document.querySelector('link[href*="fonts.googleapis"]')
    && html.includes("@font-face") && html.includes('data:font/woff2;base64');
  out.trackerArrows = (() => {
    // ArrowUpRight on every step that opens the Emails tab: Send it, both
    // overdue follow-ups and Northgate's scheduled one. Popover steps get none.
    const nx = qa('#s-tracker .trow .nx').map(r => r.textContent);
    return nx.some(t => t.includes('Follow up by 3 Sep') && t.includes('↗'))
      && nx.filter(t => t.includes('↗')).length === 4
      && !nx.find(t => t.includes('Waiting')).includes('↗')
      && !nx.find(t => t.includes('Add a date')).includes('↗');
  })();
  return out;
})()`);
for (const [s, found] of asserts.strings) ok(found, `string present: ${s.slice(0, 60)}`);
for (const [s, gone] of asserts.absent) ok(gone, `string absent: ${s}`);
ok(asserts.emDash, 'no em dash in visible text');
ok(asserts.cards, '15 job cards');
ok(asserts.strong, '3 strong cards');
ok(asserts.queries, '3 query cards');
ok(asserts.trows, '6 tracker rows');
ok(asserts.scenes, 'all 15 scenes present');
ok(asserts.camWraps, '#cam wraps #app');
ok(asserts.fontInlined, 'font inlined, no Google Fonts link');
ok(asserts.trackerArrows, 'tracker arrows on the three email-opening steps');
console.log(`content assertions: ${pass} pass, ${fail} fail`);

// ── 96 one-second seek samples: scene schedule + camera law ────────────────
const samples = await page.eval(`(() => {
  const rows = [];
  for (let ms = 0; ms < 96000; ms += 1000) {
    const scene = seek(ms);
    const m = document.querySelector('#cam').style.transform;
    const s = /scale\\(([\\d.]+)\\)/.exec(m || '');
    rows.push([ms, scene, s ? parseFloat(s[1]) : 1]);
  }
  return rows;
})()`);
let sceneFails = 0, camFails = 0;
for (const [ms, scene, s] of samples) {
  const want = sceneAt(ms);
  if (scene !== want) { sceneFails++; bad.push(`seek ${ms}: scene ${scene} != ${want}`); }
  if (inWindow(ms)) {
    if (!(s >= 1.0 && s <= 1.12)) { camFails++; bad.push(`seek ${ms}: scale ${s} outside [1, 1.12] in window`); }
  } else if (s !== 1) { camFails++; bad.push(`seek ${ms}: scale ${s} != 1 outside window`); }
}
ok(sceneFails === 0, `scene schedule across 96 samples (${sceneFails} wrong)`);
ok(camFails === 0, `camera law across 96 samples (${camFails} wrong)`);

// ── click target accuracy at each press, via seek ──────────────────────────
for (const [clickAt, sel] of CLICKS) {
  const r = await page.eval(`(() => {
    seek(${clickAt});
    const tip = tipAt();
    const el = document.querySelector('${sel}');
    const stage = document.getElementById('stage').getBoundingClientRect();
    const rr = el.getBoundingClientRect();
    const k = stage.width / 1920 || 1;
    const tgt = [(rr.left + rr.width/2 - stage.left)/k, (rr.top + rr.height/2 - stage.top)/k];
    const m = document.querySelector('#cam').style.transform;
    const s = /scale\\(([\\d.]+)\\)/.exec(m || '');
    return { tip, tgt, s: s ? parseFloat(s[1]) : 1 };
  })()`);
  const d = Math.hypot(r.tip[0] - r.tgt[0], r.tip[1] - r.tgt[1]);
  ok(d <= 1, `click @${clickAt} ${sel}: tip ${d.toFixed(2)}px off target`);
  ok(r.s >= 1.10 && r.s <= 1.12, `click @${clickAt}: camera at hold (${r.s})`);
}

// ── live run smoke: 8 seconds of real playback ─────────────────────────────
await page.eval(`seek(0)`);
await page.eval(`document.getElementById('gate').click(); 'playing'`);
await new Promise(r => setTimeout(r, 6200));
const live = await page.eval(`(() => {
  const clk = document.getElementById('clock').textContent;
  return { clk, scene: (document.querySelector('.scene.on')||{}).id || null };
})()`);
ok(live.scene === 's-build', `live run at ~6s is on s-build (got ${live.scene}, clock ${live.clk})`);
const errs = await page.eval(`window.__lastError || null`);
ok(errs === null, 'no page errors during live run');

console.log(`\nTOTAL: ${pass} pass, ${fail} fail`);
if (bad.length) { console.log('\nfailures:'); bad.forEach(b => console.log(' -', b)); }
await close();
process.exit(fail ? 1 : 0);
