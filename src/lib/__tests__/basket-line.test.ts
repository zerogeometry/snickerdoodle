import { beforeEach, describe, expect, it } from 'vitest';
import { basketLineId, designSig } from '@/lib/basket-line';
import { isLineOfSku, lineIdFor, lineIdForSku, productQtyInBasket } from '@/lib/catalogue-view';
import { rekeyLines, useBasket, type BasketItem } from '@/lib/store';
import type { CatalogueProduct } from '@/server/catalogue';

/**
 * One basket line per product + DRAWING: two heart cushions with different drawings are two lines
 * (each its own picture + quantity); the very same cushion added again counts up the one line.
 */
const TF = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
const art = (assetId: string, over: Partial<NonNullable<BasketItem['artwork']>> = {}) => ({ artwork: { assetId, transform: TF, ...over } });
const cushion = (assetId: string, over: Partial<BasketItem> = {}): Omit<BasketItem, 'qty'> => {
  const d = { ...art(assetId), ...over };
  return { id: basketLineId('cushion-heart', d), name: 'cushion', product: 'cushion' as BasketItem['product'], sku: 'cushion-heart', pricePence: 3000, ...d };
};

beforeEach(() => useBasket.setState({ items: [] }));

describe('basketLineId', () => {
  it('a different drawing is a different line', () => {
    expect(basketLineId('cushion-heart', art('a1'))).not.toBe(basketLineId('cushion-heart', art('a2')));
  });
  it('the same design is the same line (stable)', () => {
    expect(basketLineId('cushion-heart', art('a1'))).toBe(basketLineId('cushion-heart', art('a1')));
  });
  it('a cutout, placement, cushion back or card message makes its own line', () => {
    const base = basketLineId('x', art('a1'));
    expect(basketLineId('x', art('a1', { sourceObjectId: 'cut' }))).not.toBe(base);
    expect(basketLineId('x', art('a1', { transform: { ...TF, offsetX: 0.2 } }))).not.toBe(base);
    expect(basketLineId('x', { ...art('a1'), back: 'navy' })).not.toBe(base);
    expect(basketLineId('x', { ...art('a1'), message: { greeting: 'hi', message: '', signature: '', note: '', font: 'gaegu' } })).not.toBe(base);
    expect(basketLineId('x', { ...art('a1'), cardImageSpan: 'full' })).not.toBe(base);
  });
  it('float noise in the placement never forks a line', () => {
    expect(basketLineId('x', art('a1', { transform: { ...TF, offsetX: 0.1 + 0.2 } }))).toBe(basketLineId('x', art('a1', { transform: { ...TF, offsetX: 0.3 } })));
  });
  it('keeps the variant + base-colour scheme, so tiles still count every line of the product', () => {
    const id = basketLineId('socks', { ...art('a1'), ground: '#26334f' });
    expect(id.startsWith(`${lineIdFor('socks', '#26334f')}~d`)).toBe(true);
    expect(isLineOfSku(id, 'socks')).toBe(true);
    expect(isLineOfSku(id, 'socks-tube')).toBe(false);
  });
  it('a line with no drawing (an add-on) keeps the plain variant id', () => {
    expect(designSig({})).toBe('');
    expect(basketLineId('giftWrap', {})).toBe(lineIdForSku('giftWrap'));
  });
});

describe('the basket, per drawing', () => {
  it('two cushions with different drawings → two lines, each with its own drawing', () => {
    useBasket.getState().add(cushion('a1'));
    useBasket.getState().add(cushion('a2'));
    const items = useBasket.getState().items;
    expect(items).toHaveLength(2);
    expect(items.map((i) => [i.artwork?.assetId, i.qty])).toEqual([['a1', 1], ['a2', 1]]);
  });
  it('the same cushion again counts up its own line only', () => {
    useBasket.getState().add(cushion('a1'));
    useBasket.getState().add(cushion('a2'));
    useBasket.getState().add(cushion('a1'));
    expect(useBasket.getState().items.map((i) => [i.artwork?.assetId, i.qty])).toEqual([['a1', 2], ['a2', 1]]);
  });
  it('changing one line’s quantity leaves the other drawing’s line alone', () => {
    useBasket.getState().add(cushion('a1'));
    useBasket.getState().add(cushion('a2'));
    const [l1, l2] = useBasket.getState().items;
    useBasket.getState().setQty(l2!.id, 4);
    useBasket.getState().setQty(l1!.id, 0);
    expect(useBasket.getState().items.map((i) => [i.artwork?.assetId, i.qty])).toEqual([['a2', 4]]);
  });
  it('the product tile still shows the total across drawings', () => {
    useBasket.getState().add(cushion('a1'));
    useBasket.getState().add(cushion('a2'));
    const p = { variants: [{ sku: 'cushion-heart' }] } as unknown as CatalogueProduct;
    expect(productQtyInBasket(useBasket.getState().items, p)).toBe(2);
  });
});

describe('rekeyLines — a basket saved before lines were per drawing', () => {
  it('re-keys old catalogue lines to their per-drawing id and keeps everything else', () => {
    const old: BasketItem[] = [
      { ...cushion('a1'), id: 'cat-cushion-heart', qty: 2 },
      { id: 'pack-123', name: 'cards', product: 'cardPack4' as BasketItem['product'], pricePence: 1, qty: 1 },
      { id: 'cat-giftWrap', name: 'gift wrap', product: 'giftWrap' as BasketItem['product'], sku: 'giftWrap', pricePence: 1, qty: 1 },
    ];
    const out = rekeyLines(old);
    expect(out.map((i) => i.id)).toEqual([basketLineId('cushion-heart', art('a1')), 'pack-123', 'cat-giftWrap']);
    expect(out[0]!.qty).toBe(2);
  });
  it('folds lines that turn out to be the same design', () => {
    const a = { ...cushion('a1'), qty: 1 };
    const out = rekeyLines([{ ...a, id: 'cat-cushion-heart' }, { ...a, qty: 2 }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.qty).toBe(3);
  });
});
