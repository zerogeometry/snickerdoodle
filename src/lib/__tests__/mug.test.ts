import { describe, expect, it } from 'vitest';
import { MUG_BLEED_MM, mugBleedRows } from '@/lib/mug';

// Prodigi's 11oz coloured-mug template (2473×1157 at 300 dpi): solid bleed bands 12 px at the top, 24 px at the
// bottom — they run off the mug, so no preview may show them (founder, 28 Nov 2026).
describe('the mug preview shows only what lands on the mug', () => {
  it('trims 1 mm off the top and 2 mm off the bottom of the 98 mm file', () => {
    expect(MUG_BLEED_MM).toEqual({ top: 1, bottom: 2 });
    expect(mugBleedRows(1157)).toEqual({ top: 12, bottom: 24 }); // the print file itself
    expect(mugBleedRows(578)).toEqual({ top: 6, bottom: 12 }); // a half-size working canvas
  });
  it('keeps the whole width (the full 209.5 mm wraps the mug; only the handle gap is bare)', () => {
    const r = mugBleedRows(1157);
    expect(1157 - r.top - r.bottom).toBe(1121); // ≈ 95 mm, rim to base
  });
});
