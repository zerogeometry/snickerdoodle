import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderMockupLayers, renderPrintedFace, renderTemplatePreview } from '@/server/print/compositor';
import type { Transform } from '@/server/print/geometry';

/**
 * PIXEL PARITY — the compositor's output may not drift when its plumbing changes (a speed-up, a
 * cache, a sharp upgrade). Every tier is rendered from SYNTHETIC, brand-safe layers (no photo, no
 * child's image) and compared with a golden WebP rendered by the known-good pipeline: same size,
 * mean absolute difference ≤ 1 level per channel.
 *
 * A change that is MEANT to alter the picture regenerates the goldens on purpose (and bumps
 * RENDER_REV in compositor.ts so cached mockups re-render):
 *   UPDATE_PARITY=1 npx vitest run src/server/print/__tests__/compositor-parity.test.ts
 */
const GOLDEN = path.join(__dirname, 'fixtures', 'compositor-parity');
const UPDATE = process.env.UPDATE_PARITY === '1';

// ── Deterministic synthetic layers ────────────────────────────────────────────────────────────
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BW = 720, BH = 560;
/** A "product photo": warm paper-ish tone, soft folds (so the fabric fx has something to follow), a little grain. */
async function blank(): Promise<Buffer> {
  const r = rng(7);
  const d = Buffer.alloc(BW * BH * 3);
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const fold = 18 * Math.sin(x / 37 + y / 53) + 10 * Math.sin(y / 21);
      const v = 205 + fold - (40 * y) / BH + (r() - 0.5) * 6;
      const i = (y * BW + x) * 3;
      d[i] = Math.max(0, Math.min(255, v + 12));
      d[i + 1] = Math.max(0, Math.min(255, v + 4));
      d[i + 2] = Math.max(0, Math.min(255, v - 10));
    }
  return sharp(d, { raw: { width: BW, height: BH, channels: 3 } }).png().toBuffer();
}
/** Silhouette (white = printable): a rounded blob, same canvas as the blank. */
async function mask(): Promise<Buffer> {
  const d = Buffer.alloc(BW * BH);
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const dx = (x - BW * 0.5) / (BW * 0.36), dy = (y - BH * 0.5) / (BH * 0.4);
      d[y * BW + x] = dx * dx + dy * dy <= 1 ? 255 : 0;
    }
  return sharp(d, { raw: { width: BW, height: BH, channels: 1 } }).png().toBuffer();
}
/** Foreground overlay: semi-opaque "cut lines" over the art. */
async function overlay(): Promise<Buffer> {
  const d = Buffer.alloc(BW * BH * 4);
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const i = (y * BW + x) * 4;
      if (x % 90 < 2 || y % 70 < 2) { d[i] = 40; d[i + 1] = 30; d[i + 2] = 20; d[i + 3] = 150; }
    }
  return sharp(d, { raw: { width: BW, height: BH, channels: 4 } }).png().toBuffer();
}
/** A "drawing": crayon-ish blobs on a see-through ground (a background-removed cutout). */
async function design(): Promise<Buffer> {
  const W = 640, H = 480, r = rng(42);
  const d = Buffer.alloc(W * H * 4);
  const blobs = Array.from({ length: 9 }, () => ({ x: r() * W, y: r() * H, rad: 40 + r() * 90, c: [r() * 255, r() * 255, r() * 255] }));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      for (const b of blobs) {
        const k = Math.hypot(x - b.x, y - b.y) / b.rad;
        if (k <= 1) { d[i] = b.c[0]!; d[i + 1] = b.c[1]!; d[i + 2] = b.c[2]!; d[i + 3] = k > 0.9 ? Math.round(255 * (1 - k) * 10) : 255; }
      }
    }
  return sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

const T0: Transform = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
const T_MOVED: Transform = { scale: 1.4, offsetX: 0.12, offsetY: -0.08, rotationDeg: 90 };
const T1: Transform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
const FLAT_QUAD: [number, number][] = [[0.18, 0.14], [0.82, 0.14], [0.82, 0.86], [0.18, 0.86]];
const SKEW_QUAD: [number, number][] = [[0.22, 0.18], [0.78, 0.12], [0.84, 0.82], [0.16, 0.88]];
const PRINT = { widthPx: 3000, heightPx: 2400, bleedMm: 3, requiredDpi: 300 };
const THUMB = { workEdge: 480, outputEdge: 400 };
const ZOOM = { workEdge: 1500, outputEdge: 1200 };

type Layers = { blank: Buffer; mask: Buffer; overlay: Buffer; design: Buffer };
const PRESETS: { name: string; render: (l: Layers) => Promise<Buffer> }[] = [
  { name: 'flat-paper-mask-overlay-zoom', render: async (l) => (await renderMockupLayers({ blank: l.blank, mask: l.mask, overlay: l.overlay, design: l.design, quad: FLAT_QUAD, transform: T_MOVED, print: PRINT, materialClass: 'PAPER', ...ZOOM })).buffer },
  { name: 'flat-paper-thumb', render: async (l) => (await renderMockupLayers({ blank: l.blank, design: l.design, quad: FLAT_QUAD, transform: T0, print: PRINT, materialClass: 'PAPER', ...THUMB })).buffer },
  { name: 'flat-light-fabric-mask-zoom', render: async (l) => (await renderMockupLayers({ blank: l.blank, mask: l.mask, design: l.design, quad: FLAT_QUAD, transform: T0, print: PRINT, materialClass: 'LIGHT_FABRIC', ...ZOOM })).buffer },
  { name: 'flat-dark-fabric-thumb', render: async (l) => (await renderMockupLayers({ blank: l.blank, design: l.design, quad: FLAT_QUAD, transform: T_MOVED, print: PRINT, materialClass: 'DARK_FABRIC', ...THUMB })).buffer },
  { name: 'perspective-paper-mask-overlay-zoom', render: async (l) => (await renderMockupLayers({ blank: l.blank, mask: l.mask, overlay: l.overlay, design: l.design, quad: SKEW_QUAD, transform: T_MOVED, print: { ...PRINT, widthPx: 1500, heightPx: 1200 }, materialClass: 'PAPER', ...ZOOM })).buffer },
  { name: 'perspective-light-fabric-thumb', render: async (l) => (await renderMockupLayers({ blank: l.blank, mask: l.mask, design: l.design, quad: SKEW_QUAD, transform: T0, print: PRINT, materialClass: 'LIGHT_FABRIC', ...THUMB })).buffer },
  { name: 'perspective-span-front-zoom', render: async (l) => (await renderMockupLayers({ blank: l.blank, design: l.design, quad: SKEW_QUAD, transform: T0, spanHalf: 'front', print: { ...PRINT, widthPx: 1500 }, materialClass: 'PAPER', ...ZOOM })).buffer },
  { name: 'cylinder-front-zoom', render: async (l) => (await renderMockupLayers({ blank: l.blank, mask: l.mask, design: l.design, quad: FLAT_QUAD, transform: T0, print: { widthPx: 2469, heightPx: 1122, bleedMm: 0, requiredDpi: 300 }, materialClass: 'CERAMIC', mugMode: 'front', ...ZOOM })).buffer },
  { name: 'cylinder-back-thumb', render: async (l) => (await renderMockupLayers({ blank: l.blank, mask: l.mask, design: l.design, quad: FLAT_QUAD, transform: T_MOVED, print: { widthPx: 2469, heightPx: 1122, bleedMm: 0, requiredDpi: 300 }, materialClass: 'CERAMIC', mugMode: 'back', ...THUMB })).buffer },
  {
    name: 'pattern-navy-fabric-zoom',
    render: async (l) => {
      const print = { widthPx: 2400, heightPx: 1800, bleedMm: 0, requiredDpi: 300 };
      const face = await renderPrintedFace(l.design, 'pattern', print, T0, 1000, '#1f2a44');
      return (await renderMockupLayers({ blank: l.blank, mask: l.mask, design: face, quad: FLAT_QUAD, transform: T1, print, materialClass: 'LIGHT_FABRIC', ...ZOOM })).buffer;
    },
  },
  {
    name: 'height-chart-thumb',
    render: async (l) => {
      const print = { widthPx: 1200, heightPx: 7200, bleedMm: 0, requiredDpi: 150 };
      const face = await renderPrintedFace(l.design, 'heightChart', print, T0, 1000);
      const tall: [number, number][] = [[0.42, 0.05], [0.58, 0.05], [0.58, 0.95], [0.42, 0.95]];
      return (await renderMockupLayers({ blank: l.blank, design: face, quad: tall, transform: T1, print, materialClass: 'PAPER', ...THUMB })).buffer;
    },
  },
  {
    // a JPEG product photo + a JPEG phone photo of a drawing (the common upload)
    name: 'flat-jpeg-inputs-zoom',
    render: async (l) => {
      const [b, d] = await Promise.all([sharp(l.blank).jpeg({ quality: 90 }).toBuffer(), sharp(l.design).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer()]);
      return (await renderMockupLayers({ blank: b, design: d, quad: FLAT_QUAD, transform: T_MOVED, print: PRINT, materialClass: 'PAPER', ...ZOOM })).buffer;
    },
  },
  {
    name: 'template-preview-pattern-skew',
    render: (l) => renderTemplatePreview({ blank: l.blank, mask: l.mask, overlay: l.overlay, quad: SKEW_QUAD, materialClass: 'LIGHT_FABRIC', design: l.design, productKey: 'socks', print: { widthPx: 2400, heightPx: 1800, bleedMm: 0, requiredDpi: 300 }, size: 'thumb', ground: 'navy' }),
  },
];

async function decode(webp: Buffer) {
  return sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

describe('mockup compositor — pixel parity with the known-good pipeline', () => {
  let layers: Promise<Layers> | undefined;
  const getLayers = () => (layers ??= Promise.all([blank(), mask(), overlay(), design()]).then(([b, m, o, d]) => ({ blank: b, mask: m, overlay: o, design: d })));

  for (const p of PRESETS) {
    it(`${p.name}: same size, mean |Δ| ≤ 1`, async () => {
      const out = await p.render(await getLayers());
      const file = path.join(GOLDEN, `${p.name}.webp`);
      if (UPDATE) {
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(file, out);
        return;
      }
      expect(existsSync(file), `golden missing — UPDATE_PARITY=1 to create ${file}`).toBe(true);
      const [a, b] = await Promise.all([decode(out), decode(readFileSync(file))]);
      expect(`${a.info.width}x${a.info.height}`).toBe(`${b.info.width}x${b.info.height}`);
      let sum = 0;
      for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i]! - b.data[i]!);
      const mean = sum / a.data.length;
      expect(mean).toBeLessThanOrEqual(1);
    }, 30_000);
  }
});
