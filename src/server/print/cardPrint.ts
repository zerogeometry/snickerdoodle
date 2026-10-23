import sharp, { type OverlayOptions } from 'sharp';
import { computeLayerRect, type Transform } from './geometry';
import { renderCardInsidePanels } from './cardText';
import type { ScreenedCardMessage } from '@/server/textSafety';

/**
 * The Prodigi CLASSIC-GRE-FEDR-7X5 greetings-card artboard, MEASURED from the official template
 * (prodigi-classic-greetings-card-7x5.png): 6236×2220 px @300dpi, FOUR equal panels, a vertical
 * (side) fold in each pair — so NO panel is rotated. Left→right:
 *   [ outer rear | outer front | inside front | inside back ]
 * The design goes on the outer FRONT (spanning the outer REAR too when full-width); the branding on
 * the outer REAR; the note on INSIDE FRONT (the facing/left page) and the greeting/message/signature
 * on INSIDE BACK (the right page). "Cover the entire artboard" — Prodigi trims each 5×7 out.
 */
export const CARD_SPREAD = { widthPx: 6236, heightPx: 2220 } as const;
const PANEL_W = CARD_SPREAD.widthPx / 4; // 1559 — even quarters (matches the template trim lines ±1px)
// The Snickerdoodle back logo's size + centre on the outer-rear panel, MEASURED from where the
// founder placed it in the "Outside Open" snicker-overlay (bottom-left of the back panel).
const BADGE = { widthFrac: 0.18, cxFrac: 0.149, cyFrac: 0.885 } as const;
const H = CARD_SPREAD.heightPx;
const REQUIRED_DPI = 300;

/** Each panel's left-x on the spread. */
export const CARD_PANEL_X = {
  outerRear: 0,
  outerFront: PANEL_W,
  insideFront: PANEL_W * 2, // the note (facing / left page)
  insideBack: PANEL_W * 3, // greeting · message · signature (right page)
} as const;

/**
 * Cover-fit a design into a `w`×H region honouring the (clamped) editor transform — the SAME
 * rotate→scale→window placement the single-face print uses (render.ts), onto a region face of
 * `faceHex` (white, or the card's BASE COLOUR — so a see-through drawing sits on the colour).
 * `scale = 0` stays the CONTAIN sentinel, so the print matches whatever the shopper positioned.
 */
async function placeDesign(design: Buffer, transform: Transform, w: number, faceHex: string): Promise<Buffer> {
  const meta = await sharp(design).metadata();
  const src = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!src.width || !src.height) throw new Error('card print: unreadable design image');
  const rect = computeLayerRect({ printWidthPx: w, printHeightPx: H, bleedMm: 0, requiredDpi: REQUIRED_DPI }, src, transform);
  const layer = await sharp(design).rotate(transform.rotationDeg).resize(rect.width, rect.height, { fit: 'fill' }).toBuffer();
  const ix = Math.max(0, -rect.x);
  const iy = Math.max(0, -rect.y);
  const ox = Math.max(0, rect.x);
  const oy = Math.max(0, rect.y);
  const iw = Math.max(1, Math.min(rect.width - ix, rect.canvasWidth - ox));
  const ih = Math.max(1, Math.min(rect.height - iy, rect.canvasHeight - oy));
  const part = await sharp(layer).extract({ left: ix, top: iy, width: iw, height: ih }).toBuffer();
  return sharp({ create: { width: w, height: H, channels: 4, background: faceHex } })
    .composite([{ input: part, left: ox, top: oy }])
    .png()
    .toBuffer();
}

export interface CardPrintInput {
  /** The child's art bytes (ORIGINAL or a bg-removed cutout). */
  design: Buffer;
  /** Clamped editor placement. */
  transform: Transform;
  /** 'front' = the design on the outer-front panel only; 'full' = across rear+front. */
  span: 'front' | 'full';
  /** The SCREENED inside message, or null for a blank (write-by-hand) inside. */
  message: ScreenedCardMessage | null;
  /** Snickerdoodle back badge (PNG with alpha), centred on the outer-rear panel. Optional. */
  branding?: Buffer | null;
  /** The card's BASE COLOUR (#rrggbb, already normalised) — fills the OUTSIDE under the design: the
   * outer front, plus the outer rear when the drawing spans the whole outside. The inside always
   * stays white (it's for the words). Absent / null = white, exactly as before. */
  groundHex?: string | null;
}

/**
 * Assemble the card's flat 4-panel PRINT file (6236×2220 @300dpi). front-only fills the outer-front
 * panel with the design; full-width spans outer rear+front. A base colour fills exactly the panels
 * the design covers (front-only leaves the rear white). A blank inside stays white. The screened
 * message and the font token are the single source of truth shared with the on-screen preview, so
 * they can't disagree. This is the PRINT path — it never touches the display compositor's pixels.
 */
export async function assembleCardPrintSpread(input: CardPrintInput): Promise<Buffer> {
  const { design, transform, span, message, branding } = input;
  const faceHex = input.groundHex ?? '#ffffff';
  const layers: OverlayOptions[] = [];

  // OUTSIDE — the design, on its base colour. full-width = one wide face across rear+front;
  // front-only = the front panel (the rear stays white).
  if (span === 'full') {
    layers.push({ input: await placeDesign(design, transform, PANEL_W * 2, faceHex), left: CARD_PANEL_X.outerRear, top: 0 });
  } else {
    layers.push({ input: await placeDesign(design, transform, PANEL_W, faceHex), left: CARD_PANEL_X.outerFront, top: 0 });
  }

  // BACK logo — the Snickerdoodle mark at the founder's spot: bottom-left of the outer-rear panel
  // (over white for front-only, over the design's back portion — and its colour — for full-width).
  if (branding) {
    const badge = await sharp(branding).resize(Math.round(PANEL_W * BADGE.widthFrac), null, { fit: 'inside' }).png().toBuffer();
    const bm = await sharp(badge).metadata();
    layers.push({
      input: badge,
      left: CARD_PANEL_X.outerRear + Math.round(PANEL_W * BADGE.cxFrac - (bm.width ?? 0) / 2),
      top: Math.round(H * BADGE.cyFrac - (bm.height ?? 0) / 2),
    });
  }

  // INSIDE — the note on inside-front (facing/left), the greeting/message/signature on inside-back.
  if (message) {
    const { left, right } = await renderCardInsidePanels(message, { panelWidthPx: PANEL_W, panelHeightPx: H });
    layers.push({ input: left, left: CARD_PANEL_X.insideFront, top: 0 });
    layers.push({ input: right, left: CARD_PANEL_X.insideBack, top: 0 });
  }

  return sharp({ create: { width: CARD_SPREAD.widthPx, height: H, channels: 3, background: '#ffffff' } })
    .composite(layers)
    .flatten({ background: '#ffffff' })
    .png()
    .withMetadata({ density: REQUIRED_DPI })
    .toBuffer();
}
