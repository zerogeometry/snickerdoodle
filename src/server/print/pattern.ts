import './sharp-init';
import sharp, { type Sharp } from 'sharp';
import type { Transform } from './geometry';
import { patternLayout, scalePatternLayout, type PatternLayout } from './pattern-geometry';

export { PATTERN_FILL, PATTERN_MOTIF_MM, patternLayout, scalePatternLayout, type PatternLayout } from './pattern-geometry';

/**
 * The "pattern" magic edit: the drawing tiled into a SEAMLESS half-drop repeat that fills a print
 * file — socks, wrapping paper, tea towels. Deterministic and self-hosted (sharp, in-VPC): no third
 * party sees the image, and the same inputs always give the same file. The ORIGINAL is never
 * touched — this reads a source buffer and returns a new one.
 *
 * Seamless: the canvas width is an EVEN number of whole columns, so the left and right edges meet
 * exactly when the product wraps round (a sock, a roll); odd columns drop half a cell (the classic
 * hand-designed repeat). Rows are whole too, so the top and bottom meet (to within a pixel or two).
 * It renders ONE full-width strip (one cell tall, motifs wrapping round both edges) and tiles it
 * down the canvas, so even a 5 m wrapping roll stays a small, bounded amount of work.
 *
 * The client's transform still means what it does elsewhere, mapped onto the repeat:
 * scale (0 = default) → motif size · offsetX/Y → shifts the pattern · rotation → turns each motif.
 */

/**
 * Render the repeat: a print file of exactly `canvas` px, opaque, on `background` (white by
 * default — a transparent cutout sits on the paper colour). Returns PNG bytes.
 */
export async function renderRepeatPattern(
  srcBuf: Buffer,
  canvas: { width: number; height: number },
  dpi: number,
  transform: Transform,
  background = '#ffffff',
  opts: { scale?: number } = {},
): Promise<{ png: Buffer; layout: PatternLayout; width: number; height: number }> {
  const r = await repeatPipeline(srcBuf, canvas, dpi, transform, background, opts);
  const png = await r.pipeline.png().withMetadata({ density: Math.round(r.dpi) }).toBuffer();
  return { png, layout: r.layout, width: r.width, height: r.height };
}

/**
 * The same repeat as raw pixels, for the mockup PREVIEW — it composites the face straight away,
 * so a PNG of it would only be encoded to be decoded again. Same pixels as the PNG.
 */
export async function renderRepeatPatternPixels(
  srcBuf: Buffer,
  canvas: { width: number; height: number },
  dpi: number,
  transform: Transform,
  background = '#ffffff',
  opts: { scale?: number } = {},
): Promise<{ data: Buffer; width: number; height: number; channels: 3 | 4 }> {
  const r = await repeatPipeline(srcBuf, canvas, dpi, transform, background, opts);
  const { data, info } = await r.pipeline.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 && info.channels !== 4) throw new Error(`repeat pattern: unexpected ${info.channels} channels`);
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** Everything up to the encode. The steps hand each other raw pixels (lossless, as the PNGs were). */
async function repeatPipeline(
  srcBuf: Buffer,
  canvas: { width: number; height: number },
  dpi: number,
  transform: Transform,
  background: string,
  opts: { scale?: number },
): Promise<{ pipeline: Sharp; layout: PatternLayout; dpi: number; width: number; height: number }> {
  const meta = await sharp(srcBuf).metadata();
  if (!meta.width || !meta.height) throw new Error('unreadable source image');
  // The layout is decided at PRINT size; a preview (`scale` < 1) draws the same repeat smaller.
  const printLayout = patternLayout(canvas, dpi, { width: meta.width, height: meta.height }, transform);
  const scaled = opts.scale && opts.scale !== 1 ? scalePatternLayout(printLayout, canvas, opts.scale) : null;
  const layout = scaled?.layout ?? printLayout;
  if (scaled) {
    dpi = (dpi * scaled.canvas.width) / canvas.width;
    canvas = scaled.canvas;
  }
  const { cols, cellW, stripH, motifW, motifH, phaseX, phaseY } = layout;

  const motif = await sharp(srcBuf).rotate(transform.rotationDeg).resize(motifW, motifH, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const motifRaw = { raw: { width: motifW, height: motifH, channels: 4 as const } };

  // One strip, one cell tall, with a margin so motifs that cross an edge can be drawn whole and
  // then cropped: what leaves on the right comes back on the left (and bottom → top).
  const pad = Math.ceil(Math.max(motifW, motifH));
  const overlays: NonNullable<Parameters<ReturnType<typeof sharp>['composite']>[0]> = [];
  for (let i = -1; i <= cols; i++) {
    const drop = ((i % 2) + 2) % 2 === 1 ? stripH / 2 : 0;
    for (let j = -2; j <= 2; j++) {
      const cx = (i + 0.5) * cellW + phaseX;
      const cy = (j + 0.5) * stripH + drop + phaseY;
      const left = Math.round(cx - motifW / 2) + pad;
      const top = Math.round(cy - motifH / 2) + pad;
      if (left + motifW <= 0 || top + motifH <= 0 || left >= canvas.width + 2 * pad || top >= stripH + 2 * pad) continue;
      overlays.push({ input: motif, ...motifRaw, left, top });
    }
  }
  // Every column/row index is placed at a whole multiple of the canvas width/strip height from its
  // twin, so the crop below is periodic: x and x + canvas.width carry the same pixels.
  const wideW = canvas.width + 2 * pad, wideH = stripH + 2 * pad;
  const wide = await sharp({ create: { width: wideW, height: wideH, channels: 4, background } })
    .composite(overlays)
    .raw()
    .toBuffer();
  // Flattened to opaque here, so the big tiled file below is plain RGB (no alpha to carry).
  const strip = await sharp(wide, { raw: { width: wideW, height: wideH, channels: 4 } })
    .extract({ left: pad, top: pad, width: canvas.width, height: stripH })
    .flatten({ background })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // The canvas is the template's own size (never the shopper's), and a 3 m / 5 m kraft roll is 293 /
  // 489 MP — over sharp's 268 MP default — so the limit is lifted to exactly this canvas (sweep 03-B4).
  // libvips builds it a strip at a time as the PNG is written, so memory stays bounded by the strip.
  const pipeline = sharp({ create: { width: canvas.width, height: canvas.height, channels: 3, background }, limitInputPixels: canvas.width * canvas.height })
    .composite([{ input: strip.data, raw: { width: strip.info.width, height: strip.info.height, channels: strip.info.channels }, tile: true, gravity: 'northwest' }])
    .removeAlpha();
  return { pipeline, layout, dpi, width: canvas.width, height: canvas.height };
}
