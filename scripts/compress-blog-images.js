#!/usr/bin/env node

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const BLOG_DIR = path.join(__dirname, '../public/blog');

const imagesToCompress = [
  'master-cv-concept-diagram.jpg',
  'master-cv-build-process.jpg',
  'master-cv-vs-tailored-cv.jpg',
  'german-american-cv-differences.jpg',
  'german-american-cv-checklist.jpg',
  'cv-format-decision-tree.jpg',
  'ai-resume-ethics-spectrum.jpg',
  'karko-ai-safeguards.jpg',
  'job-search-pressure-balance.jpg',
];

async function compressImages() {
  console.log('Compressing blog images...\n');

  for (const filename of imagesToCompress) {
    const inputPath = path.join(BLOG_DIR, filename);
    const tempPath = path.join(BLOG_DIR, `${filename}.tmp`);

    try {
      // Get original size
      const originalStats = fs.statSync(inputPath);
      const originalSizeKB = (originalStats.size / 1024).toFixed(1);

      // Compress image
      await sharp(inputPath)
        .resize(1200, null, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80, progressive: true })
        .toFile(tempPath);

      // Get compressed size
      const compressedStats = fs.statSync(tempPath);
      const compressedSizeKB = (compressedStats.size / 1024).toFixed(1);
      const savings = ((1 - compressedStats.size / originalStats.size) * 100).toFixed(1);

      // Replace original with compressed
      fs.renameSync(tempPath, inputPath);

      console.log(`✓ ${filename}`);
      console.log(`  ${originalSizeKB} KB → ${compressedSizeKB} KB (${savings}% reduction)`);
    } catch (error) {
      console.error(`✗ ${filename}: ${error.message}`);
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }

  console.log('\n✅ Blog image compression completed!');
}

compressImages().catch(console.error);
