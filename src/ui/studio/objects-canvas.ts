import { cardFontCss } from '@/lib/card-fonts';
import { SHAPE_PATHS, TEXT_LINE_HEIGHT, type ShapeObject, type StrokeObject, type StudioObject, type TextObject } from '@/lib/studio-objects';
import { TEXTURE_TILE_FRAC, textureTiles, type TextureKind } from '@/lib/textures';

/**
 * Drawing + measuring the Studio's added things on the browser canvas, in GEOMETRY-SPACE PIXELS
 * (gw × gh of the editing copy, after rotate/flip, before crop) — the same numbers the server
 * renders from at full resolution (src/server/print/studioOverlay.ts).
 */

export interface Frame {
  gw: number;
  gh: number;
}
const S = (f: Frame) => Math.min(f.gw, f.gh);

const pathCache = new Map<string, Path2D>();
const shapePath = (k: ShapeObject['shape']) => {
  let p = pathCache.get(k);
  if (!p) pathCache.set(k, (p = new Path2D(SHAPE_PATHS[k])));
  return p;
};

/** A box in geometry px: centre, size, rotation (deg). */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function textMetrics(o: TextObject, f: Frame): { lines: string[]; fontPx: number; w: number; h: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  const fontPx = Math.max(4, o.size * S(f));
  measureCtx.font = `${fontPx}px ${cardFontCss(o.font)}`;
  const lines = o.text.split('\n');
  const w = Math.max(...lines.map((l) => measureCtx!.measureText(l || ' ').width), fontPx * 0.5);
  return { lines, fontPx, w, h: lines.length * fontPx * TEXT_LINE_HEIGHT };
}

function strokeBounds(o: StrokeObject, f: Frame): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < o.points.length; i += 3) {
    const x = o.points[i]! * f.gw, y = o.points[i + 1]! * f.gh;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const pad = o.width * S(f);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2, rotation: 0 };
}

export function boxOf(o: StudioObject, f: Frame): Box {
  if (o.type === 'stroke') return strokeBounds(o, f);
  if (o.type === 'shape') return { cx: o.x * f.gw, cy: o.y * f.gh, w: o.w * S(f), h: o.h * S(f), rotation: o.rotation };
  const m = textMetrics(o, f);
  return { cx: o.x * f.gw, cy: o.y * f.gh, w: m.w, h: m.h, rotation: o.rotation };
}

/** Is the geometry-px point inside the object's (rotated) box? */
export function hits(o: StudioObject, f: Frame, x: number, y: number, slop = 0): boolean {
  return inBox(boxOf(o, f), x, y, slop);
}

/** Is the geometry-px point inside a (rotated) box? */
export function inBox(b: Box, x: number, y: number, slop = 0): boolean {
  const a = (-b.rotation * Math.PI) / 180;
  const dx = x - b.cx, dy = y - b.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 + slop && Math.abs(ly) <= b.h / 2 + slop;
}

/** Draw one object (ctx already transformed into geometry px). */
export function drawObject(ctx: CanvasRenderingContext2D, o: StudioObject, f: Frame): void {
  if (o.type === 'stroke') return drawStroke(ctx, o, f);
  ctx.save();
  ctx.translate(o.x * f.gw, o.y * f.gh);
  ctx.rotate((o.rotation * Math.PI) / 180);
  if (o.type === 'shape') {
    const w = o.w * S(f), h = o.h * S(f);
    ctx.translate(-w / 2, -h / 2);
    ctx.scale(w / 100, h / 100);
    ctx.fillStyle = o.fill;
    ctx.fill(shapePath(o.shape), 'evenodd');
    if (o.strokeWidth > 0) {
      ctx.lineWidth = o.strokeWidth * 100; // box units, like the server's SVG
      ctx.lineJoin = 'round';
      ctx.strokeStyle = o.stroke;
      ctx.stroke(shapePath(o.shape));
    }
  } else {
    const m = textMetrics(o, f);
    ctx.font = `${m.fontPx}px ${cardFontCss(o.font)}`;
    ctx.fillStyle = o.colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = m.fontPx * TEXT_LINE_HEIGHT;
    m.lines.forEach((l, i) => ctx.fillText(l, 0, (i - (m.lines.length - 1) / 2) * lh));
  }
  ctx.restore();
}

/** A pressure-varying pen line (round-capped segments) — same width rule as the server. */
export function drawStroke(ctx: CanvasRenderingContext2D, o: Pick<StrokeObject, 'colour' | 'width' | 'points'>, f: Frame): void {
  if (!o.points.length) return;
  const base = Math.max(1, o.width * S(f));
  const p = o.points;
  ctx.save();
  ctx.strokeStyle = o.colour;
  ctx.fillStyle = o.colour;
  ctx.lineCap = 'round';
  if (p.length === 3) {
    ctx.beginPath();
    ctx.arc(p[0]! * f.gw, p[1]! * f.gh, (base * (0.5 + p[2]!)) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 3; i < p.length; i += 3) {
    ctx.beginPath();
    ctx.lineWidth = (base * (0.5 + p[i - 1]!) + base * (0.5 + p[i + 2]!)) / 2;
    ctx.moveTo(p[i - 3]! * f.gw, p[i - 2]! * f.gh);
    ctx.lineTo(p[i]! * f.gw, p[i + 1]! * f.gh);
    ctx.stroke();
  }
  ctx.restore();
}

/** Move an object by a geometry-px delta. */
export function moveObject(o: StudioObject, f: Frame, dx: number, dy: number): StudioObject {
  if (o.type === 'stroke') {
    const p = o.points.slice();
    for (let i = 0; i < p.length; i += 3) {
      p[i] = p[i]! + dx / f.gw;
      p[i + 1] = p[i + 1]! + dy / f.gh;
    }
    return { ...o, points: p };
  }
  return { ...o, x: o.x + dx / f.gw, y: o.y + dy / f.gh };
}

/** Scale an object about its centre by k (text → size, shape → w/h, stroke → points + width). */
export function scaleObject(o: StudioObject, f: Frame, k: number): StudioObject {
  k = Math.max(0.05, Math.min(20, k));
  if (o.type === 'text') return { ...o, size: Math.min(1, Math.max(0.01, o.size * k)) };
  if (o.type === 'shape') return { ...o, w: Math.min(2, Math.max(0.01, o.w * k)), h: Math.min(2, Math.max(0.01, o.h * k)) };
  const b = strokeBounds(o, f);
  const p = o.points.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i] = (b.cx + (p[i]! * f.gw - b.cx) * k) / f.gw;
    p[i + 1] = (b.cy + (p[i + 1]! * f.gh - b.cy) * k) / f.gh;
  }
  return { ...o, points: p, width: Math.min(0.3, Math.max(0.001, o.width * k)) };
}

// ── textures (crayon / chalk / paint) — the same tiles the print render uses ──

const tileCanvases = new Map<string, HTMLCanvasElement>();
function tileCanvas(kind: Exclude<TextureKind, 'smooth'>, part: 'mask' | 'dark' | 'light'): HTMLCanvasElement {
  const key = `${kind}.${part}`;
  let c = tileCanvases.get(key);
  if (!c) {
    const t = textureTiles(kind);
    c = document.createElement('canvas');
    c.width = c.height = t.size;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t[part]), t.size, t.size), 0, 0);
    tileCanvases.set(key, c);
  }
  return c;
}

let scratch: HTMLCanvasElement | null = null;

/**
 * Draw one object WITH its texture onto `ctx`. `M` maps geometry px → device px (the canvas's
 * own transform); `clip` is the picture's visible area in geometry px. Textured objects are drawn
 * on a scratch layer, cut by the grain mask, shaded, then laid on — like the server does.
 */
export function drawTextured(
  ctx: CanvasRenderingContext2D,
  o: Pick<StudioObject, 'texture'> & ({ draw: (c: CanvasRenderingContext2D) => void }),
  f: Frame,
  M: DOMMatrix,
  clip: { x: number; y: number; w: number; h: number },
): void {
  const apply = (c: CanvasRenderingContext2D) => {
    c.setTransform(M);
    c.beginPath();
    c.rect(clip.x, clip.y, clip.w, clip.h);
    c.clip();
    o.draw(c);
  };
  if (o.texture === 'smooth') {
    ctx.save();
    apply(ctx);
    ctx.restore();
    return;
  }
  const W = ctx.canvas.width, H = ctx.canvas.height;
  scratch ??= document.createElement('canvas');
  if (scratch.width !== W || scratch.height !== H) {
    scratch.width = W;
    scratch.height = H;
  }
  const s = scratch.getContext('2d')!;
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.clearRect(0, 0, W, H);
  apply(s);
  const T = TEXTURE_TILE_FRAC * S(f);
  const grain = (part: 'mask' | 'dark' | 'light', op: GlobalCompositeOperation) => {
    const tile = tileCanvas(o.texture as Exclude<TextureKind, 'smooth'>, part);
    const p = s.createPattern(tile, 'repeat')!;
    p.setTransform(new DOMMatrix().scale(T / tile.width));
    s.globalCompositeOperation = op;
    s.fillStyle = p;
    s.fillRect(clip.x, clip.y, clip.w, clip.h);
  };
  grain('mask', 'destination-in');
  grain('dark', 'source-atop');
  grain('light', 'source-atop');
  s.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}
