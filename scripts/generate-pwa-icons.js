#!/usr/bin/env node
// Generates placeholder PWA icons using canvas.
// Run once per project: node scripts/generate-pwa-icons.js
// Replace the outputs with your real branded icons before release.
//
// Requires: npm install canvas

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'frontend', 'public');
const PRIMARY = '#0073ea';
const SIZES = [
  { name: 'icon-192.png',          size: 192, maskable: false },
  { name: 'icon-512.png',          size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true  },
  { name: 'icon-maskable-512.png', size: 512, maskable: true  },
];

for (const { name, size, maskable } of SIZES) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = PRIMARY;
  if (maskable) {
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.beginPath();
    const r = size * 0.2;
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
  }

  // Letter "A"
  const pad = maskable ? size * 0.25 : size * 0.15;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size * 0.5)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A', size / 2, size / 2);

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`✔ ${name} (${size}×${size})`);
}
console.log('\nDone. Replace with real branded icons before release.');
