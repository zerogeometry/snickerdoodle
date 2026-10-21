import { beforeEach, describe, expect, it } from 'vitest';
import { cardPackLine, newPackLineId } from '@/lib/card-pack-line';
import { orderItemsFor, useBasket, type BasketItem, type PackCardLine } from '@/lib/store';

/**
 * The card PACK basket line (D22): ONE line, qty fixed at 1, carrying its N cards — and the order
 * payload sends WHICH drawings only (never a price), as `{ productKey, qty: 1, cards }`.
 */
const COVER = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
const cardOf = (assetId: string, over: Partial<PackCardLine> = {}): PackCardLine => ({ assetId, transform: COVER, ...over });
const FIVE = { id: 'var-5', sku: 'cardPack', pricePence: 1200 };
const TEN = { id: 'var-10', sku: 'cardPack-packof10', pricePence: 2100 };

beforeEach(() => useBasket.setState({ items: [] }));

describe('cardPackLine — the basket line shape', () => {
  it('is one card-pack line carrying exactly its cards, in pack order (repeats allowed)', () => {
    const cards = [cardOf('a'), cardOf('b'), cardOf('a'), cardOf('c', { sourceObjectId: 'cut-c' }), cardOf('a')];
    const line = cardPackLine({ id: 'pack-1', variant: FIVE, packSize: 5, cards, previewVariantId: 'card-var' });
    expect(line).toMatchObject({ id: 'pack-1', name: 'card pack', product: 'cardPack', sku: 'cardPack', variantId: 'var-5', pricePence: 1200, sub: '5 cards · blank inside', previewVariantId: 'card-var' });
    expect(line.cards).toEqual(cards);
    expect(line).not.toHaveProperty('artwork'); // a pack is never a single-artwork line
    expect(line).not.toHaveProperty('message'); // blank inside — no printed message
  });

  it('refuses a pack with the wrong number of cards', () => {
    expect(() => cardPackLine({ id: 'p', variant: TEN, packSize: 10, cards: [cardOf('a')] })).toThrow(/needs 10 cards/);
  });

  it('gives every pack its own line id, so two packs never fold into one pack × 2', () => {
    expect(newPackLineId()).toMatch(/^pack-/);
    expect(newPackLineId()).not.toBe(newPackLineId());
  });
});

describe('the basket keeps a pack at qty 1', () => {
  const line = () => cardPackLine({ id: 'pack-1', variant: FIVE, packSize: 5, cards: ['a', 'b', 'c', 'd', 'e'].map((x) => cardOf(x)) });

  it('adds as qty 1', () => {
    useBasket.getState().add(line());
    expect(useBasket.getState().items).toHaveLength(1);
    expect(useBasket.getState().items[0]).toMatchObject({ id: 'pack-1', qty: 1 });
  });

  it('re-adding the same pack line replaces it rather than making it 2', () => {
    useBasket.getState().add(line());
    useBasket.getState().add({ ...line(), cards: Array.from({ length: 5 }, () => cardOf('z')) });
    const [only] = useBasket.getState().items;
    expect(only).toMatchObject({ qty: 1 });
    expect(only!.cards!.every((c) => c.assetId === 'z')).toBe(true);
  });

  it('setQty can only keep it at 1 or remove it', () => {
    useBasket.getState().add(line());
    useBasket.getState().setQty('pack-1', 3);
    expect(useBasket.getState().items[0]!.qty).toBe(1);
    useBasket.getState().setQty('pack-1', 0);
    expect(useBasket.getState().items).toHaveLength(0);
  });

  it('editing the cards keeps the line, its place and qty 1', () => {
    useBasket.setState({ items: [{ id: 'cat-mug', name: 'mug', product: 'mug', pricePence: 1500, qty: 2 } as BasketItem] });
    useBasket.getState().add(line());
    const { id, ...fields } = cardPackLine({ id: 'pack-1', variant: TEN, packSize: 10, cards: Array.from({ length: 10 }, () => cardOf('q')) });
    useBasket.getState().update(id, fields);
    const items = useBasket.getState().items;
    expect(items.map((i) => i.id)).toEqual(['cat-mug', 'pack-1']);
    expect(items[1]).toMatchObject({ qty: 1, sku: 'cardPack-packof10', sub: '10 cards · blank inside' });
    expect(items[1]!.cards).toHaveLength(10);
  });
});

describe('orderItemsFor — what the order action receives', () => {
  it('sends a pack as its sku + qty 1 + its cards, without price, artwork or display-only fields', () => {
    const pack = { ...cardPackLine({ id: 'pack-1', variant: FIVE, packSize: 5, cards: [cardOf('a', { sourceObjectId: 'cut' }), ...['b', 'c', 'd', 'e'].map((x) => cardOf(x))], previewVariantId: 'card-var' }), qty: 1 };
    const [sent] = orderItemsFor([{ ...pack, qty: 4 }]); // even a corrupted qty goes out as 1
    expect(sent).toEqual({
      productKey: 'cardPack',
      qty: 1,
      cards: [{ assetId: 'a', transform: COVER, sourceObjectId: 'cut' }, ...['b', 'c', 'd', 'e'].map((x) => ({ assetId: x, transform: COVER }))],
    });
  });

  it('leaves an ordinary personalised line as it was (artwork + per-print details)', () => {
    const tee: BasketItem = { id: 'cat-kidsTee', name: 'kids tee', product: 'kidsTee', pricePence: 2500, qty: 2, sku: 'kidsTee-5-6', artwork: { assetId: 'x', transform: COVER } };
    expect(orderItemsFor([tee])).toEqual([{ productKey: 'kidsTee-5-6', qty: 2, artwork: { assetId: 'x', transform: COVER, back: undefined, message: undefined, cardImageSpan: undefined } }]);
  });
});
