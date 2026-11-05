/**
 * The MULTI PHOTO FRAME (Prodigi GLOBAL-MPF / GLOBAL-MPFM, made in the UK at gb3 since Prodigi's
 * "global" change, 5 Nov 2026 — project-office/briefs/PRODUCT-RANGE-global-uk-nov.md): ONE framed
 * print of a GRID of the family's drawings — Prodigi's spec is 60×60 mm photos with 20 mm between
 * them, in a classic frame (8 colours).
 *
 *   12×12″ (300×300 mm sheet), NO mount — 9 drawings, 3×3 — GLOBAL-MPF-12X12, 3543×3543 px
 *   16×16″ (400×400 mm sheet), MOUNTED — 16 drawings, 4×4 — GLOBAL-MPFM-16X16, 4724×4724 px
 *
 * LAYOUT — checked against Prodigi's own print-file templates (prodigi.com product page, "print file
 * templates": prodigi-multi-photo-frame-small-square-12x12.png / -medium-square-16x16.png, 5 Nov
 * 2026), which are drawn at exactly these pixel sizes. Every window ("window trim line") is 60 mm
 * square, one every 80 mm, the grid centred: 40 mm margin on the 12×12 (3 × 60 + 2 × 20 = 220 of
 * 300), 50 mm on the 16×16 (4 × 60 + 3 × 20 = 300 of 400). The red "safe area" sits 2 mm inside
 * every window. The pixel sizes are Prodigi's printAreaSizes (sandbox GET /v4.0/products, 5 Nov).
 *
 * BLEED: on the MOUNTED frame the mount's windows sit over the print, so each drawing runs 3 mm past
 * its window (Prodigi: "each image should extend into the bleed area") and the mount hides the edge
 * even if it sits a touch off. With NO mount the print IS what you see, so each drawing is exactly
 * its 60 mm square and the 20 mm between them stays clean white paper.
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

export interface FrameGrid {
  /** our variant size attribute */
  size: '12×12″' | '16×16″';
  sku: 'GLOBAL-MPF-12X12' | 'GLOBAL-MPFM-16X16';
  /** the print sheet (Prodigi's glaze size), mm — square */
  sheetMm: number;
  /** squares across (and down) */
  n: number;
  mounted: boolean;
  /** Prodigi's exact print file, px — square */
  px: number;
}

export const FRAME_GRIDS: readonly FrameGrid[] = [
  { size: '12×12″', sku: 'GLOBAL-MPF-12X12', sheetMm: 300, n: 3, mounted: false, px: 3543 },
  { size: '16×16″', sku: 'GLOBAL-MPFM-16X16', sheetMm: 400, n: 4, mounted: true, px: 4724 },
];

/** The grid for a variant's size attribute (null = not a frame size). */
export const frameGridOf = (size: string | null | undefined): FrameGrid | null => FRAME_GRIDS.find((g) => g.size === size) ?? null;
/** The grid whose print file is this wide (the template's own pixels — how the print code finds it). */
export const frameGridForPx = (printWidthPx: number): FrameGrid | null => FRAME_GRIDS.find((g) => g.px === printWidthPx) ?? null;
/** How many drawings a frame size holds (9 / 16); null = not a frame size. */
export const frameSlotCountOf = (size: string | null | undefined): number | null => {
  const g = frameGridOf(size);
  return g ? g.n * g.n : null;
};
/** The most squares any frame has — an untrusted request is never read past this. */
export const MAX_FRAME_SLOTS = Math.max(...FRAME_GRIDS.map((g) => g.n * g.n));

/** The outer margin round the grid, mm (the grid is centred on the sheet). */
export const frameMarginMm = (g: FrameGrid): number => (g.sheetMm - (g.n * PHOTO_MM + (g.n - 1) * GAP_MM)) / 2;

export interface SlotRect {
  /** the window's top-left on the print file, px */
  x: number;
  y: number;
  /** the window, px (every window the same size) */
  size: number;
}

/** px per mm on this frame's print file (11.81 = 300 dpi on both). */
const pxPerMm = (g: FrameGrid) => g.px / g.sheetMm;

/** One window's size on the print file, px (709 on both sizes). */
export const slotPx = (g: FrameGrid): number => Math.round(PHOTO_MM * pxPerMm(g));
/** The bleed a drawing runs past its window, px (35 on the mounted frame, 0 without a mount). */
export const slotBleedPx = (g: FrameGrid): number => (g.mounted ? Math.round(MOUNT_BLEED_MM * pxPerMm(g)) : 0);
/** The bleed a drawing runs past its window, mm. */
export const slotBleedMm = (g: FrameGrid): number => (g.mounted ? MOUNT_BLEED_MM : 0);

/**
 * Every window on the print file, row by row from the top-left (slot 1 = top-left, slot n = the
 * end of the first row) — rounded from Prodigi's mm layout, so each lands within a pixel of the
 * template's window trim line.
 */
export function frameSlotRects(g: FrameGrid): SlotRect[] {
  const k = pxPerMm(g);
  const m = frameMarginMm(g);
  const size = slotPx(g);
  const at = (i: number) => Math.round((m + i * (PHOTO_MM + GAP_MM)) * k);
  return Array.from({ length: g.n * g.n }, (_, i) => ({ x: at(i % g.n), y: at(Math.floor(i / g.n)), size }));
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
