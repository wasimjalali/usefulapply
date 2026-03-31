#!/usr/bin/env node

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '../public/blog');
const TARGET_QUALITY = 85;
const TARGET_MAX_WIDTH = 1920; // Max width for blog images

async function getFileSize(filePath) {
  const stats = await fs.promises.stat(filePath);
  return stats.size;
}

function formatBytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function compressImage(filePath) {
  const fileName = path.basename(filePath);
  const originalSize = await getFileSize(filePath);

  console.log(`\nCompressing: ${fileName}`);
  console.log(`  Original size: ${formatBytes(originalSize)}`);

  // Read the image
  const image = sharp(filePath);
  const metadata = await image.metadata();

  // Resize if larger than target width
  let pipeline = sharp(filePath);
  if (metadata.width > TARGET_MAX_WIDTH) {
    pipeline = pipeline.resize(TARGET_MAX_WIDTH, null, {
      withoutEnlargement: true,
      fit: 'inside'
    });
    console.log(`  Resizing from ${metadata.width}px to ${TARGET_MAX_WIDTH}px width`);
  }

  // Compress
  pipeline = pipeline.jpeg({
    quality: TARGET_QUALITY,
    progressive: true,
    mozjpeg: true
  });

  // Write to temporary file
  const tempPath = filePath + '.tmp';
  await pipeline.toFile(tempPath);

  const compressedSize = await getFileSize(tempPath);
  const savings = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

  console.log(`  Compressed size: ${formatBytes(compressedSize)}`);
  console.log(`  Savings: ${savings}%`);

  // Replace original with compressed version
  await fs.promises.rename(tempPath, filePath);

  return {
    fileName,
    originalSize,
    compressedSize,
    savings: parseFloat(savings)
  };
}

async function main() {
  console.log('🖼️  Blog Image Compression Tool');
  console.log('================================\n');
  console.log(`Target quality: ${TARGET_QUALITY}%`);
  console.log(`Max width: ${TARGET_MAX_WIDTH}px`);
  console.log(`Directory: ${BLOG_DIR}\n`);

  // Get all JPG files
  const files = await fs.promises.readdir(BLOG_DIR);
  const jpgFiles = files
    .filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'))
    .map(f => path.join(BLOG_DIR, f));

  console.log(`Found ${jpgFiles.length} images to compress\n`);

  // Compress all images
  const results = [];
  for (const file of jpgFiles) {
    try {
      const result = await compressImage(file);
      results.push(result);
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }

  // Summary
  console.log('\n================================');
  console.log('📊 Compression Summary\n');

  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalCompressed = results.reduce((sum, r) => sum + r.compressedSize, 0);
  const totalSavings = ((totalOriginal - totalCompressed) / totalOriginal * 100).toFixed(1);

  console.log(`Total original size: ${formatBytes(totalOriginal)}`);
  console.log(`Total compressed size: ${formatBytes(totalCompressed)}`);
  console.log(`Total savings: ${totalSavings}%`);
  console.log(`\n✅ Successfully compressed ${results.length} images!`);
}

main().catch(console.error);
