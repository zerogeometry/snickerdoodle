import { describe, expect, it } from 'vitest';
import { fromLabel, packCountOf, packLine } from '@/lib/pack-labels';

// founder, 29 Oct: "from £60" read as ONE placemat — a pack says how many the price buys.
const gbp = (p: number) => `£${p / 100}`;
const v = (pricePence: number, size?: string): { pricePence: number; attributes: Record<string, string> } => ({ pricePence, attributes: size ? { size } : {} });

describe('pack labels', () => {
  it('catalogue tile: "from £60 for 4" / "from £18 for 2"; a non-pack product is unchanged', () => {
    expect(fromLabel({ fromPence: 6000, variants: [v(6000, 'pack of 4')] }, gbp)).toBe('from £60 for 4');
    expect(fromLabel({ fromPence: 1800, variants: [v(3400, 'pack of 6'), v(1800, 'pack of 2'), v(2600, 'pack of 4')] }, gbp)).toBe('from £18 for 2');
    expect(fromLabel({ fromPence: 1800, variants: [v(1800, '11oz')] }, gbp)).toBe('from £18');
  });
  it('customize page: "a set of 4 placemats, one drawing on all 4" — "both" for two', () => {
    expect(packLine('placemats', { size: 'pack of 4' })).toBe('a set of 4 placemats, one drawing on all 4');
    expect(packLine('coasters', { size: 'pack of 2' })).toBe('a set of 2 coasters, one drawing on both');
    expect(packLine('mug', { size: '11oz' })).toBeNull();
    expect(packCountOf(undefined)).toBeNull();
  });
});
