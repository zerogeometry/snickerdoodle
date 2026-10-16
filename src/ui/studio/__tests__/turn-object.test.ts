import { describe, expect, it } from 'vitest';
import { cleanObjects, flipObjects, type StudioObject } from '@/lib/studio-objects';
import { turnObject } from '@/ui/studio/objects-canvas';

type Stroke = Extract<StudioObject, { type: 'stroke' }>;
const f = { gw: 400, gh: 200 };
const line: Stroke = { id: 'p', type: 'stroke', colour: '#000000', width: 0.02, points: [0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.8, 0.5, 0.5], texture: 'smooth' };
const centre = (o: Stroke) => {
  let x = 0, y = 0;
  for (let i = 0; i < o.points.length; i += 3) {
    x += o.points[i]! * f.gw;
    y += o.points[i + 1]! * f.gh;
  }
  return [x / (o.points.length / 3), y / (o.points.length / 3)] as const;
};

describe('turning any layer to an exact angle', () => {
  it('words and shapes just take the angle', () => {
    const t: StudioObject = { id: 't', type: 'text', text: 'Mia', font: 'caveat', colour: '#000000', size: 0.1, x: 0.5, y: 0.5, rotation: 0, texture: 'smooth' };
    expect((turnObject(t, f, 37.5) as typeof t).rotation).toBe(37.5);
    expect((turnObject(t, f, -90) as typeof t).rotation).toBe(270);
  });

  it('a pen line turns about its middle, which stays put', () => {
    const turned = turnObject(line, f, 90) as Stroke;
    expect(turned.rotation).toBe(90);
    const [cx0, cy0] = centre(line);
    const [cx1, cy1] = centre(turned);
    expect(cx1).toBeCloseTo(cx0, 6);
    expect(cy1).toBeCloseTo(cy0, 6);
    // the flat line (dx = 240px) now stands upright
    const dx = (turned.points[6]! - turned.points[0]!) * f.gw, dy = (turned.points[7]! - turned.points[1]!) * f.gh;
    expect(dx).toBeCloseTo(0, 6);
    expect(Math.abs(dy)).toBeCloseTo(240, 6);
  });

  it('turning a pen line back returns it exactly — no drift, however many times', () => {
    let o: Stroke = line;
    for (const a of [12.5, 45, 300, 90, 0]) o = turnObject(o, f, a) as Stroke;
    expect(o.rotation).toBe(0);
    o.points.forEach((v, i) => expect(v).toBeCloseTo(line.points[i]!, 9));
  });

  it('a pen line keeps its angle through a save, and its reading mirrors on a flip', () => {
    const turned = turnObject(line, f, 30) as Stroke;
    const [saved] = cleanObjects([turned]) as [Stroke];
    expect(saved.rotation).toBe(30);
    const [flipped] = flipObjects([turned], 'h') as [Stroke];
    expect(flipped.rotation).toBe(330);
  });
});
