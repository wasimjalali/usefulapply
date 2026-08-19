// Renders every .dc.html in a folder to PNG at 1440x900. Usage: node shoot.mjs <srcDir> <outDir>
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
const require = createRequire('/Users/wasimjalali/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/package.json');
const { chromium } = require('/Users/wasimjalali/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const [src, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.dc.html')).sort();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const f of files) {
  await page.goto('file://' + join(src, f));
  await page.waitForTimeout(150);
  const name = basename(f, '.dc.html') + '.png';
  await page.screenshot({ path: join(out, name), type: 'png' });
  console.log('shot', name);
}
await browser.close();
