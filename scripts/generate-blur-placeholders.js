#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BLOG_DIR = path.join(import.meta.dirname, '../public/blog');
const OUTPUT_FILE = path.join(import.meta.dirname, '../src/lib/blog/blur-data.ts');

async function generateBlurDataUrl(filePath) {
  const image = sharp(filePath);

  // Generate tiny blurred version (10px wide)
  const buffer = await image
    .resize(10, null, { fit: 'inside' })
    .blur(2)
    .toBuffer();

  // Convert to base64 data URL
  const base64 = buffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

async function main() {
  console.log('🎨 Generating blur placeholders for blog images\n');

  // Get all JPG files
  const files = await fs.promises.readdir(BLOG_DIR);
  const jpgFiles = files
    .filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'))
    .sort();

  console.log(`Found ${jpgFiles.length} images\n`);

  const blurData = {};

  for (const file of jpgFiles) {
    const filePath = path.join(BLOG_DIR, file);
    const blurDataUrl = await generateBlurDataUrl(filePath);
    blurData[file] = blurDataUrl;
    console.log(`✓ ${file}`);
  }

  // Generate TypeScript file
  const tsContent = `// Auto-generated blur placeholders for blog images
// Generated: ${new Date().toISOString()}

export const blurDataUrls: Record<string, string> = ${JSON.stringify(blurData, null, 2)};

export function getBlurDataUrl(imagePath: string): string | undefined {
  const fileName = imagePath.split('/').pop();
  return fileName ? blurDataUrls[fileName] : undefined;
}
`;

  await fs.promises.writeFile(OUTPUT_FILE, tsContent, 'utf-8');

  console.log(`\n✅ Generated blur data for ${jpgFiles.length} images`);
  console.log(`📝 Output: ${OUTPUT_FILE}`);
}

main().catch(console.error);
