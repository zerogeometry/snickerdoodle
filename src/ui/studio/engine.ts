/**
 * Studio engine — the pure pixel + geometry maths behind the Studio's image tools (no React).
 *
 * The working picture is an editing copy (≤ EDGE px) held as RGB + Lab (for perceptual colour
 * matching) + an ALPHA mask (what's kept). Geometry (rotate → flip → crop) is NOT baked into the
 * pixels: it's a recipe applied at draw time here and at full resolution on the server
 * (src/server/studio-doc.ts) — the same order in both places.
 */

export const EDGE = 1600;

export type Rotation = 0 | 90 | 180 | 270;
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Geometry {
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
  crop: Crop;
}
export const IDENTITY: Geometry = { rotate: 0, flipH: false, flipV: false, crop: { x: 0, y: 0, w: 1, h: 1 } };

export interface Work {
  w: number;
  h: number;
  rgb: Uint8ClampedArray;
  lab: Float32Array;
  alpha: Uint8ClampedArray;
}

/** sRGB → CIE Lab (D65): perceptual distance, so "this colour" matches how people see it. */
export function toLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Build the editing copy from an image. Source transparency (a transparent PNG) becomes the alpha. */
export function buildWork(img: HTMLImageElement): { work: Work; hadTransparency: boolean } {
  const scale = Math.min(1, EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const rgb = new Uint8ClampedArray(w * h * 3);
  const lab = new Float32Array(w * h * 3);
  const alpha = new Uint8ClampedArray(w * h);
  let transparent = 0;
  for (let k = 0; k < w * h; k++) {
    const r = px[k * 4]!, g = px[k * 4 + 1]!, b = px[k * 4 + 2]!, a = px[k * 4 + 3]!;
    rgb[k * 3] = r;
    rgb[k * 3 + 1] = g;
    rgb[k * 3 + 2] = b;
    alpha[k] = a;
    if (a < 250) transparent++;
    const L = toLab(r, g, b);
    lab[k * 3] = L[0];
    lab[k * 3 + 1] = L[1];
    lab[k * 3 + 2] = L[2];
  }
  return { work: { w, h, rgb, lab, alpha }, hadTransparency: transparent > w * h * 0.001 };
}

/** Read a greyscale mask (data URL) into the alpha array. */
export async function readMask(maskUrl: string, alpha: Uint8ClampedArray, w: number, h: number): Promise<void> {
  const img = await loadImage(maskUrl);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let k = 0; k < w * h; k++) alpha[k] = d[k * 4]!;
}

/** The alpha mask as a greyscale PNG data URL (white = kept) — what the server applies. */
export function maskToDataUrl(work: Work): string {
  const c = document.createElement('canvas');
  c.width = work.w;
  c.height = work.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(work.w, work.h);
  for (let k = 0; k < work.w * work.h; k++) {
    const a = work.alpha[k]!;
    img.data[k * 4] = a;
    img.data[k * 4 + 1] = a;
    img.data[k * 4 + 2] = a;
    img.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/** Does the picture currently have see-through parts? */
export function hasTransparency(alpha: Uint8ClampedArray): boolean {
  let n = 0;
  for (let k = 0; k < alpha.length; k += 3) if (alpha[k]! < 250 && ++n > alpha.length * 0.0003) return true;
  return false;
}

/**
 * REMOVE COLOUR — make a colour see-through. `everywhere` (default) removes it across the whole
 * picture; otherwise only the patch of that colour touching the tap (it stops at outlines).
 * A soft falloff at the tolerance edge keeps edges smooth.
 */
export function removeColour(work: Work, x: number, y: number, fussy: number, everywhere: boolean): void {
  const { w, h, lab, alpha } = work;
  let L = 0, A = 0, B = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const k = (yy * w + xx) * 3;
      L += lab[k]!;
      A += lab[k + 1]!;
      B += lab[k + 2]!;
      n++;
    }
  }
  if (!n) return;
  L /= n;
  A /= n;
  B /= n;
  const hard = fussy * 0.7, soft = fussy;
  const factor = (k: number) => {
    const dE = Math.hypot(lab[k * 3]! - L, lab[k * 3 + 1]! - A, lab[k * 3 + 2]! - B);
    if (dE <= hard) return 0;
    if (dE >= soft) return 1;
    const t = (dE - hard) / (soft - hard);
    return t * t * (3 - 2 * t);
  };
  if (everywhere) {
    for (let k = 0; k < w * h; k++) {
      const f = factor(k);
      if (f < 1) alpha[k] = alpha[k]! * f;
    }
    return;
  }
  const seen = new Uint8Array(w * h);
  const start = Math.round(y) * w + Math.round(x);
  if (start < 0 || start >= w * h) return;
  const stack = [start];
  while (stack.length) {
    const k = stack.pop()!;
    if (seen[k]) continue;
    seen[k] = 1;
    const f = factor(k);
    if (f >= 1) continue;
    alpha[k] = alpha[k]! * f;
    const kx = k % w;
    if (kx > 0) stack.push(k - 1);
    if (kx < w - 1) stack.push(k + 1);
    if (k >= w) stack.push(k - w);
    if (k < w * h - w) stack.push(k + w);
  }
}

/** A soft round brush dab: erase → see-through, bring back → kept. */
export function dab(work: Work, x: number, y: number, size: number, mode: 'erase' | 'restore', strength = 1): void {
  const { w, h, alpha } = work;
  const r = size / 2, feather = Math.max(1.5, r * 0.25);
  const target = mode === 'erase' ? 0 : 255;
  for (let yy = Math.max(0, Math.floor(y - r - 1)); yy <= Math.min(h - 1, Math.ceil(y + r + 1)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - r - 1)); xx <= Math.min(w - 1, Math.ceil(x + r + 1)); xx++) {
      const dist = Math.hypot(xx - x, yy - y);
      if (dist > r) continue;
      const s = Math.min(1, (r - dist) / feather) * strength;
      const k = yy * w + xx;
      alpha[k] = alpha[k]! + (target - alpha[k]!) * s;
    }
  }
}

// ── Geometry ──────────────────────────────────────────────────────────────────

/** Size of the picture after rotation (before crop). */
export function rotatedSize(w: number, h: number, r: Rotation): [number, number] {
  return r === 90 || r === 270 ? [h, w] : [w, h];
}

/**
 * The matrix taking editing-copy pixels into "geometry space" (rotated + flipped, uncropped) —
 * rotate clockwise about the centre, then flip — matching the server's order.
 */
export function geometryMatrix(w: number, h: number, g: Geometry): DOMMatrix {
  const [gw, gh] = rotatedSize(w, h, g.rotate);
  return new DOMMatrix()
    .translate(gw / 2, gh / 2)
    .scale(g.flipH ? -1 : 1, g.flipV ? -1 : 1)
    .rotate(g.rotate)
    .translate(-w / 2, -h / 2);
}

/** Turning or flipping the picture carries the crop rectangle with it. */
export function rotateGeometry(g: Geometry): Geometry {
  const c = g.crop;
  // a clockwise quarter turn of the rotated+flipped picture
  const crop = { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w };
  // rotating after a flip ≡ flipping the other axis after rotating
  return { rotate: (((g.rotate + 90) % 360) as Rotation), flipH: g.flipV, flipV: g.flipH, crop };
}
export function flipGeometry(g: Geometry, axis: 'h' | 'v'): Geometry {
  const c = g.crop;
  return axis === 'h'
    ? { ...g, flipH: !g.flipH, crop: { ...c, x: 1 - c.x - c.w } }
    : { ...g, flipV: !g.flipV, crop: { ...c, y: 1 - c.y - c.h } };
}

export const geometryIsIdentity = (g: Geometry) =>
  g.rotate === 0 && !g.flipH && !g.flipV && g.crop.x <= 0.0005 && g.crop.y <= 0.0005 && g.crop.w >= 0.9995 && g.crop.h >= 0.9995;

// ── Print readiness ───────────────────────────────────────────────────────────

/** The largest paper size the (cropped) picture prints well at (≥150 dpi), in plain words. */
export function printReadiness(origW: number, origH: number, g: Geometry): { label: string; good: boolean } {
  const [gw, gh] = rotatedSize(origW, origH, g.rotate);
  const long = Math.max(gw * g.crop.w, gh * g.crop.h);
  const short = Math.min(gw * g.crop.w, gh * g.crop.h);
  const px = (mm: number) => (mm / 25.4) * 150;
  for (const [name, L, S] of [['A2', 594, 420], ['A3', 420, 297], ['A4', 297, 210], ['A5', 210, 148]] as const) {
    if (long >= px(L) && short >= px(S)) return { label: `print-ready up to ${name}`, good: true };
  }
  return { label: 'best for small prints', good: false };
}
