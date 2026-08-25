/**
 * Rasterize the Page-U wordmark + tagline into src/app/opengraph-image.jpg.
 * Same paths as src/components/BrandLogo.tsx.
 *
 * Run: node scripts/gen-opengraph.mjs
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const OUT = new URL('../src/app/opengraph-image.jpg', import.meta.url);

const CREAM = '#FEFDFB';
const NAVY = '#0C1929';
const APPLY = '#C4932E';
const PAGE = '#1E3A5F';
const FOLD = '#D4A853';
const CARVE = '#FEFDFB';

const PAGE_PATH = 'M7 3 h12 l6 6 v10 c0 5 -4 9 -9 9 s-9 -4 -9 -9 Z';
const FOLD_PATH = 'M19 3 l6 6 h-6 Z';
const U_PATH = 'M12 12 v6.5 a4 4 0 0 0 8 0 V12';
const PAGE_VIEWBOX = '7 3 18 25';

const FONT_SIZE = 76;
const ICON_H = 82;
const ICON_W = Math.round(ICON_H * (18 / 25));
const GAP = 8;
const TAGLINE_SIZE = 28;
const TAGLINE_GAP = 36;

const FONT_DIR = join(tmpdir(), 'usefulapply-og-fonts');
const BOLD_URL =
  'https://github.com/tokotype/PlusJakartaSans/raw/master/fonts/ttf/PlusJakartaSans-Bold.ttf';
const REG_URL =
  'https://github.com/tokotype/PlusJakartaSans/raw/master/fonts/ttf/PlusJakartaSans-Regular.ttf';

async function fetchFont(url, dest) {
  try {
    readFileSync(dest);
    return;
  } catch {
    /* download */
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Font download failed ${res.status}: ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

mkdirSync(FONT_DIR, { recursive: true });
const boldPath = join(FONT_DIR, 'PlusJakartaSans-Bold.ttf');
const regPath = join(FONT_DIR, 'PlusJakartaSans-Regular.ttf');
await fetchFont(BOLD_URL, boldPath);
await fetchFont(REG_URL, regPath);

const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PAGE_VIEWBOX}" width="${ICON_W}" height="${ICON_H}">
  <path d="${PAGE_PATH}" fill="${PAGE}"/>
  <path d="${FOLD_PATH}" fill="${FOLD}"/>
  <path d="${U_PATH}" stroke="${CARVE}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
</svg>`;

const iconPng = await sharp(Buffer.from(iconSvg)).png().toBuffer();
const iconPath = join(tmpdir(), 'page-u-icon.png');
writeFileSync(iconPath, iconPng);

const py = `
from PIL import Image, ImageDraw, ImageFont

W, H = ${WIDTH}, ${HEIGHT}
cream = "${CREAM}"
navy = "${NAVY}"
gold = "${APPLY}"
font_size = ${FONT_SIZE}
icon_w, icon_h = ${ICON_W}, ${ICON_H}
gap = ${GAP}
tag_size = ${TAGLINE_SIZE}
tag_gap = ${TAGLINE_GAP}

img = Image.new("RGB", (W, H), cream)
draw = ImageDraw.Draw(img)
bold = ImageFont.truetype(${JSON.stringify(boldPath)}, font_size)
reg = ImageFont.truetype(${JSON.stringify(regPath)}, tag_size)

seful = "seful "
apply = "Apply"
tag = "Your entire job search, in one app."

seful_w = draw.textlength(seful, font=bold)
apply_w = draw.textlength(apply, font=bold)
row_w = icon_w + gap + seful_w + apply_w
row_h = max(icon_h, font_size)
tag_w = draw.textlength(tag, font=reg)
block_h = row_h + tag_gap + tag_size

x0 = (W - row_w) / 2
y0 = (H - block_h) / 2

icon = Image.open(${JSON.stringify(iconPath)}).convert("RGBA")
# Sit the sheet on the text baseline: icon bottom aligns with glyph baseline.
ascent, descent = bold.getmetrics()
baseline = y0 + (row_h + ascent - descent) / 2
icon_y = baseline - icon_h + 6
text_y = baseline - ascent
img.paste(icon, (int(x0), int(icon_y)), icon)

draw.text((x0 + icon_w + gap, text_y), seful, font=bold, fill=navy)
draw.text((x0 + icon_w + gap + seful_w, text_y), apply, font=bold, fill=gold)

tag_x = (W - tag_w) / 2
tag_y = y0 + row_h + tag_gap
draw.text((tag_x, tag_y), tag, font=reg, fill=navy)

img.save(${JSON.stringify(new URL(OUT).pathname)}, "JPEG", quality=90, optimize=True, subsampling=1)
print("ok", img.size)
`;

const result = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
process.stdout.write(result.stdout);
