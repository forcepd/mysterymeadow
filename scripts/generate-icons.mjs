// Renders public/icons/favicon.svg into the PNG icons used by the PWA manifest and iOS.
// Run with `npm run icons` after changing the SVG; the PNGs are committed.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const dir = resolve(import.meta.dirname, '../public/icons');
const svg = await readFile(resolve(dir, 'favicon.svg'));

const plain = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];
for (const [name, size] of plain) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .flatten({ background: '#7cc46a' })
    .png()
    .toFile(resolve(dir, name));
}

// Maskable: keep the artwork inside the 80% safe zone on a full-bleed background.
const inner = await sharp(svg, { density: 300 }).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#7cc46a' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(resolve(dir, 'icon-maskable-512.png'));

console.log('Icons written to', dir);
