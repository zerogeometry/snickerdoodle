import { createElement as el } from 'react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

/**
 * The Snickerdoodle back-of-card MARK for the print's outer-rear panel: the brand wordmark
 * (Fraunces, the display face) + the "keep the magic" tagline, set on a soft oat chip so it stays
 * legible over a white back OR a full-width design wrapping onto the rear. Rendered once per width
 * and cached; transparent surround. Same satori+resvg stack as the inside message — no new runtime.
 */
const req = createRequire(import.meta.url);
// Static Fraunces (satori rejects the variable face); the same brand display font the UI wordmark uses.
const FRAUNCES = {
  semibold: '@fontsource/fraunces/files/fraunces-latin-600-normal.woff',
  italic: '@fontsource/fraunces/files/fraunces-latin-500-italic.woff',
};
let fontCache: { name: string; data: Buffer; weight: 400 | 500 | 600; style: 'normal' | 'italic' }[] | null = null;
function fonts() {
  fontCache ??= [
    { name: 'Fraunces', data: readFileSync(req.resolve(FRAUNCES.semibold)), weight: 600, style: 'normal' },
    { name: 'Fraunces', data: readFileSync(req.resolve(FRAUNCES.italic)), weight: 500, style: 'italic' },
  ];
  return fontCache;
}

const COCOA = '#2E2723'; // brand text (never pure black)
const CINNAMON = '#C8623A';
const OAT = '#FBF5E9';

const cache = new Map<number, Buffer>();

/** The back mark as a transparent PNG `widthPx` wide (height derived). Cached per width. */
export async function renderCardBackBadge(widthPx: number): Promise<Buffer> {
  const hit = cache.get(widthPx);
  if (hit) return hit;
  const w = widthPx;
  const h = Math.round(w * 0.42);
  const node = el(
    'div',
    { style: { display: 'flex', width: w, height: h, alignItems: 'center', justifyContent: 'center' } },
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: OAT,
          borderRadius: Math.round(w * 0.07),
          padding: `${Math.round(h * 0.15)}px ${Math.round(w * 0.06)}px`,
          fontFamily: 'Fraunces',
        },
      },
      el('div', { style: { display: 'flex', fontSize: Math.round(w * 0.105), fontWeight: 600, color: COCOA, letterSpacing: -1 } }, 'snickerdoodle'),
      el('div', { style: { display: 'flex', fontSize: Math.round(w * 0.072), fontStyle: 'italic', fontWeight: 500, color: CINNAMON, marginTop: Math.round(h * 0.05) } }, 'keep the magic'),
    ),
  );
  const svg = await satori(node, { width: w, height: h, fonts: fonts() });
  const png = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: w }, background: 'rgba(0,0,0,0)' }).render().asPng());
  cache.set(widthPx, png);
  return png;
}
