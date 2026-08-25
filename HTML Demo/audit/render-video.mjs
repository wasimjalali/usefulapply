// Renders the reel to video straight from headless Chrome. No screen recorder.
//
// Chrome's compositor pushes a frame every time the page paints, tagged with a
// timestamp. We record the whole play-through that way, then resample those
// frames onto a constant grid, so the output is exactly FPS frames per second
// with no drift, whatever the capture rate did in the moment. Static holds send
// no frames at all, which is correct: the resampler just repeats the last one.
//
// Virtual time is not used: Page.captureScreenshot waits for a new frame and
// paused virtual time never produces one, so the two deadlock.
//
// The page's own audio is muted during capture and reel-audio.mp3 is muxed in
// after, which is the track the timeline was generated against, so picture and
// sound line up by construction.
//
//   node audit/render-video.mjs [fps]
//
// Writes useful-apply-reel.mp4, useful-apply-reel.webm and reel-poster.jpg.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE_URL = 'http://localhost:8793/useful-apply-reel.html?rec';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = Number(process.argv[2]) || 30;
const W = 1920, H = 1080;

const profile = mkdtempSync(join(tmpdir(), 'reel-render-'));
const frameDir = mkdtempSync(join(tmpdir(), 'reel-frames-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', '--no-first-run',
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-gpu-vsync', '--disable-frame-rate-limit',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
    if (m) res(m[1]);
  });
  chrome.on('exit', () => rej(new Error('chrome exited early')));
  setTimeout(() => rej(new Error('chrome ws timeout')), 15000);
});

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
let onFrame = null;
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    return;
  }
  if (msg.method === 'Page.screencastFrame' && onFrame) onFrame(msg.params);
};
const raw = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
});

const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => raw(m, p, sessionId);
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',
  { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

await send('Page.navigate', { url: PAGE_URL });
await new Promise(r => setTimeout(r, 2500));
await evaluate(`document.fonts.ready.then(() => 1)`);
await evaluate(`(() => { const b = document.getElementById('bed'); if (b) b.muted = true; return 1; })()`);
const dur = await evaluate(`window.DUR ?? 64000`);
const total = Math.round((dur / 1000) * FPS);
console.log(`capturing ${(dur / 1000).toFixed(1)}s, resampling to ${FPS}fps = ${total} frames`);

// ── Capture ─────────────────────────────────────────────────────────────────
const shots = [];   // { ts (s), path }
let seq = 0;
onFrame = (p) => {
  const path = join(frameDir, `c-${String(seq++).padStart(6, '0')}.png`);
  writeFileSync(path, Buffer.from(p.data, 'base64'));
  shots.push({ ts: p.metadata.timestamp, path });
  send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
};

await send('Page.startScreencast', { format: 'png', maxWidth: W, maxHeight: H, everyNthFrame: 1 });
await new Promise(r => setTimeout(r, 400));
const gateAt = shots.length;                       // frames before play starts
await evaluate(`document.getElementById('gate').click(); 1`);

const t0 = Date.now();
const deadline = dur + 2000;
while (Date.now() - t0 < deadline) {
  await new Promise(r => setTimeout(r, 1000));
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  if (Number(el) % 10 === 0) console.log(`  ${el}s / ${(deadline / 1000).toFixed(0)}s, ${shots.length} frames captured`);
}
await send('Page.stopScreencast');
await new Promise(r => setTimeout(r, 300));
onFrame = null;

const played = shots.slice(gateAt);
if (!played.length) throw new Error('no frames captured after the gate click');
const origin = played[0].ts;
const span = played.at(-1).ts - origin;
console.log(`captured ${played.length} frames over ${span.toFixed(2)}s (~${(played.length / span).toFixed(0)}fps)`);
if (span < dur / 1000 - 1) throw new Error(`capture is short: ${span.toFixed(1)}s of ${(dur / 1000).toFixed(1)}s`);

// ── Resample onto a constant grid ───────────────────────────────────────────
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', 'pipe:0',
  ...(existsSync(join(ROOT, 'reel-audio.mp3')) ? ['-i', join(ROOT, 'reel-audio.mp3')] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  ...(existsSync(join(ROOT, 'reel-audio.mp3')) ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []),
  join(ROOT, 'useful-apply-reel.mp4'),
], { stdio: ['pipe', 'inherit', 'inherit'] });

const write = (buf) => new Promise((res) => {
  if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res);
});

let cursor = 0, lastPath = played[0].path, reused = 0;
for (let i = 0; i < total; i++) {
  const want = origin + i / FPS;
  while (cursor + 1 < played.length && played[cursor + 1].ts <= want) cursor++;
  const path = played[cursor].ts <= want ? played[cursor].path : lastPath;
  if (path === lastPath && i > 0) reused++;
  lastPath = path;
  await write(readFileSync(path));
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('exit', (c) => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
console.log(`mp4 written (${reused} of ${total} output frames repeat a held frame)`);

try { await raw('Browser.close'); } catch {}
chrome.kill('SIGKILL');
// Chrome can still be flushing its profile as it dies; a failed tidy-up is not
// a failed render, so never let it take the run down.
await new Promise(r => setTimeout(r, 500));
for (const d of [profile, frameDir]) {
  try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

// ── WebM plus a poster frame ────────────────────────────────────────────────
const run = (cmd, args) => new Promise((res, rej) => {
  spawn(cmd, args, { stdio: 'inherit' }).on('exit', (c) => c === 0 ? res() : rej(new Error(`${cmd} exit ${c}`)));
});
const mp4 = join(ROOT, 'useful-apply-reel.mp4');
await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4,
  '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1',
  '-c:a', 'libopus', '-b:a', '96k', join(ROOT, 'useful-apply-reel.webm')]);
await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-ss', '00:00:05',
  '-frames:v', '1', '-q:v', '3', join(ROOT, 'reel-poster.jpg')]);
console.log('webm and poster written');
