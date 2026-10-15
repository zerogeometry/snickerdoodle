import { createElement as el } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp, { type OverlayOptions } from 'sharp';
import { SHAPE_PATHS, TEXT_LINE_HEIGHT, type StudioObject } from '@/lib/studio-objects';
import { loadCardFontWoff } from './cardFonts';

/**
 * Draw the Studio's added things (text, shapes, pen strokes) onto a design at its FULL resolution
 * — vectors rendered at the final pixel size, so words and lines stay crisp on a blanket. Text uses
 * the same font files as the greetings cards (satori → resvg), so what was typed is what prints.
 * Objects are composited in order (later = on top) and clipped to the design.
 */
export async function renderStudioObjects(
  design: Buffer,
  frame: { gw: number; gh: number; cropX: number; cropY: number },
  objects: StudioObject[],
): Promise<Buffer> {
  if (objects.length === 0) return design;
  const meta = await sharp(design).metadata();
  const W = meta.width!, H = meta.height!;
  const S = Math.min(frame.gw, frame.gh);
  const toPx = (u: number, v: number): [number, number] => [u * frame.gw - frame.cropX, v * frame.gh - frame.cropY];

  const layers: OverlayOptions[] = [];
  for (const o of objects) {
    let png: Buffer | null = null;
    let cx = 0, cy = 0;
    if (o.type === 'text') {
      png = await renderText(o.text, o.font, o.colour, Math.max(4, o.size * S));
      [cx, cy] = toPx(o.x, o.y);
      if (o.rotation) png = await rotate(png, o.rotation);
    } else if (o.type === 'shape') {
      png = await renderShape(o.shape, o.fill, o.outline, Math.max(2, o.w * S), Math.max(2, o.h * S));
      [cx, cy] = toPx(o.x, o.y);
      if (o.rotation) png = await rotate(png, o.rotation);
    } else {
      const r = await renderStroke(o, S, toPx);
      if (r) layers.push(...(await clipAsync(r.png, r.left, r.top, r.w, r.h, W, H)));
      continue;
    }
    const m = await sharp(png).metadata();
    const left = Math.round(cx - m.width! / 2), top = Math.round(cy - m.height! / 2);
    layers.push(...(await clipAsync(png, left, top, m.width!, m.height!, W, H)));
  }
  return sharp(design).ensureAlpha().composite(layers).png({ compressionLevel: 6 }).toBuffer();
}

async function rotate(png: Buffer, deg: number): Promise<Buffer> {
  return sharp(png).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/** Lay a layer at (left, top), cropping off any part outside the W×H design. */
async function clipAsync(png: Buffer, left: number, top: number, w: number, h: number, W: number, H: number): Promise<OverlayOptions[]> {
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(W, left + w), y1 = Math.min(H, top + h);
  if (x1 <= x0 || y1 <= y0) return [];
  if (x0 === left && y0 === top && x1 === left + w && y1 === top + h) return [{ input: png, left, top }];
  const part = await sharp(png).extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  return [{ input: part, left: x0, top: y0 }];
}

async function renderText(text: string, font: Parameters<typeof loadCardFontWoff>[0], colour: string, fontPx: number): Promise<Buffer> {
  const lines = text.split('\n');
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const w = Math.ceil(longest * fontPx * 0.85 + fontPx * 2);
  const h = Math.ceil(lines.length * fontPx * TEXT_LINE_HEIGHT + fontPx);
  const node = el(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: w, height: h, fontFamily: font, color: colour, fontSize: fontPx, lineHeight: TEXT_LINE_HEIGHT } },
    ...lines.map((l, i) => el('div', { key: i, style: { display: 'flex', whiteSpace: 'pre' } }, l || ' ')),
  );
  const svg = await satori(node, { width: w, height: h, fonts: [{ name: font, data: loadCardFontWoff(font), weight: 400, style: 'normal' }] });
  const png = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng());
  // tight box, so its centre is the text's centre (matches the browser's measured box)
  return sharp(png).trim({ threshold: 1 }).png().toBuffer().catch(() => png);
}

async function renderShape(shape: keyof typeof SHAPE_PATHS, fill: string, outline: boolean, w: number, h: number): Promise<Buffer> {
  const pad = outline ? Math.max(2, Math.min(w, h) * 0.04) : 0;
  const W = Math.ceil(w + pad * 2), H = Math.ceil(h + pad * 2);
  const sw = outline ? (Math.min(w, h) * 0.05 * 100) / Math.min(w, h) : 0; // ~5% of the shape, in box units
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${-pad * (100 / w)} ${-pad * (100 / h)} ${100 + (2 * pad * 100) / w} ${100 + (2 * pad * 100) / h}" preserveAspectRatio="none">
    <path d="${SHAPE_PATHS[shape]}" fill="${fill}" fill-rule="evenodd" ${outline ? `stroke="#2b2118" stroke-width="${sw}" stroke-linejoin="round"` : ''}/></svg>`;
  return Buffer.from(new Resvg(svg).render().asPng());
}

/** A pressure-varying pen line, as round-capped segments (clipped to the design by the caller). */
async function renderStroke(
  o: Extract<StudioObject, { type: 'stroke' }>,
  S: number,
  toPx: (u: number, v: number) => [number, number],
): Promise<{ png: Buffer; left: number; top: number; w: number; h: number } | null> {
  const base = Math.max(1, o.width * S);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < o.points.length; i += 3) {
    const [x, y] = toPx(o.points[i]!, o.points[i + 1]!);
    pts.push([x, y, base * (0.5 + o.points[i + 2]!)]);
  }
  if (!pts.length) return null;
  const maxW = Math.max(...pts.map((p) => p[2]));
  const minX = Math.floor(Math.min(...pts.map((p) => p[0])) - maxW), minY = Math.floor(Math.min(...pts.map((p) => p[1])) - maxW);
  const maxX = Math.ceil(Math.max(...pts.map((p) => p[0])) + maxW), maxY = Math.ceil(Math.max(...pts.map((p) => p[1])) + maxW);
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const segs =
    pts.length === 1
      ? `<circle cx="${pts[0]![0] - minX}" cy="${pts[0]![1] - minY}" r="${pts[0]![2] / 2}" fill="${o.colour}"/>`
      : pts
          .slice(1)
          .map((p, i) => {
            const q = pts[i]!;
            return `<line x1="${(q[0] - minX).toFixed(2)}" y1="${(q[1] - minY).toFixed(2)}" x2="${(p[0] - minX).toFixed(2)}" y2="${(p[1] - minY).toFixed(2)}" stroke-width="${((q[2] + p[2]) / 2).toFixed(2)}"/>`;
          })
          .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g stroke="${o.colour}" stroke-linecap="round" fill="none">${segs}</g></svg>`;
  const png = Buffer.from(new Resvg(svg).render().asPng());
  return { png, left: minX, top: minY, w, h };
}
