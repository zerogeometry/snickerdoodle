import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderCardInsidePanels } from '@/server/print/cardText';
import type { ScreenedCardMessage } from '@/server/textSafety';
import { CARD_FONTS } from '@/lib/card-fonts';

// Small panels for speed; 5:7 like a real card panel.
const GEOM = { panelWidthPx: 600, panelHeightPx: 840 };

const msg = (over: Partial<ScreenedCardMessage> = {}): ScreenedCardMessage => ({
  greeting: 'Happy Birthday, Mabel!',
  message: 'Hope your day is full of cake and every good thing.',
  signature: 'love, Mum & Dad x',
  note: 'for our favourite four-year-old',
  font: 'caveat',
  fontScale: 1,
  ...over,
});

async function ink(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i]! < 120) n++;
  return n;
}
async function dims(png: Buffer): Promise<string> {
  const m = await sharp(png).metadata();
  return `${m.width}x${m.height}`;
}

describe('card inside-panel print renderer (satori + resvg)', () => {
  it('renders both inside panels at the panel dimensions, with the text drawn', async () => {
    const { left, right } = await renderCardInsidePanels(msg(), GEOM);
    expect(await dims(left)).toBe('600x840');
    expect(await dims(right)).toBe('600x840');
    expect(await ink(left)).toBeGreaterThan(500); // the note is on the facing page
    expect(await ink(right)).toBeGreaterThan(500); // greeting/message/signature on the right
  });

  it('a note-only message → the facing page has text, the other page is plain white', async () => {
    const { left, right } = await renderCardInsidePanels(msg({ greeting: '', message: '', signature: '' }), GEOM);
    expect(await ink(left)).toBeGreaterThan(500);
    expect(await ink(right)).toBe(0); // blank white, nothing printed
  });

  it('the chosen FONT actually changes the print — NO silent fallback (the sharp/Pango trap)', async () => {
    const counts = await Promise.all(
      CARD_FONTS.map(async ({ token: font }) => ink((await renderCardInsidePanels(msg({ font }), GEOM)).right)),
    );
    expect(new Set(counts).size).toBe(CARD_FONTS.length); // every face (Christmas ones too) renders distinctly
  });

  it('the S/M/L size control scales the print too (bigger fontScale ⇒ more ink)', async () => {
    const small = await ink((await renderCardInsidePanels(msg({ fontScale: 0.8 }), GEOM)).right);
    const large = await ink((await renderCardInsidePanels(msg({ fontScale: 1.25 }), GEOM)).right);
    expect(large).toBeGreaterThan(small * 1.1);
  });
});
