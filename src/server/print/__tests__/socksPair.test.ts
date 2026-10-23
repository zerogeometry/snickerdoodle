import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nearestOf, renderTemplatePreview } from '../compositor';
import { layeredFlatTemplate, piecesOf } from '../seedMockups';

/**
 * A pair of socks is two of the SAME sock, each printed from the same print map (founder). So the
 * photo gives each sock its own print area showing the whole print file — the two socks match —
 * instead of one print file stretched across the pair (each sock a different part of it).
 * Synthetic, brand-safe layers only: no child's image, no founder photo needed.
 */

/** Paint a filled, rotated, rounded rectangle (a sock-ish capsule) into an alpha plane. */
function paint(a: Uint8Array, W: number, H: number, cx: number, cy: number, w: number, h: number, deg: number, r: number) {
  const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = Math.abs(dx * cs + dy * sn), v = Math.abs(-dx * sn + dy * cs);
      const qx = u - (w / 2 - r), qy = v - (h / 2 - r);
      if (qx <= 0 || qy <= 0 ? u <= w / 2 && v <= h / 2 : Math.hypot(qx, qy) <= r) a[y * W + x] = 255;
    }
  return a;
}

describe('piecesOf — the separate pieces of a print area', () => {
  it('a pair of socks → two pieces, left to right; a speck is ignored', () => {
    const W = 300, H = 200;
    const a = new Uint8Array(W * H);
    paint(a, W, H, 210, 100, 60, 160, 0, 20); // the right sock first …
    paint(a, W, H, 80, 100, 60, 160, 0, 20); // … then the left
    a[5 * W + 5] = 255; // a speck
    const parts = piecesOf(a, W, H);
    expect(parts).toHaveLength(2);
    const cx = (m: Uint8Array) => {
      let s = 0, n = 0;
      for (let i = 0; i < m.length; i++) if (m[i]) { s += i % W; n++; }
      return s / n;
    };
    expect(cx(parts[0]!)).toBeLessThan(cx(parts[1]!));
    expect(Math.round(cx(parts[0]!))).toBeCloseTo(80, -1);
  });
});

describe('nearestOf — two overlapping print areas never draw over each other', () => {
  it('each pixel comes from the area whose centre is nearest', () => {
    const W = 10, H = 1;
    const red = Buffer.alloc(W * 4), blue = Buffer.alloc(W * 4);
    for (let x = 0; x < W; x++) {
      red.set([255, 0, 0, 255], x * 4); // both cover the whole row
      blue.set([0, 0, 255, 255], x * 4);
    }
    const out = nearestOf([red, blue], [[2, 0.5], [8, 0.5]], W, H);
    expect([...out.subarray(0, 4)]).toEqual([255, 0, 0, 255]); // x=0 → nearer red's centre
    expect([...out.subarray(9 * 4, 10 * 4)]).toEqual([0, 0, 255, 255]); // x=9 → blue's
  });
});

describe('a pair of socks in the photo — both socks show the same print', () => {
  const W = 900, H = 900, deg = -16;
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'socks-pair-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const stage = async () => {
    const alpha = new Uint8Array(W * H);
    paint(alpha, W, H, 300, 470, 190, 560, deg, 80);
    paint(alpha, W, H, 600, 430, 190, 560, deg, 80);
    const rgba = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) if (alpha[i]) rgba.set([250, 250, 250, 255], i * 4);
    const png = (b: Buffer) => sharp(b, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    writeFileSync(path.join(dir, 'product.png'), await png(rgba));
    writeFileSync(path.join(dir, 'printmap.png'), await png(rgba));
    writeFileSync(path.join(dir, 'shadow.png'), await png(Buffer.alloc(W * H * 4)));
    writeFileSync(path.join(dir, 'background.png'), await sharp({ create: { width: W, height: H, channels: 3, background: '#f8f5e9' } }).png().toBuffer());
  };

  /** A brand-safe, lopsided test design (so a turned / mirrored / shifted copy can't pass). */
  const design = () =>
    sharp({ create: { width: 600, height: 600, channels: 3, background: '#ffffff' } })
      .composite([
        { input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect x="0" y="0" width="600" height="200" fill="#c8402a"/><rect x="0" y="200" width="200" height="400" fill="#2f5da8"/><circle cx="420" cy="420" r="120" fill="#7fa65e"/></svg>') },
      ])
      .png()
      .toBuffer();

  /** The colour at (u, v) of a print area — the same spot of the print file. */
  const at = (img: { data: Buffer; width: number }, q: [number, number][], u: number, v: number, Wimg: number, Himg: number) => {
    const [tl, tr, br, bl] = q;
    const x = ((1 - v) * ((1 - u) * tl![0] + u * tr![0]) + v * ((1 - u) * bl![0] + u * br![0])) * Wimg;
    const y = ((1 - v) * ((1 - u) * tl![1] + u * tr![1]) + v * ((1 - u) * bl![1] + u * br![1])) * Himg;
    const i = (Math.round(y) * img.width + Math.round(x)) * 3;
    return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
  };

  it('traces one print area per sock, each turned to its sock', async () => {
    await stage();
    const t = await layeredFlatTemplate(dir, 1, true, false, true);
    expect(t?.extraQuads).toHaveLength(1);
    // left sock first; both turned to the socks' −16°
    const angle = (q: [number, number][]) => (Math.atan2((q[1]![1] - q[0]![1]) * H, (q[1]![0] - q[0]![0]) * W) * 180) / Math.PI;
    expect(t!.quad[0]![0]).toBeLessThan(t!.extraQuads![0]![0]![0]);
    expect(angle(t!.quad)).toBeCloseTo(deg, 0);
    expect(angle(t!.extraQuads![0]!)).toBeCloseTo(deg, 0);
  });

  it('both socks show the same print, spot for spot (the old single area did not)', async () => {
    await stage();
    const print = { widthPx: 600, heightPx: 600, bleedMm: 0, requiredDpi: 300 };
    const compare = async (pieces: boolean) => {
      const t = (await layeredFlatTemplate(dir, 1, true, false, pieces))!;
      const webp = await renderTemplatePreview({ blank: t.blank, mask: t.mask, quad: t.quad, extraQuads: t.extraQuads, materialClass: 'LIGHT_FABRIC', design: await design(), productKey: 'socksTest', print });
      const { data, info } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const img = { data, width: info.width };
      // the same spots of each sock (each sock's own print area), in either version
      const perSock = (await layeredFlatTemplate(dir, 1, true, false, true))!;
      const quads: [number, number][][] = [perSock.quad, perSock.extraQuads![0]!];
      let diff = 0, n = 0;
      for (const u of [0.35, 0.45, 0.55, 0.65]) for (const v of [0.3, 0.45, 0.6, 0.75]) {
        const a = at(img, quads[0]!, u, v, info.width, info.height);
        const b = at(img, quads[1]!, u, v, info.width, info.height);
        diff += Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!);
        n++;
      }
      return diff / n;
    };
    expect(await compare(true), 'one print area per sock: the socks match').toBeLessThan(25);
    expect(await compare(false), 'one area across the pair: they did not').toBeGreaterThan(60);
  });
});
