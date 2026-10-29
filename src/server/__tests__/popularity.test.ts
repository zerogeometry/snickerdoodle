import { describe, expect, it } from 'vitest';
import { EXPECTED_POPULARITY, pinFirst, PRIOR_STRENGTH, priorScores, rankByPopularity } from '@/server/popularity';
import { seasonalExpected } from '@/lib/season';

describe('popularity — expected order first, real sales take over', () => {
  it('with no sales, the range is in the expected order', () => {
    expect(rankByPopularity(new Map())).toEqual(EXPECTED_POPULARITY);
  });

  it('the head start is worth PRIOR_STRENGTH sales in all, more for the expected favourites', () => {
    const p = [...priorScores().values()];
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(PRIOR_STRENGTH, 6);
    expect(p[0]).toBeGreaterThan(p[p.length - 1]!);
  });

  it('a handful of sales nudges, it doesn’t upend', () => {
    const order = rankByPopularity(new Map([['blanket', 2]]));
    expect(order.indexOf('blanket')).toBeLessThan(EXPECTED_POPULARITY.indexOf('blanket'));
    expect(order[0]).toBe('christmasBundle'); // the family bundle leads (founder, 29 Oct)
  });

  it('once real sales outweigh the head start, they decide', () => {
    const order = rankByPopularity(new Map([['blanket', 40], ['card', 25], ['framedPrint', 3]]));
    expect(order.slice(0, 2)).toEqual(['blanket', 'card']);
  });

  it('sales of products outside the list never put them in the range', () => {
    expect(rankByPopularity(new Map([['bauble', 500]]))).not.toContain('bauble');
  });

  it('the christmas family bundle is pinned first — whatever sells, in season or out (founder, 29 Oct)', () => {
    const selling = rankByPopularity(new Map([['mug', 400], ['blanket', 300]]));
    expect(selling[0]).toBe('mug');
    expect(pinFirst(selling)[0]).toBe('christmasBundle');
    expect(pinFirst(seasonalExpected(selling, new Date('2026-11-20T12:00:00Z')))[0]).toBe('christmasBundle');
    expect(pinFirst(selling)).toHaveLength(selling.length);
    expect(pinFirst(['mug', 'card'])).toEqual(['mug', 'card']); // not in the range → nothing to pin
  });
});
