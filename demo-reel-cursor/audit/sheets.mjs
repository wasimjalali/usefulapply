// Builds the frame index and shoots contact sheets, 16 frames per sheet.
import { launch } from './cdp.mjs';
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const dir = new URL('./frames/', import.meta.url);
const files = readdirSync(dir).filter(f => /^f-\d+\.png$/.test(f)).sort();
writeFileSync(new URL('./frames/index.json', import.meta.url), JSON.stringify(files));
console.log(`frames: ${files.length}`);

mkdirSync(new URL('./sheets/', import.meta.url), { recursive: true });
const { page, close } = await launch({ width: 1920, height: 1220 });
const PER = 16;
for (let o = 0; o < files.length; o += PER) {
  const dest = new URL(`./sheets/sheet-${String(o / PER).padStart(2, '0')}.png`, import.meta.url);
  if (existsSync(dest)) continue;
  await page.goto(`http://localhost:8793/audit/sheets.html?o=${o}&n=${PER}`);
  await page.eval(`new Promise(r => { const iv = setInterval(() => { if (window.__ready) { clearInterval(iv); r(1); } }, 50); setTimeout(r, 10000); })`);
  const png = await page.shot();
  writeFileSync(dest, png);
}
await close();
console.log(`sheets: ${Math.ceil(files.length / PER)}`);
