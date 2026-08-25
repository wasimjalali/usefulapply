import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTML = resolve('useful-apply-reel.html');
const DUR = 96000;
const CLICKS = [22600, 33000, 45200, 49000, 55000, 60000, 68300, 73000];
const WINDOWS = CLICKS.map((press, i) => ({ id:i+1, start:press-400, press, end:press+400 }));
const TRANSITIONS = [0, 2800, 5400, 11600, 15700, 18400, 20500, 23200, 34600, 42200, 53400, 55500, 60500, 64000, 66600, 80600, 83200, 89400];

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((ok, fail) => {
      this.ws.addEventListener('open', ok, { once:true });
      this.ws.addEventListener('error', fail, { once:true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const answer = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return answer;
  }
  close() { this.ws.close(); }
}

async function launch() {
  const profile = await mkdtemp(join(tmpdir(), 'useful-apply-audit-'));
  const url = `${pathToFileURL(HTML).href}?rec`;
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--window-size=1920,1080',
    url,
  ], { stdio:['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  const browserWs = await new Promise((resolveWs, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome did not expose CDP. ${stderr}`)), 15000);
    chrome.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      resolveWs(match[1]);
    });
    chrome.once('exit', code => reject(new Error(`Chrome exited with ${code}. ${stderr}`)));
  });

  const endpoint = new URL(browserWs);
  let pageTarget;
  for (let attempt = 0; attempt < 100 && !pageTarget; attempt++) {
    const targets = await fetch(`http://${endpoint.host}/json/list`).then(r => r.json());
    pageTarget = targets.find(target => target.type === 'page');
    if (!pageTarget) await new Promise(r => setTimeout(r, 50));
  }
  if (!pageTarget) throw new Error('Chrome opened without a page target.');
  const cdp = new Cdp(pageTarget.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width:1920,
    height:1080,
    deviceScaleFactor:1,
    mobile:false,
    screenWidth:1920,
    screenHeight:1080,
  });
  for (let attempt = 0; attempt < 200; attempt++) {
    const loaded = await evaluate(cdp, 'document.readyState === "complete" && typeof play === "function"');
    if (loaded) break;
    await new Promise(r => setTimeout(r, 50));
  }
  return {
    cdp,
    async close() {
      cdp.close();
      chrome.kill('SIGTERM');
      await rm(profile, { recursive:true, force:true });
    },
  };
}

async function evaluate(cdp, expression, awaitPromise = false, returnByValue = true) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function numeric(output, lite = false) {
  const browser = await launch();
  try {
    // The gate is bypassed here, so the scene warm has to be asked for.
    await evaluate(browser.cdp, 'warmScenes()', true, false);
    await evaluate(browser.cdp, `__reelAudit.lite = ${lite}; __reelAudit.start(); play(); true`);
    const started = Date.now();
    while (!await evaluate(browser.cdp, '__reelAudit.complete')) {
      const elapsed = Math.round((Date.now()-started)/1000);
      process.stdout.write(`live ${elapsed}s\n`);
      await new Promise(r => setTimeout(r, 5000));
    }
    const frames = await evaluate(browser.cdp, '__reelAudit.stop()');
    await mkdir(dirname(output), { recursive:true });
    await writeFile(output, `${JSON.stringify(frames)}\n`);
    process.stdout.write(`wrote ${frames.length} frames to ${output}\n`);
  } finally {
    await browser.close();
  }
}

function screenshotTimes() {
  const times = new Set();
  for (const press of CLICKS) {
    for (let t = press-300; t <= press+300; t += 40) times.add(t);
  }
  for (const transition of TRANSITIONS) {
    for (let t = Math.max(0, transition-500); t <= Math.min(DUR, transition+500); t += 100) times.add(t);
  }
  for (let t = 0; t <= DUR; t += 500) times.add(t);
  return [...times].sort((a, b) => a-b);
}

async function screenshots(output) {
  await mkdir(output, { recursive:true });
  const browser = await launch();
  try {
    const times = screenshotTimes();
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      await evaluate(browser.cdp, `(async()=>{
        document.getElementById('gate').classList.add('hide');
        seek(${t});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 520));
        return true;
      })()`, true);
      const shot = await browser.cdp.send('Page.captureScreenshot', { format:'png', fromSurface:true });
      await writeFile(join(output, `${String(t).padStart(6, '0')}.png`), Buffer.from(shot.data, 'base64'));
      if ((i+1)%25 === 0 || i+1 === times.length) process.stdout.write(`captured ${i+1}/${times.length}\n`);
    }
  } finally {
    await browser.close();
  }
}

function analyze(frames) {
  // A lite pass carries timing only, so the camera and cursor checks are not
  // reported rather than reported as passing on data that was never captured.
  if (frames.length && !frames[0].camera) {
    const longFrames = frames.filter(f => f.elapsed > 500 && f.frameDelta > 32);
    return {
      mode:'lite',
      frameCount:frames.length,
      framesOver32ms:longFrames.length,
      maxFrameDeltaMs:longFrames.length ? Math.max(...frames.filter(f => f.elapsed > 500).map(f => f.frameDelta)) : 0,
      violations:{ slow:longFrames.map(f => ({ elapsed:f.elapsed, delta:f.frameDelta })) },
    };
  }
  const outOfWindow = frames.filter(f => Math.abs(f.camera.scale-1) > 0.00005 && !f.clickWindowId);
  const overCeiling = frames.filter(f => f.camera.scale > 1.12005);
  const longFrames = frames.filter(f => f.elapsed > 500 && f.frameDelta > 32);
  const drift = frames.filter(f => f.targetDriftPx !== null);
  const presses = frames.filter(f => f.pressing && f.cursorErrorPx !== null);
  const pops = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i-1], b = frames[i];
    const dt = b.elapsed-a.elapsed;
    if (dt <= 0 || dt > 40) continue;
    const scaleRate = Math.abs(b.camera.scale-a.camera.scale)/dt;
    if (scaleRate > 0.00034) pops.push({ elapsed:b.elapsed, scaleRate });
  }
  const overshoot = [];
  for (const w of WINDOWS) {
    const sample = frames.filter(f => f.clickWindowId === w.id);
    const before = sample.filter(f => f.elapsed <= w.press-100);
    const after = sample.filter(f => f.elapsed >= w.press+100);
    for (let i = 1; i < before.length; i++) {
      if (before[i].camera.scale+0.00005 < before[i-1].camera.scale) overshoot.push({ elapsed:before[i].elapsed, window:w.id });
    }
    for (let i = 1; i < after.length; i++) {
      if (after[i].camera.scale-0.00005 > after[i-1].camera.scale) overshoot.push({ elapsed:after[i].elapsed, window:w.id });
    }
  }
  const max = (items, key) => items.length ? Math.max(...items.map(item => item[key])) : 0;
  return {
    frameCount:frames.length,
    outOfWindowScaleFrames:outOfWindow.length,
    overCeilingFrames:overCeiling.length,
    popFrames:pops.length,
    overshootFrames:overshoot.length,
    maxTargetDriftPx:max(drift, 'targetDriftPx'),
    maxCursorErrorPx:max(presses, 'cursorErrorPx'),
    framesOver32ms:longFrames.length,
    maxFrameDeltaMs:max(frames.filter(f => f.elapsed > 500), 'frameDelta'),
    violations:{
      outOfWindow:outOfWindow.map(f => f.elapsed),
      overCeiling:overCeiling.map(f => f.elapsed),
      pops:pops.map(f => f.elapsed),
      overshoot:overshoot.map(f => f.elapsed),
      drift:drift.filter(f => f.targetDriftPx > 2).map(f => f.elapsed),
      cursor:presses.filter(f => f.cursorErrorPx > 1).map(f => f.elapsed),
      slow:longFrames.map(f => ({ elapsed:f.elapsed, delta:f.frameDelta })),
    },
  };
}

async function main() {
  const [command, path] = process.argv.slice(2);
  if (command === 'numeric') return numeric(resolve(path));
  // Frame timing only. The full probe reads layout every frame, which inflates
  // the very deltas it reports, so the timing verdict comes from this pass.
  if (command === 'lite') return numeric(resolve(path), true);
  if (command === 'screens') return screenshots(resolve(path));
  if (command === 'analyze') {
    const frames = JSON.parse(await readFile(resolve(path), 'utf8'));
    const summary = analyze(frames);
    const output = resolve(dirname(path), `${basename(path, '.json')}-summary.json`);
    await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  throw new Error('Usage: node audit-reel.mjs numeric FILE | lite FILE | screens DIR | analyze FILE');
}

await main();
