import './sharp-init';
import { Resvg } from '@resvg/resvg-js';
import sharp, { type Sharp } from 'sharp';
import { computeLayerRect, type TemplateGeom, type Transform } from './geometry';
import { heightChartLayout, HEIGHT_CHART_FLOOR_CM, rulerBandSvg } from './height-chart-geometry';

/**
 * The HEIGHT CHART print face: the drawing placed in the art area (its transform resolved against
 * the art area, exactly like any product's canvas) + the cm / ft·in ruler band drawn into the file
 * at true physical scale (height-chart-geometry.ts). Deterministic and in-VPC; the original is
 * never touched.
 *
 * `scale` < 1 renders the SAME face smaller — the mockup compositor's preview — from the same
 * layout maths, so preview == print (to rounding at the smaller size).
 */
export async function renderHeightChartFace(
  srcBuf: Buffer,
  t: TemplateGeom,
  transform: Transform,
  opts: { scale?: number; floorCm?: number; groundHex?: string } = {},
): Promise<{ png: Buffer; width: number; height: number }> {
  const f = await faceAssembly(srcBuf, t, transform, opts);
  const png = await f.pipeline.png().withMetadata({ density: Math.round(f.dpi) }).toBuffer();
  return { png, width: f.width, height: f.height };
}

/** The same face as raw pixels, for the mockup PREVIEW (it composites it straight away). */
export async function renderHeightChartFacePixels(
  srcBuf: Buffer,
  t: TemplateGeom,
  transform: Transform,
  opts: { scale?: number; floorCm?: number; groundHex?: string } = {},
): Promise<{ data: Buffer; width: number; height: number; channels: 3 | 4 }> {
  const f = await faceAssembly(srcBuf, t, transform, opts);
  const { data, info } = await f.pipeline.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 && info.channels !== 4) throw new Error(`height chart: unexpected ${info.channels} channels`);
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** Everything up to the encode. */
async function faceAssembly(
  srcBuf: Buffer,
  t: TemplateGeom,
  transform: Transform,
  opts: { scale?: number; floorCm?: number; groundHex?: string },
): Promise<{ pipeline: Sharp; dpi: number; width: number; height: number }> {
  const s = opts.scale ?? 1;
  const W = Math.max(1, Math.round(t.printWidthPx * s));
  const H = Math.max(1, Math.round(t.printHeightPx * s));
  const dpi = t.requiredDpi * s;
  const lay = heightChartLayout({ width: W, height: H }, dpi);

  // the drawing, placed in the art area (white where it doesn't reach — unprinted canvas)
  const artGeom = { printWidthPx: lay.art.width, printHeightPx: lay.art.height, bleedMm: 0, requiredDpi: dpi };
  const meta = await sharp(srcBuf).metadata();
  if (!meta.width || !meta.height) throw new Error('unreadable source image');
  const rect = computeLayerRect(artGeom, { width: meta.width, height: meta.height }, transform);
  const layer = await sharp(srcBuf).rotate(transform.rotationDeg).resize(rect.width, rect.height, { fit: 'fill' }).toBuffer();
  const ix = Math.max(0, -rect.x);
  const iy = Math.max(0, -rect.y);
  const ox = Math.max(0, rect.x);
  const oy = Math.max(0, rect.y);
  const iw = Math.max(1, Math.min(rect.width - ix, rect.canvasWidth - ox));
  const ih = Math.max(1, Math.min(rect.height - iy, rect.canvasHeight - oy));
  const part = await sharp(layer).extract({ left: ix, top: iy, width: iw, height: ih }).png().toBuffer();

  const band = Buffer.from(
    new Resvg(rulerBandSvg(lay, opts.floorCm ?? HEIGHT_CHART_FLOOR_CM), { fitTo: { mode: 'original' }, background: 'white' }).render().asPng(),
  );

  // a base colour fills the art area (the ruler band stays white, so its marks always read)
  const bg = opts.groundHex ?? '#ffffff';
  const pipeline = sharp({ create: { width: W, height: H, channels: 3, background: bg } })
    .composite([
      { input: part, left: lay.art.x + ox, top: oy },
      { input: band, left: 0, top: 0 },
    ])
    .flatten({ background: bg });
  return { pipeline, dpi, width: W, height: H };
}
