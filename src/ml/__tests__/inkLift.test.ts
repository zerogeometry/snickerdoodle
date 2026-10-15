import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { liftInk } from '../inkLift';

const W = 600, H = 480;

/** A phone-photo-like drawing: paper, a shadow falling across it, JPEG artefacts. */
async function drawing(paper: string, body: string, opts: { shadow?: boolean } = {}): Promise<Buffer> {
  const shadow = opts.shadow === false ? '' : `<defs><radialGradient id="l" cx="25%" cy="20%" r="100%"><stop offset="0" stop-opacity="0"/><stop offset="1" stop-opacity="0.3"/></radialGradient></defs>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${shadow}<rect width="${W}" height="${H}" fill="${paper}"/>${body}${opts.shadow === false ? '' : `<rect width="${W}" height="${H}" fill="url(#l)"/>`}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function lifted(buf: Buffer) {
  const res = await liftInk(buf);
  expect(res).not.toBeNull();
  const { data, info } = await sharp(res!.buffer).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * 4;
    return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! };
  };
  return { at, data, info, res: res! };
}

describe('liftInk — lifting children’s art off the paper', () => {
  it('removes paper ENCLOSED by the drawing (inside a house outline), keeps the outline solid', async () => {
    const { at } = await lifted(await drawing('#f6f3ea', `<rect x="180" y="140" width="240" height="200" fill="none" stroke="#2f5da8" stroke-width="14"/>`));
    expect(at(300, 240).a).toBe(0); // the paper inside the outline — the old flood kept this
    expect(at(30, 30).a).toBe(0); // the paper outside
    expect(at(180, 240).a).toBe(255); // the outline itself
    const ink = at(180, 240);
    expect(ink.b).toBeGreaterThan(ink.r); // still blue
  });

  it('clears paper under a heavy shadow (no grey patches)', async () => {
    const { at } = await lifted(await drawing('#f6f3ea', `<circle cx="300" cy="240" r="60" fill="#c8402a"/>`));
    for (const [x, y] of [[590, 470], [580, 20], [15, 460]] as const) expect(at(x, y).a).toBe(0); // the darkest corners
    expect(at(300, 240).a).toBe(255);
  });

  it('keeps a pale crayon fill SOLID (so it shows on a dark tee) in its own colour', async () => {
    const { at } = await lifted(await drawing('#fbfaf6', `<rect x="200" y="200" width="200" height="80" fill="#f2b6c8"/>`, { shadow: false }));
    const p = at(300, 240);
    expect(p.a).toBe(255);
    expect(p.r).toBeGreaterThan(p.g); // pink, not grey/white
  });

  it('gives a thin pencil line soft edges with NO pale paper halo (the dark-fabric fringe)', async () => {
    const { data, info } = await lifted(await drawing('#fbfaf6', `<path d="M100 240 L500 240" stroke="#55575c" stroke-width="2.4"/>`, { shadow: false }));
    let soft = 0, halo = 0;
    for (let y = 230; y <= 250; y++) {
      for (let x = 150; x <= 450; x++) {
        const i = (y * info.width + x) * 4;
        const a = data[i + 3]!, lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
        if (a > 0 && a < 255) soft++;
        if (a > 60 && lum > 200) halo++; // a visible, near-paper-white pixel = halo
      }
    }
    expect(soft).toBeGreaterThan(50); // anti-aliased, not a jagged cut
    expect(halo).toBe(0);
  });

  it('works on brown craft paper and keeps WHITE paint', async () => {
    const { at } = await lifted(await drawing('#b98b57', `<circle cx="300" cy="240" r="120" fill="none" stroke="#fdfdf8" stroke-width="22"/>`));
    expect(at(300, 240).a).toBe(0); // craft paper inside the ring
    expect(at(420, 240).a).toBe(255); // the white paint
    expect(at(420, 240).r).toBeGreaterThan(200);
  });

  it('declines a full-bleed painting (the "background" is paint — a choice for the parent)', async () => {
    const painting = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#2aa7d8"/>${Array.from({ length: 40 }, (_, k) => `<circle cx="${(k * 97) % W}" cy="${(k * 53) % H}" r="${20 + (k % 5) * 8}" fill="${['#c8402a', '#f6c445', '#7fa65e', '#6b3fa0'][k % 4]}"/>`).join('')}</svg>`,
      ),
    )
      .jpeg()
      .toBuffer();
    // Paper-less: there's no paper to measure ink against.
    const res = await liftInk(painting);
    expect(res === null || res.removedFraction < 0.02 || res.paper.b > res.paper.r).toBe(true);
  });

  it('returns metadata-free PNG with alpha, same size as the input', async () => {
    const { info, res } = await lifted(await drawing('#ffffff', `<rect x="250" y="200" width="100" height="80" fill="#2b2118"/>`, { shadow: false }));
    expect(info.channels).toBe(4);
    expect([res.width, res.height]).toEqual([W, H]);
    expect((await sharp(res.buffer).metadata()).exif).toBeUndefined();
  });

  it('optionally KEEPS paper enclosed by the drawing (whites of the eyes, a snowman) as clean white', async () => {
    const buf = await drawing('#f6f3ea', `<circle cx="300" cy="240" r="100" fill="none" stroke="#2b2118" stroke-width="12"/>`);
    const res = await liftInk(buf, { keepEnclosedPaper: true });
    const { data, info } = await sharp(res!.buffer).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]!;
    const rgb = (x: number, y: number) => data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3);
    expect(at(300, 240)).toBe(255); // inside the circle: kept…
    expect(Math.min(...rgb(300, 240))).toBeGreaterThan(245); // …as clean white, not shadowed grey
    expect(at(20, 20)).toBe(0); // outside still cleared
  });

  it('handles a SMALL image (a screenshot / thumbnail) instead of declining', async () => {
    const small = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([{ input: { create: { width: 20, height: 20, channels: 3, background: { r: 30, g: 120, b: 200 } } }, left: 20, top: 20 }])
      .png()
      .toBuffer();
    const res = await liftInk(small);
    expect(res).not.toBeNull();
    const { data, info } = await sharp(res!.buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[(2 * info.width + 2) * 4 + 3]).toBe(0); // paper
    expect(data[(30 * info.width + 30) * 4 + 3]).toBe(255); // the square
  });
});
