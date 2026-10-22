import type { StudioObject } from '@/lib/studio-objects';

/**
 * Studio geometry maths shared by the browser (live canvas) and the server (full-resolution
 * render), so both turn, flip and place the drawing identically.
 *
 * Pipeline (both sides): ROTATE the whole picture by `rotate`° clockwise (any angle; the frame
 * grows to the rotated bounding box, so nothing is clipped) → FLIP → PLACE the drawing inside that
 * frame (`place`: centre as frame fractions, scale, its own turn — identity unless the drawing
 * layer was unlocked and moved) → CROP. Added things live in the frame ("geometry space").
 */

export interface Placement {
  /** Centre of the drawing, as fractions of the frame. */
  x: number;
  y: number;
  /** 1 = fills the frame exactly as it was rotated into it. */
  scale: number;
  /** The drawing's own turn inside the frame, degrees clockwise. */
  angle: number;
}
export const IDENTITY_PLACE: Placement = { x: 0.5, y: 0.5, scale: 1, angle: 0 };

export const placeIsIdentity = (p: Placement | null | undefined): boolean =>
  !p || (Math.abs(p.x - 0.5) < 1e-4 && Math.abs(p.y - 0.5) < 1e-4 && Math.abs(p.scale - 1) < 1e-4 && Math.abs(normAngle(p.angle)) < 0.05);

/** Into [0, 360), to a tenth of a degree. */
export function normAngle(a: number): number {
  const r = Math.round((((a % 360) + 360) % 360) * 10) / 10;
  return r >= 360 ? 0 : r;
}

/** "Light smart snaps": within `within`° of a multiple of 45, land on it exactly. */
export const SNAP_STEP = 45;
export const SNAP_WITHIN = 2.5;
export function snapAngle(a: number, within = SNAP_WITHIN, step = SNAP_STEP): number {
  const n = normAngle(a);
  const nearest = Math.round(n / step) * step;
  return Math.abs(n - nearest) <= within ? normAngle(nearest) : n;
}

const isQuarter = (a: number) => Math.abs(a / 90 - Math.round(a / 90)) < 1e-9;

/** Size of a w×h picture after turning it `deg`° (its bounding box). Exact for quarter turns. */
export function rotatedSize(w: number, h: number, deg: number): [number, number] {
  const r = normAngle(deg);
  if (r === 0 || r === 180) return [w, h];
  if (r === 90 || r === 270) return [h, w];
  const t = (r * Math.PI) / 180;
  const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return [w * c + h * s, w * s + h * c];
}

/** With exactly one flip the stored turn runs backwards on screen — this is the angle people see. */
export const visualAngle = (g: { rotate: number; flipH: boolean; flipV: boolean }): number =>
  g.flipH !== g.flipV ? normAngle(-g.rotate) : normAngle(g.rotate);

interface Geo {
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  crop: { x: number; y: number; w: number; h: number };
  place?: Placement | null;
}

/**
 * Turn the WHOLE design so it shows at `visual`° on screen. Returns the new geometry, plus how
 * far it turned and the frame before/after (for carrying added things along with it).
 * Quarter turns carry the crop exactly; any other turn resets it (the frame changes shape).
 */
export function turnTo<G extends Geo>(g: G, visual: number, w: number, h: number): { geo: G; delta: number; f0: [number, number]; f1: [number, number] } {
  const target = normAngle(visual);
  const delta = normAngle(target - visualAngle(g));
  const rotate = g.flipH !== g.flipV ? normAngle(-target) : target;
  const f0 = rotatedSize(w, h, g.rotate);
  const f1 = rotatedSize(w, h, rotate);
  let crop = { x: 0, y: 0, w: 1, h: 1 };
  if (isQuarter(delta)) {
    crop = { ...g.crop };
    for (let q = Math.round(delta / 90) % 4; q > 0; q--) crop = { x: 1 - crop.y - crop.h, y: crop.x, w: crop.h, h: crop.w };
  }
  const place = g.place && !placeIsIdentity(g.place) ? turnPlacement(g.place, delta, f0, f1) : g.place;
  return { geo: { ...g, rotate, crop, place }, delta, f0, f1 };
}

/** A point in the old frame (px) → the same spot after the design turns `deg`° about its centre. */
function turnPoint(px: number, py: number, deg: number, f0: [number, number], f1: [number, number]): [number, number] {
  const t = (deg * Math.PI) / 180;
  const dx = px - f0[0] / 2, dy = py - f0[1] / 2;
  return [f1[0] / 2 + dx * Math.cos(t) - dy * Math.sin(t), f1[1] / 2 + dx * Math.sin(t) + dy * Math.cos(t)];
}

function turnPlacement(p: Placement, deg: number, f0: [number, number], f1: [number, number]): Placement {
  const [x, y] = turnPoint(p.x * f0[0], p.y * f0[1], deg, f0, f1);
  return { ...p, x: x / f1[0], y: y / f1[1] };
}

/** Mirror the drawing's placement with the design (its own turn mirrors too). */
export function flipPlacement(p: Placement | null | undefined, axis: 'h' | 'v'): Placement | null | undefined {
  if (!p || placeIsIdentity(p)) return p;
  return axis === 'h' ? { ...p, x: 1 - p.x, angle: normAngle(-p.angle) } : { ...p, y: 1 - p.y, angle: normAngle(-p.angle) };
}

/**
 * Carry added things with a turn of the whole design: positions turn about the centre, tilts add
 * the turn, and sizes (fractions of the frame's shorter side) rescale as the frame grows, so
 * everything stays the same size on the drawing.
 */
export function turnObjects(objs: StudioObject[], deg: number, f0: [number, number], f1: [number, number]): StudioObject[] {
  if (!objs.length || normAngle(deg) === 0) return objs;
  const k = Math.min(...f0) / Math.min(...f1);
  return objs.map((o) => {
    if (o.type === 'stroke') {
      const p = o.points.slice();
      for (let i = 0; i < p.length; i += 3) {
        const [x, y] = turnPoint(p[i]! * f0[0], p[i + 1]! * f0[1], deg, f0, f1);
        p[i] = x / f1[0];
        p[i + 1] = y / f1[1];
      }
      return { ...o, points: p, width: o.width * k, rotation: normAngle((o.rotation ?? 0) + deg) };
    }
    const [x, y] = turnPoint(o.x * f0[0], o.y * f0[1], deg, f0, f1);
    const rotation = Math.round(normAngle(o.rotation + deg) * 10) / 10;
    if (o.type === 'text') return { ...o, x: x / f1[0], y: y / f1[1], rotation, size: o.size * k };
    return { ...o, x: x / f1[0], y: y / f1[1], rotation, w: o.w * k, h: o.h * k };
  });
}

/** Clean a placement from the browser (never trust the client). */
export function cleanPlace(raw: unknown): Placement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const p = { x: num(r.x, -1, 2, 0.5), y: num(r.y, -1, 2, 0.5), scale: num(r.scale, 0.05, 8, 1), angle: normAngle(num(r.angle, -3600, 3600, 0)) };
  return placeIsIdentity(p) ? null : p;
}

/**
 * A print-area quad (corners tl, tr, br, bl in pixels) that is a rectangle TURNED by a visible
 * angle — the angled ankle socks and playing cards — as its centre, own size and angle (degrees,
 * clockwise on screen). Null for a straight rectangle (≤ 0.3°) and for a true perspective quad, which
 * keep the plain box. Lets the placement editor turn the print area with the product, like the
 * mockup does.
 */
export function tiltedRect(q: readonly (readonly [number, number])[]): { cx: number; cy: number; w: number; h: number; angle: number } | null {
  if (q.length !== 4) return null;
  const [p0, p1, p2, p3] = q as [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]];
  const len = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const top = len(p0, p1), bottom = len(p3, p2), left = len(p0, p3), right = len(p1, p2);
  if (!(top > 0 && left > 0)) return null;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.02 * Math.max(a, b);
  // a rectangle: opposite sides equal, and the diagonals equal too (no shear)
  if (!near(top, bottom) || !near(left, right) || !near(len(p0, p2), len(p1, p3))) return null;
  const angle = (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
  if (Math.abs(angle) <= 0.3) return null;
  return { cx: (p0[0] + p1[0] + p2[0] + p3[0]) / 4, cy: (p0[1] + p1[1] + p2[1] + p3[1]) / 4, w: (top + bottom) / 2, h: (left + right) / 2, angle };
}
