import { describe, expect, it } from 'vitest';
import { studioEditTarget } from '../studioEditTarget';

// sweep 01-B1: a keepsake picked on the create page, edited in the Studio, saved onto the ORIGINAL —
// the Studio kept the id it opened with, though the drawing in progress had become the copy.
describe('studioEditTarget — where a Studio edit lands', () => {
  it('the copy made after the Studio opened, not the keepsake it opened with', () => {
    expect(studioEditTarget({ assetId: 'copy', fromKeepsake: undefined }, 'original')).toBe('copy');
  });
  it('nowhere while the drawing in progress is still a picked keepsake (copy not made, or it failed)', () => {
    expect(studioEditTarget({ assetId: 'original', fromKeepsake: true }, 'original')).toBeNull();
  });
  it('a fresh drawing: its stored asset, or nothing yet (upload it first)', () => {
    expect(studioEditTarget({ assetId: 'a1' }, null)).toBe('a1');
    expect(studioEditTarget({}, 'a1')).toBe('a1');
    expect(studioEditTarget({}, null)).toBeUndefined();
    expect(studioEditTarget(null, null)).toBeUndefined();
  });
});
