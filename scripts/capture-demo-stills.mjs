// Recapture the four landing stills from the product reel at 2x
// (3840x2160), then encode sharp WebP. Run with the Next dev server up:
//   node scripts/capture-demo-stills.mjs
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = 'http://localhost:3000/demo/useful-apply-reel.html?rec';
const OUT = join(ROOT, 'public/images/demo');

// Played-timeline ms (CUES already divide by --rate). Frames sit on a
// settled product screen, away from click/camera windows, cursor hidden.
const STILLS = [
  // Crops are 2x pixels on the 1920x1080 stage. Each still is the one pane
  // that moment is about, so the landing walkthrough stays readable at 1280.
  { name: 'still-find', ms: 11500, crop: { left: 1950, top: 0, width: 1890, height: 980 } },
  { name: 'still-fit', ms: 20500, crop: { left: 470, top: 220, width: 1460, height: 920 } },
  { name: 'still-kit', ms: 35000, crop: { left: 1950, top: 0, width: 1890, height: 1040 } },
  { name: 'still-track', ms: 57500, crop: { left: 1568, top: 0, width: 2272, height: 1100 } },
];

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((ok, fail) => {
      this.ws.addEventListener('open', ok, { once: true });
      this.ws.addEventListener('error', fail, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
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
  close() {
    this.ws.close();
  }
}

async function launch() {
  const profile = await mkdtemp(join(tmpdir(), 'demo-stills-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--window-size=1920,1080',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  const browserWs = await new Promise((resolveWs, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome did not expose CDP. ${stderr}`)), 20000);
    chrome.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      resolveWs(match[1]);
    });
    chrome.once('exit', (code) => reject(new Error(`Chrome exited with ${code}. ${stderr}`)));
  });

  const cdp = new Cdp(browserWs);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => {
    const id = cdp.nextId++;
    const answer = new Promise((resolve, reject) => cdp.pending.set(id, { resolve, reject }));
    cdp.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return answer;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    mobile: false,
  });

  return {
    send,
    async close() {
      try { await cdp.send('Browser.close'); } catch { /* already gone */ }
      chrome.kill('SIGKILL');
      await rm(profile, { recursive: true, force: true });
    },
  };
}

const page = await launch();
try {
  await page.send('Page.navigate', { url: PAGE });
  await page.send('Runtime.evaluate', {
    expression: `new Promise((r) => {
      if (document.readyState === 'complete') r(1);
      else addEventListener('load', () => r(1), { once: true });
    })`,
    awaitPromise: true,
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.send('Runtime.evaluate', {
    expression: `(() => {
      const gate = document.getElementById('gate');
      if (gate) gate.style.display = 'none';
      const hud = document.getElementById('hud');
      if (hud) hud.classList.add('hide');
      const cursor = document.getElementById('cursor');
      if (cursor) cursor.style.display = 'none';
      return document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1;
    })()`,
    awaitPromise: true,
  });

  for (const still of STILLS) {
    await page.send('Runtime.evaluate', {
      expression: `seek(${still.ms}); 'ok'`,
      awaitPromise: true,
    });
    await page.send('Runtime.evaluate', {
      expression: `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`,
      awaitPromise: true,
    });
    await new Promise((r) => setTimeout(r, 120));
    const shot = await page.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    const png = Buffer.from(shot.data, 'base64');
    const meta = await sharp(png).metadata();
    const dest = join(OUT, `${still.name}.webp`);
    await sharp(png)
      .extract(still.crop)
      .webp({ quality: 90, effort: 6, smartSubsample: false, lossless: true })
      .toFile(dest);
    const { size } = await stat(dest);
    console.log(
      `${still.name}  png ${meta.width}x${meta.height}  webp ${(size / 1024).toFixed(0)}KB  q90`
    );
  }
} finally {
  await page.close();
}
