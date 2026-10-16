import { CARD_FONTS, type CardFontToken } from '@/lib/card-fonts';
import { cleanTexture, type TextureKind } from '@/lib/textures';

/**
 * The Studio's added things — text, shapes and pen strokes — as VECTOR objects in the recipe.
 * Shared by the browser (live preview) and the server (full-resolution render), so both draw the
 * same thing from the same numbers.
 *
 * Coordinates live in "geometry space": the picture after rotate + flip, BEFORE crop, as 0–1
 * fractions of its width (u) and height (v). Sizes are fractions of its SHORTER side (S), so they
 * survive rotation. Re-cropping never moves an object relative to the picture.
 */

export type ShapeKind = 'heart' | 'star' | 'circle' | 'square' | 'triangle' | 'cloud' | 'flower' | 'sun';

export interface TextObject {
  id: string;
  type: 'text';
  text: string;
  font: CardFontToken;
  colour: string;
  /** Font size as a fraction of S. */
  size: number;
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  texture: TextureKind;
}
export interface ShapeObject {
  id: string;
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  /** Outline colour, and its thickness as a fraction of the shape's shorter side (0 = none). */
  stroke: string;
  strokeWidth: number;
  x: number;
  y: number;
  /** Width / height as fractions of S. */
  w: number;
  h: number;
  rotation: number;
  texture: TextureKind;
}
export interface StrokeObject {
  id: string;
  type: 'stroke';
  colour: string;
  /** Line width as a fraction of S. */
  width: number;
  /** Flat [u, v, pressure, u, v, pressure, …] — pressure 0–1 (0.5 when not a stylus). */
  points: number[];
  texture: TextureKind;
  /** How far it's been turned (degrees). The points already ARE turned — this is the dial's reading. */
  rotation?: number;
}
export type StudioObject = TextObject | ShapeObject | StrokeObject;

/** Shape outlines on a 100×100 box — drawn by Path2D in the browser and by SVG on the server. */
export const SHAPE_PATHS: Record<ShapeKind, string> = {
  heart: 'M50 88 C20 66 4 50 4 30 C4 15 16 5 29 5 C38 5 46 10 50 18 C54 10 62 5 71 5 C84 5 96 15 96 30 C96 50 80 66 50 88 Z',
  star: 'M50 4 L62 36 L96 37 L69 58 L79 92 L50 72 L21 92 L31 58 L4 37 L38 36 Z',
  circle: 'M50 4 A46 46 0 1 1 49.99 4 Z',
  square: 'M18 6 H82 Q94 6 94 18 V82 Q94 94 82 94 H18 Q6 94 6 82 V18 Q6 6 18 6 Z',
  triangle: 'M50 6 L95 90 Q96 94 91 94 H9 Q4 94 5 90 Z',
  cloud: 'M26 82 Q6 82 6 64 Q6 48 22 46 Q22 24 44 22 Q58 8 74 22 Q94 24 94 46 Q96 60 88 68 Q90 82 74 82 Z',
  flower:
    'M50 30 C44 6 26 10 30 30 C10 26 6 44 28 50 C6 56 10 74 30 70 C26 90 44 94 50 70 C56 94 74 90 70 70 C90 74 94 56 72 50 C94 44 90 26 70 30 C74 10 56 6 50 30 Z',
  sun: 'M50 26 A24 24 0 1 1 49.99 26 Z M47 2 H53 L52 18 H48 Z M47 98 H53 L52 82 H48 Z M2 47 V53 L18 52 V48 Z M98 47 V53 L82 52 V48 Z M14 18 L18 14 L29 26 L26 29 Z M86 82 L82 86 L71 74 L74 71 Z M86 18 L82 14 L71 26 L74 29 Z M14 82 L18 86 L29 74 L26 71 Z',
};
export const SHAPE_KINDS = Object.keys(SHAPE_PATHS) as ShapeKind[];

export const TEXT_LINE_HEIGHT = 1.2;
export const MAX_OBJECTS = 120;
export const MAX_TEXT_LENGTH = 200;
export const MAX_STROKE_POINTS = 4000;
export const MAX_SHAPE_STROKE = 0.2;
const MAX_TOTAL_POINTS = 40000;

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const colour = (v: unknown, d = '#2b2118') => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
const id = (v: unknown) => (typeof v === 'string' && /^[a-z0-9-]{1,40}$/i.test(v) ? v : Math.random().toString(36).slice(2, 10));

/**
 * Validate + clamp objects from the browser (never trust the client): known types / fonts / shapes
 * only, colours as #rrggbb, numbers clamped, sizes and counts capped. Junk is dropped, not "fixed".
 */
export function cleanObjects(raw: unknown): StudioObject[] {
  if (!Array.isArray(raw)) return [];
  const out: StudioObject[] = [];
  let points = 0;
  for (const o of raw.slice(0, MAX_OBJECTS)) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    if (r.type === 'text') {
      const text = String(r.text ?? '').replace(/\r/g, '').slice(0, MAX_TEXT_LENGTH);
      if (!text.trim()) continue;
      const font = CARD_FONTS.find((f) => f.token === r.font)?.token ?? 'caveat';
      out.push({ id: id(r.id), type: 'text', text, font, colour: colour(r.colour), size: num(r.size, 0.01, 1, 0.08), x: num(r.x, -0.5, 1.5, 0.5), y: num(r.y, -0.5, 1.5, 0.5), rotation: num(r.rotation, -360, 360, 0), texture: cleanTexture(r.texture) });
    } else if (r.type === 'shape') {
      const shape = SHAPE_KINDS.includes(r.shape as ShapeKind) ? (r.shape as ShapeKind) : null;
      if (!shape) continue;
      // saved before outlines had a colour + thickness: `outline: true` was a 5% dark line
      const legacy = r.strokeWidth === undefined ? (r.outline === true ? 0.05 : 0) : 0;
      out.push({
        id: id(r.id), type: 'shape', shape, fill: colour(r.fill, '#f6c445'), stroke: colour(r.stroke), strokeWidth: num(r.strokeWidth, 0, MAX_SHAPE_STROKE, legacy),
        x: num(r.x, -0.5, 1.5, 0.5), y: num(r.y, -0.5, 1.5, 0.5), w: num(r.w, 0.01, 2, 0.2), h: num(r.h, 0.01, 2, 0.2), rotation: num(r.rotation, -360, 360, 0), texture: cleanTexture(r.texture),
      });
    } else if (r.type === 'stroke') {
      if (!Array.isArray(r.points)) continue;
      const pts = (r.points as unknown[]).slice(0, MAX_STROKE_POINTS * 3).map((n, i) => (i % 3 === 2 ? num(n, 0, 1, 0.5) : num(n, -0.5, 1.5, 0)));
      const n = Math.floor(pts.length / 3) * 3;
      if (n < 3 || points + n / 3 > MAX_TOTAL_POINTS) continue;
      points += n / 3;
      out.push({ id: id(r.id), type: 'stroke', colour: colour(r.colour), width: num(r.width, 0.001, 0.3, 0.012), points: pts.slice(0, n), texture: cleanTexture(r.texture), ...(typeof r.rotation === 'number' && Number.isFinite(r.rotation) && r.rotation % 360 !== 0 ? { rotation: num(r.rotation, -360, 360, 0) } : {}) });
    }
  }
  return out;
}

/** All the words in the objects (for the abuse screen). */
export const objectText = (objs: StudioObject[]) => objs.filter((o): o is TextObject => o.type === 'text').map((o) => o.text);

/**
 * Carry objects through a quarter turn clockwise / a flip of the picture, so they stay where they
 * were on the drawing. Text is never mirrored — only its position (and tilt) follows a flip.
 */
export function rotateObjects(objs: StudioObject[]): StudioObject[] {
  return objs.map((o) => {
    if (o.type === 'stroke') {
      const p = o.points.slice();
      for (let i = 0; i < p.length; i += 3) {
        const u = p[i]!, v = p[i + 1]!;
        p[i] = 1 - v;
        p[i + 1] = u;
      }
      return { ...o, points: p };
    }
    return { ...o, x: 1 - o.y, y: o.x, rotation: (o.rotation + 90) % 360 };
  });
}
export function flipObjects(objs: StudioObject[], axis: 'h' | 'v'): StudioObject[] {
  return objs.map((o) => {
    if (o.type === 'stroke') {
      const p = o.points.slice();
      for (let i = 0; i < p.length; i += 3) {
        if (axis === 'h') p[i] = 1 - p[i]!;
        else p[i + 1] = 1 - p[i + 1]!;
      }
      // the points mirror; the dial's reading mirrors with them
      return o.rotation ? { ...o, points: p, rotation: (((-o.rotation % 360) + 360) % 360) } : { ...o, points: p };
    }
    return axis === 'h' ? { ...o, x: 1 - o.x, rotation: -o.rotation } : { ...o, y: 1 - o.y, rotation: -o.rotation };
  });
}
