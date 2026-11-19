import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { cardBackBadgeOverlay } from '@/server/print/seedMockups';
import { CARD_BACK_BADGE } from '@/server/print/cardPrint';

// The on-screen "opened out" card carries the SAME back badge the print does, in the same spot on the
// back panel — so the picture a parent sees is the card they get (not the folder's old logo overlay).
describe('card "opened out" picture — the back badge matches the print', () => {
  const W = 2000, H = 2000;
  const back = { x0: 223 / W, y0: 456 / H, x1: 1000 / W, y1: 1544 / H }; // the founder's back panel

  it('is a see-through W×H overlay with the badge at the print’s spot on the back panel, nothing elsewhere', async () => {
    const png = await cardBackBadgeOverlay(W, H, back);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([W, H]);
    const alpha = (x: number, y: number) => data[(Math.round(y) * W + Math.round(x)) * 4 + 3]!;
    const pw = (back.x1 - back.x0) * W, ph = (back.y1 - back.y0) * H;
    const cx = back.x0 * W + pw * CARD_BACK_BADGE.cxFrac, cy = back.y0 * H + ph * CARD_BACK_BADGE.cyFrac;
    const r = (pw * CARD_BACK_BADGE.widthFrac) / 2;
    let ink = 0; // the logo's ink across its row (the logo alone — no circle behind it)
    for (let x = cx - r; x < cx + r; x++) if (alpha(x, cy) > 200) ink++;
    expect(ink).toBeGreaterThan(r * 0.2);
    expect(alpha(cx - r * 1.3, cy)).toBe(0); // just beyond it, either side: clear
    expect(alpha(cx + r * 1.3, cy)).toBe(0);
    expect(alpha(W / 2, H / 2)).toBe(0); // the design area stays clear
    expect(alpha(back.x0 * W + pw / 2, back.y0 * H + ph / 2)).toBe(0); // back-panel middle: clear
  });
});
