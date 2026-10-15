import { describe, expect, it } from 'vitest';
import { ADULT_TEE_CHEST_MM, ADULT_TEE_PRINT_MM, FAMILY_SET_COLOURS, isDarkGarment, KIDS_TEE_CHEST_MM, KIDS_TEE_PRINT_MM, teePrintRegion, TEE_PHOTO } from '@/lib/garments';

describe('garments', () => {
  it('a family set offers only the colours every tee comes in', () => {
    expect(FAMILY_SET_COLOURS).toEqual(['white', 'heather grey', 'french navy', 'black']);
  });

  it('white prints ink only; every other colour prints on an underbase', () => {
    expect(isDarkGarment('white')).toBe(false);
    expect(isDarkGarment('heather grey')).toBe(true);
    expect(isDarkGarment('french navy')).toBe(true);
  });

  it('the print is a fixed size, so it covers more of a small tee than a big one — at its true ratio', () => {
    const small = teePrintRegion(KIDS_TEE_PRINT_MM, KIDS_TEE_CHEST_MM['3-4 years']!);
    const big = teePrintRegion(KIDS_TEE_PRINT_MM, KIDS_TEE_CHEST_MM['12-14 years']!);
    expect(small.x1 - small.x0).toBeGreaterThan(big.x1 - big.x0);
    // 260mm on a 330mm chest = 78.8% of the torso
    expect((small.x1 - small.x0) / TEE_PHOTO.torsoFrac).toBeCloseTo(260 / 330, 3);
    // centred on the chest, starting at the same spot below the collar
    expect((small.x0 + small.x1) / 2).toBeCloseTo(TEE_PHOTO.centreX, 6);
    expect(small.y0).toBe(big.y0);
  });

  it('the adult print keeps its portrait shape and fits on the photo for every size', () => {
    for (const chest of Object.values(ADULT_TEE_CHEST_MM)) {
      const r = teePrintRegion(ADULT_TEE_PRINT_MM, chest);
      const photoAspect = ((r.x1 - r.x0) * TEE_PHOTO.aspect) / (r.y1 - r.y0);
      expect(photoAspect).toBeCloseTo(396 / 498, 3);
      expect(r.x0).toBeGreaterThan(0);
      expect(r.y1).toBeLessThan(1);
    }
  });
});
