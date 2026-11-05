/**
 * How much work a product PREVIEW gets, by size. Pure numbers (no sharp, no storage) so they can be
 * unit-tested — and so it's plain that none of this reaches the PRINT FILE (render.ts never imports it).
 *
 * A range TILE's photo is never shown bigger than {@link TILE_MAX_CSS_PX} CSS px (measured 5 Nov on the
 * create page: ~320 px on a 390 px phone, ~350 px on a 430 px phone, ~265 px at 1280 px, ≤ 350 px on the
 * widest desktop — the tile's square, less its padding). A thumb is therefore composed on a photo no
 * bigger than that at 2× DPR, from a drawing (or printed face) no bigger than that either: the print
 * area is only ever part of the photo, so nothing finer could reach the screen. The zoom tier (the
 * close-up, the customise page) keeps the template's full map resolution, the full-size drawing and
 * the slower, smaller WebP.
 */
export type MockupSize = 'thumb' | 'zoom';

/** The largest a range tile's photo is shown, in CSS px. */
export const TILE_MAX_CSS_PX = 350;
/** The screen density thumbs are drawn for. */
export const TILE_DPR = 2;
/** A thumb's working photo (longest edge, device px). Was 800. */
export const THUMB_WORK_EDGE = TILE_MAX_CSS_PX * TILE_DPR;
/** The drawing a thumb is composed from (longest edge). Was 1200. */
export const THUMB_DESIGN_EDGE = THUMB_WORK_EDGE;
/** A thumb's printed face (repeat, height chart, calendar page, frame grid, strap). Was 1000. */
export const THUMB_FACE_EDGE = THUMB_WORK_EDGE;
/** A close-up's printed face: the photo's print area is never more than the ~1500 px working edge, so 2× is plenty. */
export const FACE_MAX_EDGE = 3000;
/** The encoded preview's longest edge. */
export const OUTPUT_EDGE: Record<MockupSize, number> = { thumb: 400, zoom: 1200 };
/** WebP encoder effort (0 fastest … 6 smallest): a thumb is encoded once and shown small. */
export const WEBP_EFFORT: Record<MockupSize, number> = { thumb: 2, zoom: 4 };

export interface MockupSizing {
  /** the working photo's longest edge */
  workEdge: number;
  /** the drawing's longest edge (null = the stored drawing as it is) */
  designEdge: number | null;
  /** a printed face's longest edge */
  faceEdge: number;
  outputEdge: number;
  webpEffort: number;
}

/** Everything a preview of this size is composed at, for a template mapped at `mapResolutionPx`. */
export function mockupSizing(size: MockupSize, mapResolutionPx: number): MockupSizing {
  const thumb = size === 'thumb';
  return {
    workEdge: thumb ? Math.min(mapResolutionPx, THUMB_WORK_EDGE) : mapResolutionPx,
    designEdge: thumb ? THUMB_DESIGN_EDGE : null,
    faceEdge: thumb ? THUMB_FACE_EDGE : FACE_MAX_EDGE,
    outputEdge: OUTPUT_EDGE[size],
    webpEffort: WEBP_EFFORT[size],
  };
}
