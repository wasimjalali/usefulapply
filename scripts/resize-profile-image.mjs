#!/usr/bin/env node

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const INPUT = path.join(import.meta.dirname, '../public/wasim-founder.jpg');
const OUTPUT_SMALL = path.join(import.meta.dirname, '../public/wasim-avatar.jpg');
const OUTPUT_MEDIUM = path.join(import.meta.dirname, '../public/wasim-profile.jpg');

async function resizeImages() {
  console.log('Resizing profile images...\n');

  // Small avatar (80x80) for inline use
  await sharp(INPUT)
    .resize(80, 80, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 90, progressive: true })
    .toFile(OUTPUT_SMALL);

  const statsSmall = fs.statSync(OUTPUT_SMALL);
  console.log(`✓ Avatar (80x80): ${(statsSmall.size / 1024).toFixed(1)} KB`);

  // Medium profile (200x200) for blog author section
  await sharp(INPUT)
    .resize(200, 200, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 90, progressive: true })
    .toFile(OUTPUT_MEDIUM);

  const statsMedium = fs.statSync(OUTPUT_MEDIUM);
  console.log(`✓ Profile (200x200): ${(statsMedium.size / 1024).toFixed(1)} KB`);

  console.log('\n✅ Profile images resized successfully!');
}

resizeImages().catch(console.error);
