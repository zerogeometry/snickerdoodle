import { describe, expect, it } from 'vitest';
import { expandCardPack, isCardPackKey, packSizeOf, type PackCard } from '../card-packs';

const card = (assetId: string, over: Partial<PackCard['transform']> = {}): PackCard => ({ assetId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, ...over } });
const sum = (ls: { linePence: number }[]) => ls.reduce((a, l) => a + l.linePence, 0);

describe('card packs — splitting a pack into order lines', () => {
  it('a 10-pack of 10 different drawings → 10 card lines, £2.10 each, adding up to exactly £21', () => {
    const lines = expandCardPack(2100, 10, Array.from({ length: 10 }, (_, i) => card(`a${i}`)));
    expect(lines).toHaveLength(10);
    expect(lines.every((l) => l.qty === 1 && l.unitPricePence === 210)).toBe(true);
    expect(sum(lines)).toBe(2100);
  });

  it('the same drawing ten times → ONE line of 10 copies (still exactly £21)', () => {
    const lines = expandCardPack(2100, 10, Array.from({ length: 10 }, () => card('same')));
    expect(lines).toEqual([{ card: card('same'), qty: 10, unitPricePence: 210, linePence: 2100, ground: null }]);
  });

  it('a mix: 3 of one + 2 of another in a 5-pack → 2 lines (3 × £2.40, 2 × £2.40 = £12)', () => {
    const lines = expandCardPack(1200, 5, [card('a'), card('b'), card('a'), card('a'), card('b')]);
    expect(lines.map((l) => [l.card.assetId, l.qty, l.linePence])).toEqual([['a', 3, 720], ['b', 2, 480]]);
    expect(sum(lines)).toBe(1200);
  });

  it('the same drawing placed differently is a different card', () => {
    const lines = expandCardPack(1200, 5, [card('a'), card('a', { offsetX: 0.5 }), card('a', { rotationDeg: 90 }), card('a'), card('a')]);
    expect(lines.map((l) => l.qty)).toEqual([3, 1, 1]);
  });

  it('refuses a pack with the wrong number of cards — never a short (or long) pack for the pack price', () => {
    expect(() => expandCardPack(2100, 10, Array.from({ length: 9 }, (_, i) => card(`a${i}`)))).toThrow(/needs 10 cards/);
    expect(() => expandCardPack(2100, 10, Array.from({ length: 11 }, (_, i) => card(`a${i}`)))).toThrow(/needs 10 cards/);
    expect(() => expandCardPack(1200, 5, [])).toThrow(/needs 5 cards/);
  });

  it('refuses a pack price that doesn’t split evenly (a catalogue mistake, caught loudly)', () => {
    expect(() => expandCardPack(1199, 5, Array.from({ length: 5 }, () => card('a')))).toThrow(/split evenly/);
  });
});

describe('card packs — one base colour per pack', () => {
  it('every split card line carries the pack’s colour (normalised to lowercase #rrggbb)', () => {
    const lines = expandCardPack(1200, 5, [card('a'), card('b'), card('a'), card('c'), card('b')], '#C8402A');
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.ground === '#c8402a')).toBe(true);
    expect(sum(lines)).toBe(1200); // the colour never changes the money
  });

  it('a pack saved before the wheel (a palette word) still prints its colour on every card', () => {
    expect(expandCardPack(1200, 5, Array.from({ length: 5 }, () => card('a')), 'navy').map((l) => l.ground)).toEqual(['#26334f']);
  });

  it('junk, white or nothing means no colour — every card stays white', () => {
    const five = Array.from({ length: 5 }, (_, i) => card(`a${i}`));
    for (const none of [undefined, null, '', '#ffffff', '#FFF', 'white', 'c8402a', '#12345g', '#000000; drop', 42, { hex: '#c8402a' }]) {
      expect(expandCardPack(1200, 5, five, none).every((l) => l.ground === null), String(none)).toBe(true);
    }
  });
});

describe('card packs — keys and sizes', () => {
  it('recognises the pack product and its variant skus, nothing else', () => {
    for (const k of ['cardPack', 'cardPack-packof10']) expect(isCardPackKey(k)).toBe(true);
    for (const k of ['card', 'cardPacks', 'playingCards', '', null, undefined]) expect(isCardPackKey(k)).toBe(false);
  });

  it('reads the pack size from the variant size', () => {
    expect(packSizeOf('pack of 5')).toBe(5);
    expect(packSizeOf('pack of 10')).toBe(10);
    for (const s of ['7×5″', 'pack of 1', 'pack of ten', '', null, undefined]) expect(packSizeOf(s)).toBeNull();
  });
});
