import './sharp-init';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { artWindowOf, computeLayerRect, type TemplateGeom, type Transform } from './geometry';
import { visibleLayerPart } from './visibleLayer';

/**
 * An ART-WINDOW product's printed face (today the christmas sack — geometry.ts artWindowOf): Prodigi's
 * whole file, white (unprinted), with the drawing placed inside the print box by the shared geometry and
 * a base colour (if any) filling the box only. ONE function for the order's print file (render.ts) and the
 * mockup's face (compositor.ts), so preview == print. `scale` < 1 renders the same face smaller.
 */
export async function renderArtWindowFace(
  srcBuf: Buffer,
  productKey: string,
  t: TemplateGeom,
  transform: Transform,
  opts: { scale?: number; groundHex?: string | null } = {},
): Promise<{ pipeline: Sharp; width: number; height: number }> {
  const s = opts.scale ?? 1;
  const W = Math.max(1, Math.round(t.printWidthPx * s));
  const H = Math.max(1, Math.round(t.printHeightPx * s));
  const win = artWindowOf(productKey, { printWidthPx: W, printHeightPx: H, bleedMm: 0, requiredDpi: t.requiredDpi * s });
  if (!win) throw new Error(`${productKey} has no art window`);
  const meta = await sharp(srcBuf).metadata();
  if (!meta.width || !meta.height) throw new Error('unreadable source image');
  const src = { width: meta.width, height: meta.height };
  const rect = computeLayerRect(win.geom, src, transform);
  // cut from the source BEFORE resizing — a big zoomed layer is never decoded whole (sweep 03-B3)
  const { part, left, top } = await visibleLayerPart(srcBuf, src, rect);
  const layers: OverlayOptions[] = [];
  const ground = opts.groundHex && opts.groundHex.toLowerCase() !== '#ffffff' ? opts.groundHex : null;
  if (ground) layers.push({ input: { create: { width: win.geom.printWidthPx, height: win.geom.printHeightPx, channels: 3, background: ground } }, left: win.x, top: win.y });
  layers.push({ input: part, left: win.x + left, top: win.y + top });
  const pipeline = sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(layers).flatten({ background: '#ffffff' });
  return { pipeline, width: W, height: H };
}
