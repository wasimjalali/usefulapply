// Minimal CDP driver for the reel audits. No dependencies: Node 22's built-in
// WebSocket talks to headless Chrome over the DevTools protocol.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch(viewport = { width: 1920, height: 1080 }) {
  const profile = mkdtempSync(join(tmpdir(), 'reel-audit-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run',
    `--window-size=${viewport.width},${viewport.height}`, '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) res(m[1]);
    });
    proc.on('exit', () => rej(new Error('chrome exited early')));
    setTimeout(() => rej(new Error('chrome ws timeout')), 15000);
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  // headless=new still reserves browser chrome from --window-size; override the
  // viewport so screenshots are exactly the stage size.
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
  }, sessionId);
  const page = {
    sessionId,
    send: (m, p) => send(m, p, sessionId),
    async goto(url) {
      await this.send('Page.navigate', { url });
      await new Promise(r => setTimeout(r, 1200));
      await this.eval('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1');
    },
    async eval(expression) {
      const r = await this.send('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true,
      });
      if (r.exceptionDetails) {
        throw new Error('page eval failed: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      }
      return r.result.value;
    },
    async shot() {
      const r = await this.send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(r.data, 'base64');
    },
  };
  const close = async () => {
    try { await send('Browser.close'); } catch {}
    proc.kill('SIGKILL');
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  return { page, close };
}
