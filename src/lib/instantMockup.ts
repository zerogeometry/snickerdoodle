/**
 * INSTANT previews — the browser draws the shopper's drawing onto a small copy of the product
 * photo the moment the range opens, while the server makes the photoreal mockup (which then fades
 * in over it). Pure, client-safe maths: the placement is the SAME shared geometry the compositor
 * uses (computeLayerRect on the print area, bleed-exact), so the instant preview and the photo
 * show the drawing in the same place — only the finish (fabric folds, linear-light blend) differs.
 */
import { computeLayerRect, type TemplateGeom, type Transform } from '@/server/print/geometry';

/** What the browser needs to draw an instant preview for one variant (/api/mockup/contexts). */
export interface InstantContext {
  blankUrl: string;
  maskUrl: string | null;
  overlayUrl: string | null;
  /** print area on the photo, normalised TL,TR,BR,BL (axis-aligned) */
  quad: [number, number][];
  blankW: number;
  blankH: number;
  /** compositor material — fabric prints read as ink (multiply) */
  material: string;
  print: TemplateGeom;
}

export interface InstantPlacement {
  /** the photo's displayed size (css px) */
  width: number;
  height: number;
  /** the print area's box on it */
  area: { left: number; top: number; width: number; height: number };
  /** the drawing's box INSIDE the print area, before rotation (centre-anchored) */
  image: { centreX: number; centreY: number; width: number; height: number; rotationDeg: number };
  blend: 'normal' | 'multiply';
}

/**
 * Where the drawing goes on the product photo shown `width` px wide. Mirrors renderFlat in the
 * compositor exactly: the print area at photo scale, the design cover/contain-placed over the
 * SCALED BLEED canvas with the clamped transform, then windowed to the trim box.
 */
export function instantPlacement(ctx: InstantContext, width: number, src: { width: number; height: number }, transform: Transform): InstantPlacement {
  const height = (width * ctx.blankH) / ctx.blankW;
  const xs = ctx.quad.map((p) => p[0]);
  const ys = ctx.quad.map((p) => p[1]);
  const left = Math.min(...xs) * width;
  const top = Math.min(...ys) * height;
  const aw = Math.max(1, (Math.max(...xs) - Math.min(...xs)) * width);
  const ah = Math.max(1, (Math.max(...ys) - Math.min(...ys)) * height);
  const s = aw / ctx.print.printWidthPx;
  const r = computeLayerRect({ printWidthPx: Math.round(aw), printHeightPx: Math.round(ah), bleedMm: ctx.print.bleedMm, requiredDpi: ctx.print.requiredDpi * s }, src, transform);
  const bleed = (r.canvasWidth - Math.round(aw)) / 2;
  const swap = transform.rotationDeg % 180 !== 0;
  return {
    width,
    height,
    area: { left, top, width: aw, height: ah },
    image: {
      centreX: r.x - bleed + r.width / 2,
      centreY: r.y - bleed + r.height / 2,
      width: swap ? r.height : r.width,
      height: swap ? r.width : r.height,
      rotationDeg: transform.rotationDeg,
    },
    blend: ctx.material === 'LIGHT_FABRIC' ? 'multiply' : 'normal',
  };
}
