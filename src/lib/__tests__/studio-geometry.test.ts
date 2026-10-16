import { describe, expect, it } from 'vitest';
import { cleanPlace, flipPlacement, normAngle, rotatedSize, snapAngle, turnObjects, turnTo, visualAngle } from '@/lib/studio-geometry';
import type { StudioObject } from '@/lib/studio-objects';

const geo = (over: Partial<{ rotate: number; flipH: boolean; flipV: boolean; crop: { x: number; y: number; w: number; h: number } }> = {}) => ({
  rotate: 0, flipH: false, flipV: false, crop: { x: 0, y: 0, w: 1, h: 1 }, place: null, ...over,
});
type Text = Extract<StudioObject, { type: 'text' }>;
type Stroke = Extract<StudioObject, { type: 'stroke' }>;

describe('studio geometry — turn to any angle, snap gently at 45°', () => {
  it('angles are kept in [0, 360) to a tenth of a degree', () => {
    expect(normAngle(-90)).toBe(270);
    expect(normAngle(360)).toBe(0);
    expect(normAngle(37.46)).toBe(37.5);
    expect(normAngle(0.1)).toBe(0.1);
  });

  it('snaps only when close to a multiple of 45°', () => {
    expect(snapAngle(43.2)).toBe(45);
    expect(snapAngle(46.9)).toBe(45);
    expect(snapAngle(40)).toBe(40);
    expect(snapAngle(357.8)).toBe(0);
    expect(snapAngle(134)).toBe(135);
    expect(snapAngle(12.3)).toBe(12.3);
  });

  it('the frame grows to fit a free turn; quarter turns are exact', () => {
    expect(rotatedSize(400, 200, 90)).toEqual([200, 400]);
    expect(rotatedSize(400, 200, 180)).toEqual([400, 200]);
    const [w, h] = rotatedSize(400, 200, 45);
    expect(w).toBeCloseTo(600 * Math.SQRT1_2, 6);
    expect(h).toBeCloseTo(600 * Math.SQRT1_2, 6);
  });

  it('a quarter turn carries the crop with it; a free turn starts the crop afresh', () => {
    const g = geo({ crop: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
    const q = turnTo(g, 90, 400, 200).geo.crop;
    expect(q.x).toBeCloseTo(0.4, 9);
    expect([q.y, q.w, q.h]).toEqual([0.1, 0.4, 0.3]);
    expect(turnTo(g, 30, 400, 200).geo.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('with one flip, the stored turn runs backwards so the design still turns clockwise on screen', () => {
    const t = turnTo(geo({ flipH: true }), 30, 400, 200);
    expect(t.geo.rotate).toBe(330);
    expect(visualAngle(t.geo)).toBe(30);
    expect(t.delta).toBe(30);
    // both flips = a half turn: no reversal
    expect(turnTo(geo({ flipH: true, flipV: true }), 30, 400, 200).geo.rotate).toBe(30);
  });

  it('added things turn with the design and come back exactly when it turns back', () => {
    const objs: StudioObject[] = [
      { id: 't', type: 'text', text: 'Mia', font: 'caveat', colour: '#000000', size: 0.1, x: 0.8, y: 0.25, rotation: 0, texture: 'smooth' },
      { id: 's', type: 'stroke', colour: '#000000', width: 0.02, points: [0.1, 0.1, 0.5, 0.9, 0.9, 0.5], texture: 'smooth' },
    ];
    const a = turnTo(geo(), 30, 400, 200);
    const there = turnObjects(objs, a.delta, a.f0, a.f1);
    expect((there[0] as Text).rotation).toBe(30);
    // smaller as a fraction of the (bigger) frame — the same size on the drawing
    expect((there[0] as Text).size).toBeLessThan(0.1);
    const b = turnTo(a.geo, 0, 400, 200);
    const back = turnObjects(there, b.delta, b.f0, b.f1);
    const t0 = back[0] as Text;
    expect(t0.x).toBeCloseTo(0.8, 6);
    expect(t0.y).toBeCloseTo(0.25, 6);
    expect(t0.size).toBeCloseTo(0.1, 6);
    expect(normAngle(t0.rotation)).toBe(0);
    const s0 = back[1] as Stroke;
    s0.points.forEach((v, i) => expect(v).toBeCloseTo((objs[1] as Stroke).points[i]!, 6));
  });

  it('the drawing placement mirrors with a flip, and junk placements are cleaned away', () => {
    expect(flipPlacement({ x: 0.3, y: 0.6, scale: 0.5, angle: 20 }, 'h')).toEqual({ x: 0.7, y: 0.6, scale: 0.5, angle: 340 });
    expect(cleanPlace({ x: 0.5, y: 0.5, scale: 1, angle: 0 })).toBeNull(); // identity = nothing stored
    expect(cleanPlace({ x: 99, y: 'no', scale: -4, angle: 725 })).toEqual({ x: 2, y: 0.5, scale: 0.05, angle: 5 });
  });
});
