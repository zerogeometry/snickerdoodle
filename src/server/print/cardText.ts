import { createElement as el, type ReactNode } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { ScreenedCardMessage } from '@/server/textSafety';
import { loadCardFontWoff } from '@/server/print/cardFonts';

const COCOA = '#2E2723'; // brand text colour (never pure black)

// Font sizes + padding as FRACTIONS of one panel's width, derived from the on-screen preview's cqw
// units (which are % of the 2-panel spread) doubled to per-panel — so print matches what the shopper
// saw. `fontScale` (the S/M/L control, clamped in screenCardMessage) multiplies every line together.
const FRAC = { pad: 0.1, note: 0.122, greeting: 0.096, message: 0.07, signature: 0.078 } as const;
const LINE = 1.3;

async function whitePanel(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } }).png().toBuffer();
}

async function rasterise(node: ReactNode, fontName: string, woff: Buffer, w: number, h: number): Promise<Buffer> {
  const svg = await satori(node, { width: w, height: h, fonts: [{ name: fontName, data: woff, weight: 400, style: 'normal' }] });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: w }, background: 'white' }).render().asPng());
}

export interface CardPanelGeom {
  /** One inside panel's dimensions in print px (incl. bleed). */
  panelWidthPx: number;
  panelHeightPx: number;
}

/**
 * Render the card's two INSIDE panels from a SCREENED message: LEFT (facing) page = the note,
 * centred both ways; RIGHT page = greeting (top, left) · message (centred) · signature (bottom,
 * left) — the same layout, font and size the shopper saw in CardInsidePreview, now at print
 * resolution. A side with no text comes back plain WHITE (a card may be blank on either page).
 * The screened message and the font TOKEN are the single source of truth, so the preview and the
 * print cannot disagree, and the font is never silently substituted.
 */
export async function renderCardInsidePanels(msg: ScreenedCardMessage, geom: CardPanelGeom): Promise<{ left: Buffer; right: Buffer }> {
  const { panelWidthPx: w, panelHeightPx: h } = geom;
  const woff = loadCardFontWoff(msg.font);
  const k = msg.fontScale; // clamped [0.7,1.4] upstream
  const px = (frac: number) => Math.round(w * frac * k);
  const pad = Math.round(w * FRAC.pad);
  const font = { fontFamily: msg.font, color: COCOA } as const;

  // LEFT / facing page — the note, centred vertically + horizontally.
  const left = msg.note
    ? await rasterise(
        el(
          'div',
          { style: { display: 'flex', width: w, height: h, padding: pad, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', ...font } },
          el('div', { style: { display: 'flex', textAlign: 'center', lineHeight: LINE, fontSize: px(FRAC.note) } }, msg.note),
        ),
        msg.font,
        woff,
        w,
        h,
      )
    : await whitePanel(w, h);

  // RIGHT page — greeting top-left · message centred · signature bottom-left (empty fields collapse).
  const right =
    msg.greeting || msg.message || msg.signature
      ? await rasterise(
          el(
            'div',
            { style: { display: 'flex', flexDirection: 'column', width: w, height: h, padding: pad, backgroundColor: 'white', lineHeight: LINE, ...font } },
            el('div', { style: { display: 'flex', fontSize: px(FRAC.greeting) } }, msg.greeting || ''),
            el('div', { style: { display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: px(FRAC.message) } }, msg.message || ''),
            el('div', { style: { display: 'flex', fontSize: px(FRAC.signature) } }, msg.signature || ''),
          ),
          msg.font,
          woff,
          w,
          h,
        )
      : await whitePanel(w, h);

  return { left, right };
}
