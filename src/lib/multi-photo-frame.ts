/**
 * The MULTI PHOTO FRAME (Prodigi GLOBAL-MPF / GLOBAL-MPFM, made in the UK at gb3 since Prodigi's
 * "global" change, 5 Nov 2026 — project-office/briefs/PRODUCT-RANGE-global-uk-nov.md): ONE framed
 * print of a GRID of the family's drawings — Prodigi's spec is 60×60 mm photos with 20 mm between
 * them, in a classic frame (8 colours).
 *
 *   3 × 3  —  9 drawings — 12×12″ (300×300 mm), no mount — GLOBAL-MPF-12X12, 3543×3543 px
 *   6 × 4  — 24 drawings — 16×24″ (600×400 mm), no mount — GLOBAL-MPF-16X24, 4724×7086 px
 *   10 × 6 — 60 drawings — 24×36″ (900×600 mm), no mount — GLOBAL-MPF-24X36, 7086×10629 px
 * (founder, 5 Nov: these three, named by their drawings; each has the founder's layered photo —
 * src/server/print/frameLayout.ts)
 *
 * LAYOUT — checked against Prodigi's own print-file templates (prodigi.com product page, "print file
 * templates": prodigi-multi-photo-frame-small-square-12x12.png, -medium-16x24.png,
 * -x-large-24x36.png, 5 Nov 2026), drawn at the print's own pixels. Every window ("window trim line")
 * is 60 mm square, one every 80 mm, the grid centred on the sheet: 40 mm margin on the 12×12, 70 × 50 mm
 * on the 16×24, 60 × 70 mm on the 24×36. The red "safe
 * area" sits 2 mm inside every window. The pixel sizes are Prodigi's printAreaSizes (sandbox GET
 * /v4.0/products, 5 Nov).
 *
 * ORIENTATION (the two rectangles): they hang LANDSCAPE, as Prodigi's templates and the founder's
 * photos are drawn — but Prodigi's print file is PORTRAIT (4724×7086 / 7086×10629). Like the framed
 * print, the frame is designed on the landscape sheet and the finished file turned 90° to Prodigi's
 * spec. (Portrait is the same sheet the other way up; the machinery takes it — FRAME_GRIDS just
 * doesn't offer it, as there's no photo of it.) The square has no orientation.
 *
 * BLEED: with NO mount (all three) the print IS what you see, so each drawing is exactly its 60 mm
 * square and the 20 mm between them stays clean white paper. (A MOUNTED frame would run each drawing
 * 3 mm past its window, under the mount — kept for if one is ever offered.)
 *
 * In the basket a frame is ONE line carrying a drawing per square (unfilled squares repeat the main
 * drawing). At order time the server re-fills + re-checks every square (authz, moderation, DPI) and
 * freezes ONE artwork row per square (print area `slot-1`…`slot-N`); fulfilment renders each
 * square's drawing as a tile and composes them into the ONE print file Prodigi gets.
 * Client-safe: no I/O.
 */

export const MULTI_PHOTO_FRAME_KEY = 'multiPhotoFrame';

/** Is this basket-line key the multi photo frame (the product key or one of its variant skus)? */
export const isMultiPhotoFrameKey = (key: string | null | undefined): boolean =>
  !!key && (key === MULTI_PHOTO_FRAME_KEY || key.startsWith(`${MULTI_PHOTO_FRAME_KEY}-`));

/** Prodigi's spec: every photo 60 mm square, 20 mm between them. */
export const PHOTO_MM = 60;
export const GAP_MM = 20;
/** The red "safe area" on Prodigi's templates: 2 mm inside every window. */
export const SAFE_INSET_MM = 2;
/** How far a drawing runs past its window under a MOUNT (none without one). */
export const MOUNT_BLEED_MM = 3;

export type FrameSize = '12×12″' | '16×24″' | '24×36″';
/** How the frame hangs — the square sizes have no choice. */
export type FrameOrientation = 'square' | 'landscape' | 'portrait';

export interface FrameGrid {
  /** our variant size attribute */
  size: FrameSize;
  orientation: FrameOrientation;
  sku: 'GLOBAL-MPF-12X12' | 'GLOBAL-MPF-16X24' | 'GLOBAL-MPF-24X36';
  /** how the founder names it — its drawings across × down ('3x3', '6x4', '10x6'): its layered photo's folder */
  name: string;
  /** the print sheet as it HANGS (Prodigi's glaze size), mm */
  wMm: number;
  hMm: number;
  /** squares across and down, as it hangs */
  cols: number;
  rows: number;
  mounted: boolean;
  /** the print as it is DESIGNED (as it hangs), px — Prodigi's printAreaSizes, turned if `turned` */
  pxW: number;
  pxH: number;
  /** Prodigi's file is this design turned 90° (their print file is portrait; this frame hangs landscape) */
  turned: boolean;
}

/** One size as Prodigi makes it: its sheet, file px and squares along each side (short / long) — the
 * squares counted on Prodigi's template. Prodigi's own orientation is portrait (or square). */
const SIZES: Array<{ size: FrameSize; sku: FrameGrid['sku']; shortMm: number; longMm: number; shortPx: number; longPx: number; shortN: number; longN: number; mounted: boolean }> = [
  { size: '12×12″', sku: 'GLOBAL-MPF-12X12', shortMm: 300, longMm: 300, shortPx: 3543, longPx: 3543, shortN: 3, longN: 3, mounted: false },
  { size: '16×24″', sku: 'GLOBAL-MPF-16X24', shortMm: 400, longMm: 600, shortPx: 4724, longPx: 7086, shortN: 4, longN: 6, mounted: false },
  { size: '24×36″', sku: 'GLOBAL-MPF-24X36', shortMm: 600, longMm: 900, shortPx: 7086, longPx: 10629, shortN: 6, longN: 10, mounted: false },
];

/** Every frame we sell: the square, and the rectangles hung landscape (Prodigi's template, the founder's photos). */
export const FRAME_GRIDS: readonly FrameGrid[] = SIZES.flatMap((s) => {
  const square = s.shortMm === s.longMm;
  const make = (orientation: FrameOrientation): FrameGrid => {
    const landscape = orientation === 'landscape';
    const wMm = landscape ? s.longMm : s.shortMm;
    const hMm = landscape ? s.shortMm : s.longMm;
    const cols = landscape ? s.longN : s.shortN, rows = landscape ? s.shortN : s.longN;
    return {
      size: s.size, orientation, sku: s.sku, name: `${cols}x${rows}`, wMm, hMm, cols: landscape ? s.longN : s.shortN, rows: landscape ? s.shortN : s.longN, mounted: s.mounted,
      pxW: landscape ? s.longPx : s.shortPx, pxH: landscape ? s.shortPx : s.longPx, turned: landscape,
    };
  };
  return square ? [make('square')] : [make('landscape')];
});

/** The sizes, in shop order (one entry per size, whatever its orientations). */
export const FRAME_SIZES: readonly FrameSize[] = SIZES.map((s) => s.size);

/** A size's grid, hung this way (a square ignores it; a rectangle with none hangs landscape; a way up
 * we don't offer is null). */
export function frameGridOf(size: string | null | undefined, orientation?: string | null): FrameGrid | null {
  const want = orientation === 'portrait' ? 'portrait' : 'landscape';
  return FRAME_GRIDS.find((g) => g.size === size && (g.orientation === 'square' || g.orientation === want)) ?? null;
}
/** The grid DESIGNED at these pixels (a variant's print template) — how the print code finds it. */
export const frameGridForPx = (w: number, h: number): FrameGrid | null => FRAME_GRIDS.find((g) => g.pxW === w && g.pxH === h) ?? null;
/** How many drawings a frame holds (9 / 24 / 60); null = not a frame size. */
export const frameSlotCountOf = (size: string | null | undefined, orientation?: string | null): number | null => {
  const g = frameGridOf(size, orientation);
  return g ? g.cols * g.rows : null;
};
/** The most squares any frame has — an untrusted request is never read past this. */
export const MAX_FRAME_SLOTS = Math.max(...FRAME_GRIDS.map((g) => g.cols * g.rows));

/** The margins round the grid, mm (the grid is centred on the sheet). */
export const frameMarginsMm = (g: FrameGrid): { x: number; y: number } => ({
  x: (g.wMm - (g.cols * PHOTO_MM + (g.cols - 1) * GAP_MM)) / 2,
  y: (g.hMm - (g.rows * PHOTO_MM + (g.rows - 1) * GAP_MM)) / 2,
});

/** Prodigi's print file for this frame, px (the design, turned back if it hangs landscape). */
export const prodigiPx = (g: FrameGrid): { w: number; h: number } => (g.turned ? { w: g.pxH, h: g.pxW } : { w: g.pxW, h: g.pxH });

export interface SlotRect {
  /** the window's top-left on the designed print, px */
  x: number;
  y: number;
  /** the window, px (every window the same size) */
  size: number;
}

/** px per mm across / down the designed print (11.81 = 300 dpi on every size). */
const kx = (g: FrameGrid) => g.pxW / g.wMm;
const ky = (g: FrameGrid) => g.pxH / g.hMm;

/** One window's size on the print file, px (709 on every size). */
export const slotPx = (g: FrameGrid): number => Math.round(PHOTO_MM * kx(g));
/** The bleed a drawing runs past its window, px (35 on the mounted frame, 0 without a mount). */
export const slotBleedPx = (g: FrameGrid): number => (g.mounted ? Math.round(MOUNT_BLEED_MM * kx(g)) : 0);
/** The bleed a drawing runs past its window, mm. */
export const slotBleedMm = (g: FrameGrid): number => (g.mounted ? MOUNT_BLEED_MM : 0);

/**
 * Every window on the designed print, row by row from the top-left as it hangs (slot 1 = top-left,
 * slot `cols` = the end of the first row) — rounded from Prodigi's mm layout, so each lands on the
 * template's window trim line.
 */
export function frameSlotRects(g: FrameGrid): SlotRect[] {
  const m = frameMarginsMm(g);
  const size = slotPx(g);
  const step = PHOTO_MM + GAP_MM;
  return Array.from({ length: g.cols * g.rows }, (_, i) => ({
    x: Math.round((m.x + (i % g.cols) * step) * kx(g)),
    y: Math.round((m.y + Math.floor(i / g.cols) * step) * ky(g)),
    size,
  }));
}

/** A square's print area name on its frozen artwork row (1-based, row by row). */
export const slotArea = (i: number): string => `slot-${i + 1}`;
/** The square index (0-based) a print area names, or null for anything else. */
export function slotIndexOf(printArea: string | null | undefined): number | null {
  const m = /^slot-(\d{1,2})$/.exec(printArea ?? '');
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 ? n - 1 : null;
}

/** One square of a frame: which drawing, and how it sits in its square. */
export interface FramePick {
  assetId: string;
  transform: { scale?: number; offsetX?: number; offsetY?: number; rotationDeg?: number };
  sourceObjectId?: string | null;
}

/**
 * Fill a frame's `count` squares from the shopper's picks (a null / missing / malformed square =
 * "not chosen"). Every empty square takes the MAIN drawing — the first square's, or else the first
 * chosen — so one drawing fills the whole frame (founder: "unfilled squares repeat the main
 * drawing"). Untrusted input is fine: anything past `count` is ignored. Throws if NOTHING is chosen.
 */
export function fillFrameSlots<P extends FramePick>(slots: ReadonlyArray<P | null | undefined>, count: number): Array<P & { printArea: string }> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_FRAME_SLOTS) throw new Error('not a frame size');
  const pick = (s: P | null | undefined): s is P => !!s && typeof s === 'object' && typeof s.assetId === 'string' && s.assetId.length > 0;
  const mine = Array.from({ length: count }, (_, i) => slots[i] ?? null);
  const main = mine.find(pick);
  if (!main) throw new Error('a frame needs at least one drawing');
  return mine.map((s, i) => ({ ...(pick(s) ? s : main), printArea: slotArea(i) }));
}

/**
 * The classic frame's colours — Prodigi's exact `color` attribute values (sandbox, 5 Nov) — gold
 * first, our signature ("frame the wonky bits in gold"), as on the framed print.
 */
export const MULTI_FRAME_COLOURS = ['gold', 'black', 'white', 'natural', 'brown', 'dark grey', 'light grey', 'silver'] as const;

/** The frame mouldings, roughly as they look — swatches + the builder's drawn frame (product
 * data, like the framed print's swatches: the real material colours, never brand styling). */
export const FRAME_MOULDING_HEX: Record<string, string> = {
  gold: '#D9B45B', black: '#2E2723', white: '#F7F2E8', natural: '#E7D9BE', brown: '#6B4A32',
  'dark grey': '#4D4C4A', 'light grey': '#CFCDC8', silver: '#B9B6AE',
};
