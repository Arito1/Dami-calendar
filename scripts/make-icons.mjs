// Рисует иконки PWA из SVG-свинки в очках: npm run icons
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { pigShapes, PIG_LIGHT } from '../public/js/pig.js';

const OUT = join(import.meta.dirname, '..', 'public', 'icons');

const gradient = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C9A7FF"/>
      <stop offset="1" stop-color="#E8417F"/>
    </linearGradient>
  </defs>`;

// rounded — для обычной иконки и favicon; full — для maskable и iOS (там скругляет система).
function iconSvg({ rounded, scale }) {
  const offset = (512 - 512 * scale) / 2;
  const bg = rounded
    ? '<rect width="512" height="512" rx="116" fill="url(#bg)"/>'
    : '<rect width="512" height="512" fill="url(#bg)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}${bg}
    <g transform="translate(${offset} ${offset + 10}) scale(${scale})">${pigShapes(PIG_LIGHT)}</g></svg>`;
}

const render = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

await mkdir(OUT, { recursive: true });
const normal = iconSvg({ rounded: true, scale: 0.86 });
const full = iconSvg({ rounded: false, scale: 0.7 });

await writeFile(join(OUT, 'favicon.svg'), normal);
await writeFile(join(OUT, 'icon-192.png'), render(normal, 192));
await writeFile(join(OUT, 'icon-512.png'), render(normal, 512));
await writeFile(join(OUT, 'icon-maskable-512.png'), render(full, 512));
await writeFile(join(OUT, 'apple-touch-icon.png'), render(full, 180));
console.log('Иконки готовы в public/icons');
