import { describe, it, expect } from 'vitest';
import sharp, { type OutputInfo } from 'sharp';
import { assembleCardPrintSpread, CARD_SPREAD, CARD_PANEL_X, CARD_BACK_BADGE_WIDTH_PX } from '@/server/print/cardPrint';
import { renderCardBackBadge } from '@/server/print/cardBranding';
import type { ScreenedCardMessage } from '@/server/textSafety';

const PANEL_W = CARD_SPREAD.widthPx / 4;
const MIDY = Math.round(CARD_SPREAD.heightPx / 2);
const green = () => sharp({ create: { width: 1500, height: 2100, channels: 3, background: { r: 40, g: 170, b: 80 } } }).png().toBuffer();
const magenta = () => sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 210, g: 40, b: 180, alpha: 1 } } }).png().toBuffer();
const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 as const };
const message = (over: Partial<ScreenedCardMessage> = {}): ScreenedCardMessage => ({
  greeting: 'Happy Birthday, Mabel!', message: 'Hope your day is lovely.', signature: 'love, Mum x', note: 'for you', font: 'caveat', fontScale: 1, ...over,
});

async function pixels(png: Buffer) {
  return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function at(buf: { data: Buffer; info: OutputInfo }, x: number, y: number): [number, number, number] {
  const i = (y * buf.info.width + x) * buf.info.channels;
  return [buf.data[i]!, buf.data[i + 1]!, buf.data[i + 2]!];
}
const isGreen = ([r, g, b]: number[]) => g! > 120 && r! < 120 && b! < 130;
const isWhite = ([r, g, b]: number[]) => r! > 240 && g! > 240 && b! > 240;
// dark ink anywhere in a vertical band (text present)
function bandInk(buf: { data: Buffer; info: OutputInfo }, x0: number, x1: number): number {
  let n = 0;
  for (let y = 40; y < buf.info.height - 40; y += 4) for (let x = x0 + 40; x < x1 - 40; x += 4) {
    const [r, g, b] = at(buf, x, y);
    if (r < 120 && g < 120 && b < 120) n++;
  }
  return n;
}
const centre = (panelX: number) => Math.round(panelX + PANEL_W / 2);

describe('card 4-panel print assembly', () => {
  it('outputs the exact Prodigi artboard size', async () => {
    const out = await assembleCardPrintSpread({ design: await green(), transform: tf, span: 'front', message: null });
    const m = await sharp(out).metadata();
    expect(`${m.width}x${m.height}`).toBe('6236x2220');
  });

  it('FRONT-ONLY: design on the outer-front panel; rear white; inside white when blank', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await green(), transform: tf, span: 'front', message: null }));
    expect(isGreen(at(p, centre(CARD_PANEL_X.outerFront), MIDY))).toBe(true); // design → outer front
    expect(isWhite(at(p, centre(CARD_PANEL_X.outerRear), MIDY))).toBe(true); // rear stays white
    expect(bandInk(p, CARD_PANEL_X.insideFront, CARD_PANEL_X.insideFront + PANEL_W)).toBe(0); // blank inside
    expect(bandInk(p, CARD_PANEL_X.insideBack, CARD_PANEL_X.insideBack + PANEL_W)).toBe(0);
  });

  it('FULL-WIDTH: the design spans outer rear AND front', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await green(), transform: tf, span: 'full', message: null }));
    expect(isGreen(at(p, centre(CARD_PANEL_X.outerRear), MIDY))).toBe(true); // now the rear shows the design too
    expect(isGreen(at(p, centre(CARD_PANEL_X.outerFront), MIDY))).toBe(true);
  });

  it('branding badge lands in the lower third of the outer-rear panel', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await green(), transform: tf, span: 'front', message: null, branding: await magenta() }));
    const badgeY = Math.round(CARD_SPREAD.heightPx * 0.72); // the back-of-card mark's row
    const [r, g, b] = at(p, centre(CARD_PANEL_X.outerRear), badgeY);
    expect(r > 160 && b > 130 && g < 110).toBe(true); // magenta stand-in badge, centred-x + lower-third
    expect(isWhite(at(p, centre(CARD_PANEL_X.outerRear), MIDY))).toBe(true); // rear vertical centre stays clear
  });

  it('the Snickerdoodle back badge renders at the requested width with the wordmark drawn', async () => {
    const badge = await renderCardBackBadge(CARD_BACK_BADGE_WIDTH_PX);
    const m = await sharp(badge).metadata();
    expect(m.width).toBe(CARD_BACK_BADGE_WIDTH_PX);
    expect(m.hasAlpha).toBe(true); // transparent surround so it composites over any back
    // dark wordmark ink present (not a blank chip)
    const { data, info } = await sharp(badge).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let ink = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i + 3]! > 40 && data[i]! < 90) ink++;
    expect(ink).toBeGreaterThan(500);
  });

  it('a message prints the note on inside-front and the greeting/message/signature on inside-back', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await green(), transform: tf, span: 'front', message: message() }));
    expect(bandInk(p, CARD_PANEL_X.insideFront, CARD_PANEL_X.insideFront + PANEL_W)).toBeGreaterThan(20); // note text
    expect(bandInk(p, CARD_PANEL_X.insideBack, CARD_PANEL_X.insideBack + PANEL_W)).toBeGreaterThan(20); // message text
    // the OUTSIDE panels carry no message ink (design/white only)
    expect(bandInk(p, CARD_PANEL_X.outerFront, CARD_PANEL_X.outerFront + PANEL_W)).toBe(0);
  });
});
