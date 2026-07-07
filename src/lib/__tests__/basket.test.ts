import { beforeEach, describe, expect, it } from 'vitest';
import { useBasket, type BasketItem } from '@/lib/store';

/**
 * The basket line-editing rules behind the "click a basket item → Customize → update basket"
 * round-trip. `update` must keep a line's position + quantity, re-key it if the shopper
 * changed the variant, and never leave two lines for the same variant.
 */
const item = (id: string, over: Partial<BasketItem> = {}): BasketItem => ({
  id,
  name: 'framed print',
  product: 'framedPrint' as BasketItem['product'],
  pricePence: 6695,
  qty: 1,
  ...over,
});

beforeEach(() => useBasket.setState({ items: [] }));

describe('basket.update — the "update in basket" round-trip', () => {
  it('patches a line in place, keeping id, position and quantity', () => {
    useBasket.setState({ items: [item('cat-a', { qty: 3 }), item('cat-framedPrint', { qty: 2 })] });
    useBasket.getState().update('cat-framedPrint', { sub: '11×14″ · oak', pricePence: 6995 });
    const items = useBasket.getState().items;
    expect(items.map((i) => i.id)).toEqual(['cat-a', 'cat-framedPrint']); // order untouched
    expect(items[1]).toMatchObject({ id: 'cat-framedPrint', qty: 2, sub: '11×14″ · oak', pricePence: 6995 });
  });

  it('re-keys to the new variant line id when the variant changes (no collision), preserving qty', () => {
    useBasket.setState({ items: [item('cat-framedPrint', { qty: 2 })] });
    useBasket.getState().update('cat-framedPrint', { sku: 'framedPrint-oak', sub: 'oak' }, 'cat-framedPrint-oak');
    const items = useBasket.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'cat-framedPrint-oak', sku: 'framedPrint-oak', qty: 2 });
  });

  it('merges into the existing line when the edit makes it match another variant (sums qty, drops the edited)', () => {
    useBasket.setState({
      items: [item('cat-framedPrint', { qty: 1 }), item('cat-framedPrint-oak', { qty: 2, sku: 'framedPrint-oak' })],
    });
    // Editing the gold line to oak collides with the existing oak line → one oak line, qty 3.
    useBasket.getState().update('cat-framedPrint', { sku: 'framedPrint-oak' }, 'cat-framedPrint-oak');
    const items = useBasket.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'cat-framedPrint-oak', qty: 3 });
  });

  it('is a no-op when the target line id is unknown', () => {
    useBasket.setState({ items: [item('cat-a')] });
    useBasket.getState().update('cat-missing', { sub: 'x' }, 'cat-missing2');
    expect(useBasket.getState().items).toEqual([item('cat-a')]);
  });
});

describe('basket.setQty — dropping below 1 removes the line', () => {
  it('removes the line at qty 0 (basket − pressed at qty 1)', () => {
    useBasket.setState({ items: [item('cat-a', { qty: 1 }), item('cat-b', { qty: 2 })] });
    useBasket.getState().setQty('cat-a', 0);
    expect(useBasket.getState().items.map((i) => i.id)).toEqual(['cat-b']);
  });
});
