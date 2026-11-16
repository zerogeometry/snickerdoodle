import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pieceOwners } from '../compositor';
import { layeredFlatTemplate, plan, sideQuad } from '../seedMockups';
import { renderRepeatPattern } from '../pattern';
import { patternLayout } from '../pattern-geometry';
import { sockSideFor, SOCK_SIDES, type SockSide } from '../sockTemplates';

/**
 * Socks follow PRODIGI'S TEMPLATE (founder, 16 Nov 2026 — "absolute certainty it will print cleanly and as
 * previewed"): the print file is ONE sock's two sides, the left half one side, the right half its mirror.
 * Synthetic, brand-safe shapes only — no child's image, no founder photo.
 */

/** Paint the tube template's LEFT-half sock (or its mirror) into an alpha plane, the half laid on `rect` (px). */
function paintSide(a: Uint8Array, W: number, rect: { x: number; y: number; w: number; h: number }, side: 'left' | 'right') {
  const { outline: spans } = SOCK_SIDES.tube;
  for (let py = Math.ceil(rect.y); py < rect.y + rect.h; py++) {
    const r = Math.min(spans.length - 1, Math.floor(((py + 0.5 - rect.y) / rect.h) * spans.length));
    const span = spans[r];
    if (!span) continue;
    const [l, rr] = side === 'left' ? span : [1 - span[1], 1 - span[0]];
    for (let px = Math.ceil(rect.x + l * rect.w); px < rect.x + rr * rect.w; px++) a[py * W + px] = 255;
  }
}

describe('the tube pair: each sock shows ITS side of the file (sideQuad)', () => {
  // two template-shaped socks, upright: each half of the 300 × 520 mm file drawn 150 px wide, 520 px tall
  const W = 700, H = 640;
  const left = { x: 60, y: 60, w: 150, h: 520 }, right = { x: 420, y: 60, w: 150, h: 520 };
  const alphaOf = (side: 'left' | 'right') => {
    const a = new Uint8Array(W * H);
    paintSide(a, W, side === 'left' ? left : right, side);
    return a;
  };

  it('the left sock: the file’s LEFT half lies exactly on it, the right half off to its right', () => {
    const s = sideQuad(alphaOf('left'), W, H, 'left', SOCK_SIDES.tube)!;
    expect(s.fit).toBeGreaterThan(0.97); // the template's own shape → a near-perfect fit
    const [tl, tr, br, bl] = s.quad;
    const px = (p: [number, number]) => [p[0] * W, p[1] * H];
    // the whole file = the half's rectangle, twice as wide, going right
    expect(px(tl!)[0]).toBeCloseTo(left.x, -1);
    expect(px(tl!)[1]).toBeCloseTo(left.y, -1);
    expect(px(tr!)[0]).toBeCloseTo(left.x + 2 * left.w, -1);
    expect(px(bl!)[1]).toBeCloseTo(left.y + left.h, -1);
    expect(px(br!)[0]).toBeCloseTo(left.x + 2 * left.w, -1);
  });

  it('the right sock: the file’s RIGHT half lies on it, the left half off to its left', () => {
    const s = sideQuad(alphaOf('right'), W, H, 'right', SOCK_SIDES.tube)!;
    expect(s.fit).toBeGreaterThan(0.97);
    const [tl, tr] = s.quad;
    expect(tl![0] * W).toBeCloseTo(right.x - right.w, -1);
    expect(tr![0] * W).toBeCloseTo(right.x + right.w, -1);
  });

  it('the tube plan asks for it; the ankle plan is built on its template (artboard)', () => {
    const tube = plan('socks', { size: 'tube' });
    const ankle = plan('socks', {});
    if (tube?.register === 'layered-flat') expect(tube.pieces).toBe(SOCK_SIDES.tube);
    if (ankle?.register === 'layered-flat') {
      expect(ankle.artboard).toBe(true);
      expect(ankle.pieces ?? false).toBe(false);
    }
  });
});

describe('the ankle set built on Prodigi’s template: the WHOLE print file lies on its artboard', () => {
  const W = 400, H = 400;
  let dir = '';
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'socks-artboard-'));
    const png = (b: Buffer) => sharp(b, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const rgba = Buffer.alloc(W * H * 4);
    for (let y = 60; y < 340; y++) for (let x = 60; x < 190; x++) rgba.set([250, 250, 250, 255], (y * W + x) * 4);
    for (let y = 60; y < 340; y++) for (let x = 210; x < 340; x++) rgba.set([250, 250, 250, 255], (y * W + x) * 4);
    writeFileSync(path.join(dir, 'product.png'), await png(rgba));
    writeFileSync(path.join(dir, 'printmap.png'), await png(rgba));
    writeFileSync(path.join(dir, 'shadow.png'), await png(Buffer.alloc(W * H * 4)));
    writeFileSync(path.join(dir, 'background.png'), await sharp({ create: { width: W, height: H, channels: 3, background: '#f8f5e9' } }).png().toBuffer());
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('no artboard.json → no template (never a guessed mapping)', async () => {
    expect(await layeredFlatTemplate(dir, 1, false, false, false, true)).toBeNull();
  });

  it('with it → one straight print area, exactly the artboard', async () => {
    writeFileSync(path.join(dir, 'artboard.json'), JSON.stringify({ x0: 0.1, y0: 0.09, x1: 0.9, y1: 0.89 }));
    const t = (await layeredFlatTemplate(dir, 1, false, false, false, true))!;
    expect(t.extraQuads).toBeUndefined();
    expect(t.quad).toEqual([[0.1, 0.09], [0.9, 0.09], [0.9, 0.89], [0.1, 0.89]]);
  });

  it('a broken artboard.json is refused', async () => {
    writeFileSync(path.join(dir, 'artboard.json'), JSON.stringify({ x0: 0.5, y0: 0.1, x1: 0.2, y1: 0.9 }));
    await expect(layeredFlatTemplate(dir, 1, false, false, false, true)).rejects.toThrow(/artboard/);
  });
});

describe('each sock gets its own print area, left to right, however the areas’ centres fall', () => {
  it('a piece goes to the area of its place in the row — the whole-file areas’ centres sit off their socks', async () => {
    const W = 200, H = 120;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="10" y="10" width="70" height="100" fill="#fff"/><rect x="120" y="10" width="70" height="100" fill="#fff"/></svg>`;
    const mask = await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
    // area 0 (the left sock's) centred just right of the left sock — nearer the RIGHT sock's middle than
    // area 1's centre, which sits just left of the right sock
    const centres: [number, number][] = [[118, 60], [82, 60]];
    const owner = await pieceOwners(mask, undefined, W, H, centres);
    expect(owner[60 * W + 40]).toBe(0); // the left sock → area 0
    expect(owner[60 * W + 160]).toBe(1); // the right sock → area 1
    expect(owner[5 * W + 100]).toBe(-1); // off the print map
  });
});

describe('the sock repeat (founder, 16 Nov 2026): one line of drawings up each side, inside the sock, mirrored', () => {
  const CANVAS = { ankle: { width: 3543, height: 3543 }, tube: { width: 3543, height: 6141 } } as const;
  const SHAPES = [{ width: 1000, height: 1000 }, { width: 1200, height: 1600 }, { width: 1600, height: 1000 }];
  const tf = (scale: number, rotationDeg: 0 | 90 = 0) => ({ scale, offsetX: 0, offsetY: 0, rotationDeg });

  /** Every corner (and edge midpoint) of every drawing lies in the sock's safe lane, on its own side. */
  const allInside = (kind: 'ankle' | 'tube', scale: number, src: { width: number; height: number }, rot: 0 | 90 = 0) => {
    const c = CANVAS[kind], sock: SockSide = SOCK_SIDES[kind];
    const L = patternLayout(c, 300, src, tf(scale, rot));
    const HW = c.width / 2, rowH = c.height / sock.lane.length;
    for (const m of L.centres!) {
      const rad = (m.angle * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad);
      for (const [u, v] of [[-0.5, -0.5], [0, -0.5], [0.5, -0.5], [0.5, 0], [0.5, 0.5], [0, 0.5], [-0.5, 0.5], [-0.5, 0]] as const) {
        const dx = u * L.motifW, dy = v * L.motifH;
        let x = m.x + dx * cs - dy * sn;
        const y = m.y + dx * sn + dy * cs;
        const right = m.x > HW;
        if (right) x = c.width - x; // the right side is the left's mirror
        expect(right ? m.x - L.motifW / 2 : m.x + L.motifW / 2, 'stays on its own side').toBeLessThanOrEqual(right ? c.width : HW + 1);
        const lane = sock.lane[Math.min(sock.lane.length - 1, Math.floor(y / rowH))];
        expect(lane, `${kind} @${scale}: a drawing off the lane at y=${Math.round(y)}`).toBeTruthy();
        expect(x / HW, `${kind} @${scale}: left edge`).toBeGreaterThanOrEqual(lane![0] - 0.01);
        expect(x / HW, `${kind} @${scale}: right edge`).toBeLessThanOrEqual(lane![1] + 0.01);
      }
    }
    return L;
  };

  it('knows the sock from its print canvas (and nothing else is one)', () => {
    expect(sockSideFor(CANVAS.ankle, 300)).toBe(SOCK_SIDES.ankle);
    expect(sockSideFor(CANVAS.tube, 300)).toBe(SOCK_SIDES.tube);
    expect(sockSideFor({ width: 8208, height: 5492 }, 300)).toBeNull(); // the tea towel
    expect(sockSideFor({ width: 2400, height: 1800 }, 300)).toBeNull();
  });

  it('at first: ONE line up each side, two or more drawings along it — every one wholly inside the sock', () => {
    for (const kind of ['ankle', 'tube'] as const)
      for (const src of SHAPES) {
        const L = allInside(kind, 0, src);
        expect(L.cols, `${kind} ${src.width}×${src.height}`).toBe(2); // one line a side
        expect(L.rows, `${kind} ${src.width}×${src.height}`).toBeGreaterThanOrEqual(kind === 'tube' ? 3 : 2);
      }
  });

  it('the right side is the left’s mirror image in place — the drawing itself never flipped, its turn mirrored', () => {
    for (const kind of ['ankle', 'tube'] as const) {
      const L = patternLayout(CANVAS[kind], 300, SHAPES[1]!, tf(0));
      const left = L.centres!.filter((m) => m.x < CANVAS[kind].width / 2);
      const right = L.centres!.filter((m) => m.x > CANVAS[kind].width / 2);
      expect(right).toHaveLength(left.length);
      for (const m of left) expect(right.some((r) => Math.abs(r.x - (CANVAS[kind].width - m.x)) < 0.5 && Math.abs(r.y - m.y) < 0.5 && Math.abs(r.angle + m.angle) < 1e-9)).toBe(true);
    }
  });

  it('the ankle sock’s drawings lean with its foot; the straight tube sock’s stand upright', () => {
    const ankle = patternLayout(CANVAS.ankle, 300, SHAPES[0]!, tf(0));
    const tube = patternLayout(CANVAS.tube, 300, SHAPES[0]!, tf(0));
    expect(Math.max(...ankle.centres!.map((m) => Math.abs(m.angle)))).toBeGreaterThan(3);
    expect(Math.max(...tube.centres!.map((m) => Math.abs(m.angle)))).toBeLessThan(1.5);
  });

  it('zoom out: smaller drawings, more of them, then TWO lines a side — still all inside; zoom in stops where they fit', () => {
    for (const kind of ['ankle', 'tube'] as const)
      for (const src of SHAPES) {
        const def = allInside(kind, 0, src);
        const out = allInside(kind, 0.38, src);
        expect(out.cols * out.rows).toBeGreaterThan(def.cols * def.rows);
        expect(out.cols, `${kind} ${src.width}×${src.height} two lines`).toBeGreaterThanOrEqual(4);
        const big = allInside(kind, 4, src); // pinched far in
        expect(big.rows).toBeGreaterThanOrEqual(2);
        allInside(kind, 0.7, src, 90); // turned drawings fit too
      }
  });

  it('the print file: nothing on the front fold (the middle line) or past the sock’s outline', async () => {
    const red = await sharp({ create: { width: 800, height: 900, channels: 3, background: '#d62728' } }).png().toBuffer();
    const { png, width, height } = await renderRepeatPattern(red, CANVAS.ankle, 300, tf(0.6));
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const isRed = (x: number, y: number) => data[(y * width + x) * info.channels]! > 150 && data[(y * width + x) * info.channels + 1]! < 90;
    let onFold = 0, inked = 0, outside = 0;
    const { outline } = SOCK_SIDES.ankle, rowH = height / outline.length, HW = width / 2;
    for (let y = 0; y < height; y += 7)
      for (let x = 0; x < width; x += 7) {
        if (!isRed(x, y)) continue;
        inked++;
        if (Math.abs(x - HW) < 40) onFold++;
        const o = outline[Math.min(outline.length - 1, Math.floor(y / rowH))];
        const fx = (x < HW ? x : width - x) / HW;
        if (!o || fx < o[0] || fx > o[1]) outside++;
      }
    expect(inked).toBeGreaterThan(1000);
    expect(onFold).toBe(0);
    expect(outside).toBe(0);
  });
});
