import './sharp-init';
import sharp from 'sharp';
import { frameSlotRects, slotBleedPx, slotPx, type FrameGrid } from '@/lib/multi-photo-frame';
import { computeLayerRect, type Transform } from './geometry';
import { frameSlotGeom } from './pattern-geometry';
import { visibleLayerPart } from './visibleLayer';

/**
 * ONE square of a multi photo frame: the drawing placed on its 60 mm window + bleed (the square's
 * own print geometry, frameSlotGeom) on white — exactly as any print places a drawing. `scale` < 1
 * makes the same tile smaller for a preview (the catalogue tile's printed face); 1 is the print.
 */
export async function renderFrameTile(srcBuf: Buffer, src: { width: number; height: number }, grid: FrameGrid, transform: Transform, scale = 1, dpi = 300): Promise<{ png: Buffer; edge: number }> {
  const rect = computeLayerRect(frameSlotGeom(grid, { requiredDpi: dpi }), src, transform);
  const edge = Math.max(1, Math.round(rect.canvasWidth * scale));
  const shown = scale === 1
    ? rect
    : { ...rect, x: Math.round(rect.x * scale), y: Math.round(rect.y * scale), width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)), canvasWidth: edge, canvasHeight: edge };
  const { part, left, top } = await visibleLayerPart(srcBuf, src, shown);
  const png = await sharp({ create: { width: edge, height: edge, channels: 3, background: '#ffffff' } })
    .composite([{ input: part, left, top }])
    .flatten({ background: '#ffffff' })
    .png()
    .withMetadata({ density: dpi })
    .toBuffer();
  return { png, edge };
}

/**
 * The MULTI PHOTO FRAME's ONE print file, composed from its squares' tiles (each rendered on its own
 * by render.ts — the drawing on its 60 mm window + bleed). White sheet at Prodigi's exact pixels
 * (3543² / 4724²), every tile centred on its window from frameSlotRects — the positions measured
 * against Prodigi's print-file template — so the photos land where the mount's windows (or, with no
 * mount, the clean 20 mm white gaps) expect them. In-VPC, deterministic: the same tiles always make
 * the same file.
 *
 * `tiles[i]` is square i (row by row from the top-left). Deny by default: a missing square or a
 * tile of the wrong size is refused here — a frame with a hole must never reach the printer.
 */
export async function composeFrameGrid(grid: FrameGrid, tiles: Buffer[], dpi = 300): Promise<Buffer> {
  const rects = frameSlotRects(grid);
  if (tiles.length !== rects.length) throw new Error(`a ${grid.size} frame needs ${rects.length} squares (got ${tiles.length})`);
  const bleed = slotBleedPx(grid);
  const edge = slotPx(grid) + 2 * bleed;
  const inputs: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const [i, tile] of tiles.entries()) {
    const m = await sharp(tile).metadata();
    if (m.width !== edge || m.height !== edge) throw new Error(`square ${i + 1}'s tile is ${m.width}×${m.height}, not ${edge}×${edge}`);
    inputs.push({ input: tile, left: rects[i]!.x - bleed, top: rects[i]!.y - bleed });
  }
  return sharp({ create: { width: grid.px, height: grid.px, channels: 3, background: '#ffffff' } })
    .composite(inputs)
    .flatten({ background: '#ffffff' })
    .png()
    .withMetadata({ density: dpi })
    .toBuffer();
}

/**
 * The frame's PRINTED FACE at preview size, for the mockup: ONE drawing repeated in every square
 * (the catalogue tile, the basket thumbnail — the founder's "the drawing in every square"), made by
 * the same tile code as the print, just smaller (preview == print). Raw pixels for the compositor.
 */
export async function renderFrameGridFacePixels(
  srcBuf: Buffer,
  grid: FrameGrid,
  transform: Transform,
  scale: number,
): Promise<{ data: Buffer; width: number; height: number; channels: 3 }> {
  const m = await sharp(srcBuf).metadata();
  const src = { width: m.width ?? 0, height: m.height ?? 0 };
  if (!src.width || !src.height) throw new Error('unreadable source image');
  const { png } = await renderFrameTile(srcBuf, src, grid, transform, scale);
  const W = Math.max(1, Math.round(grid.px * scale));
  const bleed = slotBleedPx(grid);
  const { data, info } = await sharp({ create: { width: W, height: W, channels: 3, background: '#ffffff' } })
    .composite(frameSlotRects(grid).map((r) => ({ input: png, left: Math.round((r.x - bleed) * scale), top: Math.round((r.y - bleed) * scale) })))
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`frame face has ${info.channels} channels`);
  return { data, width: info.width, height: info.height, channels: 3 };
}
