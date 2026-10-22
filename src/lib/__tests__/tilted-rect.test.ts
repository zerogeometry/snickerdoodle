import { describe, expect, it } from 'vitest';
import { tiltedRect } from '@/lib/studio-geometry';

/** A w×h rectangle centred at (cx, cy), turned `deg` clockwise on screen — corners tl, tr, br, bl. */
const turned = (cx: number, cy: number, w: number, h: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const).map(
    ([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)] as const,
  );
};

describe('the placement editor turns an ANGLED print area with the product', () => {
  it('reads a turned rectangle back as its centre, own size and angle (the playing cards, the ankle socks)', () => {
    for (const deg of [8.9, -23.6]) {
      const r = tiltedRect(turned(300, 200, 120, 180, deg))!;
      expect(r.angle).toBeCloseTo(deg, 5);
      expect(r.cx).toBeCloseTo(300, 5);
      expect(r.cy).toBeCloseTo(200, 5);
      expect(r.w).toBeCloseTo(120, 5);
      expect(r.h).toBeCloseTo(180, 5);
    }
  });

  it('a straight print area keeps the plain box', () => {
    expect(tiltedRect(turned(300, 200, 120, 180, 0))).toBeNull();
    expect(tiltedRect(turned(300, 200, 120, 180, 0.2))).toBeNull(); // a hair off square is still square
  });

  it('a true perspective quad (a skewed lid) is not mistaken for a turned rectangle', () => {
    expect(tiltedRect([[100, 100], [300, 120], [320, 300], [90, 280]])).toBeNull();
    expect(tiltedRect([[0, 0], [10, 0]])).toBeNull();
  });
});
