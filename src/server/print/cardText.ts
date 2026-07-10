import { createElement as el, type ReactNode } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { ScreenedCardMessage } from '@/server/textSafety';
import { loadCardFontWoff } from '@/server/print/cardFonts';
import { fitCardFontSize } from '@/lib/cardTextFit';

const COCOA = '#2E2723'; // brand text colour (never pure black)

// ONE base font size for EVERY inside field — a fraction of one panel's width — so the S/M/L
// control (`fontScale`) is the ONLY thing that changes size, and it changes every panel EQUALLY
// (no field is arbitrarily larger than another — the founder's "consistent across each printmap").
// A field, or the right page's three fields together, then shrinks BELOW this base only when it
// would overflow its panel (fitCardFontSize), so a long verse fits instead of clipping. The preview
// (CardInsidePreview) uses the SAME base fraction and the SAME fit — expressed in cqw — so what the
// shopper saw is what prints.
const BODY = 0.085; // per-panel-width fraction (preview mirror = BODY×50 cqw)
const PAD = 0.1; // padding, per-panel-width fraction
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
  const pad = Math.round(w * PAD);
  const innerW = w - 2 * pad;
  const innerH = h - 2 * pad;
  const base = w * BODY * k;
  // The note owns the whole left page; the right page's three fields share one page, so they fit as
  // a GROUP (one size for all three) with a line of slack between them. Short text stays at `base`
  // (so every panel matches); long text shrinks just enough to fit — never clips.
  const leftPx = Math.round(fitCardFontSize([msg.note], innerW, innerH, base, { lineHeight: LINE }));
  const rightPx = Math.round(fitCardFontSize([msg.greeting, msg.message, msg.signature], innerW, innerH, base, { lineHeight: LINE, gapLines: 1 }));
  const font = { fontFamily: msg.font, color: COCOA } as const;

  // LEFT / facing page — the note, centred vertically + horizontally.
  const left = msg.note
    ? await rasterise(
        el(
          'div',
          { style: { display: 'flex', width: w, height: h, padding: pad, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', ...font } },
          el('div', { style: { display: 'flex', textAlign: 'center', lineHeight: LINE, fontSize: leftPx } }, msg.note),
        ),
        msg.font,
        woff,
        w,
        h,
      )
    : await whitePanel(w, h);

  // RIGHT page — greeting top-left · message centred · signature bottom-left (empty fields collapse).
  // All three share ONE fitted size (rightPx) so the page reads evenly.
  const right =
    msg.greeting || msg.message || msg.signature
      ? await rasterise(
          el(
            'div',
            { style: { display: 'flex', flexDirection: 'column', width: w, height: h, padding: pad, backgroundColor: 'white', lineHeight: LINE, ...font } },
            el('div', { style: { display: 'flex', fontSize: rightPx } }, msg.greeting || ''),
            el('div', { style: { display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: rightPx } }, msg.message || ''),
            el('div', { style: { display: 'flex', fontSize: rightPx } }, msg.signature || ''),
          ),
          msg.font,
          woff,
          w,
          h,
        )
      : await whitePanel(w, h);

  return { left, right };
}
