import { MAX_OBJECTS, type ShapeKind, type ShapeObject, type StudioObject } from '@/lib/studio-objects';

/**
 * "Festive touches" (the Studio's christmas drawer, mockups/christmas screen 3): one-tap presets that add a few
 * ORDINARY shape objects — tape, a frame, snowflakes — so they undo, move, recolour and print like
 * anything else added in the Studio. Nothing here touches the drawing itself, and nothing new
 * reaches the print path except shapes. Deterministic and in-house: no third party sees anything.
 */

export type FestivePreset = 'hollyTape' | 'goldFrame' | 'snowfall';
export const FESTIVE_PRESETS: FestivePreset[] = ['hollyTape', 'goldFrame', 'snowfall'];

/** Brand colours as recipe data (globals.css tokens: cta, paper, honey, sky; the frame's edge is the mockup's honey-deep). */
export const FESTIVE_COLOURS = { holly: '#c8402a', gold: '#f6c445', goldEdge: '#c99a1e', snow: '#ffffff', sky: '#8fb5d6' } as const;

/** What's on show: the picture's geometry-space size (px) and the crop, as 0–1 fractions. */
export interface DesignArea {
  gw: number;
  gh: number;
  crop: { x: number; y: number; w: number; h: number };
}

/** A preset's objects carry its name in their id, so the sheet can show it's on (and take it off). */
const PREFIX: Record<FestivePreset, string> = { hollyTape: 'fx-tape-', goldFrame: 'fx-frame-', snowfall: 'fx-snow-' };
export const presetOf = (o: Pick<StudioObject, 'id'>): FestivePreset | null => FESTIVE_PRESETS.find((p) => o.id.startsWith(PREFIX[p])) ?? null;
export const presetIsOn = (objects: StudioObject[], p: FestivePreset) => objects.some((o) => presetOf(o) === p);

/** Snowflakes round the edges (crop fractions, size as a fraction of the shorter side, turn). */
const SNOW: [number, number, number, number][] = [
  [0.09, 0.9, 0.13, 10],
  [0.24, 0.8, 0.08, 35],
  [0.1, 0.17, 0.07, 5],
  [0.37, 0.07, 0.06, 25],
  [0.9, 0.12, 0.11, 20],
  [0.77, 0.23, 0.07, 50],
  [0.92, 0.63, 0.08, 40],
  [0.63, 0.92, 0.06, 15],
];

const rid = () => Math.random().toString(36).slice(2, 10);

/** The objects a preset adds, laid out over what's on show (after crop), on top of everything. */
export function festiveObjects(preset: FestivePreset, area: DesignArea, id: () => string = rid): ShapeObject[] {
  const S = Math.min(area.gw, area.gh);
  const { crop } = area;
  // the visible area in S units, and a way to place things by fractions of it
  const cw = (crop.w * area.gw) / S, ch = (crop.h * area.gh) / S;
  const short = Math.min(cw, ch);
  const at = (fx: number, fy: number) => ({ x: crop.x + crop.w * fx, y: crop.y + crop.h * fy });
  const shape = (shape: ShapeKind, rest: Omit<ShapeObject, 'id' | 'type' | 'shape' | 'texture'>): ShapeObject => ({ id: PREFIX[preset] + id(), type: 'shape', shape, texture: 'smooth', ...rest });

  if (preset === 'goldFrame') {
    return [shape('frame', { ...at(0.5, 0.5), w: cw, h: ch, rotation: 0, fill: FESTIVE_COLOURS.gold, stroke: FESTIVE_COLOURS.goldEdge, strokeWidth: 0.012 })];
  }
  if (preset === 'hollyTape') {
    // two strips across opposite corners, as if the drawing were taped into a scrapbook
    const w = 0.4 * short, h = 0.09 * short;
    const inX = (0.13 * short) / cw, inY = (0.02 * short) / ch;
    const strip = (fx: number, fy: number) => shape('tape', { ...at(fx, fy), w, h, rotation: 336, fill: FESTIVE_COLOURS.holly, stroke: FESTIVE_COLOURS.holly, strokeWidth: 0 });
    return [strip(inX, inY), strip(1 - inX, 1 - inY)];
  }
  return SNOW.map(([fx, fy, size, rotation]) => shape('snowflake', { ...at(fx, fy), w: size * short, h: size * short, rotation, fill: FESTIVE_COLOURS.snow, stroke: FESTIVE_COLOURS.sky, strokeWidth: 0.05 }));
}

/**
 * Tap a festive touch: on → its objects go on top (or `null` if there's no room under MAX_OBJECTS);
 * already on → every object it added comes off. The drawing is never part of `objects`.
 */
export function toggleFestive(objects: StudioObject[], preset: FestivePreset, area: DesignArea, id?: () => string): StudioObject[] | null {
  if (presetIsOn(objects, preset)) return objects.filter((o) => presetOf(o) !== preset);
  const add = festiveObjects(preset, area, id);
  if (objects.length + add.length > MAX_OBJECTS) return null;
  // the frame sits under everything else added, so names and stickers stay on top of it
  return preset === 'goldFrame' ? [...add, ...objects] : [...objects, ...add];
}
