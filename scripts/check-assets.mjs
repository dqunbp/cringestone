import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CARDS, HEROES } from '../src/core/catalog.ts';

const root = new URL('../public/', import.meta.url);
const images = [...new Set([
  ...Object.values(CARDS).map(card => card.art),
  ...Object.values(HEROES).map(hero => hero.art),
  '/assets/card-back.png', '/assets/board/tavern.png',
])];
const errors = [];
let bytes = 0;
for (const image of images) {
  try {
    const content = await readFile(new URL(image.slice(1), root));
    if (!content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error('Expected a PNG file');
    }
    const width = content.readUInt32BE(16);
    const height = content.readUInt32BE(20);
    if (width < 512 || height < 512) throw new Error(`Image too small: ${width}×${height}`);
    bytes += content.length;
  } catch (error) { errors.push(`${image}: ${error.message}`); }
}
for (const font of ['heading.ttf', 'body.ttf', 'Alegreya-OFL.txt', 'GolosText-OFL.txt']) {
  try { await readFile(new URL(`assets/fonts/${font}`, root)); }
  catch (error) { errors.push(`${font}: ${error.message}`); }
}
if (errors.length) {
  console.error(`Asset validation failed in ${fileURLToPath(root)}:\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${images.length} original PNG images verified (${(bytes / 1024 / 1024).toFixed(1)} MiB); local fonts and licenses present.`);
}
