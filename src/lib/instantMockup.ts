/**
 * INSTANT previews — the browser draws the shopper's drawing onto a small copy of the product
 * photo the moment the range opens, while the server makes the photoreal mockup (which then fades
 * in over it). Pure, client-safe maths: the placement is the SAME shared geometry the compositor
 * uses (computeLayerRect on the print area, bleed-exact), so the instant preview and the photo
 * show the drawing in the same place — only the finish (fabric folds, linear-light blend) differs.
 */
import { computeLayerRect, galleryRect, type TemplateGeom, type Transform } from '@/server/print/geometry';

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
  /** The printed FACE the photo shows instead of the drawing placed: 'gallery' = the calendar's page
   * (white, the whole drawing inside its margin — galleryRect, the print file's own geometry). */
  face?: 'gallery';
}

/** A product's plain photo, shown on a tile the browser can't draw while the server's picture is made. */
export interface ProductPhoto {
  url: string;
  overlayUrl: string | null;
  w: number;
  h: number;
}

export interface InstantPlacement {
  /** the photo's displayed size (css px) */
  width: number;
  height: number;
  /** the print area's box on it */
  area: { left: number; top: number; width: number; height: number };
  /** the drawing's box INSIDE the print area, before rotation (centre-anchored) — for a printed face,
   * the face's box */
  image: { centreX: number; centreY: number; width: number; height: number; rotationDeg: number };
  /** a printed face only: where the drawing sits inside {@link image} (top-left, unrotated) */
  art?: { left: number; top: number; width: number; height: number };
  blend: 'normal' | 'multiply';
}

/** The face's own placement: laid on the print area as the compositor lays every printed face (cover, upright). */
const FACE_TRANSFORM: Transform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };

/**
 * Where the drawing goes on the product photo shown `width` px wide. Mirrors renderFlat in the
 * compositor exactly: the print area at photo scale, the design cover/contain-placed over the
 * SCALED BLEED canvas with the clamped transform, then windowed to the trim box. A printed face
 * (the calendar page) is placed the same way at the print canvas's size, with the drawing inside it
 * where the print file puts it.
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
  const face = ctx.face === 'gallery';
  const placed = face ? { width: ctx.print.printWidthPx, height: ctx.print.printHeightPx } : src;
  const tf = face ? FACE_TRANSFORM : transform;
  const r = computeLayerRect({ printWidthPx: Math.round(aw), printHeightPx: Math.round(ah), bleedMm: ctx.print.bleedMm, requiredDpi: ctx.print.requiredDpi * s }, placed, tf);
  const bleed = (r.canvasWidth - Math.round(aw)) / 2;
  const swap = tf.rotationDeg % 180 !== 0;
  const image = {
    centreX: r.x - bleed + r.width / 2,
    centreY: r.y - bleed + r.height / 2,
    width: swap ? r.height : r.width,
    height: swap ? r.width : r.height,
    rotationDeg: tf.rotationDeg,
  };
  let art: InstantPlacement['art'];
  if (face) {
    const g = galleryRect(ctx.print, src);
    const k = image.width / ctx.print.printWidthPx;
    art = { left: g.x * k, top: g.y * k, width: g.width * k, height: g.height * k };
  }
  return {
    width,
    height,
    area: { left, top, width: aw, height: ah },
    image,
    ...(art ? { art } : {}),
    blend: ctx.material === 'LIGHT_FABRIC' ? 'multiply' : 'normal',
  };
}
