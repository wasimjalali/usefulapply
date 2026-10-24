#!/usr/bin/env node
/**
 * Design token check, run by `npm run lint`.
 *
 * UI code takes its colors, radii and gradients from the role tokens in src/app/globals.css
 * (`bg-surface`, `text-ink`, `rounded-card`...), never from palette names or literals. This
 * flags, per file:
 *
 *   color-class    palette-named color utilities: navy, cream, gold, sage, charcoal, warm-gray,
 *                  white, black, and every Tailwind default palette (gray, slate, red...).
 *   palette-var    palette variables read directly, such as var(--color-navy-600) or var(--color-red-500).
 *   color-literal  hex, rgb(), rgba(), hsl(), hsla(), oklch(), oklab(), lab(), lch() and hwb() colors,
 *                  arbitrary values included (`shadow-[0_0_0_1px_#fff]`).
 *   radius         rounded-* classes other than the roles (pill, control, card, modal) and none.
 *   gradient       gradient utilities and *-gradient( values.
 *
 * It scans src/components, src/app and src/lib/blog (.ts, .tsx, .css), minus the paths that
 * keep their own colors: CV templates, exports, email templates, the Open Graph image, icons and
 * logos, the web manifest, route handlers, the root error page, blog post content and globals.css
 * itself, which defines the tokens. Comments are ignored.
 *
 * Every hit fails the check.
 *
 *   node scripts/check-design-tokens.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src/components', 'src/app', 'src/lib/blog'];
const EXTENSIONS = /\.(ts|tsx|css)$/;
const SKIP = [
  /^src\/components\/cv-templates\//,
  /^src\/lib\/cv-templates\//,
  /^src\/lib\/services\/export\//,
  /^src\/lib\/email\//,
  /\/opengraph-image\.[a-z]+$/,
  /\/(apple-)?icon\.[a-z]+$/,
  /\/icons?\//,
  /^src\/app\/manifest\.ts$/,
  // Server code: route handlers render no UI, only email bodies, which keep inline colors.
  /^src\/app\/api\//,
  // Logos keep their owners' colors in every theme: third-party marks and the product logo (which has
  // its own light and dark variants).
  /^src\/components\/marketing\/(JobBoardMarks|TrustpilotLogo)\.tsx$/,
  /^src\/components\/BrandLogo\.tsx$/,
  // It replaces the root layout when that crashes, so no app CSS and no role variables load there.
  /^src\/app\/global-error\.tsx$/,
  // Blog post bodies: markdown prose in strings ("numbers get rounded"), not UI code.
  /^src\/lib\/blog\/posts\.ts$/,
  /^src\/app\/globals\.css$/,
];

const PALETTES = [
  'navy', 'cream', 'gold', 'sage',
  'gray', 'slate', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
].join('|');
const COLOR_UTILITIES = [
  'bg', 'text', 'border(?:-[xytrblse])?', 'ring(?:-offset)?', 'inset-ring', 'outline', 'divide',
  'placeholder', 'from', 'via', 'to', 'fill', 'stroke', 'shadow', 'inset-shadow', 'drop-shadow', 'text-shadow',
  'decoration', 'caret', 'accent',
].join('|');
const RADIUS_ROLES = new Set(['pill', 'control', 'card', 'modal', 'none']);

/** Rule name to a global regex. `radius` is filtered further in countHits. */
const RULES = {
  'color-class': new RegExp(`(?<![\\w-])(?:${COLOR_UTILITIES})-(?:(?:${PALETTES})-\\d{2,3}|charcoal|warm-gray|white|black)(?![\\w-])`, 'g'),
  'palette-var': new RegExp(`--color-(?:(?:${PALETTES})-\\d{2,3}|charcoal|warm-gray|white|black)(?![\\w-])`, 'g'),
  // `_` may precede a literal: Tailwind writes spaces in arbitrary values as underscores.
  'color-literal': /(?<![&A-Za-z0-9#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|(?<![A-Za-z0-9-])(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g,
  radius: /(?<![\w-])rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(\[[^\]\s]+\]|\([^)\s]+\)|[a-z0-9]+))?(?![\w-])/g,
  gradient: /(?<![\w-])(?:bg-gradient-[\w-]+|bg-linear-(?:\[[^\]\s]+\]|\([^)\s]+\)|[\w-]+)|bg-(?:radial|conic)(?:-(?:\[[^\]\s]+\]|\([^)\s]+\)|[\w-]+))?)(?![\w-])|(?:repeating-)?(?:linear|radial|conic)-gradient\(/g,
};
const RULE_NAMES = Object.keys(RULES);

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (EXTENSIONS.test(entry.name)) out.push(relative(ROOT, path).split(sep).join('/'));
  }
  return out;
}

/** Blank out comments, keeping line breaks so reported line numbers stay right. */
function stripComments(text, isCss) {
  const blank = (match) => match.replace(/[^\n]/g, ' ');
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  // Line comments: `//` at the start of a line or after whitespace, so `https://` in a string survives.
  if (!isCss) out = out.replace(/(^|[ \t])\/\/.*$/gm, (match, lead) => lead + blank(match.slice(lead.length)));
  return out;
}

/**
 * Hex-looking text that isn't a color: a URL fragment (`/#fff`), or a number after a capitalized word
 * ("Delaware Ave #412", "PR #154"). `solid #000` still counts.
 */
function isNumberNotColor(line, match) {
  if (!match[0].startsWith('#')) return false;
  const before = line.slice(0, match.index);
  if (before.endsWith('/')) return true;
  return /^#\d{3,4}$/.test(match[0]) && /(?:^|[^A-Za-z])[A-Z][A-Za-z]*\.?\s+$/.test(before);
}

/** Every hit in one file: { rule, line, text }. */
function findHits(file) {
  const source = stripComments(readFileSync(join(ROOT, file), 'utf8'), file.endsWith('.css'));
  const lines = source.split('\n');
  const hits = [];
  lines.forEach((line, index) => {
    for (const rule of RULE_NAMES) {
      for (const match of line.matchAll(RULES[rule])) {
        if (rule === 'radius' && match[1] && RADIUS_ROLES.has(match[1])) continue;
        if (rule === 'color-literal' && isNumberNotColor(line, match)) continue;
        hits.push({ rule, line: index + 1, text: match[0] });
      }
    }
  });
  return hits;
}

function scan() {
  const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir), []))
    .filter((file) => !SKIP.some((pattern) => pattern.test(file)))
    .sort();
  const hitsByFile = {};
  for (const file of files) {
    const hits = findHits(file);
    if (hits.length === 0) continue;
    hitsByFile[file] = hits;
  }
  return hitsByFile;
}

const hitsByFile = scan();
const files = Object.keys(hitsByFile);
if (files.length === 0) {
  console.log('design tokens: no hits.');
  process.exit(0);
}
for (const file of files) {
  for (const hit of hitsByFile[file]) console.error(`${file}:${hit.line}  ${hit.rule}  ${hit.text}`);
}
console.error(`design tokens: ${files.reduce((sum, file) => sum + hitsByFile[file].length, 0)} hit(s) in ${files.length} file(s). Use the role tokens in src/app/globals.css (.claude/rules/design-system.md).`);
process.exit(1);
