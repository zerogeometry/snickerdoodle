import { describe, expect, it } from 'vitest';
import { layeredFlatPath, layeredFlatTemplate, orientedCoverQuad, plan, tiltOf } from '../seedMockups';
import { definedPriceList } from '@/server/catalogue';
import { isTransposed } from '../compositor';
import { assertQuadFitsBlank } from '../templates';

/** Paint a filled, rotated, ROUNDED rectangle (a card / a sock-ish capsule) into an alpha plane. */
function paint(a: Uint8Array, W: number, H: number, cx: number, cy: number, w: number, h: number, deg: number, r: number) {
  const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = Math.abs(dx * cs + dy * sn), v = Math.abs(-dx * sn + dy * cs);
      const qx = u - (w / 2 - r), qy = v - (h / 2 - r);
      const inside = qx <= 0 || qy <= 0 ? u <= w / 2 && v <= h / 2 : Math.hypot(qx, qy) <= r;
      if (inside) a[y * W + x] = 255;
    }
  return a;
}
const len = (p: number[], q: number[], W: number, H: number) => Math.hypot((p[0]! - q[0]!) * W, (p[1]! - q[1]!) * H);
const edgeDeg = (p: number[], q: number[], W: number, H: number) => (Math.atan2((q[1]! - p[1]!) * H, (q[0]! - p[0]!) * W) * 180) / Math.PI;

describe('a leaning playing card — the art lands on its true corners', () => {
  const W = 800, H = 800, cx = 420, cy = 380, w = 300, h = 420, deg = 8.6, r = 26;
  const alpha = paint(new Uint8Array(W * H), W, H, cx, cy, w, h, deg, r);

  it('reads the card’s tilt', () => {
    expect(tiltOf(alpha, W, H, 1)).toBeCloseTo(deg, 0);
  });

  it('the print area is the card’s sharp corners (not points on the rounded arcs), TL, TR, BR, BL', () => {
    const q = orientedCoverQuad(alpha, W, H, w / h, tiltOf(alpha, W, H, 1), 1)!;
    const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
    const at = (u: number, v: number) => [(cx + u * cs - v * sn) / W, (cy + u * sn + v * cs) / H];
    const expected = [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)];
    q.forEach(([x, y], i) => {
      expect(Math.abs(x - expected[i]![0]!) * W, `corner ${i} x`).toBeLessThan(3);
      expect(Math.abs(y - expected[i]![1]!) * H, `corner ${i} y`).toBeLessThan(3);
    });
  });

  it('is aspect-locked to the PRINT file (widened, never squashed)', () => {
    const q = orientedCoverQuad(alpha, W, H, 0.731, deg, 1)!; // the deck's 820×1122 print
    expect(len(q[0]!, q[1]!, W, H) / len(q[1]!, q[2]!, W, H)).toBeCloseTo(0.731, 3);
    expect(len(q[1]!, q[2]!, W, H)).toBeGreaterThanOrEqual(h - 2); // still covers the whole card
  });
});

describe('ankle socks laid at an angle — the pattern runs down the socks', () => {
  // two parallel sock-ish capsules, tilted ~−16° (toes out to the right, like the founder's photo)
  const W = 900, H = 900, deg = -16;
  const alpha = new Uint8Array(W * H);
  paint(alpha, W, H, 330, 470, 170, 560, deg, 80);
  paint(alpha, W, H, 580, 430, 170, 560, deg, 80);

  it('reads the pair’s tilt from the socks themselves', () => {
    expect(tiltOf(alpha, W, H)).toBeCloseTo(deg, 0);
  });

  it('turns the (square) print area to that tilt and covers both socks', () => {
    const q = orientedCoverQuad(alpha, W, H, 1, tiltOf(alpha, W, H))!;
    expect(edgeDeg(q[0]!, q[1]!, W, H)).toBeCloseTo(deg, 0); // the top edge runs at the socks' angle
    expect(len(q[0]!, q[1]!, W, H) / len(q[1]!, q[2]!, W, H)).toBeCloseTo(1, 3); // square, like the print
    // every opaque pixel is inside the quad (convex: same side of every edge)
    const cross = (a: number[], b: number[], p: number[]) => (b[0]! - a[0]!) * (p[1]! - a[1]!) - (b[1]! - a[1]!) * (p[0]! - a[0]!);
    for (let y = 0; y < H; y += 7)
      for (let x = 0; x < W; x += 7) {
        if (!alpha[y * W + x]) continue;
        const p = [(x + 0.5) / W, (y + 0.5) / H];
        expect([0, 1, 2, 3].every((i) => cross(q[i]!, q[(i + 1) % 4]!, p) >= -1e-6)).toBe(true);
      }
  });

  it('an upright shape reads no tilt; an empty print area gives no quad', () => {
    expect(tiltOf(paint(new Uint8Array(400 * 400), 400, 400, 200, 200, 120, 300, 0, 40), 400, 400)).toBeCloseTo(0, 1);
    expect(orientedCoverQuad(new Uint8Array(100), 10, 10, 1, 0)).toBeNull();
  });
});

describe('isTransposed — when a print is turned 90° to fit an angled view', () => {
  it('turns the tin’s landscape lid print into its portrait view', () => {
    expect(isTransposed(869 / 674, 0.8)).toBe(true);
  });
  it('never turns a square print (a sock pattern) for a rounding hair either side of 1', () => {
    expect(isTransposed(1, 0.9999)).toBe(false);
    expect(isTransposed(1, 1.0001)).toBe(false);
  });
  it('leaves a print that already matches alone', () => {
    expect(isTransposed(0.731, 0.72)).toBe(false);
  });
});

describe('assertQuadFitsBlank — the seeder’s print-area check', () => {
  it('a straight print area must sit inside the photo', () => {
    expect(() => assertQuadFitsBlank([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]])).not.toThrow();
    expect(() => assertQuadFitsBlank([[-0.05, 0.1], [0.9, 0.1], [0.9, 0.9], [-0.05, 0.9]])).toThrow(/outside the blank/);
  });
  it('an angled one may overhang a little (the warp only draws on the photo) — like the 24° ankle socks', () => {
    expect(() => assertQuadFitsBlank([[-0.053, 0.277], [0.73, -0.07], [1.08, 0.72], [0.3, 1.06]])).not.toThrow();
  });
  it('but not far off it, and never with its centre off the photo', () => {
    expect(() => assertQuadFitsBlank([[-0.4, 0.2], [0.6, 0.0], [0.8, 0.9], [-0.2, 1.1]])).toThrow(/outside the blank/);
    expect(() => assertQuadFitsBlank([[0.9, 0.1], [1.2, 0.15], [1.15, 0.5], [0.85, 0.45]])).toThrow(/centre is off/);
  });
});

// The founder-photographed sets live in .prodigi-assets (gitignored) — this runs where they're staged
// (the computer that seeds the test site) and skips elsewhere. It walks EVERY variant through the
// seeder's own plan + the seeder's own print-area check, so a set that can't be seeded fails here.
const STAGED = layeredFlatPath('socks/ankle') !== null;
describe.skipIf(!STAGED)('every founder-photographed variant can be seeded', () => {
  // (kraft wrapping paper always uses the drawn kraft sheet — the founder's photo set is white paper, D24)
  const variants = definedPriceList().filter((v) => ['socks', 'teaTowel', 'wrappingPaper', 'playingCards'].includes(v.productKey) && v.attributes.colour !== 'kraft');
  for (const v of variants) {
    it(`${v.sku}`, async () => {
      const attrsPlan = plan(v.productKey, v.attributes); // the variant exactly as the seeder sees it
      expect(attrsPlan?.register).toBe('layered-flat');
      if (attrsPlan?.register !== 'layered-flat') return;
      const t = await layeredFlatTemplate(attrsPlan.dir, v.px!.w / v.px!.h, !!attrsPlan.tilted, !!attrsPlan.window);
      expect(t).not.toBeNull();
      expect(() => assertQuadFitsBlank(t!.quad)).not.toThrow();
    }, 30_000);
  }
});
