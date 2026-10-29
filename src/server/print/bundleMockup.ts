import './sharp-init';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { BUNDLE_PIECE_GEOM, type BundlePiece, type BundleSize } from '@/lib/christmas-bundle';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { clampTransform, computeLayerRect, type Transform } from './geometry';

/**
 * The CHRISTMAS FAMILY BUNDLE's pictures (founder, 29 Oct), composed from the founder's own PSD layers
 * (.prodigi-assets/blanks/layered/christmasBundle/{thumb,x2,x4,x8}: same-canvas PNGs + manifest.json,
 * bottom → top). Used LITERALLY: no 3D, no warps — the only movement is the rotation of a rotated
 * placemat / coaster. `thumb` is the catalogue tile (2 placemats, 2 coasters, 2 ornaments, the
 * shopper's one drawing on every piece); `x2` / `x4` / `x8` are the builder's picture of each size (one
 * placemat, one coaster, N ornaments, each piece its own drawing).
 *
 * SPEED is the point — the bundle leads the catalogue. Everything that doesn't depend on a drawing is
 * worked out ONCE, at seed time (buildBundleLayout):
 *   the stack is  backdrop · per piece: [its soft contact shadow, the piece's print area] · the
 *   ornaments' edges + strings  — and since compositing is linear, the finished picture is exactly
 *        picture = BASE + Σ_k drawing_k × WEIGHT_k
 *   where BASE is everything fixed (backdrop, shadows, edges, strings — each already dimmed by
 *   whatever sits over it) and WEIGHT_k is how much of print area k shows through everything above
 *   it (its own alpha × the transparency of every layer over it). So the edges + strings land OVER the
 *   art, a lower ornament's string is hidden behind the one in front, and a placemat's shadow falls
 *   on the placemat under it — all baked in, with no per-render layer order at all.
 * A render (renderBundleLayers) is then: lay each drawing into its print area's oriented rectangle at
 * the piece's print aspect, add it in under its weight, encode. Pure pixels — no I/O here.
 */

export type BundleLayoutName = 'thumb' | 'x2' | 'x4' | 'x8';
export const BUNDLE_LAYOUTS: readonly BundleLayoutName[] = ['thumb', 'x2', 'x4', 'x8'];
export const layoutForSize = (n: BundleSize): BundleLayoutName => (n === 2 ? 'x2' : n === 4 ? 'x4' : 'x8');

/** A print area of a layout. `index` counts that role's areas in stacking order (ornament 0, 1, …). */
export type RegionRole = 'placemat' | 'coaster' | 'ornament';
export const ROLE_PIECE: Record<RegionRole, BundlePiece> = { placemat: 'placemat', coaster: 'coaster', ornament: 'ceramicOrnament' };

/** Seed-time output: the flattened base + per area its weight mask and oriented rectangle. */
export interface BuiltBundleLayout {
  W: number;
  H: number;
  /** BASE: RGB PNG, the canvas size */
  base: Buffer;
  regions: Array<{ role: RegionRole; index: number; quad: [number, number][]; weight: Buffer }>;
}

interface ManifestLayer {
  order: number;
  file: string;
  role: 'placemat' | 'coaster' | 'ornament-print' | 'ornament-edge' | 'ornament-string';
  bbox: [number, number, number, number];
}

/** The soft contact shadow under each piece: its silhouette, blurred, nudged down-right, faint black. */
export const SHADOW = { blurFrac: 0.009, dxFrac: 0.002, dyFrac: 0.007, opacity: 0.32 } as const;

/**
 * The tilt (degrees, clockwise) of a rounded rectangle: the angle in [−45°, 45°) whose upright box
 * around the shape is smallest — exact for a square coaster turned 40°, where a side-fitting estimate
 * meets corners. Coarse 1° search, then 0.1° around the best.
 */
export function minAreaTilt(alpha: Uint8Array | Buffer, W: number, H: number, step = 2): number {
  const pts: number[] = [];
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (alpha[y * W + x]! >= 128) pts.push(x + 0.5, y + 0.5);
  if (!pts.length) return 0;
  const area = (deg: number) => {
    const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const u = pts[i]! * cs + pts[i + 1]! * sn, v = -pts[i]! * sn + pts[i + 1]! * cs;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    return (u1 - u0) * (v1 - v0);
  };
  let best = 0, bestA = Infinity;
  for (let d = -45; d < 45; d += 1) {
    const a = area(d);
    if (a < bestA - 1e-6) [best, bestA] = [d, a];
  }
  for (let d = best - 1; d <= best + 1; d += 0.1) {
    const a = area(d);
    if (a < bestA - 1e-6) [best, bestA] = [d, a];
  }
  return Math.round(best * 10) / 10;
}

/** The smallest rectangle at `tiltDeg` holding the shape, widened (never squashed) to `printAspect`,
 * centred. Corners TL, TR, BR, BL, normalised. */
export function coverQuadAt(alpha: Uint8Array | Buffer, W: number, H: number, printAspect: number, tiltDeg: number, step = 1): [number, number][] {
  const t = (tiltDeg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let y = 0; y < H; y += step)
    for (let x = 0; x < W; x += step) {
      if (alpha[y * W + x]! < 128) continue;
      const px = x + 0.5, py = y + 0.5;
      const u = px * cs + py * sn, v = -px * sn + py * cs;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
  if (u1 < u0) throw new Error('an empty print area');
  // half a pixel out on every side — the shape's soft edge stays inside the art
  u0 -= 1; u1 += 1; v0 -= 1; v1 += 1;
  const w = u1 - u0, h = v1 - v0, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const [ww, hh] = w / h < printAspect ? [h * printAspect, h] : [w, w / printAspect];
  const back = (u: number, v: number): [number, number] => [(u * cs - v * sn) / W, (u * sn + v * cs) / H];
  return [back(cu - ww / 2, cv - hh / 2), back(cu + ww / 2, cv - hh / 2), back(cu + ww / 2, cv + hh / 2), back(cu - ww / 2, cv + hh / 2)];
}

const printAspectOf = (role: RegionRole) => {
  const g = BUNDLE_PIECE_GEOM[ROLE_PIECE[role]];
  return g.printWidthPx / g.printHeightPx;
};

async function rgbaOf(file: string, W: number, H: number): Promise<Uint8Array> {
  const { data, info } = await sharp(file).resize(W, H, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`${file}: expected RGBA`);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
const alphaOf = (rgba: Uint8Array): Uint8Array => {
  const a = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < a.length; i++) a[i] = rgba[i * 4 + 3]!;
  return a;
};

/**
 * A SHAPE layer's mask: its alpha when it has real transparency; else (a grey shape on an opaque white
 * ground — how some print maps are exported) the shape is read from how far each pixel is from white,
 * scaled so the grey itself is fully on — the antialiased edge stays soft. Exported for its test.
 */
export function shapeMaskOf(rgba: Uint8Array): Uint8Array {
  const n = rgba.length / 4;
  let clear = 0;
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3]! < 250) clear++;
  if (clear > n * 0.01) return alphaOf(rgba);
  const lum = (i: number) => 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
  let dark = 255;
  for (let i = 0; i < n; i++) dark = Math.min(dark, lum(i));
  const span = Math.max(1, 255 - dark);
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.max(0, Math.min(255, Math.round(((255 - lum(i)) / span) * 255)));
  return a;
}

/** A piece's soft contact shadow as an alpha plane (0–1). */
async function shadowOf(alpha: Uint8Array, W: number, H: number): Promise<Float32Array> {
  const dx = Math.round(SHADOW.dxFrac * W), dy = Math.round(SHADOW.dyFrac * H);
  const shifted = new Uint8Array(W * H);
  for (let y = Math.max(0, dy); y < H; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= H) continue;
    for (let x = Math.max(0, dx); x < W; x++) shifted[y * W + x] = alpha[sy * W + (x - dx)]!;
  }
  const { data: blurred, info } = await sharp(Buffer.from(shifted.buffer), { raw: { width: W, height: H, channels: 1 } })
    .blur(Math.max(0.3, SHADOW.blurFrac * W))
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error('shadow: expected one channel');
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = (blurred[i]! / 255) * SHADOW.opacity;
  return out;
}

/**
 * Seed time: flatten one layout of the founder's layers into its BASE + per print area its WEIGHT and
 * oriented rectangle (see the module note). `backdropFile` is the same backdrop as our other tiles.
 */
export async function buildBundleLayout(dir: string, backdropFile: string): Promise<BuiltBundleLayout> {
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { canvas: [number, number]; layers: ManifestLayer[] };
  const layers = [...manifest.layers].sort((a, b) => a.order - b.order).map((l) => ({ file: path.join(dir, l.file), role: l.role }));
  return buildLayout(layers, manifest.canvas, backdropFile);
}

/**
 * The same, from a plain list of layers (bottom → top) — e.g. the standalone placemat's one print map,
 * the coasters' back + front (the front's shadow falls on the back one).
 */
export async function buildLayout(layers: ReadonlyArray<{ file: string; role: ManifestLayer['role'] }>, canvas: [number, number], backdropFile: string): Promise<BuiltBundleLayout> {
  const [W, H] = canvas;
  const N = W * H;

  // the stack, bottom → top: fixed layers carry a colour; print areas a slot for a drawing
  type Fixed = { kind: 'fixed'; rgb: Uint8Array | [number, number, number]; a: Float32Array | Uint8Array; aScale: number };
  type Slot = { kind: 'slot'; role: RegionRole; index: number; a: Uint8Array };
  const stack: Array<Fixed | Slot> = [];
  // RGBA, like the layers (its own alpha is ignored: the backdrop is the opaque bottom of the stack)
  const backdrop = await sharp(await sharp(backdropFile).resize(W, H, { fit: 'cover' }).flatten({ background: '#ffffff' }).png().toBuffer()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (backdrop.info.channels !== 4) throw new Error('backdrop: expected RGBA');
  stack.push({ kind: 'fixed', rgb: new Uint8Array(backdrop.data.buffer, backdrop.data.byteOffset, backdrop.data.byteLength), a: new Float32Array(N).fill(1), aScale: 1 });

  const counts: Record<RegionRole, number> = { placemat: 0, coaster: 0, ornament: 0 };
  const quads: Array<{ role: RegionRole; index: number; quad: [number, number][] }> = [];
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]!;
    const rgba = await rgbaOf(l.file, W, H);
    const isShape = l.role === 'placemat' || l.role === 'coaster' || l.role === 'ornament-print';
    const a = isShape ? shapeMaskOf(rgba) : alphaOf(rgba);
    if (l.role === 'placemat' || l.role === 'coaster' || l.role === 'ornament-print') {
      const role: RegionRole = l.role === 'ornament-print' ? 'ornament' : l.role;
      // an ornament's shadow is its whole disc: the print face and its edge together
      let silhouette = a;
      if (role === 'ornament') {
        const edge = layers.slice(i + 1).find((x) => x.role === 'ornament-edge');
        if (edge) {
          const ea = alphaOf(await rgbaOf(edge.file, W, H));
          silhouette = a.map((v, j) => Math.max(v, ea[j]!));
        }
      }
      stack.push({ kind: 'fixed', rgb: [0, 0, 0], a: await shadowOf(silhouette, W, H), aScale: 1 });
      const index = counts[role]++;
      stack.push({ kind: 'slot', role, index, a });
      // circles have no tilt; rectangles are read from their outline
      const tilt = role === 'ornament' ? 0 : minAreaTilt(a, W, H);
      quads.push({ role, index, quad: coverQuadAt(a, W, H, printAspectOf(role), tilt) });
    } else {
      stack.push({ kind: 'fixed', rgb: rgba, a, aScale: 1 / 255 });
    }
  }

  // top → bottom: each layer's share of the final pixel = its alpha × what's still showing through
  const through = new Float32Array(N).fill(1);
  const base = new Float32Array(N * 3);
  const weights = new Map<string, Float32Array>();
  for (let s = stack.length - 1; s >= 0; s--) {
    const L = stack[s]!;
    if (L.kind === 'slot') {
      const w = new Float32Array(N);
      for (let p = 0; p < N; p++) {
        const a = L.a[p]! / 255;
        w[p] = a * through[p]!;
        through[p]! *= 1 - a;
      }
      weights.set(`${L.role}:${L.index}`, w);
      continue;
    }
    const perPixel = !Array.isArray(L.rgb);
    for (let p = 0; p < N; p++) {
      const a = L.a[p]! * L.aScale;
      if (a <= 0) continue;
      const w = a * through[p]!;
      if (perPixel) {
        const c = L.rgb as Uint8Array;
        base[p * 3] = base[p * 3]! + c[p * 4]! * w;
        base[p * 3 + 1] = base[p * 3 + 1]! + c[p * 4 + 1]! * w;
        base[p * 3 + 2] = base[p * 3 + 2]! + c[p * 4 + 2]! * w;
      } else {
        const c = L.rgb as [number, number, number];
        base[p * 3] = base[p * 3]! + c[0] * w;
        base[p * 3 + 1] = base[p * 3 + 1]! + c[1] * w;
        base[p * 3 + 2] = base[p * 3 + 2]! + c[2] * w;
      }
      through[p]! *= 1 - a;
    }
  }
  const base8 = Buffer.alloc(N * 3);
  for (let i = 0; i < base8.length; i++) base8[i] = Math.max(0, Math.min(255, Math.round(base[i]!)));
  const regions: BuiltBundleLayout['regions'] = [];
  for (const q of quads) {
    const w = weights.get(`${q.role}:${q.index}`)!;
    const g = Buffer.alloc(N);
    for (let p = 0; p < N; p++) g[p] = Math.round(w[p]! * 255);
    regions.push({ ...q, weight: await sharp(g, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer() });
  }
  return { W, H, base: await sharp(base8, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer(), regions };
}

// ── render ────────────────────────────────────────────────────────────────────────────────────

/** A layout decoded at a working size, ready to render from (cached by the caller). */
export interface DecodedBundleLayout {
  W: number;
  H: number;
  base: Buffer; // RGB
  regions: Array<{ role: RegionRole; index: number; quad: [number, number][]; box: { x: number; y: number; w: number; h: number }; weight: Buffer /* 1 channel, box-sized */ }>;
}

/** Decode a stored layout at `edge` px (the layouts are drawn at 1024; a thumb works smaller). */
export async function decodeBundleLayout(base: Buffer, regions: Array<{ role: RegionRole; index: number; quad: [number, number][]; weight: Buffer }>, edge?: number): Promise<DecodedBundleLayout> {
  const m = await sharp(base).metadata();
  const W0 = m.width!, H0 = m.height!;
  const s = edge ? Math.min(1, edge / Math.max(W0, H0)) : 1;
  const W = Math.round(W0 * s), H = Math.round(H0 * s);
  const baseRaw = await sharp(base).resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const out: DecodedBundleLayout['regions'] = [];
  for (const r of regions) {
    const full = await sharp(r.weight).resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).toColourspace('b-w').extractChannel(0).raw().toBuffer();
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (full[y * W + x]! > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) continue; // nothing of it shows
    const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    const weight = Buffer.alloc(box.w * box.h);
    for (let y = 0; y < box.h; y++) full.copy(weight, y * box.w, (y + box.y) * W + box.x, (y + box.y) * W + box.x + box.w);
    out.push({ role: r.role, index: r.index, quad: r.quad, box, weight });
  }
  return { W, H, base: baseRaw, regions: out };
}

/** A drawing, decoded once per render (RGBA pixels). */
export interface DecodedDrawing {
  data: Buffer;
  width: number;
  height: number;
}
export async function decodeDrawing(buf: Buffer): Promise<DecodedDrawing> {
  const { data, info } = await sharp(buf, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** The drawing laid on a piece's print canvas exactly as its print file (white, at `placement` — the
 * piece's default unless the shopper placed it), at `w × h` px, turned `deg` — RGBA. */
async function pieceArt(d: DecodedDrawing, piece: BundlePiece, w: number, h: number, deg: number, placement?: Transform): Promise<{ data: Buffer; width: number; height: number }> {
  const geom = BUNDLE_PIECE_GEOM[piece];
  const t = placement ?? clampTransform(defaultTransformFor(piece));
  const r = computeLayerRect(geom, { width: d.width, height: d.height }, t);
  const s = w / geom.printWidthPx;
  const rw = Math.max(1, Math.round(r.width * s)), rh = Math.max(1, Math.round(r.height * s));
  const rx = Math.round(r.x * s), ry = Math.round(r.y * s);
  // the part of the drawing that lands on the canvas
  const ix0 = Math.max(0, rx), iy0 = Math.max(0, ry), ix1 = Math.min(w, rx + rw), iy1 = Math.min(h, ry + rh);
  let canvas = sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } });
  if (ix1 > ix0 && iy1 > iy0) {
    const part = await sharp(d.data, { raw: { width: d.width, height: d.height, channels: 4 } })
      .rotate(t.rotationDeg)
      .resize(rw, rh, { fit: 'fill' })
      .extract({ left: ix0 - rx, top: iy0 - ry, width: ix1 - ix0, height: iy1 - iy0 })
      .raw()
      .toBuffer();
    canvas = canvas.composite([{ input: part, raw: { width: ix1 - ix0, height: iy1 - iy0, channels: 4 }, left: ix0, top: iy0 }]);
  }
  if (Math.abs(deg) < 0.3) {
    const data = await canvas.raw().toBuffer();
    return { data, width: w, height: h };
  }
  // one pipeline can't composite and then rotate the result — flatten first
  const flat = await canvas.raw().toBuffer();
  const { data, info } = await sharp(flat, { raw: { width: w, height: h, channels: 4 } })
    .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Render a layout: each print area gets `drawingFor(role, index)`'s drawing, laid into its oriented
 * rectangle and added in under its weight. Returns RGB pixels (encode with encodeBundle).
 */
export async function renderBundleLayers(
  layout: DecodedBundleLayout,
  drawingFor: (role: RegionRole, index: number) => DecodedDrawing | null,
  /** the shopper's own placement (a standalone placemat / coaster); absent ⇒ each piece's default */
  placement?: Transform,
): Promise<{ data: Buffer; width: number; height: number }> {
  const { W, H } = layout;
  const out = Buffer.from(layout.base); // a copy — the base is cached
  const acc = new Float32Array(W * H * 3);
  const made = new Map<string, Promise<{ data: Buffer; width: number; height: number }>>();
  await Promise.all(
    layout.regions.map(async (r) => {
      const d = drawingFor(r.role, r.index);
      if (!d) return;
      const [tl, tr, , bl] = r.quad as [[number, number], [number, number], [number, number], [number, number]];
      const ex = (tr[0] - tl[0]) * W, ey = (tr[1] - tl[1]) * H;
      const fx = (bl[0] - tl[0]) * W, fy = (bl[1] - tl[1]) * H;
      const w = Math.max(1, Math.round(Math.hypot(ex, ey))), h = Math.max(1, Math.round(Math.hypot(fx, fy)));
      const deg = Math.round(((Math.atan2(ey, ex) * 180) / Math.PI) * 10) / 10;
      const cx = (tl[0] + (tr[0] - tl[0]) / 2 + (bl[0] - tl[0]) / 2) * W, cy = (tl[1] + (tr[1] - tl[1]) / 2 + (bl[1] - tl[1]) / 2) * H;
      // the same drawing at the same size + angle (a row of ornaments) is laid out once
      const id = `${r.role}|${w}x${h}@${deg}|${drawingKey(d)}`;
      let p = made.get(id);
      if (!p) made.set(id, (p = pieceArt(d, ROLE_PIECE[r.role], w, h, deg, placement)));
      const art = await p;
      const ox = Math.round(cx - art.width / 2), oy = Math.round(cy - art.height / 2);
      const { box, weight } = r;
      for (let y = 0; y < box.h; y++) {
        const py = box.y + y, ay = py - oy;
        if (ay < 0 || ay >= art.height) continue;
        for (let x = 0; x < box.w; x++) {
          const wv = weight[y * box.w + x]!;
          if (!wv) continue;
          const px = box.x + x, ax = px - ox;
          if (ax < 0 || ax >= art.width) continue;
          const ai = (ay * art.width + ax) * 4;
          const f = (wv / 255) * (art.data[ai + 3]! / 255);
          const o = (py * W + px) * 3;
          acc[o] = acc[o]! + art.data[ai]! * f;
          acc[o + 1] = acc[o + 1]! + art.data[ai + 1]! * f;
          acc[o + 2] = acc[o + 2]! + art.data[ai + 2]! * f;
        }
      }
    }),
  );
  for (let i = 0; i < out.length; i++) {
    const v = out[i]! + acc[i]!;
    out[i] = v > 255 ? 255 : v + 0.5;
  }
  return { data: out, width: W, height: H };
}

const ids = new WeakMap<DecodedDrawing, number>();
let nextId = 0;
const drawingKey = (d: DecodedDrawing) => {
  let k = ids.get(d);
  if (k === undefined) ids.set(d, (k = nextId++));
  return k;
};

/** Encode a render as the shop's WebP (sRGB). Fast settings — this picture leads the catalogue. */
export async function encodeBundle(img: { data: Buffer; width: number; height: number }, outputEdge?: number): Promise<{ buffer: Buffer; width: number; height: number }> {
  let p = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } });
  if (outputEdge && outputEdge < Math.max(img.width, img.height)) p = p.resize(outputEdge, outputEdge, { fit: 'inside', kernel: 'lanczos3' });
  const { data, info } = await p.withMetadata({ icc: 'srgb' }).webp({ quality: 82, effort: 2 }).toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}
