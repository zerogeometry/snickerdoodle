import { describe, it, expect } from 'vitest';
import sharp, { type OutputInfo } from 'sharp';
import { assembleCardPrintSpread, CARD_SPREAD, CARD_PANEL_X } from '@/server/print/cardPrint';
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

  it('branding lands at the founder’s spot — bottom-left of the outer-rear panel', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await green(), transform: tf, span: 'front', message: null, branding: await magenta() }));
    const badgeX = Math.round(PANEL_W * 0.149); // logo centre: left side of the back panel…
    const badgeY = Math.round(CARD_SPREAD.heightPx * 0.885); // …lower area
    const [r, g, b] = at(p, badgeX, badgeY);
    expect(r > 160 && b > 130 && g < 110).toBe(true); // magenta stand-in at the logo spot
    expect(isWhite(at(p, centre(CARD_PANEL_X.outerRear), MIDY))).toBe(true); // rear centre stays clear
  });

  it('the back logo is the founder’s asset — a transparent PNG with real ink', async () => {
    const badge = renderCardBackBadge();
    const m = await sharp(badge).metadata();
    expect(m.format).toBe('png');
    expect(m.hasAlpha).toBe(true); // transparent surround so it composites over any back
    // dark logo ink present (not a blank asset)
    const { data, info } = await sharp(badge).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let ink = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i + 3]! > 40 && data[i]! < 120) ink++;
    expect(ink).toBeGreaterThan(200);
  });

  it('a message prints the note on inside-front and the greeting/message/signature on inside-back', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await green(), transform: tf, span: 'front', message: message() }));
    expect(bandInk(p, CARD_PANEL_X.insideFront, CARD_PANEL_X.insideFront + PANEL_W)).toBeGreaterThan(20); // note text
    expect(bandInk(p, CARD_PANEL_X.insideBack, CARD_PANEL_X.insideBack + PANEL_W)).toBeGreaterThan(20); // message text
    // the OUTSIDE panels carry no message ink (design/white only)
    expect(bandInk(p, CARD_PANEL_X.outerFront, CARD_PANEL_X.outerFront + PANEL_W)).toBe(0);
  });
});

describe('card print — the base colour fills the OUTSIDE, never the inside', () => {
  const TOMATO = '#c8402a';
  const isTomato = ([r, g, b]: number[]) => Math.abs(r! - 0xc8) < 6 && Math.abs(g! - 0x40) < 6 && Math.abs(b! - 0x2a) < 6;
  // A see-through drawing: a green blob in the middle of a transparent sheet (a lifted-off cutout).
  const cutout = async () =>
    sharp({ create: { width: 1500, height: 2100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 40, g: 170, b: 80, alpha: 1 } } }).png().toBuffer(), left: 600, top: 900 }])
      .png()
      .toBuffer();
  const near = (panelX: number) => panelX + 60; // well inside the panel, away from the drawing in its middle
  const panelSamples = (panelX: number): [number, number][] => [[near(panelX), 60], [near(panelX), MIDY], [panelX + PANEL_W - 60, CARD_SPREAD.heightPx - 60]];

  it('FRONT-ONLY: the front panel is the colour where the drawing is see-through, the drawing sits on it; rear + inside stay white', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await cutout(), transform: tf, span: 'front', message: null, groundHex: TOMATO }));
    for (const [x, y] of panelSamples(CARD_PANEL_X.outerFront)) expect(isTomato(at(p, x, y)), `front ${x},${y}`).toBe(true);
    expect(isGreen(at(p, centre(CARD_PANEL_X.outerFront), MIDY))).toBe(true); // the drawing, on top of the colour
    for (const [x, y] of panelSamples(CARD_PANEL_X.outerRear)) expect(isWhite(at(p, x, y)), `rear ${x},${y}`).toBe(true);
    for (const panel of [CARD_PANEL_X.insideFront, CARD_PANEL_X.insideBack]) {
      for (const [x, y] of [...panelSamples(panel), [centre(panel), MIDY] as [number, number]]) expect(isWhite(at(p, x, y)), `inside ${x},${y}`).toBe(true);
    }
  });

  it('FULL-WIDTH: the rear takes the colour too, and the back logo still sits on top of it', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await cutout(), transform: tf, span: 'full', message: null, branding: await magenta(), groundHex: TOMATO }));
    // the drawing now straddles the fold, so sample the colour away from it: the outer edges + corners
    const farFront = CARD_PANEL_X.outerFront + PANEL_W - 60;
    for (const [x, y] of [[farFront, 60], [farFront, MIDY], [farFront, CARD_SPREAD.heightPx - 60]] as [number, number][]) expect(isTomato(at(p, x, y)), `front ${x},${y}`).toBe(true);
    expect(isGreen(at(p, CARD_PANEL_X.outerFront, MIDY))).toBe(true); // the drawing, across the fold
    for (const [x, y] of [[60, 60], [60, MIDY], [centre(CARD_PANEL_X.outerRear), 60]] as [number, number][]) expect(isTomato(at(p, x, y)), `rear ${x},${y}`).toBe(true);
    const [r, g, b] = at(p, Math.round(PANEL_W * 0.149), Math.round(CARD_SPREAD.heightPx * 0.885));
    expect(r > 160 && b > 130 && g < 110).toBe(true); // magenta stand-in for the logo, over the colour
    for (const panel of [CARD_PANEL_X.insideFront, CARD_PANEL_X.insideBack]) {
      for (const [x, y] of panelSamples(panel)) expect(isWhite(at(p, x, y)), `inside ${x},${y}`).toBe(true);
    }
  });

  it('with a printed message, the inside stays white paper behind the words', async () => {
    const p = await pixels(await assembleCardPrintSpread({ design: await cutout(), transform: tf, span: 'front', message: message(), groundHex: TOMATO }));
    for (const panel of [CARD_PANEL_X.insideFront, CARD_PANEL_X.insideBack]) {
      for (const [x, y] of panelSamples(panel)) expect(isWhite(at(p, x, y)), `inside ${x},${y}`).toBe(true);
    }
  });

  it('no colour (null / absent) is the card exactly as before — byte for byte', async () => {
    const design = await cutout();
    const plain = await assembleCardPrintSpread({ design, transform: tf, span: 'front', message: null });
    const nulled = await assembleCardPrintSpread({ design, transform: tf, span: 'front', message: null, groundHex: null });
    expect(nulled.equals(plain)).toBe(true);
    const p = await pixels(plain);
    for (const [x, y] of panelSamples(CARD_PANEL_X.outerFront)) expect(isWhite(at(p, x, y))).toBe(true);
  });
});
