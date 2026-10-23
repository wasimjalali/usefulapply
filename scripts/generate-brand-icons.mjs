// One-off generator for the Useful Apply "Page-U" brand icon set.
// Renders the standalone Page-U mark (light theme) to every favicon / icon
// PNG, the email logo, the ICO container and src/app/icon.svg.
//
// Usage: node scripts/generate-brand-icons.mjs
// Rerun whenever the mark changes. sharp cannot emit ICO, so the ICO
// directory is assembled here around raw PNG payloads (valid per spec).

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const APP_DIR = path.join(ROOT, 'src', 'app');

// The Page-U drawing, identical to src/components/BrandLogo.tsx.
// Sheet: x 7-25, y 3-28 in the 32x32 reference grid.
const PAGE_PATH = 'M7 3 h12 l6 6 v10 c0 5 -4 9 -9 9 s-9 -4 -9 -9 Z';
const FOLD_PATH = 'M19 3 l6 6 h-6 Z';
const U_PATH = 'M12 12 v6.5 a4 4 0 0 0 8 0 V12';

// Light theme tokens.
const COLORS = { page: '#1E3A5F', fold: '#D4A853', carve: '#FEFDFB' };
const CREAM = '#FEFDFB';

function iconSvg({ size, background = null }) {
  const rect = background
    ? `<rect width="32" height="32" fill="${background}"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" ` +
    `width="${size}" height="${size}">${rect}` +
    `<path d="${PAGE_PATH}" fill="${COLORS.page}"/>` +
    `<path d="${FOLD_PATH}" fill="${COLORS.fold}"/>` +
    `<path d="${U_PATH}" stroke="${COLORS.carve}" stroke-width="2.6" ` +
    `stroke-linecap="round" fill="none"/>` +
    `</svg>`
  );
}

async function transparentPng(size) {
  return sharp(Buffer.from(iconSvg({ size }))).png().toBuffer();
}

// Mark centered on a solid square. iOS ignores transparency in touch icons
// and email clients paint their own background, so those get CREAM tiles.
// ~12% padding each side keeps the sheet clear of the tile edge.
async function tiledPng(size, background) {
  const inner = Math.round(size * 0.76);
  const mark = await sharp(Buffer.from(iconSvg({ size: inner })))
    .png()
    .toBuffer();
  const inset = Math.round((size - inner) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: mark, left: inset, top: inset }])
    .png()
    .toBuffer();
}

// ICO container whose entries embed PNG bytes (PNG-in-ICO, Vista+).
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0); // 0 means 256
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt8(0, 2); // palette colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([
    header,
    ...entries,
    ...images.map((image) => image.data),
  ]);
}

async function writeOutput(filePath, data) {
  await writeFile(filePath, data);
  console.log(`wrote ${path.relative(ROOT, filePath)} (${data.length} bytes)`);
}

async function main() {
  const transparentSizes = [16, 32, 192, 512];
  for (const size of transparentSizes) {
    await writeOutput(
      path.join(PUBLIC_DIR, `favicon-${size}x${size}.png`),
      await transparentPng(size),
    );
  }
  for (const size of [192, 512]) {
    await writeOutput(
      path.join(PUBLIC_DIR, `icon-${size}.png`),
      await transparentPng(size),
    );
  }

  await writeOutput(
    path.join(PUBLIC_DIR, 'apple-touch-icon.png'),
    await tiledPng(180, CREAM),
  );

  // Email logo: rendered at 48/56px with border-radius 12px, plain tile is fine.
  await writeOutput(
    path.join(PUBLIC_DIR, 'useful-apply-logo.png'),
    await tiledPng(512, CREAM),
  );

  const icoImages = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, data: await transparentPng(size) });
  }
  await writeOutput(path.join(APP_DIR, 'favicon.ico'), buildIco(icoImages));

  await writeOutput(
    path.join(APP_DIR, 'icon.svg'),
    `${iconSvg({ size: 32 })}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
