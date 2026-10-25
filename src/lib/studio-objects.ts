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

export type ShapeKind =
  | 'heart' | 'star' | 'circle' | 'square' | 'triangle' | 'cloud' | 'flower' | 'sun'
  // the Christmas stickers (src/lib/studio-festive.ts)
  | 'christmasTree' | 'snowflake' | 'gingerbread' | 'holly' | 'bauble' | 'present' | 'candyCane'
  // only placed by the festive touches (washi tape, a frame round the design) — not in the picker
  | 'tape' | 'frame';

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
  // ── Christmas stickers: one outline each, details cut out as holes (evenodd), like cookie-cutters ──
  christmasTree:
    'M50 3 L71 30 Q73 33 69 33 L63 33 L82 56 Q84 59 80 59 L72 59 L93 83 Q95 86 91 86 L58 86 L58 96 Q58 98 56 98 L44 98 Q42 98 42 96 L42 86 L9 86 Q5 86 7 83 L28 59 L20 59 Q16 59 18 56 L37 33 L31 33 Q27 33 29 30 Z',
  snowflake:
    'M43.5 38.7 L43.5 31.8 L30.6 24.3 L29.2 17.8 L35.6 15.7 L43.5 20.2 L43.5 12.5 L46.4 6 L50 5 L53.6 6 L56.5 12.5 L56.5 20.2 L64.4 15.7 L70.8 17.8 L69.4 24.3 L56.5 31.8 L56.5 38.7 L62.5 35.3 L62.5 20.4 L67.5 15.9 L72.5 20.4 L72.5 29.5 L79.2 25.6 L86.3 24.9 L89 27.5 L89.9 31.1 L85.7 36.9 L79 40.7 L86.9 45.3 L88.3 51.9 L81.9 54 L69 46.5 L63 50 L69 53.5 L81.9 46 L88.3 48.1 L86.9 54.7 L79 59.3 L85.7 63.1 L89.9 68.9 L89 72.5 L86.3 75.1 L79.2 74.4 L72.5 70.5 L72.5 79.6 L67.5 84.1 L62.5 79.6 L62.5 64.7 L56.5 61.3 L56.5 68.2 L69.4 75.7 L70.8 82.3 L64.4 84.3 L56.5 79.8 L56.5 87.5 L53.6 94 L50 95 L46.4 94 L43.5 87.5 L43.5 79.8 L35.6 84.3 L29.2 82.3 L30.6 75.7 L43.5 68.2 L43.5 61.3 L37.5 64.7 L37.5 79.6 L32.5 84.1 L27.5 79.6 L27.5 70.5 L20.8 74.4 L13.7 75.1 L11 72.5 L10.1 68.9 L14.3 63.1 L21 59.3 L13.1 54.7 L11.7 48.1 L18.1 46 L31 53.5 L37 50 L31 46.5 L18.1 54 L11.7 51.9 L13.1 45.3 L21 40.7 L14.3 36.9 L10.1 31.1 L11 27.5 L13.7 24.9 L20.8 25.6 L27.5 29.5 L27.5 20.4 L32.5 15.9 L37.5 20.4 L37.5 35.3 Z M52 46.5 L54 50 L52 53.5 L48 53.5 L46 50 L48 46.5 Z',
  gingerbread:
    'M42 33.9 A16 16 0 1 1 58 33.9 L60 38 L84 38 Q94 38 94 47 Q94 56 84 56 L64 56 L66 70 L74 88 Q78 96 70 97 Q64 98 60 92 L50 78 L40 92 Q36 98 30 97 Q22 96 26 88 L34 70 L36 56 L16 56 Q6 56 6 47 Q6 38 16 38 L40 38 Z M46.8 18 A2.8 2.8 0 1 0 41.2 18 A2.8 2.8 0 1 0 46.8 18 Z M58.8 18 A2.8 2.8 0 1 0 53.2 18 A2.8 2.8 0 1 0 58.8 18 Z M43 24.5 Q50 31 57 24.5 Q50 28 43 24.5 Z M53 45 A3 3 0 1 0 47 45 A3 3 0 1 0 53 45 Z M53 55 A3 3 0 1 0 47 55 A3 3 0 1 0 53 55 Z M53 65 A3 3 0 1 0 47 65 A3 3 0 1 0 53 65 Z',
  holly:
    'M46 66 Q43.1 62.2 42.9 51.5 Q35.5 55.7 34.7 42.7 Q25.7 51.2 23.9 40.7 Q15.2 49.7 11.8 44.7 Q6.7 50.5 4 50 Q6.3 51.4 6.3 59.1 Q12.1 57.7 12.6 70.2 Q21 63.6 22 75.9 Q31.3 66.7 34 74.7 Q41.4 66.7 46 66 Z M54 66 Q58.7 66.9 66 74.7 Q68.7 66.7 78 75.9 Q79 63.6 87.4 70.2 Q87.9 57.7 93.7 59.1 Q93.6 51.4 96 50 Q93.3 50.5 88.2 44.7 Q84.8 49.7 76.1 40.7 Q74.3 51.2 65.3 42.7 Q64.5 55.7 57.1 51.5 Q57 62.5 54 66 Z M59.5 44 A9.5 9.5 0 1 0 40.5 44 A9.5 9.5 0 1 0 59.5 44 Z M46 29 A8.5 8.5 0 1 0 29 29 A8.5 8.5 0 1 0 46 29 Z M71 29 A8.5 8.5 0 1 0 54 29 A8.5 8.5 0 1 0 71 29 Z',
  bauble:
    'M40 27.5 L40 15 Q40 12 43 12 L57 12 Q60 12 60 15 L60 27.5 A34 34 0 1 1 40 27.5 Z M54.5 6.5 A4.5 4.5 0 1 0 45.5 6.5 A4.5 4.5 0 1 0 54.5 6.5 Z M52 6.5 A2 2 0 1 0 48 6.5 A2 2 0 1 0 52 6.5 Z M22 54 L31 50 L40 54 L50 50 L60 54 L69 50 L78 54 L78 60 L69 56 L60 60 L50 56 L40 60 L31 56 L22 60 Z',
  present:
    'M6 33 Q6 30 9 30 L44 30 C30 26 18 8 32 8 C40 8 46 16 50 26 C54 16 60 8 68 8 C82 8 70 26 56 30 L91 30 Q94 30 94 33 L94 39 Q94 42 91 42 L88 42 L88 91 Q88 94 85 94 L15 94 Q12 94 12 91 L12 42 L9 42 Q6 42 6 39 Z M15 42 H42 V45 H15 Z M58 42 H85 V45 H58 Z M43 49 H46 V90 H43 Z M54 49 H57 V90 H54 Z M43 33 H46 V39 H43 Z M54 33 H57 V39 H54 Z M37.5 16 A3.5 3.5 0 1 0 30.5 16 A3.5 3.5 0 1 0 37.5 16 Z M69.5 16 A3.5 3.5 0 1 0 62.5 16 A3.5 3.5 0 1 0 69.5 16 Z',
  candyCane:
    'M72 90 L72 36 A26 26 0 0 0 20 36 L20 46 A8 8 0 0 0 36 46 L36 36 A10 10 0 0 1 56 36 L56 90 A8 8 0 0 0 72 90 Z M58.5 85.5 L69.5 78.5 L69.5 74 L58.5 81 Z M58.5 73.5 L69.5 66.5 L69.5 62 L58.5 69 Z M58.5 61.5 L69.5 54.5 L69.5 50 L58.5 57 Z M58.5 49.5 L69.5 42.5 L69.5 38 L58.5 45 Z M56.8 29.8 L62.3 19.1 L57.8 15.6 L55 27.3 Z M49.2 23.9 L45.6 12.5 L39.9 13.3 L46.2 23.5 Z M39.8 25.2 L29.1 19.7 L25.6 24.2 L37.3 27 Z M33.9 32.8 L22.5 36.4 L23.3 42.1 L33.5 35.8 Z',
  // ── placed by the festive touches only: washi tape (its gaps let the drawing through) and a frame ──
  tape: 'M25 0 L98 0 L96.4 7 L23.4 7 Z M3.6 93 L76.6 93 L75 100 L2 100 Z M3.6 93 L23.4 7 L33.4 7 L13.6 93 Z M24.6 93 L44.4 7 L54.4 7 L34.6 93 Z M45.6 93 L65.4 7 L75.4 7 L55.6 93 Z M66.6 93 L86.4 7 L96.4 7 L76.6 93 Z',
  frame: 'M0 0 H100 V100 H0 Z M7 7 V93 H93 V7 Z',
};
export const SHAPE_KINDS = Object.keys(SHAPE_PATHS) as ShapeKind[];
/** The everyday shapes in the picker (the festive stickers are their own set, in season). */
export const PLAIN_SHAPES: ShapeKind[] = ['heart', 'star', 'circle', 'square', 'triangle', 'cloud', 'flower', 'sun'];
/** What a shape is called, to a parent and to a screen reader. */
export const SHAPE_LABELS: Record<ShapeKind, string> = {
  heart: 'heart', star: 'star', circle: 'circle', square: 'square', triangle: 'triangle', cloud: 'cloud', flower: 'flower', sun: 'sun',
  christmasTree: 'christmas tree', snowflake: 'snowflake', gingerbread: 'gingerbread man', holly: 'holly', bauble: 'bauble', present: 'present', candyCane: 'candy cane',
  tape: 'washi tape', frame: 'gold frame',
};

export const TEXT_LINE_HEIGHT = 1.2;
export const MAX_OBJECTS = 120;
export const MAX_TEXT_LENGTH = 200;
export const MAX_STROKE_POINTS = 4000;
export const MAX_SHAPE_STROKE = 0.2;
/** A shape's width / height cap, in S — room for a frame round a long, thin design. */
export const MAX_SHAPE_SIZE = 4;
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
        x: num(r.x, -0.5, 1.5, 0.5), y: num(r.y, -0.5, 1.5, 0.5), w: num(r.w, 0.01, MAX_SHAPE_SIZE, 0.2), h: num(r.h, 0.01, MAX_SHAPE_SIZE, 0.2), rotation: num(r.rotation, -360, 360, 0), texture: cleanTexture(r.texture),
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
