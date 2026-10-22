import { describe, expect, it } from 'vitest';
import { deliveryLine, shipsTracked } from '@/lib/delivery';

describe('delivery copy never claims tracking we don’t buy', () => {
  it('tracked products say tracked; untracked-post products don’t', () => {
    expect(deliveryLine('framedPrint')).toBe('free tracked delivery');
    expect(deliveryLine('mug-black')).toBe('free tracked delivery');
    for (const k of ['card', 'cardPack', 'cardPack-packof10', 'wrappingPaper', 'wrappingPaper-5mroll', 'playingCards']) {
      expect(shipsTracked(k), k).toBe(false);
      expect(deliveryLine(k)).toBe('free delivery');
    }
  });
  it('a basket is only "tracked" when every line is', () => {
    expect(deliveryLine(['framedPrint', 'mug'])).toBe('free tracked delivery');
    expect(deliveryLine(['framedPrint', 'card'])).toBe('free delivery');
    expect(deliveryLine([])).toBe('free tracked delivery');
  });
});
