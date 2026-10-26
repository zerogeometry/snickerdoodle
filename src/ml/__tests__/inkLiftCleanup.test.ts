import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { liftInk } from '../inkLift';

// The ONE-CLICK clean-up (founder, 26 Oct): what a parent used to tap off by hand with
// "remove colour · just that patch" goes on the first click — and nothing that is drawing goes with it.

const svgPng = (w: number, h: number, body: string) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)).png().toBuffer();

async function alphaAt(buf: Buffer, opts: Parameters<typeof liftInk>[1] = {}) {
  const res = await liftInk(buf, opts);
  expect(res).not.toBeNull();
  const { data, info } = await sharp(res!.buffer).raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => data[(y * info.width + x) * 4 + 3]!;
}

describe('remove background — one click, ready to go', () => {
  it('clears a slightly different shade of the paper that touches the background (the corner a parent tapped away)', async () => {
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#c53134"/>
      <defs><radialGradient id="g" cx="0" cy="0" r="1"><stop offset="0" stop-color="#e0434a"/><stop offset="1" stop-color="#c53134"/></radialGradient></defs>
      <rect width="260" height="220" fill="url(#g)"/>
      <rect x="300" y="200" width="160" height="160" fill="#1f7a2e"/>`);
    const a = await alphaAt(buf);
    expect(a(30, 30)).toBe(0); // the lighter corner is paper
    expect(a(380, 280)).toBe(255); // the drawing stays
  });

  it('leaves no PINK halo round white cotton wool on red paper, and keeps the white', async () => {
    // fluffy edge: white fading into the red paper over ~14px
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#c53134"/>
      <defs><radialGradient id="w"><stop offset="0.85" stop-color="#fbfbf8"/><stop offset="1" stop-color="#fbfbf8" stop-opacity="0"/></radialGradient></defs>
      <circle cx="300" cy="240" r="110" fill="url(#w)"/>`);
    const res = await liftInk(buf);
    const { data, info } = await sharp(res!.buffer).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => { const i = (y * info.width + x) * 4; return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! }; };
    expect(px(300, 240).a).toBe(255); // the white cotton wool
    for (let r = 94; r <= 110; r++) {
      const p = px(300, 240 - r);
      // the rim is either gone, or WHITE ink fading out — never a visible pink (paper mixed in)
      const pink = p.a > 60 && p.r - Math.min(p.g, p.b) > 45;
      expect(pink, `r=${r} ${JSON.stringify(p)}`).toBe(false);
    }
  });

  it('clears faint paper flecks but keeps small WHITE snowflakes (far from the paper colour)', async () => {
    const flecks = Array.from({ length: 30 }, (_, i) => `<circle cx="${40 + (i % 10) * 50}" cy="${60 + Math.floor(i / 10) * 40}" r="3" fill="#d24a4e"/>`).join('');
    const snow = Array.from({ length: 6 }, (_, i) => `<circle cx="${60 + i * 90}" cy="380" r="4" fill="#ffffff"/>`).join('');
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#c53134"/>${flecks}${snow}<rect x="250" y="200" width="100" height="100" fill="#1f7a2e"/>`);
    const a = await alphaAt(buf);
    expect(a(40, 60)).toBe(0); // a fleck of paper colour
    expect(a(60, 380)).toBeGreaterThan(200); // a snowflake
    expect(a(300, 250)).toBe(255);
  });

  it('lifts a SHEET photographed on a TABLE — the table and the sheet both go, the drawing stays', async () => {
    // a mid-brown wooden table (a near-black one is declined outright — the existing dark-paper rule)
    const grain = Array.from({ length: 40 }, (_, i) => `<rect x="0" y="${i * 12}" width="640" height="5" fill="#7a4e2d" opacity="0.6"/>`).join('');
    const buf = await svgPng(640, 480, `<rect width="640" height="480" fill="#9a6a40"/>${grain}
      <rect x="80" y="50" width="480" height="380" fill="#f3e6b0"/>
      <circle cx="320" cy="240" r="90" fill="#2f5da8"/>`);
    const a = await alphaAt(buf, { keepEnclosedPaper: true });
    expect(a(20, 20)).toBe(0); // the table
    expect(a(120, 90)).toBe(0); // the sheet
    expect(a(320, 240)).toBe(255); // the drawing
  });

  it('never mistakes a big painted shape on WHITE paper for a sheet (it would be erased)', async () => {
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#fbfaf6"/><circle cx="300" cy="240" r="210" fill="#c8402a"/>`);
    const a = await alphaAt(buf);
    expect(a(10, 10)).toBe(0);
    expect(a(300, 240)).toBe(255); // the painted circle stays
  });

  it('can be switched off (the old single pass)', async () => {
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#c53134"/><rect x="250" y="200" width="100" height="100" fill="#1f7a2e"/>`);
    const res = await liftInk(buf, { cleanup: false });
    expect(res).not.toBeNull();
  });
});
