import { describe, expect, it } from 'vitest';
import { FESTIVE_PRESETS, FESTIVE_SHAPES, festiveObjects, presetIsOn, presetOf, toggleFestive, type DesignArea } from '@/lib/studio-festive';
import { cleanObjects, MAX_OBJECTS, PLAIN_SHAPES, SHAPE_KINDS, SHAPE_LABELS, SHAPE_PATHS, type StudioObject } from '@/lib/studio-objects';

/** A strict reader for the 100-box paths: absolute commands only, the right number of numbers each, closed subpaths. */
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, A: 7, Z: 0 };
function parsePath(d: string) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  expect(tokens.join('').length).toBe(d.replace(/[\s,]/g, '').length); // nothing unreadable
  let subpaths = 0, open = false;
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++]!;
    expect(ARGS, `unknown command ${cmd}`).toHaveProperty(cmd);
    if (cmd === 'M') {
      expect(open, 'a new subpath before the last one closed').toBe(false);
      subpaths++;
      open = true;
    } else expect(open, `${cmd} outside a subpath`).toBe(true);
    if (cmd === 'Z') open = false;
    const n = ARGS[cmd]!;
    const nums = tokens.slice(i, i + n).map(Number);
    expect(nums.length === n && nums.every(Number.isFinite), `${cmd} needs ${n} numbers`).toBe(true);
    i += n;
    // points (not arc radii / flags) stay inside the box
    const pts = cmd === 'A' ? nums.slice(5) : nums;
    for (const v of pts) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  }
  return { subpaths, closed: !open };
}

const area: DesignArea = { gw: 1200, gh: 1600, crop: { x: 0, y: 0, w: 1, h: 1 } };
let n = 0;
const seqId = () => `t${++n}`;

describe('festive stickers: shape paths', () => {
  it('every festive shape (and the tape + frame) is a well-formed, closed path inside the 100-box', () => {
    for (const k of [...FESTIVE_SHAPES, 'tape', 'frame'] as const) {
      const { subpaths, closed } = parsePath(SHAPE_PATHS[k]);
      expect(subpaths, k).toBeGreaterThan(0);
      expect(closed, `${k} subpaths are all closed`).toBe(true);
    }
  });

  it('the festive set is all real shapes, with names a parent can read; the everyday picker is unchanged', () => {
    for (const k of FESTIVE_SHAPES) expect(SHAPE_KINDS).toContain(k);
    expect(FESTIVE_SHAPES[0]).toBe('gingerbread'); // the mascot leads
    expect(PLAIN_SHAPES).toEqual(['heart', 'star', 'circle', 'square', 'triangle', 'cloud', 'flower', 'sun']);
    for (const k of SHAPE_KINDS) expect(SHAPE_LABELS[k]).toMatch(/^[a-z ]+$/);
    expect(SHAPE_LABELS.gingerbread).toBe('gingerbread man');
  });

  it('a saved festive sticker survives the server’s cleaning (it is just a shape)', () => {
    const raw = { id: 'abc', type: 'shape', shape: 'gingerbread', fill: '#c8402a', stroke: '#2b2118', strokeWidth: 0.05, texture: 'crayon', x: 0.4, y: 0.6, w: 0.2, h: 0.2, rotation: 12 };
    expect(cleanObjects([raw])).toEqual([raw]);
  });
});

describe('festive touches: one-tap presets of ordinary objects', () => {
  it('each preset makes valid shapes that the server keeps exactly as they are', () => {
    for (const p of FESTIVE_PRESETS) {
      const objs = festiveObjects(p, area, seqId);
      expect(objs.length).toBeGreaterThan(0);
      expect(objs.every((o) => o.type === 'shape' && SHAPE_KINDS.includes(o.shape))).toBe(true);
      expect(cleanObjects(objs)).toEqual(objs);
      expect(objs.every((o) => presetOf(o) === p)).toBe(true);
    }
  });

  it('holly tape: two red strips across opposite corners', () => {
    const [a, b] = festiveObjects('hollyTape', area, seqId);
    expect([a!.shape, b!.shape]).toEqual(['tape', 'tape']);
    expect(a!.fill).toBe('#c8402a');
    expect(a!.x).toBeLessThan(0.5);
    expect(a!.y).toBeLessThan(0.5);
    expect(b!.x).toBeGreaterThan(0.5);
    expect(b!.y).toBeGreaterThan(0.5);
  });

  it('gold frame: honey with a deeper edge, exactly round what is on show (after crop)', () => {
    const cropped: DesignArea = { gw: 1200, gh: 1600, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } };
    const [f] = festiveObjects('goldFrame', cropped, seqId);
    expect(f).toMatchObject({ shape: 'frame', fill: '#f6c445', stroke: '#c99a1e', rotation: 0 });
    expect(f!.x).toBeCloseTo(0.35);
    expect(f!.y).toBeCloseTo(0.5);
    // sizes are fractions of the shorter side (1200): 600 × 960 px on show
    expect(f!.w).toBeCloseTo(0.5);
    expect(f!.h).toBeCloseTo(0.8);
  });

  it('a gold frame round a long, thin design is not cut short by the size cap', () => {
    const long: DesignArea = { gw: 3600, gh: 1000, crop: { x: 0, y: 0, w: 1, h: 1 } };
    const [f] = cleanObjects(festiveObjects('goldFrame', long, seqId)) as [Extract<StudioObject, { type: 'shape' }>];
    expect(f.w).toBeCloseTo(3.6);
  });

  it('snowfall: white snowflakes with a faint sky outline, kept off the middle of the drawing', () => {
    const snow = festiveObjects('snowfall', area, seqId);
    expect(snow.length).toBeGreaterThanOrEqual(6);
    for (const s of snow) {
      expect(s).toMatchObject({ shape: 'snowflake', fill: '#ffffff', stroke: '#8fb5d6' });
      expect(Math.max(Math.abs(s.x - 0.5), Math.abs(s.y - 0.5))).toBeGreaterThan(0.2);
    }
  });

  it('tap on, tap off — and only the touch’s own objects come off; the drawing is never in the list', () => {
    const mine: StudioObject = { id: 'name', type: 'text', text: 'Mia', font: 'caveat', colour: '#2b2118', size: 0.1, x: 0.5, y: 0.9, rotation: 0, texture: 'smooth' };
    const on = toggleFestive([mine], 'snowfall', area, seqId)!;
    expect(on[0]).toBe(mine);
    expect(presetIsOn(on, 'snowfall')).toBe(true);
    const off = toggleFestive(on, 'snowfall', area, seqId)!;
    expect(off).toEqual([mine]);
  });

  it('the gold frame goes underneath what is already added, so names stay on top', () => {
    const mine: StudioObject = { id: 'name', type: 'text', text: 'Mia', font: 'caveat', colour: '#2b2118', size: 0.1, x: 0.5, y: 0.9, rotation: 0, texture: 'smooth' };
    const out = toggleFestive([mine], 'goldFrame', area, seqId)!;
    expect(out.at(-1)).toBe(mine);
    expect(presetOf(out[0]!)).toBe('goldFrame');
  });

  it('never goes past MAX_OBJECTS — it says no rather than dropping anything', () => {
    const full: StudioObject[] = Array.from({ length: MAX_OBJECTS - 3 }, (_, i) => ({ id: `s${i}`, type: 'shape', shape: 'heart', fill: '#c8402a', stroke: '#2b2118', strokeWidth: 0, x: 0.5, y: 0.5, w: 0.1, h: 0.1, rotation: 0, texture: 'smooth' }));
    expect(toggleFestive(full, 'snowfall', area, seqId)).toBeNull();
    const framed = toggleFestive(full, 'goldFrame', area, seqId)!;
    expect(framed).toHaveLength(MAX_OBJECTS - 2);
    expect(cleanObjects(framed)).toHaveLength(framed.length);
    for (const p of FESTIVE_PRESETS) expect(festiveObjects(p, area).length).toBeLessThanOrEqual(MAX_OBJECTS);
  });
});
