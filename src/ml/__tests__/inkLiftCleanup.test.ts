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

  it('lifts a white sheet off a DARK table (walnut / a black desk) — both go in one click', async () => {
    const grain = Array.from({ length: 40 }, (_, i) => `<rect x="0" y="${i * 12}" width="640" height="4" fill="#4a3020" opacity="0.7"/>`).join('');
    const buf = await svgPng(640, 480, `<rect width="640" height="480" fill="#2a1a10"/>${grain}
      <polygon points="90,60 560,40 580,430 70,440" fill="#f4f1e8"/>
      <circle cx="320" cy="240" r="80" fill="#2f5da8"/>`);
    const a = await alphaAt(buf, { keepEnclosedPaper: true });
    expect(a(15, 15)).toBe(0); // the dark table
    expect(a(140, 110)).toBe(0); // the sheet
    expect(a(320, 240)).toBe(255); // the drawing
  });

  it('lifts a DEEP RED sheet lit from one side (bright edge to deep shadow — one hue)', async () => {
    const buf = await svgPng(600, 800, `<defs><linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eb3735"/><stop offset="1" stop-color="#a60b13"/></linearGradient></defs>
      <rect width="600" height="800" fill="url(#l)"/><rect x="220" y="300" width="160" height="200" fill="#1f7a2e"/>`);
    const a = await alphaAt(buf);
    expect(a(20, 20)).toBe(0); // bright corner
    expect(a(580, 780)).toBe(0); // shadowed corner
    expect(a(300, 400)).toBe(255);
  });

  it('keeps a SATURATED yellow chick on PALE yellow paper (same hue, far more colour)', async () => {
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#ede080"/><circle cx="300" cy="240" r="70" fill="#fad700"/>`);
    const a = await alphaAt(buf);
    expect(a(10, 10)).toBe(0);
    expect(a(300, 240)).toBe(255);
  });

  it('keeps drawing right at the EDGE of a coloured sheet on a table (never painted over as table)', async () => {
    const grain = Array.from({ length: 40 }, (_, i) => `<rect x="0" y="${i * 12}" width="640" height="5" fill="#b8936a" opacity="0.6"/>`).join('');
    const buf = await svgPng(640, 480, `<rect width="640" height="480" fill="#d1ac81"/>${grain}
      <rect x="40" y="40" width="560" height="400" fill="#65cdfc"/>
      <ellipse cx="110" cy="200" rx="70" ry="45" fill="#f67d30"/>`);
    const a = await alphaAt(buf, { keepEnclosedPaper: true });
    expect(a(10, 10)).toBe(0); // the table
    expect(a(400, 300)).toBe(0); // the blue sheet
    expect(a(110, 200)).toBe(255); // the orange fish near the sheet's edge
  });

  it('never mistakes a big painted shape on WHITE paper for a sheet (it would be erased)', async () => {
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#fbfaf6"/><circle cx="300" cy="240" r="210" fill="#c8402a"/>`);
    const a = await alphaAt(buf);
    expect(a(10, 10)).toBe(0);
    expect(a(300, 240)).toBe(255); // the painted circle stays
  });

  // ── founder's second round (26 Oct): the lion, the birthday card, and no new breakages ──
  const oak = (w: number, h: number) => `<rect width="${w}" height="${h}" fill="#c99a62"/>` +
    Array.from({ length: Math.ceil(h / 12) }, (_, i) => `<rect x="0" y="${i * 12}" width="${w}" height="5" fill="#a87a48" opacity="0.6"/>`).join('');

  it('lifts a GREEN sheet whose middle is mostly the drawing (a big lion) off an oak table', async () => {
    const buf = await svgPng(640, 480, `${oak(640, 480)}
      <rect x="50" y="40" width="540" height="400" fill="#a6d79a"/>
      <circle cx="320" cy="240" r="150" fill="#f2b632"/><circle cx="320" cy="240" r="95" fill="#e8a020"/>`);
    const a = await alphaAt(buf, { keepEnclosedPaper: true });
    expect(a(10, 10)).toBe(0); // the table
    expect(a(90, 80)).toBe(0); // the green paper
    expect(a(560, 400)).toBe(0);
    expect(a(320, 240)).toBe(255); // the lion
  });

  it('lifts a PALE PINK sheet off a WHITE desk — no pink scraps left round the drawing', async () => {
    const buf = await svgPng(600, 760, `<rect width="600" height="760" fill="#eeeeec"/>
      <rect x="40" y="20" width="520" height="720" fill="#f3c5ca"/>
      <rect x="140" y="360" width="320" height="300" fill="#7b4fc4"/>`);
    const a = await alphaAt(buf, { keepEnclosedPaper: true });
    expect(a(10, 10)).toBe(0); // the desk
    expect(a(80, 60)).toBe(0); // the pink paper
    expect(a(300, 700)).toBe(0); // the pink paper below the cake
    expect(a(520, 500)).toBe(0); // …and beside it
    expect(a(300, 500)).toBe(255); // the cake
  });

  it('keeps SNOW painted right across a navy card to its edges (it is still the sheet, not table)', async () => {
    const buf = await svgPng(640, 480, `${oak(640, 480)}
      <rect x="60" y="40" width="520" height="400" fill="#1d4a8f"/>
      <rect x="60" y="300" width="520" height="140" fill="#f2f4f8"/>
      <ellipse cx="300" cy="200" rx="60" ry="90" fill="#111111"/>`);
    const a = await alphaAt(buf, { keepEnclosedPaper: true });
    expect(a(10, 10)).toBe(0); // the table
    expect(a(120, 80)).toBe(0); // the navy card
    expect(a(100, 400)).toBe(255); // the snow, right to the sheet's edge
    expect(a(560, 330)).toBe(255);
    expect(a(300, 200)).toBe(255); // the penguin
  });

  it('a RED sheet photographed edge to edge (white showing only at the sides) is never mistaken for a table', async () => {
    const buf = await svgPng(560, 800, `<rect width="560" height="800" fill="#f4f4f2"/>
      <rect x="40" y="0" width="480" height="800" fill="#e45a5e"/>
      <rect x="200" y="250" width="160" height="300" fill="#2f5da8"/>`);
    const a = await alphaAt(buf, { keepEnclosedPaper: true });
    expect(a(280, 400)).toBe(255); // the blue figure stays
    expect(a(100, 100)).toBe(0); // the red paper goes
  });

  it('an enclosed area that was COLOURED IN (sand on a parchment island) keeps its colour, not white', async () => {
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#e9cf9a"/>
      <ellipse cx="300" cy="240" rx="180" ry="120" fill="#d2ad72" stroke="#3a2a1a" stroke-width="8"/>`);
    const res = await liftInk(buf, { keepEnclosedPaper: true });
    const { data, info } = await sharp(res!.buffer).raw().toBuffer({ resolveWithObject: true });
    const i = (240 * info.width + 300) * 4;
    expect(data[i + 3]).toBe(255);
    expect(Math.min(data[i]!, data[i + 1]!, data[i + 2]!)).toBeLessThan(200); // sand, not flat white
  });

  it('can be switched off (the old single pass)', async () => {
    const buf = await svgPng(600, 480, `<rect width="600" height="480" fill="#c53134"/><rect x="250" y="200" width="100" height="100" fill="#1f7a2e"/>`);
    const res = await liftInk(buf, { cleanup: false });
    expect(res).not.toBeNull();
  });
});
